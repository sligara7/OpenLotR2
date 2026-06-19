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

  // The map zooms (viewport transform scales up).
  await page.getByTestId('map-zoom-in').click();
  const transform = await page.getByTestId('map-viewport').getAttribute('transform');
  const scale = Number(transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? '1');
  expect(scale).toBeGreaterThan(1);

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

test('selecting a county exposes tax/ration/labour controls that send commands', async ({ page }) => {
  await page.goto('/');

  // Select the player's county (on the map) → its control panel populates.
  await page.getByTestId('county-hampshire-label').click();
  await expect(page.getByTestId('sel-name')).toContainText('Hampshire');
  await expect(page.getByTestId('sel-tax')).toContainText('18%');

  // Tax control.
  await page.getByTestId('sel-tax-up').click();
  await expect(page.getByTestId('status')).toContainText('Applied SetTaxRate');
  await expect(page.getByTestId('sel-tax')).toContainText('23%');

  // Rations control (Normal → Double).
  await page.getByTestId('sel-ration-up').click();
  await expect(page.getByTestId('status')).toContainText('Applied SetRation');
  await expect(page.getByTestId('sel-ration')).toContainText('Double');

  // Labour split control.
  await page.getByTestId('sel-ind-up').click();
  await expect(page.getByTestId('status')).toContainText('Applied SetLabourPolicy');
});

test('realm overview manages all owned counties (per-county + bulk)', async ({ page }) => {
  await page.goto('/');

  // Every owned county appears in the realm overview with its controls.
  await expect(page.getByTestId('realm-hampshire')).toBeVisible();
  await expect(page.getByTestId('realm-berkshire')).toBeVisible();
  await expect(page.getByTestId('realm-hampshire-tax')).toContainText('18%');

  // Per-county control directly in the overview (no need to select).
  await page.getByTestId('realm-hampshire-tax-up').click();
  await expect(page.getByTestId('realm-hampshire-tax')).toContainText('23%');

  // Bulk: raise rations for EVERY owned county in one click.
  await page.getByTestId('realm-bulk-ration-up').click();
  await expect(page.getByTestId('status')).toContainText('counties');
  await expect(page.getByTestId('realm-hampshire-ration')).toContainText('Double');
  await expect(page.getByTestId('realm-berkshire-ration')).toContainText('Double');
  await expect(page.getByTestId('realm-wiltshire-ration')).toContainText('Double');
});
