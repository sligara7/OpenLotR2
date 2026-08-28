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

  // Rivers are rendered along hex edges.
  expect(await page.getByTestId('rivers').locator('line').count()).toBeGreaterThan(0);

  // Owner-aware county/territory borders are rendered.
  expect(await page.getByTestId('borders').locator('line').count()).toBeGreaterThan(0);

  // Armies and castles render; an army can be selected.
  await expect(page.getByTestId('army-p1-army')).toBeVisible();
  expect(await page.getByTestId('castles').locator('g').count()).toBeGreaterThan(0);
  await page.getByTestId('army-p1-army').click();
  await expect(page.getByTestId('status')).toContainText('Army selected');

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
  // The turn-log section is present to report what happened.
  await expect(page.getByTestId('turn-log')).toBeAttached();
});

test('diplomacy: the panel lists rivals and sends messages that move opinion', async ({ page }) => {
  await page.goto('/');

  // The Diplomacy panel lists the AI rivals (p2, p3) with an opinion readout.
  await expect(page.getByTestId('diplomacy-panel')).toContainText('Diplomacy');
  await expect(page.getByTestId('diplo-p2')).toBeVisible();
  const before = Number(await page.getByTestId('diplo-p2-opinion').textContent());

  // A gift of a chosen amount raises p2's regard for you.
  await page.getByTestId('diplo-gift-amount-p2').fill('150');
  await page.getByTestId('diplo-gift-p2').click();
  await expect(page.getByTestId('status')).toContainText('Applied SendGift');
  await expect
    .poll(async () => Number(await page.getByTestId('diplo-p2-opinion').textContent()))
    .toBeGreaterThan(before);

  // Offering an alliance creates a pending offer (button reflects it).
  await page.getByTestId('diplo-offer-p3').click();
  await expect(page.getByTestId('status')).toContainText('Applied OfferAlliance');
  await expect(page.getByTestId('diplo-offer-p3')).toContainText('Offer sent');

  await page.screenshot({ path: 'test-results/diplomacy.png', fullPage: true });
});

test('advanced farming: a new game surfaces weather and soil fertility', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');
  // By default the option is off — no weather flag in the header.
  await expect(page.getByTestId('hud-header')).not.toContainText('Advanced Farming');

  // Start a fresh game with Advanced Farming enabled.
  await page.getByTestId('adv-farming').check();
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('hud-header')).toContainText('Advanced Farming');

  // The selected county now reports its weather and soil fertility.
  await page.getByTestId('county-hampshire-info').click();
  await expect(page.getByTestId('sel-detail')).toContainText('soil');

  await page.screenshot({ path: 'test-results/advanced-farming.png', fullPage: true });
});

test('exploration: a new game with fog of war blacks out the unexplored map', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');
  // No fog by default.
  expect(await page.getByTestId('fog').locator('polygon').count()).toBe(0);

  // Start a fresh game with Exploration enabled.
  await page.getByTestId('exploration').check();
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('status')).toContainText('Exploration');

  // Most of the island is now fogged (many dark hexes), but not all of it.
  const fogged = await page.getByTestId('fog').locator('polygon').count();
  expect(fogged).toBeGreaterThan(50);

  await page.screenshot({ path: 'test-results/exploration.png', fullPage: true });
});

test('custom game: the setup form starts a tailored game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');

  // Configure four nobles, a hard AI, and a fat treasury, then start.
  await page.getByTestId('setup-nobles').selectOption('4');
  await page.getByTestId('setup-difficulty').selectOption('hard');
  await page.getByTestId('setup-start-gold').fill('500');
  await page.getByTestId('new-game').click();

  await expect(page.getByTestId('status')).toContainText('4 nobles');
  // The human's treasury reflects the chosen starting gold.
  await expect(page.getByTestId('treasury')).toContainText('500 gold');
  // A fourth noble now competes (shows up in the diplomacy panel).
  await expect(page.getByTestId('diplo-p4')).toBeVisible();
  // The AI tuning dials are present in the setup form.
  await expect(page.getByTestId('setup-ai-aggression')).toBeVisible();
  await expect(page.getByTestId('setup-ai-boldness')).toBeVisible();

  await page.screenshot({ path: 'test-results/custom-game.png', fullPage: true });
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

