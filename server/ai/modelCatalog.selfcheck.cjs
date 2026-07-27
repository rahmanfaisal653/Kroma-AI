const assert = require('assert');

// --- Mirrors server/ai/modelCatalog.ts helpers (pure logic extract) ---

function activeCheckedModels(models, checks = {}) {
  return models.filter(id => checks[id]?.status !== 'off');
}

function visibleModels(fetchModels, checks) {
  const models = fetchModels();
  const freshChecks = Object.fromEntries(Object.entries(checks).filter(([id]) => models.includes(id)));
  return models.filter(id => freshChecks[id]?.status !== 'off').map(id => ({ id, status: freshChecks[id]?.status || 'unknown' }));
}

const sameModel = (actual, expected) => !actual || actual === expected || actual.endsWith(`/${expected}`) || expected.endsWith(`/${actual}`);

// --- Tests ---

// 1) Filter off models, keep on + unknown
assert.deepStrictEqual(
  visibleModels(() => ['groq/live', 'groq/off', 'groq/unknown'], { 'groq/live': { status: 'on' }, 'groq/off': { status: 'off' }, 'groq/deleted': { status: 'on' } }),
  [{ id: 'groq/live', status: 'on' }, { id: 'groq/unknown', status: 'unknown' }]
);

// 2) Stale checks that no longer exist are pruned (not in result)
assert.deepStrictEqual(
  visibleModels(() => ['groq/new'], { 'groq/old': { status: 'on' }, 'groq/deleted': { status: 'on' } }),
  [{ id: 'groq/new', status: 'unknown' }]
);

// 3) All untested models appear (commandcode-go case)
assert.deepStrictEqual(
  activeCheckedModels(['cc/model-a', 'cc/model-b', 'cc/model-c'], {}),
  ['cc/model-a', 'cc/model-b', 'cc/model-c']
);

// 4) only 'off' is hidden, 'unknown' + 'on' keep
assert.deepStrictEqual(
  activeCheckedModels(['p/on', 'p/off', 'p/unknown'], { 'p/on': { status: 'on' }, 'p/off': { status: 'off' } }),
  ['p/on', 'p/unknown']
);

// 5) model matching
assert.equal(sameModel('deleted-model', 'live-model'), false);
assert.equal(sameModel('openrouter/live-model', 'live-model'), true);

console.log('ok');
