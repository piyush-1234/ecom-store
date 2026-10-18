import { test, expect, type Page } from '@playwright/test';

/**
 * Accessibility checks that do not need an external axe dependency.
 *
 * These are the failures that actually block assistive-technology users: missing
 * headings, unnamed controls, images without alt text, and missing landmarks.
 * Colour contrast and deeper ARIA semantics still need a manual/axe pass.
 */

async function auditPage(page: Page, label: string): Promise<void> {
  // Exactly one h1 — the page's primary subject.
  const h1Count = await page.locator('h1').count();
  expect(h1Count, `${label}: expected exactly one h1, found ${h1Count}`).toBe(1);

  // Every image has a non-empty alt attribute.
  const imagesWithoutAlt = await page.locator('img:not([alt]), img[alt=""]').count();
  expect(imagesWithoutAlt, `${label}: ${imagesWithoutAlt} image(s) missing alt text`).toBe(0);

  // Every button has an accessible name (text or aria-label).
  const buttons = page.locator('button');
  const buttonCount = await buttons.count();
  for (let index = 0; index < buttonCount; index += 1) {
    const button = buttons.nth(index);
    const name = (await button.innerText().catch(() => '')).trim();
    const aria = (await button.getAttribute('aria-label')) ?? '';
    const title = (await button.getAttribute('title')) ?? '';
    expect(
      (name || aria || title).length > 0,
      `${label}: button #${index} has no accessible name`,
    ).toBe(true);
  }

  // A main landmark exists and is labelled by the skip link target.
  await expect(page.locator('main#main')).toHaveCount(1);

  // Skip link is present and points at the main landmark.
  const skip = page.getByRole('link', { name: /skip to content/i });
  await expect(skip).toHaveAttribute('href', '#main');
}

test.describe('accessibility basics', () => {
  test('home', async ({ page }) => {
    await page.goto('/');
    await auditPage(page, 'home');
  });

  test('category listing', async ({ page }) => {
    await page.goto('/t-shirts');
    await auditPage(page, 't-shirts');
  });

  test('product detail', async ({ page }) => {
    await page.goto('/t-shirts');
    const href = await page.locator('a[href^="/product/"]').first().getAttribute('href');
    await page.goto(href!);
    await auditPage(page, 'product');

    // The size and colour controls expose their state, not just their label.
    const pressed = page.locator('button[aria-pressed]');
    expect(await pressed.count()).toBeGreaterThan(0);
  });

  test('cart', async ({ page }) => {
    await page.goto('/cart');
    await auditPage(page, 'cart');
  });

  test('size chart tables have captions or headers', async ({ page }) => {
    await page.goto('/size-chart');
    await auditPage(page, 'size-chart');

    const tables = page.locator('table');
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const table = tables.nth(index);
      const headers = await table.locator('th').count();
      expect(headers, `table #${index} has no header cells`).toBeGreaterThan(0);
    }
  });

  test('auth pages', async ({ page }) => {
    await page.goto('/login');
    await auditPage(page, 'login');

    await page.goto('/register');
    await auditPage(page, 'register');
  });

  test('keyboard focus reaches the skip link first', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(focused.toLowerCase()).toContain('skip to content');
  });
});