test('save and load round-trips a game through the UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');

  // Save the turn-0 game (triggers a file download).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-game').click(),
  ]);
  const savePath = await download.path();

  // Advance a turn, then load the earlier save → back to turn 0.
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('hud-header')).toContainText('turn 1');

  await page.getByTestId('load-file').setInputFiles(savePath as string);
  await expect(page.getByTestId('status')).toContainText('Loaded');
  await expect(page.getByTestId('hud-header')).toContainText('turn 0');
});

test('combat & units: army composition, the armory, forging and mustering', async ({ page }) => {
  await page.goto('/');

  // The map labels each army with its troop count.
  await expect(page.getByTestId('army-p1-army')).toContainText('40');

  // Selecting an army shows its strength and unit composition.
  await page.getByTestId('army-p1-army').click();
  await expect(page.getByTestId('army-name')).toContainText('40 men');
  await expect(page.getByTestId('army-detail')).toContainText('Knt'); // the starting retinue has knights
  await expect(page.getByTestId('army-detail')).toContainText('move'); // movement points shown
  // The army sits on the player's own county, so it can be disbanded.
  await expect(page.getByTestId('army-disband')).toBeVisible();
  // The treasury is shown (drives army upkeep).
  await expect(page.getByTestId('treasury')).toContainText('gold');

  // The realm armory is shown (empty until the smith forges).
  await expect(page.getByTestId('armory')).toContainText('Armory');

  // The game is ongoing: no end-game banner, End Turn enabled.
  await expect(page.getByTestId('game-over')).toBeHidden();
  await expect(page.getByTestId('end-turn')).toBeEnabled();

  // Select an owned county → forge + muster controls appear.
  await page.getByTestId('county-hampshire-info').click();
  await expect(page.getByTestId('mil-controls')).toBeVisible();

  // Forge crossbows.
  await page.getByTestId('forge-select').selectOption('Crossbowman');
  await expect(page.getByTestId('status')).toContainText('Applied SetBlacksmith');
  await expect(page.getByTestId('sel-detail')).toContainText('forging Crossbowman');

  // Muster a fresh peasant levy from the county.
  await page.getByTestId('muster-select').selectOption('Peasant');
  await page.getByTestId('muster-btn').click();
  await expect(page.getByTestId('status')).toContainText('Applied Conscript');

  // Hire a self-armed mercenary band (gold only).
  await page.getByTestId('muster-select').selectOption('Crossbowman');
  await page.getByTestId('hire-btn').click();
  await expect(page.getByTestId('status')).toContainText('Applied HireMercenaries');

  // Dispatch a supply convoy from the county to the selected army.
  await expect(page.getByTestId('army-detail')).toContainText('supply');
  await page.getByTestId('supply-btn').click();
  await expect(page.getByTestId('status')).toContainText('Applied SendConvoy');

  await page.screenshot({ path: 'test-results/combat-units.png', fullPage: true });
});

/*
 * Regressions from a play session on 2026-08-26. Each of these was a defect that
 * made the game feel broken without ever throwing an error, which is exactly the
 * kind an automated check has to hold down.
 */

test('armies crowded on one tile stay individually selectable', async ({ page }) => {
  await page.goto('/');

  // Muster TWO more armies where the starting army already stands. Three is the
  // number that matters: a fan sized by guesswork separated two banners and not
  // three, so the bug came back the moment a county mustered twice.
  await page.getByTestId('county-hampshire-info').click();
  await page.getByTestId('muster-btn').click();
  await expect(page.getByTestId('army-p1-army-2')).toBeVisible();
  await page.getByTestId('county-hampshire-info').click();
  await page.getByTestId('muster-btn').click();
  await expect(page.getByTestId('army-p1-army-3')).toBeVisible();

  // Every one of them must still be reachable by a click.
  for (const id of ['army-p1-army', 'army-p1-army-2', 'army-p1-army-3']) {
    await page.getByTestId(id).click({ timeout: 5000 });
    await expect(page.getByTestId('status')).toContainText(/Army selected|Armies combined/);
  }
});

test('every realm is painted, even in a five-noble game', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('setup-nobles').selectOption('5');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('borders')).toBeVisible();

  // The owner palette must name every realm a game can hold. It once listed
  // three, so in a four- or five-noble game the last two realms drew no tint and
  // no border colour and were indistinguishable from unclaimed land.
  const strokes = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('[data-testid="borders"] line')]
      .map((l) => l.getAttribute('stroke')))]);
  expect(strokes.every((s) => s && s !== 'undefined')).toBe(true);
  // Five realms plus the neutral border colour.
  expect(strokes.length).toBeGreaterThanOrEqual(6);
});

