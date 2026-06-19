/*
 * End-to-end: the game screen, driven by the live backend API (Britain map).
 * Exercises the full chain browser -> Vite proxy -> REST API -> simulation.
 * (Assertions target the DOM HUD; the canvas map is the visual layer.)
 */
import { test, expect } from '@playwright/test';

test('loads live county state from the API (Britain scenario)', async ({ page }) => {
  await page.goto('/');

  // A fresh game starts at turn 0.
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');

  // Hampshire is one of the player's starting counties (tax 18%).
  const hampshire = page.getByTestId('county-hampshire-info');
  await expect(hampshire).toContainText('Hampshire [p1]');
  await expect(hampshire).toContainText('tax 18%');

  // A neutral county is present too.
  await expect(page.getByTestId('county-yorkshire-info')).toContainText('Yorkshire');
});

test('renders the SVG hex-tile map (clickable, DOM-testable)', async ({ page }) => {
  await page.goto('/');

  // The SVG map and county labels are real DOM, so they are queryable.
  await expect(page.getByTestId('map-svg')).toBeVisible();
  const kent = page.getByTestId('county-kent-label');
  await expect(kent).toBeVisible();

  // Clicking a county shows its details in the HUD status.
  await kent.click();
  await expect(page.getByTestId('status')).toContainText('Kent');

  // Settlements (villages) are rendered from population.
  const villages = await page.getByTestId('settlements').locator('g').count();
  expect(villages).toBeGreaterThan(0);

  // Farms (worked crop/pasture tiles) are rendered from the counties' fields.
  const farms = await page.getByTestId('farms').locator('g').count();
  expect(farms).toBeGreaterThan(0);
});

test('End Turn advances the simulation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');

  await page.getByTestId('end-turn').click();

  await expect(page.getByTestId('hud-header')).toContainText('turn 1');
  await expect(page.getByTestId('status')).toContainText('Applied EndTurn');
});

test('raising a player county tax sends a command and updates state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('county-hampshire-info')).toContainText('tax 18%');

  await page.getByTestId('county-hampshire-tax-up').click();

  await expect(page.getByTestId('status')).toContainText('Applied SetTaxRate');
  await expect(page.getByTestId('county-hampshire-info')).toContainText('tax 23%');
});
