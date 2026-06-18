/*
 * End-to-end: the Phaser game screen, driven by the live backend API.
 * Exercises the full chain browser -> Vite proxy -> REST API -> simulation.
 */
import { test, expect } from '@playwright/test';

test('loads live county state from the API', async ({ page }) => {
  await page.goto('/');

  // A fresh game starts at turn 0 (the demo scenario).
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');

  const york = page.getByTestId('county-york-info');
  await expect(york).toContainText('York [p1]');
  await expect(york).toContainText('tax 15%');

  await expect(page.getByTestId('county-kent-info')).toContainText('Kent [p2]');
});

test('End Turn advances the simulation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');

  await page.getByTestId('end-turn').click();

  await expect(page.getByTestId('hud-header')).toContainText('turn 1');
  await expect(page.getByTestId('status')).toContainText('Applied EndTurn');
});

test('raising a county tax sends a command and updates state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('county-york-info')).toContainText('tax 15%');

  await page.getByTestId('county-york-tax-up').click();

  await expect(page.getByTestId('status')).toContainText('Applied SetTaxRate');
  await expect(page.getByTestId('county-york-info')).toContainText('tax 20%');
});