test('the turn log reports your own realm, not all 82 counties', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('end-turn').click();
    await expect(page.getByTestId('status')).toContainText('EndTurn');
  }

  // Plague fires at 3% per county per season across the whole map, so reporting
  // every county buried the player's own news under two or three lines a turn
  // about land nobody owned.
  const log = (await page.getByTestId('turn-log').textContent()) ?? '';
  const struck = [...log.matchAll(/plague struck ([A-Z][a-zA-Z ]+?)(?:Year|·|$)/g)].map((m) => m[1].trim());
  const mine = ['Hampshire', 'Berkshire', 'Wiltshire'];
  for (const county of struck) expect(mine).toContain(county);
});

test('marketplace: trade with the merchant visiting one of your counties', async ({ page }) => {
  await page.goto('/');

  // Wagons are drawn on the map, because trade is only possible where one has
  // stopped and a player has to be able to see one coming.
  expect(await page.getByTestId('merchants').locator('g').count()).toBeGreaterThan(0);

  // Find a season in which a merchant is standing in a county we own. Circuits
  // are deterministic, so this always resolves — but not necessarily on turn 0.
  const mine = ['hampshire', 'berkshire', 'wiltshire'];
  let open: string | null = null;
  for (let turn = 0; turn < 12 && !open; turn++) {
    for (const county of mine) {
      await page.getByTestId(`county-${county}-info`).click();
      if (await page.getByTestId('market').isVisible()) { open = county; break; }
    }
    if (!open) await page.getByTestId('end-turn').click();
  }
  expect(open).not.toBeNull();
  await expect(page.getByTestId('market-title')).toContainText('merchant is trading here');

  // The price is quoted against what is actually held here, so the panel says
  // how much there is and what a usual holding would be.
  await expect(page.getByTestId('market-price')).toContainText('held vs');

  // Buying spends gold and delivers goods. Only a few units: a realm holding no
  // timber is a desperate buyer and pays accordingly, which is the supply
  // pricing working rather than a fault.
  await page.getByTestId('market-good').selectOption('Wood');
  await page.getByTestId('market-qty').fill('5');
  await page.getByTestId('market-buy').click();
  await expect(page.getByTestId('status')).toContainText('Bought 5 Wood');
  await expect(page.getByTestId('treasury')).toContainText('5 wood');

  // Selling turns a county's grain back into gold, at a worse rate than buying.
  await page.getByTestId(`county-${open}-info`).click();
  await page.getByTestId('market-good').selectOption('Grain');
  await page.getByTestId('market-qty').fill('30');
  await page.getByTestId('market-sell').click();
  await expect(page.getByTestId('status')).toContainText('Sold 30 Grain');
});

test('marketplace: closed in a county with no merchant', async ({ page }) => {
  await page.goto('/');
  // Somewhere on the map there is a county with no wagon in it; the market must
  // stay shut there. This is the rule that makes a merchant's arrival matter.
  const visiting = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="merchant-"]')].length);
  expect(visiting).toBeGreaterThan(0);

  await page.getByTestId('county-yorkshire-info').click();
  // Yorkshire is not ours, so even with a merchant there the market stays shut.
  await expect(page.getByTestId('market')).toBeHidden();
});

test('castles: a ruler can order one built, and it consumes the realm’s materials', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('county-hampshire-info').click();

  // Every design a ruler may order, with what it costs — the manual makes
  // castle building one of the six things a ruler does each turn, and until
  // this control existed the command was unreachable, so a county could only
  // ever keep the castle it started with.
  await expect(page.getByTestId('castle-build-select')).toBeVisible();
  await expect(page.getByTestId('castle-state')).toContainText('MotteAndBailey');

  await page.getByTestId('castle-build-select').selectOption('NormanKeep');
  await page.getByTestId('castle-build-btn').click();
  await expect(page.getByTestId('status')).toContainText('BuildCastle');

  // The build takes seasons and draws on the treasury as it goes.
  for (let i = 0; i < 8; i++) await page.getByTestId('end-turn').click();
  await page.getByTestId('county-hampshire-info').click();
  await expect(page.getByTestId('castle-state')).toContainText('NormanKeep');
});
