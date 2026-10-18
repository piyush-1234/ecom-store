import { test, expect } from '@playwright/test';

/**
 * End-to-end: admin access and the pages behind it.
 *
 * Covers the guard (a real browser redirect), login, and that each admin surface
 * renders for an authenticated staff user.
 */

const EMAIL = process.env.ADMIN_SEED_EMAIL ?? 'admin@ecomerce-store.local';
const PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? 'admin-dev-password-1';

test.describe('admin', () => {
  test('guarded pages redirect to login, then login works', async ({ page }) => {
    // --- guard ---
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/admin/i);

    // --- bad credentials are refused ---
    await page.getByLabel('Admin email').fill(EMAIL);
    await page.getByLabel('Password').fill('definitely-wrong-1');
    await page.getByRole('button', { name: /Sign in to admin/i }).click();
    // Next injects its own role="alert" route announcer, so match the text rather
    // than the role alone.
    await expect(page.getByText(/Incorrect email or password/i)).toBeVisible();

    // --- good credentials ---
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /Sign in to admin/i }).click();

    await expect(page).toHaveURL(/\/admin\/orders/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Orders/i);

    // --- every admin surface renders ---
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Dashboard/i);
    await expect(page.getByText(/Revenue/i).first()).toBeVisible();

    await page.getByRole('link', { name: 'Products', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Products/i);

    await page.getByRole('link', { name: 'Inventory', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Inventory/i);

    await page.getByRole('link', { name: 'Coupons', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Coupons/i);

    await page.getByRole('link', { name: 'Returns', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Returns/i);
  });

  test('admin session survives a reload and signs out', async ({ page, context }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Admin email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /Sign in to admin/i }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);

    await page.reload();
    await expect(page).toHaveURL(/\/admin\/orders/);

    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/);

    // The cookie is gone: the guard rejects again.
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login/);

    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'es_admin')).toBeUndefined();
  });
});
