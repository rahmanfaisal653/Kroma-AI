import { expect, test, type APIRequestContext } from '@playwright/test';

const DEV_TOKEN = process.env.DEV_BOOTSTRAP_TOKEN || 'kroma-test-bootstrap-2024';
const PASSWORD = 'SmokeTest123!';

type AuthSession = {
  email: string;
  accessToken: string;
  refreshToken: string;
  apiKey: string;
  userId: number | string;
};

async function expectJson(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON but got: ${text.slice(0, 500)}`);
  }
}

async function register(request: APIRequestContext, prefix: string): Promise<AuthSession> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const response = await request.post('/api/auth/register', { data: { email, password: PASSWORD } });
  expect(response.status(), await response.text()).toBe(200);
  const body = await expectJson(response);
  expect(body.accessToken).toBeTruthy();
  expect(body.refreshToken).toBeTruthy();
  expect(body.api_key).toBeTruthy();
  expect(body.user.email).toBe(email);
  return {
    email,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    apiKey: body.api_key,
    userId: body.user.id,
  };
}

async function login(request: APIRequestContext, email: string) {
  const response = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  expect(response.status(), await response.text()).toBe(200);
  return expectJson(response);
}

async function promoteAdmin(request: APIRequestContext, email: string) {
  const response = await request.post('/api/dev/promote-admin', {
    headers: { 'x-dev-token': DEV_TOKEN },
    data: { email },
  });
  expect(response.status(), await response.text()).toBe(200);
  return expectJson(response);
}

test.describe('API, backend, auth, and permission smoke', () => {
  test('health, readiness, and public catalog endpoints are available', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.status(), await health.text()).toBe(200);
    const healthBody = await expectJson(health);
    expect(healthBody.status).toBe('ok');
    expect(healthBody.dependencies.database.status).toBe('ok');
    expect(healthBody.dependencies.database.message).toBe('mysql');

    const ready = await request.get('/api/ready');
    expect(ready.status(), await ready.text()).toBe(200);
    expect((await expectJson(ready)).status).toBe('ready');

    for (const endpoint of ['/api/apis', '/api/docs', '/api/plans', '/api/payment-methods']) {
      const response = await request.get(endpoint);
      expect(response.status(), `${endpoint}: ${await response.text()}`).toBe(200);
      const body = await expectJson(response);
      expect(Array.isArray(body), endpoint).toBe(true);
      expect(body.length, endpoint).toBeGreaterThan(0);
    }
  });

  test('user auth flow, token rotation, profile, quota, keys, billing, and feedback work', async ({ request }) => {
    const session = await register(request, 'api-user');
    const loginBody = await login(request, session.email);
    expect(loginBody.user.role).toBe('user');
    let accessToken = loginBody.accessToken as string;
    const oldRefresh = loginBody.refreshToken as string;

    const refresh = await request.post('/api/auth/refresh', { data: { refreshToken: oldRefresh } });
    expect(refresh.status(), await refresh.text()).toBe(200);
    const refreshBody = await expectJson(refresh);
    accessToken = refreshBody.accessToken;

    const reusedRefresh = await request.post('/api/auth/refresh', { data: { refreshToken: oldRefresh } });
    expect(reusedRefresh.status(), await reusedRefresh.text()).toBe(401);

    const authHeaders = { Authorization: `Bearer ${accessToken}` };
    const me = await request.get('/api/user/me', { headers: authHeaders });
    expect(me.status(), await me.text()).toBe(200);
    expect((await expectJson(me)).email).toBe(session.email);

    const quota = await request.get('/api/user/quota', { headers: authHeaders });
    expect(quota.status(), await quota.text()).toBe(200);
    expect(await expectJson(quota)).toEqual(expect.objectContaining({ usage: expect.any(Number), quota: expect.any(Number) }));

    const key = await request.post('/api/user/generate-key', { headers: authHeaders, data: {} });
    expect(key.status(), await key.text()).toBe(200);
    expect((await expectJson(key)).api_key).toMatch(/^sk-/);

    const reveal = await request.get('/api/user/reveal-key', { headers: authHeaders });
    expect(reveal.status(), await reveal.text()).toBe(200);
    expect((await expectJson(reveal)).user_key).toMatch(/^sk-/);

    const transaction = await request.post('/api/transactions', {
      headers: authHeaders,
      data: { plan_id: 1, payment_method_id: 'bca', user_name: 'Playwright User', notes: 'api e2e' },
    });
    expect(transaction.status(), await transaction.text()).toBe(201);
    expect((await expectJson(transaction)).status).toBe('PENDING');

    const transactions = await request.get('/api/transactions', { headers: authHeaders });
    expect(transactions.status(), await transactions.text()).toBe(200);
    expect(Array.isArray(await expectJson(transactions))).toBe(true);

    const feedback = await request.post('/api/feedback', {
      headers: authHeaders,
      data: { conversation_id: `api-${Date.now()}`, message_index: 0, rating: 'up', comment: 'playwright' },
    });
    expect(feedback.status(), await feedback.text()).toBe(201);

    const feedbackList = await request.get('/api/feedback', { headers: authHeaders });
    expect(feedbackList.status(), await feedbackList.text()).toBe(200);

    const forbidden = await request.get('/api/admin/users', { headers: authHeaders });
    expect(forbidden.status(), await forbidden.text()).toBe(403);
  });

  test('admin permissions and admin CRUD endpoints work', async ({ request }) => {
    const admin = await register(request, 'api-admin');
    await promoteAdmin(request, admin.email);
    const loginBody = await login(request, admin.email);
    expect(loginBody.user.role).toBe('admin');
    const headers = { Authorization: `Bearer ${loginBody.accessToken}` };

    for (const endpoint of [
      '/admin/apis',
      '/admin/apis/schema-health',
      '/api/admin/users',
      '/api/admin/plans',
      '/api/admin/payment-methods',
      '/api/admin/transactions',
      '/api/admin/docs',
      '/api/feedback',
    ]) {
      const response = await request.get(endpoint, { headers });
      expect(response.status(), `${endpoint}: ${await response.text()}`).toBe(200);
    }

    const stamp = Date.now();
    const model = await request.post('/admin/apis', {
      headers,
      data: {
        name: 'Playwright Model',
        type: 'text-to-text',
        endpoint: `/playwright-${stamp}`,
        target_url: 'http://127.0.0.1:9/mock',
        active: false,
        features: ['test'],
        versions: ['v1'],
      },
    });
    expect(model.status(), await model.text()).toBe(201);
    const modelId = (await expectJson(model)).id;

    const updatedModel = await request.put(`/admin/apis/${modelId}`, { headers, data: { name: 'Playwright Model Updated', active: false } });
    expect(updatedModel.status(), await updatedModel.text()).toBe(200);

    const deletedModel = await request.delete(`/admin/apis/${modelId}`, { headers });
    expect(deletedModel.status(), await deletedModel.text()).toBe(200);

    const methodId = `pw-${stamp}`;
    const method = await request.post('/api/admin/payment-methods', {
      headers,
      data: { id: methodId, name: 'Playwright Pay', type: 'manual', min_amount: 1, active: true },
    });
    expect(method.status(), await method.text()).toBe(201);

    const methodUpdate = await request.put(`/api/admin/payment-methods/${methodId}`, { headers, data: { name: 'Playwright Pay Updated', active: false } });
    expect(methodUpdate.status(), await methodUpdate.text()).toBe(200);

    const methodDelete = await request.delete(`/api/admin/payment-methods/${methodId}`, { headers });
    expect(methodDelete.status(), await methodDelete.text()).toBe(200);

    const doc = await request.post('/api/admin/docs', {
      headers,
      data: { title: 'Playwright Doc', slug: `playwright-${stamp}`, content: 'ok', category: 'test', published: true },
    });
    expect(doc.status(), await doc.text()).toBe(200);
    const docId = (await expectJson(doc)).id;

    const docUpdate = await request.put(`/api/admin/docs/${docId}`, { headers, data: { title: 'Playwright Doc Updated' } });
    expect(docUpdate.status(), await docUpdate.text()).toBe(200);

    const docDelete = await request.delete(`/api/admin/docs/${docId}`, { headers });
    expect(docDelete.status(), await docDelete.text()).toBe(200);
  });

  test('admin plan CRUD works with auto credit calculation', async ({ request }) => {
    const admin = await register(request, 'api-admin-plan');
    await promoteAdmin(request, admin.email);
    const loginBody = await login(request, admin.email);
    const headers = { Authorization: `Bearer ${loginBody.accessToken}` };

    const create = await request.post('/api/admin/plans', {
      headers,
      data: { name: `Playwright Plan ${Date.now()}`, price: '25000', credits: 0, bonus_credits: 5, features: ['api', 'ui'], popular: true },
    });
    expect(create.status(), await create.text()).toBe(201);
    const created = await expectJson(create);
    expect(created.credits).toBe(2500);

    const update = await request.put(`/api/admin/plans/${created.id}`, { headers, data: { name: 'Playwright Plan Updated', credits: 3000, popular: false } });
    expect(update.status(), await update.text()).toBe(200);

    const list = await request.get('/api/admin/plans', { headers });
    expect(list.status(), await list.text()).toBe(200);
    expect((await expectJson(list)).some((plan: any) => String(plan.id) === String(created.id))).toBe(true);

    const remove = await request.delete(`/api/admin/plans/${created.id}`, { headers });
    expect(remove.status(), await remove.text()).toBe(200);
  });

  test('admin user update, quota update, and delete work without leaking full keys', async ({ request }) => {
    const admin = await register(request, 'api-admin-user-admin');
    await promoteAdmin(request, admin.email);
    const target = await register(request, 'api-admin-user-target');
    const loginBody = await login(request, admin.email);
    const headers = { Authorization: `Bearer ${loginBody.accessToken}` };

    const update = await request.put(`/api/admin/users/${target.userId}`, { headers, data: { status: 'active', balance: 1234 } });
    expect(update.status(), await update.text()).toBe(200);
    const updated = await expectJson(update);
    expect(updated.balance).toBe(1234);
    expect(updated.user_key).toContain('...');
    expect(updated.user_key).not.toBe(target.apiKey);

    const quota = await request.put(`/api/admin/users/${target.userId}/quota`, { headers, data: { quota_limit: 777, usage_count: 7 } });
    expect(quota.status(), await quota.text()).toBe(200);
    const quotaBody = await expectJson(quota);
    expect(Number(quotaBody.quota_limit)).toBe(777);
    expect(Number(quotaBody.usage_count)).toBe(7);

    const remove = await request.delete(`/api/admin/users/${target.userId}`, { headers });
    expect(remove.status(), await remove.text()).toBe(200);
  });

  test('admin can confirm and reject transactions', async ({ request }) => {
    const admin = await register(request, 'api-admin-tx-admin');
    await promoteAdmin(request, admin.email);
    const userA = await register(request, 'api-admin-tx-user-a');
    const userB = await register(request, 'api-admin-tx-user-b');
    const adminLogin = await login(request, admin.email);
    const adminHeaders = { Authorization: `Bearer ${adminLogin.accessToken}` };

    const txA = await request.post('/api/transactions', {
      headers: { Authorization: `Bearer ${userA.accessToken}` },
      data: { plan_id: 1, payment_method_id: 'bca', user_name: 'Confirm User', notes: 'confirm' },
    });
    expect(txA.status(), await txA.text()).toBe(201);
    const txAId = (await expectJson(txA)).id;

    const confirm = await request.put(`/api/admin/transactions/${txAId}/confirm`, { headers: adminHeaders, data: { notes: 'ok' } });
    expect(confirm.status(), await confirm.text()).toBe(200);
    expect((await expectJson(confirm)).success).toBe(true);

    const txB = await request.post('/api/transactions', {
      headers: { Authorization: `Bearer ${userB.accessToken}` },
      data: { plan_id: 1, payment_method_id: 'bca', user_name: 'Reject User', notes: 'reject' },
    });
    expect(txB.status(), await txB.text()).toBe(201);
    const txBId = (await expectJson(txB)).id;

    const reject = await request.put(`/api/admin/transactions/${txBId}/reject`, { headers: adminHeaders, data: { notes: 'no' } });
    expect(reject.status(), await reject.text()).toBe(200);
    expect((await expectJson(reject)).success).toBe(true);
  });

  test('auth logout, update-key, and dev quota tools work', async ({ request }) => {
    const session = await register(request, 'api-auth-extra');
    const headers = { Authorization: `Bearer ${session.accessToken}` };

    const customKey = `sk-playwright-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const updateKey = await request.put('/api/auth/update-key', { headers, data: { userKey: customKey } });
    expect(updateKey.status(), await updateKey.text()).toBe(200);
    expect((await expectJson(updateKey)).user.user_key).toContain('...');

    const setQuota = await request.post('/api/dev/set-quota', {
      headers: { 'x-dev-token': DEV_TOKEN },
      data: { email: session.email, quota_limit: 4321, usage_count: 12 },
    });
    expect(setQuota.status(), await setQuota.text()).toBe(200);

    const quota = await request.get('/api/user/quota', { headers });
    expect(quota.status(), await quota.text()).toBe(200);
    expect(await expectJson(quota)).toEqual(expect.objectContaining({ quota: 4321, usage: 12 }));

    const logout = await request.post('/api/auth/logout', { headers, data: {} });
    expect(logout.status(), await logout.text()).toBe(200);
  });

  test('feedback delete is admin-only and works', async ({ request }) => {
    const user = await register(request, 'api-feedback-user');
    const admin = await register(request, 'api-feedback-admin');
    await promoteAdmin(request, admin.email);
    const adminLogin = await login(request, admin.email);

    const created = await request.post('/api/feedback', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { conversation_id: `feedback-${Date.now()}`, message_index: 2, rating: 'down', comment: 'delete me' },
    });
    expect(created.status(), await created.text()).toBe(201);
    const feedbackId = (await expectJson(created)).data.id;

    const forbidden = await request.delete(`/api/feedback/${feedbackId}`, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    expect(forbidden.status(), await forbidden.text()).toBe(403);

    const deleted = await request.delete(`/api/feedback/${feedbackId}`, { headers: { Authorization: `Bearer ${adminLogin.accessToken}` } });
    expect(deleted.status(), await deleted.text()).toBe(200);
  });

  test('protected scrape and knowledge ingest endpoints enforce auth and roles', async ({ request }) => {
    const user = await register(request, 'api-protected-user');
    const admin = await register(request, 'api-protected-admin');
    await promoteAdmin(request, admin.email);
    const adminLogin = await login(request, admin.email);

    const noAuthScrape = await request.post('/api/scrape', { data: { url: 'https://example.com' } });
    expect(noAuthScrape.status(), await noAuthScrape.text()).toBe(401);

    const userKnowledge = await request.post('/api/knowledge/add', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { url: 'https://example.com' },
    });
    expect(userKnowledge.status(), await userKnowledge.text()).toBe(403);

    const adminKnowledge = await request.post('/api/knowledge/add', {
      headers: { Authorization: `Bearer ${adminLogin.accessToken}` },
      data: { url: 'https://example.com' },
      timeout: 20_000,
    });
    expect([200, 400, 500, 502, 503, 504]).toContain(adminKnowledge.status());
    expect(await expectJson(adminKnowledge)).toBeTruthy();
  });

  test('async job lookup returns a structured not-found response', async ({ request }) => {
    const response = await request.get('/api/async-jobs/not-a-real-job');
    expect(response.status(), await response.text()).toBe(404);
    expect(await expectJson(response)).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test('AI gateway routes are protected and fail gracefully when upstream is unavailable', async ({ request }) => {
    const unauthenticatedChat = await request.post('/api/chat', { data: { messages: [{ role: 'user', content: 'hello' }] } });
    expect(unauthenticatedChat.status(), await unauthenticatedChat.text()).toBe(401);

    const session = await register(request, 'api-gateway');
    const headers = { Authorization: `Bearer ${session.accessToken}` };

    for (const endpoint of ['/api/chat', '/api/rag/generate']) {
      const response = await request.post(endpoint, {
        headers,
        data: endpoint === '/api/chat'
          ? { messages: [{ role: 'user', content: 'hello' }] }
          : { targetUrl: 'https://example.com', userQuery: 'hello' },
        timeout: 20_000,
      });
      expect([200, 400, 402, 500, 502, 503, 504]).toContain(response.status());
      const body = await expectJson(response);
      expect(body).toBeTruthy();
    }
  });
});
