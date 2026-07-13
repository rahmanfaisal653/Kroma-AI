import React, { useEffect, useState } from 'react';
import http from '../../services/http';
import { InputField } from '../../components/InputField';
import {
  Plus, Edit, Trash2, Loader2, X, ChevronRight,
  Globe, Lock, Wifi, WifiOff, CheckCircle2, AlertCircle, Zap
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiService {
  id: string;
  name: string;
  type: string;
  description: string;
  price_per_token: number;
  price_input: number;
  price_output: number;
  features: string[];
  versions: string[];
  endpoint: string;
  target_url: string;
  target_auth: string;
  active: boolean;
  // New "DICEGAT ADMIN" fields
  model_slug?: string;
  default_temperature?: number;
  max_tokens?: number;
  is_streaming?: boolean;
  timeout_ms?: number;
  max_input_chars?: number;
  speed_mode?: string;
  default_top_p?: number;
  default_top_k?: number;
}

type FormTab = 'client' | 'backend';

const EMPTY_FORM: Partial<ApiService> = {
  name: '', type: 'text-to-image', description: '',
  price_per_token: 10, price_input: 0, price_output: 0,
  features: [], versions: ['v1.0.0'], endpoint: '/v1/generate',
  target_url: '', target_auth: '', active: true,
  model_slug: '', default_temperature: 0.7, max_tokens: 1024, is_streaming: false,
  timeout_ms: 120000, max_input_chars: 8000, speed_mode: 'balanced', default_top_p: 1, default_top_k: 40
};

// Auth is handled by http interceptor (JWT Bearer token)

// ─── Sub-components ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  'text-to-image': 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
  'text-to-text':  'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
  'text-to-video': 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
  'text-to-audio': 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
      {type}
    </span>
  );
}

function StatusToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4.5' : 'translate-x-1'}`} />
    </button>
  );
}

const inputCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm";

