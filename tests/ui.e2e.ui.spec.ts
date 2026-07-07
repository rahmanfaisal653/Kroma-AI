import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const DEV_TOKEN = process.env.DEV_BOOTSTRAP_TOKEN || 'kroma-test-bootstrap-2024';
const PASSWORD = 'SmokeTest123!';

async function createAccount(request: APIRequestContext, prefix: string, role: 'user' | 'admin' = 'user') {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const register = await request.post('/api/auth/register', { data: { email, password: PASSWORD } });
  expect(register.status(), await register.text()).toBe(200);
  if (role === 'admin') {
    const promote = await request.post('/api/dev/promote-admin', {
      headers: { 'x-dev-token': DEV_TOKEN },
      data: { email },
    });
    expect(promote.status(), await promote.text()).toBe(200);
  }
  return { email, password: PASSWORD };
}

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('UI auth, user app, admin app, and responsive navigation', () => {
  test('public auth pages render and user can register into the user app', async ({ page }) => {
    const email = `ui-register-${Date.now()}@example.test`;

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible();
    await page.getByLabel(/^email$/i).fill(email);
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/confirm password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.getByText(/chat|models|billing|docs|settings/i).first()).toBeVisible();
  });

  test('user login lands in the user app and is blocked from admin', async ({ page, request }) => {
    const user = await createAccount(request, 'ui-user');
    await loginViaUi(page, user.email, user.password);

    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.getByText(/chat|models|billing|docs|settings/i).first()).toBeVisible();

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
  });

  test('admin login lands in the admin app, not the user app', async ({ page, request }) => {
    const admin = await createAccount(request, 'ui-admin', 'admin');
    await loginViaUi(page, admin.email, admin.password);

    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await expect(page.getByText(/admin|overview|users|models|transactions/i).first()).toBeVisible();

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  });

  test('main user pages load without frontend crashes', async ({ page, request }) => {
    const user = await createAccount(request, 'ui-pages');
    await loginViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });

    for (const path of ['/models', '/docs', '/billing', '/keys', '/settings', '/images']) {
      await page.goto(path);
      await expect(page.locator('body')).toContainText(/kroma|models|docs|billing|keys|settings|images|chat|api/i, { timeout: 15_000 });
      await expect(page.locator('body')).not.toContainText(/uncaught|runtime error|failed to fetch/i);
    }
  });

  test('admin pages load without frontend crashes', async ({ page, request }) => {
    const admin = await createAccount(request, 'ui-admin-pages', 'admin');
    await loginViaUi(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    for (const path of ['/admin', '/admin/models', '/admin/users', '/admin/billing/plans', '/admin/billing/methods', '/admin/billing/transactions', '/admin/docs', '/admin/settings']) {
      await page.goto(path);
      await expect(page.locator('body')).toContainText(/admin|models|users|billing|payment|transactions|docs|settings|overview/i, { timeout: 15_000 });
      await expect(page.locator('body')).not.toContainText(/uncaught|runtime error/i);
    }
  });

  test('chat conversations are isolated per authenticated user', async ({ page, request }) => {
    const userA = await createAccount(request, 'ui-chat-owner-a');
    const userB = await createAccount(request, 'ui-chat-owner-b');
    const privateTitle = `private-chat-${Date.now()}`;

    await loginViaUi(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });

    const userAId = await page.evaluate(() => JSON.parse(localStorage.getItem('kroma_user') || '{}').id);
    await page.evaluate(({ userId, title }) => {
      localStorage.setItem(`kroma_conversations_${userId}`, JSON.stringify([
        {
          id: 'private-conversation',
          title,
          modelId: undefined,
          systemPrompt: '',
          messages: [{ role: 'user', content: title, timestamp: Date.now() }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]));
    }, { userId: userAId, title: privateTitle });
    await page.reload();
    const historyTitle = page.locator('span').filter({ hasText: privateTitle });
    if ((await historyTitle.count()) === 0) {
      await page.getByTitle('Toggle history').click();
    }
    await expect(historyTitle).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      localStorage.removeItem('kroma_user');
      localStorage.removeItem('kroma_access_token');
      localStorage.removeItem('kroma_refresh_token');
    });
    await loginViaUi(page, userB.email, userB.password);
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.getByText(privateTitle)).toHaveCount(0);
  });

  test('mobile viewport renders auth and app shell', async ({ page, request }) => {
    const user = await createAccount(request, 'ui-mobile');
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, user.email, user.password);

    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/chat|models|kroma|api/i);
  });
});
