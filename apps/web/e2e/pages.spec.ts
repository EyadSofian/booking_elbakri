import { test, expect } from '@playwright/test';

/**
 * Every page loads without a client-side exception.
 *
 * A page written against an assumed API shape typechecks perfectly and then
 * white-screens with "Application error". Only actually rendering it catches
 * that, so this walks the whole application. `scripts/check-api-contracts.py`
 * covers the same ground at the field level.
 */
const PAGES = [
  '/dashboard', '/operations', '/trips', '/trips/new',
  '/hotel-bookings', '/transfers', '/excursions', '/visas',
  '/finance', '/finance/payables', '/finance/payments',
  '/finance/settlements', '/finance/reconciliation',
  '/travelers', '/matching', '/imports', '/data-quality', '/reports',
  '/master-data', '/master-data/hotels', '/master-data/partners',
  '/master-data/room-types', '/master-data/drivers',
  '/admin', '/admin/users', '/admin/audit', '/admin/api-keys', '/admin/settings',
  '/notifications', '/account',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', process.env.E2E_EMAIL ?? 'admin@elbakri.local');
  await page.fill('#password', process.env.E2E_PASSWORD ?? '');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
});

for (const path of PAGES) {
  test(`${path} renders`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    const body = await page.innerText('body');
    expect(body, `${path} threw a client-side exception`).not.toContain('Application error');
  });
}

test('trip file tabs all render', async ({ page }) => {
  await page.goto('/trips', { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr, [role=button]', { timeout: 20_000 });
  await page.locator('tbody tr').first().click();
  await page.waitForSelector('button[role=tab]', { timeout: 20_000 });

  const tabs = await page.locator('button[role=tab]').count();
  expect(tabs).toBeGreaterThan(4);

  for (let i = 0; i < tabs; i++) {
    await page.locator('button[role=tab]').nth(i).click();
    await page.waitForTimeout(600);
    const body = await page.innerText('body');
    expect(body, `tab ${i} threw`).not.toContain('Application error');
    // Switching a tab is navigation; it must be in the URL.
    expect(page.url()).toContain('tab=');
  }
});