const UNIVERSAL_KEYS_DOC = [
  { key: 'model', desc: 'Nama model target dari admin. Menentukan model AI yang dipakai di backend.' },
  { key: 'messages', desc: 'Isi percakapan user/system. Diteruskan ke provider AI.' },
  { key: 'temperature', desc: 'Tingkat kreativitas jawaban. Semakin tinggi, semakin variatif.' },
  { key: 'max_tokens', desc: 'Batas panjang output AI agar biaya dan latency terkendali.' },
  { key: 'top_p', desc: 'Sampling nucleus. Alternatif kendali variasi output.' },
  { key: 'top_k', desc: 'Batasi kandidat token teratas saat sampling.' },
  { key: 'speed_mode', desc: 'Profil performa: fast, balanced, quality.' },
  { key: 'timeout_ms', desc: 'Batas waktu request gateway ke AI provider.' },
  { key: 'max_input_chars', desc: 'Batas panjang input user untuk proteksi beban.' },
  { key: 'stream', desc: 'Mode realtime/chunk. ON jika client support streaming.' }
];

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  editingId: string | null;
  formData: Partial<ApiService>;
  initialTab?: FormTab;
  onChange: (data: Partial<ApiService>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

function ApiDrawer({ open, editingId, formData, initialTab = 'client', onChange, onSave, onClose, saving }: DrawerProps) {
  const [tab, setTab] = useState<FormTab>('client');
  const [authType, setAuthType] = useState('none');
  const isNew = editingId === 'new';

  const set = (patch: Partial<ApiService>) => onChange({ ...formData, ...patch });

  // Derive auth type from stored target_auth string
  useEffect(() => {
    const auth = formData.target_auth || '';
    if (auth.startsWith('Basic ')) setAuthType('basic');
    else if (auth.startsWith('Bearer ')) setAuthType('bearer');
    else if (auth) setAuthType('apikey');
    else setAuthType('none');
  }, [editingId]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const handleAuthTypeChange = (type: string) => {
    setAuthType(type);
    if (type === 'none') set({ target_auth: '' });
    else if (type === 'basic') set({ target_auth: 'Basic ' });
    else if (type === 'bearer') set({ target_auth: 'Bearer ' });
    else set({ target_auth: '' }); // apikey — user types raw value
  };

  const handleCredentialInput = (val: string) => {
    if (authType === 'basic') set({ target_auth: `Basic ${val}` });
    else if (authType === 'bearer') set({ target_auth: `Bearer ${val}` });
    else set({ target_auth: val });
  };

  const credentialValue = () => {
    const auth = formData.target_auth || '';
    if (authType === 'basic') return auth.replace(/^Basic /, '');
    if (authType === 'bearer') return auth.replace(/^Bearer /, '');
    return auth;
  };

  const isTextType = formData.type === 'text-to-text';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div className={`fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{isNew ? 'Add New API Service' : 'Edit API Service'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Configure both client-facing info and backend proxy settings.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          {(['client', 'backend'] as FormTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative py-3 px-1 mr-6 text-sm font-medium transition-colors ${tab === t ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {t === 'client' ? (
                <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Client-Facing Info</span>
              ) : (
                <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Backend Config <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-semibold">Secret</span></span>
              )}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {tab === 'client' && (
            <>
              <InputField label="API Name" hint="*">
                <input className={inputCls} placeholder="e.g. Stable Diffusion XL" value={formData.name || ''} onChange={e => set({ name: e.target.value })} />
              </InputField>

              <div className="grid grid-cols-2 gap-4">
                <InputField label="Type" hint="*">
                  <select className={inputCls} value={formData.type || 'text-to-image'} onChange={e => set({ type: e.target.value })}>
                    <option value="text-to-image">Text to Image</option>
                    <option value="text-to-text">Text to Text (LLM)</option>
                    <option value="text-to-video">Text to Video</option>
                    <option value="text-to-audio">Text to Audio</option>
                  </select>
                </InputField>
                <InputField label="Gateway Endpoint" hint="*">
                  <input className={inputCls} placeholder="/v1/generate" value={formData.endpoint || ''} onChange={e => set({ endpoint: e.target.value })} />
                </InputField>
              </div>

              {/* Pricing — dynamic based on type */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pricing Model</p>
                {isTextType ? (
                  <div className="grid grid-cols-2 gap-3">
                    <InputField label="Input Price" hint="credits / 1K tokens">
                      <input type="number" min="0" step="0.001" className={inputCls} placeholder="e.g. 5" value={formData.price_input || 0} onChange={e => set({ price_input: Number(e.target.value) })} />
                    </InputField>
                    <InputField label="Output Price" hint="credits / 1K tokens">
                      <input type="number" min="0" step="0.001" className={inputCls} placeholder="e.g. 15" value={formData.price_output || 0} onChange={e => set({ price_output: Number(e.target.value) })} />
                    </InputField>
                  </div>
                ) : (
                  <InputField label="Price per Request" hint="credits deducted per generation">
                    <input type="number" min="0" className={inputCls} placeholder="e.g. 10" value={formData.price_per_token || 0} onChange={e => set({ price_per_token: Number(e.target.value) })} />
                  </InputField>
                )}
              </div>

              <InputField label="Description">
                <textarea rows={3} className={inputCls + ' resize-none'} placeholder="What does this API do? Shown on the API details page." value={formData.description || ''} onChange={e => set({ description: e.target.value })} />
              </InputField>

              <InputField label="Features" hint="comma-separated">
                <input className={inputCls} placeholder="Fast generation, HD output, NSFW filter" value={Array.isArray(formData.features) ? formData.features.join(', ') : formData.features || ''} onChange={e => set({ features: e.target.value as any })} />
              </InputField>

              <InputField label="Versions" hint="comma-separated">
                <input className={inputCls} placeholder="v1.0.0, v1.5" value={Array.isArray(formData.versions) ? formData.versions.join(', ') : formData.versions || ''} onChange={e => set({ versions: e.target.value as any })} />
              </InputField>

              <div className="flex items-center gap-3 py-1">
                <StatusToggle active={formData.active ?? true} onChange={v => set({ active: v })} />
                <span className="text-sm text-slate-700 font-medium">{formData.active ? 'Active — visible to users' : 'Inactive — hidden from users'}</span>
              </div>
            </>
          )}

          {tab === 'backend' && (
            <>
              {/* Universal Request Params (DICEGAT ADMIN) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 mb-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Universal Request Defaults (Text & Image)
                </p>

                <InputField label="Model Slug" hint="(e.g. 'qwen-72b', 'sdxl-1.0')">
                  <input className={inputCls} placeholder="Target model name in JSON body" value={formData.model_slug || ''} onChange={e => set({ model_slug: e.target.value })} />
                </InputField>

                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Max Tokens" hint="Hard limit">
                    <input type="number" min="1" className={inputCls} placeholder="e.g. 2048" value={formData.max_tokens || ''} onChange={e => set({ max_tokens: Number(e.target.value) })} />
                  </InputField>
                  <InputField label="Default Temp" hint="If user omits">
                    <input type="number" min="0" max="2" step="0.1" className={inputCls} placeholder="e.g. 0.7" value={formData.default_temperature ?? 0.7} onChange={e => set({ default_temperature: Number(e.target.value) })} />
                  </InputField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Timeout (ms)" hint="Gateway timeout">
                    <input type="number" min="1000" step="1000" className={inputCls} placeholder="e.g. 120000" value={formData.timeout_ms || 120000} onChange={e => set({ timeout_ms: Number(e.target.value) })} />
                  </InputField>
                  <InputField label="Max Input Chars" hint="Batasi prompt user">
                    <input type="number" min="100" step="100" className={inputCls} placeholder="e.g. 8000" value={formData.max_input_chars || 8000} onChange={e => set({ max_input_chars: Number(e.target.value) })} />
                  </InputField>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <InputField label="Speed Mode" hint="fast/balanced/quality">
                    <select className={inputCls} value={formData.speed_mode || 'balanced'} onChange={e => set({ speed_mode: e.target.value })}>
                      <option value="fast">fast</option>
                      <option value="balanced">balanced</option>
                      <option value="quality">quality</option>
                    </select>
                  </InputField>
                  <InputField label="Default Top-P" hint="Sampling">
                    <input type="number" min="0" max="1" step="0.05" className={inputCls} placeholder="e.g. 1" value={formData.default_top_p ?? 1} onChange={e => set({ default_top_p: Number(e.target.value) })} />
                  </InputField>
                  <InputField label="Default Top-K" hint="Sampling">
                    <input type="number" min="0" step="1" className={inputCls} placeholder="e.g. 40" value={formData.default_top_k ?? 40} onChange={e => set({ default_top_k: Number(e.target.value) })} />
                  </InputField>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_streaming"
                    checked={!!formData.is_streaming}
                    onChange={e => set({ is_streaming: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <label htmlFor="is_streaming" className="text-sm text-slate-700">Allow Streaming (Experimental)</label>
                </div>

                <div className="rounded-lg bg-slate-900 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Universal JSON (contoh request)</p>
                  <pre className="text-xs text-emerald-400 whitespace-pre-wrap">{`{
  "model": "${formData.model_slug || 'diatur-admin'}",
  "messages": [{"role":"user","content":"..."}],
  "temperature": ${formData.default_temperature ?? 0.7},
  "max_tokens": ${formData.max_tokens || 1024},
  "top_p": ${formData.default_top_p ?? 1},
  "top_k": ${formData.default_top_k ?? 40},
  "speed_mode": "${formData.speed_mode || 'balanced'}",
  "timeout_ms": ${formData.timeout_ms || 120000},
  "max_input_chars": ${formData.max_input_chars || 8000},
  "stream": ${!!formData.is_streaming}
}`}</pre>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">These settings are <strong>never exposed to users</strong>. They configure how the gateway proxies requests to your real AI server.</p>
              </div>

              <InputField label="Target URL" hint="— real AI server endpoint">
                <input className={inputCls} placeholder="http://192.168.x.x:7860/sdapi/v1/txt2img" value={formData.target_url || ''} onChange={e => set({ target_url: e.target.value })} />
              </InputField>

              <InputField label="Auth Type">
                <select className={inputCls} value={authType} onChange={e => handleAuthTypeChange(e.target.value)}>
                  <option value="none">None — no auth needed</option>
                  <option value="basic">Basic Auth (Username:Password → Base64)</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="apikey">Custom Header (e.g. x-api-key: ...)</option>
                </select>
              </InputField>

              {authType !== 'none' && (
                <InputField
                  label={authType === 'basic' ? 'Credentials (Base64 of user:pass)' : authType === 'bearer' ? 'Bearer Token' : 'Header Value'}
                  hint="— stored encrypted in DB"
                >
                  <div className="relative">
                    <input
                      type="password"
                      className={inputCls + ' pr-10'}
                      placeholder={
                        authType === 'basic' ? 'Run: echo -n "user:pass" | base64' :
                        authType === 'bearer' ? 'eyJhbGciOiJIUzI1...' :
                        'x-api-key: sk-xxxxxxxx'
                      }
                      value={credentialValue()}
                      onChange={e => handleCredentialInput(e.target.value)}
                    />
                    <Lock className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  </div>
                  {authType === 'basic' && (
                    <p className="text-xs text-slate-400 mt-1">
                      Will be stored as: <code className="bg-slate-100 px-1 rounded">Basic {credentialValue() || '<base64>'}</code>
                    </p>
                  )}
                </InputField>
              )}

              {/* Preview of header value sent to upstream */}
              {formData.target_auth && (
                <div className="rounded-lg bg-slate-900 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Upstream auth/header preview</p>
                  <code className="text-xs text-emerald-400 break-all">{formData.target_auth.slice(0, 60)}{formData.target_auth.length > 60 ? '…' : ''}</code>
                  {authType === 'apikey' && !String(formData.target_auth || '').includes(':') && (
                    <p className="text-[10px] text-amber-300 mt-2">
                      Tip: gunakan format <code>x-api-key: your_key</code> agar tidak ambigu.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors">Cancel</button>
          <div className="flex gap-2">
            {tab === 'client' && (
              <button onClick={() => setTab('backend')} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                Backend Config <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {saving ? 'Saving…' : isNew ? 'Create API' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

interface TableProps {
  apis: ApiService[];
  onEdit: (api: ApiService) => void;
  onEditUniversal: (api: ApiService) => void;
  onDelete: (id: string) => void;
  onToggleActive: (api: ApiService) => void;
  onTestConnection: (api: ApiService) => void;
  testing: string | null;
}

function ApiTable({ apis, onEdit, onEditUniversal, onDelete, onToggleActive, onTestConnection, testing }: TableProps) {
  if (apis.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Globe className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-slate-600 font-medium">No API services yet</p>
        <p className="text-slate-400 text-sm mt-1">Click "Add New API" to register your first AI service.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
          <tr>
            <th className="px-5 py-3.5">Service</th>
            <th className="px-5 py-3.5">Endpoint</th>
            <th className="px-5 py-3.5">Pricing</th>
            <th className="px-5 py-3.5">Universal AI (Admin)</th>
            <th className="px-5 py-3.5">Status</th>
            <th className="px-5 py-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {apis.map(api => (
            <tr key={api.id} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-5 py-4">
                <div className="font-semibold text-slate-900 text-sm">{api.name}</div>
                <div className="mt-1"><TypeBadge type={api.type} /></div>
              </td>
              <td className="px-5 py-4">
                <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-md">{api.endpoint}</code>
              </td>
              <td className="px-5 py-4 text-slate-700 text-xs space-y-0.5">
                {api.type === 'text-to-text' ? (
                  <>
                    <div>In: <span className="font-semibold">{api.price_input ?? 0}</span> cr/1K</div>
                    <div>Out: <span className="font-semibold">{api.price_output ?? 0}</span> cr/1K</div>
                  </>
                ) : (
                  <div className="font-semibold">{api.price_per_token} credits/req</div>
                )}
              </td>
              <td className="px-5 py-4 text-xs text-slate-700">
                <div className="space-y-0.5">
                  <div>Model: <span className="font-semibold">{api.model_slug || '-'}</span></div>
                  <div>Max: <span className="font-semibold">{api.max_tokens ?? '-'}</span></div>
                  <div>Temp: <span className="font-semibold">{api.default_temperature ?? 0.7}</span></div>
                  <div>Stream: <span className="font-semibold">{api.is_streaming ? 'ON' : 'OFF'}</span></div>
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <StatusToggle active={api.active ?? true} onChange={() => onToggleActive(api)} />
                  <span className={`text-xs font-medium ${api.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {api.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onTestConnection(api)}
                    disabled={testing === api.id}
                    title="Test connection to target server"
                    className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >
                    {testing === api.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  </button>
                  <button onClick={() => onEdit(api)} title="Edit" className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEditUniversal(api)}
                    title="Atur Universal Request"
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    Universal
                  </button>
                  <button onClick={() => onDelete(api.id)} title="Delete" className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminApis() {
  const [apis, setApis] = useState<ApiService[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminAuthorized, setAdminAuthorized] = useState(true);
  const [schemaMissingColumns, setSchemaMissingColumns] = useState<string[]>([]);
  const [schemaMigrationSql, setSchemaMigrationSql] = useState<string[]>([]);
  const [duplicateEndpoints, setDuplicateEndpoints] = useState<Array<{ endpoint: string; rows: any[] }>>([]);
  const [invalidTargetUrls, setInvalidTargetUrls] = useState<Array<{ id: string; endpoint: string; target_url: string }>>([]);
  const [endpointCleanupSql, setEndpointCleanupSql] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<FormTab>('client');
  const [formData, setFormData] = useState<Partial<ApiService>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Admin endpoint returns full records including target_url/target_auth
      const [res, schemaRes] = await Promise.all([
        http.get('/api/admin/apis'),
        http.get('/api/admin/apis/schema-health').catch(() => null)
      ]);
      setAdminAuthorized(true);
      setApis(res.data.map((a: any) => ({ ...a, active: a.active !== 0 && a.active !== false && a.active !== 'false' })));
      setSchemaMissingColumns(Array.isArray(schemaRes?.data?.missing_columns) ? schemaRes.data.missing_columns : []);
      setSchemaMigrationSql(Array.isArray(schemaRes?.data?.migration_sql) ? schemaRes.data.migration_sql : []);
      setDuplicateEndpoints(Array.isArray(schemaRes?.data?.duplicate_endpoints) ? schemaRes.data.duplicate_endpoints : []);
      setInvalidTargetUrls(Array.isArray(schemaRes?.data?.invalid_target_urls) ? schemaRes.data.invalid_target_urls : []);
      setEndpointCleanupSql(Array.isArray(schemaRes?.data?.endpoint_cleanup_sql) ? schemaRes.data.endpoint_cleanup_sql : []);
    } catch {
      setAdminAuthorized(false);
      // Fallback to public endpoint (no target_auth)
      try {
        const res = await http.get('/api/apis');
        setApis(res.data.map((a: any) => ({ ...a, active: a.active !== 0 && a.active !== false })));
        setSchemaMissingColumns([]);
        setSchemaMigrationSql([]);
        setDuplicateEndpoints([]);
        setInvalidTargetUrls([]);
        setEndpointCleanupSql([]);
      } catch (err) { console.error('Failed to fetch APIs', err); }
    } finally { setLoading(false); }
  };

  const openNew = () => {
    if (!adminAuthorized) {
      showToast('error', 'Admin key invalid/missing. Cannot create API in public fallback mode.');
      return;
    }
    setEditingId('new');
    setDrawerInitialTab('client');
    setFormData({ ...EMPTY_FORM });
    setDrawerOpen(true);
  };

  const openEdit = (api: ApiService) => {
    if (!adminAuthorized) {
      showToast('error', 'Admin key invalid/missing. Cannot edit target_auth in public fallback mode.');
      return;
    }
    setEditingId(api.id);
    setDrawerInitialTab('client');
    setFormData({ ...api });
    setDrawerOpen(true);
  };

  const openEditUniversal = (api: ApiService) => {
    if (!adminAuthorized) {
      showToast('error', 'Admin key invalid/missing. Cannot edit backend config in public fallback mode.');
      return;
    }
    setEditingId(api.id);
    setDrawerInitialTab('backend');
    setFormData({ ...api });
    setDrawerOpen(true);
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); };

  const handleSave = async () => {
    if (!adminAuthorized) {
      showToast('error', 'Admin key invalid/missing. Save is disabled to prevent overwriting hidden fields.');
      return;
    }
    setSaving(true);
    try {
      const { id: _id, ...formWithoutId } = formData as any;
      const payload = {
        ...formWithoutId,
        features: typeof formData.features === 'string'
          ? (formData.features as string).split(',').map(s => s.trim()).filter(Boolean)
          : formData.features,
        versions: typeof formData.versions === 'string'
          ? (formData.versions as string).split(',').map(s => s.trim()).filter(Boolean)
          : formData.versions,
        active: formData.active ? 1 : 0
      };

      if (editingId === 'new') {
        const res = await http.post('/api/admin/apis', payload);
        const skipped = Array.isArray(res.data?.skipped_fields) ? res.data.skipped_fields : [];
        if (skipped.length > 0) {
          showToast('success', `API dibuat. Kolom dilewati (tidak ada di DB): ${skipped.join(', ')}`);
        } else {
          showToast('success', 'API service created successfully.');
        }
      } else {
        const res = await http.put(`/api/admin/apis/${editingId}`, payload);
        if (res.data?.partial) {
          const failed = Array.isArray(res.data?.failed_fields) ? res.data.failed_fields.map((f: any) => f.field).join(', ') : '';
          showToast('error', failed
            ? `Sebagian tersimpan. Kolom gagal: ${failed}`
            : 'Sebagian field gagal disimpan. Cek skema DB.');
        } else if (Array.isArray(res.data?.skipped_fields) && res.data.skipped_fields.length > 0) {
          showToast('success', `API updated. Kolom dilewati (tidak ada di DB): ${res.data.skipped_fields.join(', ')}`);
        } else {
          showToast('success', 'API service updated.');
        }
      }
      closeDrawer();
      fetchData();
    } catch (err: any) {
      const data = err.response?.data || {};
      const detail = data?.detail;
      const details = data?.details;
      const base = data?.error || 'Failed to save. Check admin key and try again.';
      
      let msg = base;
      
      // Show validation details if available
      if (Array.isArray(details) && details.length > 0) {
        msg = `${base}\n\nValidation errors:\n• ${details.join('\n• ')}`;
      } else if (detail) {
        msg = `${base} → ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`;
      }
      
      if (Array.isArray(data?.missing_columns) && data.missing_columns.length > 0) {
        msg = `${base}\n\nMissing database columns: ${data.missing_columns.join(', ')}`;
        if (Array.isArray(data?.migration_sql) && data.migration_sql.length > 0) {
          setSchemaMissingColumns(data.missing_columns);
          setSchemaMigrationSql(data.migration_sql);
        }
      }
      
      console.error('[AdminApis] Save error:', { data, details, detail });
      showToast('error', msg);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!adminAuthorized) {
      showToast('error', 'Admin key invalid/missing. Delete is disabled in public fallback mode.');
      return;
    }
    if (!confirm('Delete this API service? This cannot be undone.')) return;
    try {
      await http.delete(`/api/admin/apis/${id}`);
      showToast('success', 'API service deleted.');
      fetchData();
    } catch { showToast('error', 'Failed to delete.'); }
  };

  const handleToggleActive = async (api: ApiService) => {
    if (!adminAuthorized) {
      showToast('error', 'Admin key invalid/missing. Status update is disabled in public fallback mode.');
      return;
    }
    try {
      await http.put(`/api/admin/apis/${api.id}`, { active: api.active ? 0 : 1 });
      fetchData();
    } catch { showToast('error', 'Failed to update status.'); }
  };

  const handleTestConnection = async (api: ApiService) => {
    setTesting(api.id);
    try {
      const res = await http.post('/api/debug/proxy-test', {
        target_url: api.target_url, target_auth: api.target_auth
      }, { timeout: 12000 });

      const data = res.data;
      if (data.success) {
        const time = data.response_time_ms ? ` (${data.response_time_ms}ms)` : '';
        showToast('success', `✅ ${api.name}: ${data.message || 'Reachable'}${time}`);
      } else {
        const msg = data.message || 'Connection failed';
        const suggestion = data.suggestion ? `\n💡 ${data.suggestion}` : '';
        showToast('error', `❌ ${api.name}: ${msg}${suggestion}`);
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.message || err.message || 'Unknown error';
      showToast('error', `❌ ${api.name}: ${detail}`);
    } finally { setTesting(null); }
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Admin auth is now handled via JWT — no more admin key needed */}

      {!adminAuthorized && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-red-800">Admin mode unavailable.</span>
            <span className="text-red-700 ml-1">
              Data sedang fallback ke endpoint publik, sehingga field sensitif seperti <code className="bg-red-100 px-1 rounded">target_auth</code> tidak ikut terbaca.
              Edit/Create/Delete dinonaktifkan agar API key model yang sudah tersimpan tidak ketimpa kosong.
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">API Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">{apis.length} service{apis.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New API
        </button>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        <p className="font-semibold">Universal JSON untuk AI Text & Image</p>
        <p className="mt-1">
          Klik tombol <span className="font-semibold">Universal</span> pada baris API mana pun, lalu isi
          <span className="font-semibold"> model, temperature, max_tokens, stream</span> di tab Backend Config.
        </p>
      </div>

      {schemaMissingColumns.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p>
            <span className="font-semibold">Skema DB belum lengkap.</span> Kolom setting API yang belum ada:
            <span className="font-mono"> {schemaMissingColumns.join(', ')}</span>
          </p>
          {schemaMigrationSql.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Jalankan SQL berikut di Kroombase:</p>
              <pre className="bg-amber-100 border border-amber-200 rounded-lg p-2 overflow-auto text-xs whitespace-pre-wrap">{schemaMigrationSql.join('\n')}</pre>
            </div>
          )}
        </div>
      )}

      {duplicateEndpoints.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
          <p>
            <span className="font-semibold">Endpoint duplikat aktif terdeteksi.</span> Ini bisa bikin routing gateway ambigu/timeout.
          </p>
          <div className="space-y-1">
            {duplicateEndpoints.map((group) => (
              <div key={group.endpoint} className="text-xs">
                <code className="font-mono">{group.endpoint}</code> → {group.rows.map((r: any) => `#${r.id}${r.active ? '(active)' : ''}`).join(', ')}
              </div>
            ))}
          </div>
          {endpointCleanupSql.length > 0 && (
            <div>
              <p className="font-semibold mb-1">SQL cleanup yang disarankan:</p>
              <pre className="bg-red-100 border border-red-200 rounded-lg p-2 overflow-auto text-xs whitespace-pre-wrap">{endpointCleanupSql.join('\n')}</pre>
            </div>
          )}
        </div>
      )}

      {invalidTargetUrls.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
          <p>
            <span className="font-semibold">Target URL tidak valid terdeteksi.</span> Harus full URL (`http://` atau `https://`).
          </p>
          <div className="space-y-1 text-xs">
            {invalidTargetUrls.map((row) => (
              <div key={String(row.id)}>
                API #{row.id} <code className="font-mono">{row.endpoint}</code> → <code className="font-mono">{String(row.target_url || '') || '(kosong)'}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">JSON Keys Documentation (Admin Guide)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {UNIVERSAL_KEYS_DOC.map(item => (
            <div key={item.key} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
              <code className="text-xs font-semibold text-indigo-700">{item.key}</code>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : (
        <ApiTable
          apis={apis}
          onEdit={openEdit}
          onEditUniversal={openEditUniversal}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onTestConnection={handleTestConnection}
          testing={testing}
        />
      )}

      <ApiDrawer
        open={drawerOpen}
        editingId={editingId}
        formData={formData}
        initialTab={drawerInitialTab}
        onChange={setFormData}
        onSave={handleSave}
        onClose={closeDrawer}
        saving={saving}
      />
    </div>
  );
}
