const assert = require('assert');

function visibleModels(fetchModels, checks) {
  const models = fetchModels();
  const freshChecks = Object.fromEntries(Object.entries(checks).filter(([id]) => models.includes(id)));
  return models.filter(id => freshChecks[id]?.status !== 'off').map(id => ({ id, status: freshChecks[id]?.status || 'unknown' }));
}

assert.deepStrictEqual(
  visibleModels(() => ['groq/live', 'groq/off', 'groq/unknown'], { 'groq/live': { status: 'on' }, 'groq/off': { status: 'off' }, 'groq/deleted': { status: 'on' } }),
  [{ id: 'groq/live', status: 'on' }, { id: 'groq/unknown', status: 'unknown' }]
);

const sameModel = (actual, expected) => !actual || actual === expected || actual.endsWith(`/${expected}`) || expected.endsWith(`/${actual}`);
assert.equal(sameModel('deleted-model', 'live-model'), false);
assert.equal(sameModel('openrouter/live-model', 'live-model'), true);

// ponytail: mirrors gateway stale-check pruning; upgrade by moving helper to shared pure fn when test runner exists.
console.log('ok');