import { Router } from 'express';
import { db } from '../../services/db.service.js';
import { config } from '../../config.js';
import {
  parseList, isValidHttpUrl, isActiveLike,
  normalizeEndpointPath, normalizeBooleanLike, toNumericId
} from '../../utils/helpers.js';

const router = Router();

// --- Helper: Build dynamic API payload ---
function buildDynamicApiPayload(input: Record<string, any>): Record<string, any> {
  const payload: Record<string, any> = {};
  for (const [key, rawValue] of Object.entries(input || {})) {
    if (key === 'id' || rawValue === undefined) continue;

    if (Array.isArray(rawValue)) {
      if (key === 'features' || key === 'versions') {
        payload[key] = JSON.stringify(rawValue);
      } else {
        payload[key] = rawValue.join(',');
      }
      continue;
    }
    if (key === 'is_streaming') { payload[key] = normalizeBooleanLike(rawValue); continue; }
    if (key === 'active') { payload[key] = normalizeBooleanLike(rawValue) ? 1 : 0; continue; }
    if (key === 'features' || key === 'versions') {
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) { payload[key] = JSON.stringify([]); }
        else {
          try {
            const parsed = JSON.parse(trimmed);
            payload[key] = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
          } catch { payload[key] = JSON.stringify(trimmed.split(',').map(s => s.trim()).filter(Boolean)); }
        }
      } else { payload[key] = JSON.stringify([]); }
      continue;
    }
    payload[key] = rawValue;
  }
  return payload;
}

function getMissingColumns(columns: string[] | null, expected: readonly string[]): string[] {
  if (!columns || columns.length === 0) return [];
  const colSet = new Set(columns);
  return expected.filter(c => !colSet.has(c));
}

function buildMigrationSql(missing: string[]): string[] {
  const typedMap: Record<string, string> = {
    timeout_ms: 'INTEGER DEFAULT 600000',
    max_input_chars: 'INTEGER DEFAULT 8000',
    speed_mode: "TEXT DEFAULT 'balanced'",
    default_top_p: 'REAL DEFAULT 1',
    default_top_k: 'INTEGER DEFAULT 40',
    default_temperature: 'REAL DEFAULT 0.7',
    max_tokens: 'INTEGER DEFAULT 1024',
    is_streaming: 'BOOLEAN DEFAULT false',
    model_slug: 'TEXT'
  };
  return missing.filter(c => typedMap[c]).map(c => `ALTER TABLE apis ADD COLUMN ${c} ${typedMap[c]};`);
}

function filterPayloadByColumns(payload: Record<string, any>, columns: string[] | null) {
  if (!columns || columns.length === 0) return { filtered: payload, skipped: [] as string[] };
  const allowed = new Set(columns);
  const filtered: Record<string, any> = {};
  const skipped: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (allowed.has(k)) filtered[k] = v;
    else skipped.push(k);
  }
  return { filtered, skipped };
}

// GET /admin/apis — Full records (admin only)
router.get('/', async (req, res) => {
  try {
    const raw = await db.findAll('apis');
    const apis = raw.map((api: any) => ({
      ...api,
      features: parseList(api.features),
      versions: parseList(api.versions),
      price_per_token: Number(api.price_per_token) || 0,
      price_input: Number(api.price_input) || 0,
      price_output: Number(api.price_output) || 0
    }));
    res.json(apis);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch APIs' });
  }
});

