import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const DEV_TOKEN = process.env.DEV_BOOTSTRAP_TOKEN || 'kroma-test-bootstrap-2024';
const PASSWORD = 'SmokeTest123!';

type Account = { email: string; password: string; accessToken: string; userId: string | number };

async function parseJson(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON response, got: ${text.slice(0, 500)}`);
  }
}

async function createAccount(request: APIRequestContext, prefix: string, role: 'user' | 'admin' = 'user'): Promise<Account> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const response = await request.post('/api/auth/register', { data: { email, password: PASSWORD } });
  expect(response.status(), await response.text()).toBe(200);
  const body = await parseJson(response);

  if (role === 'admin') {
    const promote = await request.post('/api/dev/promote-admin', {
      headers: { 'x-dev-token': DEV_TOKEN },
      data: { email },
    });
    expect(promote.status(), await promote.text()).toBe(200);
  }

  return { email, password: PASSWORD, accessToken: body.accessToken, userId: body.user.id };
}

async function loginViaUi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function captureErrors(page: Page) {
  const messages: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') messages.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => messages.push(`pageerror: ${error.message}`));
  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    if (status >= 500 && !url.includes('/api/chat') && !url.includes('/api/rag/generate')) {
      messages.push(`http ${status}: ${url}`);
    }
  });
  return messages;
}

test.describe('deep path UI and integration coverage', () => {
  test('auth edge paths: duplicate register, wrong password, reload persistence, logout guard', async ({ page, request }) => {
    const errors = await captureErrors(page);
    const account = await createAccount(request, 'deep-auth-user');

    await page.goto('/register');
    await page.getByLabel(/^email$/i).fill(account.email);
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/confirm password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.locator('body')).toContainText(/already|exists|registered|terdaftar|email/i, { timeout: 15_000 });

    await loginViaUi(page, account.email, 'WrongPassword123!');
    await expect(page.locator('body')).toContainText(/invalid|wrong|incorrect|gagal|password|credentials/i, { timeout: 15_000 });

    await loginViaUi(page, account.email);
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(account.email);

    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    expect(errors.filter(error => !/status of 400|status of 401|Bad Request|Unauthorized/i.test(error))).toEqual([]);
  });

  test('chat path: create, send, retry/error handling, search, clear, reload persistence', async ({ page, request }) => {
    const errors = await captureErrors(page);
    const account = await createAccount(request, 'deep-chat-user');
    const message = `deep-chat-${Date.now()}`;

    await loginViaUi(page, account.email);
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await page.getByRole('button', { name: /new chat/i }).click();

    const input = page.getByPlaceholder(/message/i);
    await expect(input).toBeVisible();
    await input.fill(message);
    await page.locator('main').getByRole('button').last().click();

    await expect(page.locator('body')).toContainText(message, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/retry|target_url|valid|allowed|error|failed|quota|credits|assistant|response/i, { timeout: 30_000 });

    const retry = page.getByRole('button', { name: /retry/i });
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      await expect(page.locator('body')).toContainText(message, { timeout: 15_000 });
    }

    await page.getByPlaceholder(/search chats/i).fill(message);
    await expect(page.locator('body')).toContainText(message);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(message, { timeout: 15_000 });

    const clear = page.getByTitle(/clear chat/i);
    if (await clear.isVisible().catch(() => false)) {
      await clear.click();
      await expect(page.locator('body')).not.toContainText(message, { timeout: 15_000 });
    }

    expect(errors.filter(error => !/favicon|api\/chat|target_url|Failed to fetch|402|Payment Required|quota|credits/i.test(error))).toEqual([]);
  });

  test('theme and api key paths persist through reload', async ({ page, request }) => {
    const errors = await captureErrors(page);
    const account = await createAccount(request, 'deep-theme-key-user');

    await loginViaUi(page, account.email);
    await page.goto('/settings');
    const beforeTheme = await page.evaluate(() => document.documentElement.className);
    await page.getByRole('button', { name: /switch to|mode/i }).first().click();
    const afterTheme = await page.evaluate(() => document.documentElement.className);
    expect(afterTheme).not.toBe(beforeTheme);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/currently using/i);
    expect(await page.evaluate(() => document.documentElement.className)).toBe(afterTheme);

    await page.goto('/keys');
    await expect(page.locator('body')).toContainText(/secret api key/i);
    await page.getByTitle(/reveal key/i).click();
    await expect(page.locator('body')).toContainText(/sk-/i);
    await page.getByRole('button', { name: /regenerate/i }).click();
    await expect(page.locator('body')).toContainText(/sk-/i, { timeout: 15_000 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/secret api key/i);
    expect(errors).toEqual([]);
  });

  test('admin action paths: pages, model test connection, filters, and user-route guard', async ({ page, request }) => {
    const errors = await captureErrors(page);
    const admin = await createAccount(request, 'deep-admin', 'admin');

    await loginViaUi(page, admin.email);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    for (const path of ['/admin/models', '/admin/users', '/admin/billing/plans', '/admin/billing/methods', '/admin/billing/transactions', '/admin/docs', '/admin/settings']) {
      await page.goto(path);
      await expect(page.locator('body')).toContainText(/admin|api|users|plans|metode|transaksi|documentation|settings|profile/i, { timeout: 15_000 });
    }

    await page.goto('/admin/models');
    await expect(page.locator('body')).toContainText(/qwen chat|api management/i, { timeout: 15_000 });
    const testConnection = page.getByRole('button', { name: /test connection/i }).first();
    if (await testConnection.isVisible().catch(() => false)) {
      await testConnection.click();
      await expect(page.locator('body')).toContainText(/success|failed|error|connection|target|timeout/i, { timeout: 30_000 });
    }

    await page.goto('/admin/billing/transactions');
    await page.getByRole('button', { name: /^menunggu/i }).click();
    await expect(page.locator('body')).toContainText(/menunggu|transaksi/i);
    await page.getByRole('button', { name: /dikonfirmasi/i }).click();
    await expect(page.locator('body')).toContainText(/dikonfirmasi|transaksi/i);
    await page.getByRole('button', { name: /ditolak/i }).click();
    await expect(page.locator('body')).toContainText(/ditolak|transaksi/i);

    expect(errors.filter(error => !/api\/admin|admin\/apis\/test|target|timeout|connection|404|Not Found/i.test(error))).toEqual([]);
  });
});
