import { test, expect } from '@playwright/test';

test('deposit, autonomous allocation, HOLD and automatic rebalance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make your money work.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/deposit-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'START AUTOPILOT' }).click();
  await expect(page.getByTestId('current-asset')).toHaveText('BRAt');
  await expect(page.getByText('Brazil has a lower nominal APR than Argentina, but a higher expected return after FX risk.')).toBeVisible();
  await page.screenshot({ path: 'test-results/active-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Test a small improvement' }).click();
  await expect(page.getByRole('heading', { name: 'HOLD BRAt' })).toBeVisible();
  await expect(page.getByText('Moving would destroy value after execution costs.')).toBeVisible();
  await expect(page.getByTestId('decision-math')).toContainText('-0.039%');
  await page.screenshot({ path: 'test-results/hold-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'SIMULATE MARKET CHANGE' }).click();
  await expect(page.getByTestId('current-asset')).toHaveText('ARGt');
  await expect(page.getByTestId('decision-math')).toContainText('+0.361%');
  await expect(page.getByTestId('decision-math')).toContainText('8.8 days');
  await expect(page.getByRole('log')).toContainText('REBALANCE ARGt');
  await page.screenshot({ path: 'test-results/rebalance-desktop.png', fullPage: true });
  await page.getByText('How your money is working').click();
  await expect(page.getByText('Twin Finance local-currency stablecoin')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile layout, custom amount and reset while scanning', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/deposit-mobile.png', fullPage: true });
  await page.getByLabel('Start with simulated capital').fill('2500');
  await page.getByRole('button', { name: 'START AUTOPILOT' }).click();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByRole('heading', { name: 'Make your money work.' })).toBeVisible();
  await page.getByRole('button', { name: 'START AUTOPILOT' }).click();
  await expect(page.getByTestId('current-asset')).toHaveText('BRAt');
  await expect(page.getByTestId('portfolio-value')).toContainText('$2,500.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/active-mobile.png', fullPage: true });
});

test('unavailable liquidity is visible and never deploys', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Start with simulated capital').fill('100001');
  await page.getByRole('button', { name: 'START AUTOPILOT' }).click();
  await expect(page.getByRole('heading', { name: 'No eligible strategy' })).toBeVisible();
  await expect(page.getByTestId('current-asset')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SIMULATE MARKET CHANGE' })).toBeDisabled();
  await expect(page.getByText('Excluded from allocation', { exact: false })).toHaveCount(3);
});