// GET /admin/apis/schema-health
router.get('/schema-health', async (req, res) => {
  try {
    const columns = await db.getTableColumns('apis');
    const missingColumns = getMissingColumns(columns, config.dynamicApiSettingColumns);
    const allApis = await db.findAll('apis');
    const endpointMap = new Map<string, any[]>();
    const invalidTargetRows: any[] = [];

    for (const row of allApis) {
      const endpoint = String(row?.endpoint || '').trim();
      if (endpoint) {
        const arr = endpointMap.get(endpoint) || [];
        arr.push(row);
        endpointMap.set(endpoint, arr);
      }
      if (!isValidHttpUrl(row?.target_url)) {
        invalidTargetRows.push({ id: row?.id, endpoint, target_url: row?.target_url });
      }
    }

    const duplicateEndpoints = Array.from(endpointMap.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([endpoint, rows]) => ({
        endpoint,
        rows: rows.map((r: any) => ({
          id: r?.id, name: r?.name, model_slug: r?.model_slug || '',
          active: isActiveLike(r?.active), target_url: String(r?.target_url || '')
        })).sort((a: any, b: any) => toNumericId(b.id) - toNumericId(a.id))
      }));

    const endpointCleanupSql = duplicateEndpoints.flatMap((group) => {
      const activeRows = group.rows.filter((r: any) => r.active);
      if (activeRows.length <= 1) return [];
      const keepId = activeRows.sort((a: any, b: any) => toNumericId(b.id) - toNumericId(a.id))[0]?.id;
      const deactivateIds = activeRows.filter((r: any) => String(r.id) !== String(keepId)).map((r: any) => r.id);
      if (deactivateIds.length === 0) return [];
      return [
        `-- Resolve duplicate active endpoint ${group.endpoint}`,
        `UPDATE apis SET active = 0 WHERE id IN (${deactivateIds.map((id: any) => `'${id}'`).join(', ')});`
      ];
    });

    res.json({
      table: 'apis', columns: columns || [],
      expected_columns: [...config.dynamicApiSettingColumns],
      missing_columns: missingColumns, healthy: missingColumns.length === 0,
      migration_sql: buildMigrationSql(missingColumns),
      duplicate_endpoints: duplicateEndpoints,
      invalid_target_urls: invalidTargetRows,
      endpoint_cleanup_sql: endpointCleanupSql
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to inspect apis schema', detail: error.message });
  }
});

// POST /admin/apis — Create
router.post('/', async (req, res) => {
  const { name, type, endpoint, target_url } = req.body;
  const errors: string[] = [];
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  const normalizedTargetUrl = String(target_url || '').trim();

  if (!name || typeof name !== 'string') errors.push('name is required');
  if (!type || typeof type !== 'string') errors.push('type is required');
  if (!endpoint || typeof endpoint !== 'string') errors.push('endpoint is required');
  if (normalizedEndpoint && !normalizedEndpoint.startsWith('/')) errors.push('endpoint must start with "/"');
  if (!target_url || typeof target_url !== 'string') errors.push('target_url is required');
  if (normalizedTargetUrl && !isValidHttpUrl(normalizedTargetUrl)) errors.push('target_url must be http:// or https://');
  if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', details: errors });

  try {
    // NOTE: Removed endpoint uniqueness check.
    // Multiple models can share the same endpoint (e.g. /v1/chat/completions).
    // Gateway routes based on model_slug, not just endpoint path.

    const dynamicPayload = buildDynamicApiPayload({
      ...req.body, name: String(name).trim(), type: String(type).trim(),
      endpoint: normalizedEndpoint, target_url: normalizedTargetUrl,
      price_per_token: req.body.price_per_token === undefined ? 0 : req.body.price_per_token
    });

    const columns = await db.getTableColumns('apis');
    const missingColumns = getMissingColumns(columns, config.dynamicApiSettingColumns);
    const requestedUnsupported = Object.keys(req.body || {}).filter(k =>
      (config.dynamicApiSettingColumns as readonly string[]).includes(k) && missingColumns.includes(k) && req.body[k] !== undefined
    );
    if (requestedUnsupported.length > 0) {
      return res.status(400).json({
        error: 'Schema mismatch', missing_columns: missingColumns,
        migration_sql: buildMigrationSql(missingColumns)
      });
    }

    const { filtered: payload, skipped } = filterPayloadByColumns(dynamicPayload, columns);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No valid fields to create API', skipped_fields: skipped });
    }

    const { id } = await db.create('apis', payload);
    res.status(201).json({ success: true, id, skipped_fields: skipped, ...payload });
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    console.error('Admin create API error:', JSON.stringify(detail));
    res.status(500).json({ error: 'Failed to create API', detail });
  }
});

// PUT /admin/apis/:id — Update
router.put('/:id', async (req, res) => {
  try {
    const incomingTargetUrl = req.body?.target_url;
    if (incomingTargetUrl !== undefined && !isValidHttpUrl(incomingTargetUrl)) {
      return res.status(400).json({ error: 'Validation failed', details: ['target_url must be http:// or https://'] });
    }

    const currentApi = await db.findById('apis', req.params.id);
    const nextEndpoint = req.body?.endpoint !== undefined
      ? normalizeEndpointPath(req.body.endpoint)
      : String(currentApi?.endpoint || '');
    const nextActive = req.body?.active !== undefined
      ? isActiveLike(req.body.active)
      : isActiveLike(currentApi?.active);

    // NOTE: Removed endpoint uniqueness check on update.
    // Multiple models can share the same endpoint.

    const normalizedBody = {
      ...req.body,
      endpoint: req.body?.endpoint !== undefined ? nextEndpoint : undefined,
      target_url: req.body?.target_url !== undefined ? String(req.body.target_url).trim() : undefined
    };

    const dynamicPayload = buildDynamicApiPayload(normalizedBody);
    const columns = await db.getTableColumns('apis');
    const missingColumns = getMissingColumns(columns, config.dynamicApiSettingColumns);
    const requestedUnsupported = Object.keys(req.body || {}).filter(k =>
      (config.dynamicApiSettingColumns as readonly string[]).includes(k) && missingColumns.includes(k) && req.body[k] !== undefined
    );
    if (requestedUnsupported.length > 0) {
      return res.status(400).json({
        error: 'Schema mismatch', missing_columns: missingColumns,
        migration_sql: buildMigrationSql(missingColumns)
      });
    }

    const { filtered: payload, skipped } = filterPayloadByColumns(dynamicPayload, columns);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided', skipped_fields: skipped });
    }

    await db.update('apis', req.params.id, payload);
    res.json({ success: true, skipped_fields: skipped });
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    console.error('Admin update API error:', JSON.stringify(detail));
    res.status(500).json({ error: 'Failed to update API', detail });
  }
});

// DELETE /admin/apis/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.remove('apis', req.params.id);
    res.json({ success: true, deleted_id: req.params.id });
  } catch (error: any) {
    console.error('Admin delete API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete API' });
  }
});

export default router;
