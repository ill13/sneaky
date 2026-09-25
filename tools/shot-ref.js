// Capture real-game UI reference screenshots (minimap + portrait HUD conventions)
// via the isolated debug Chrome on CDP 9222.
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.join(__dirname, 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERIES = [
  ['ref-minimap-moba', 'MOBA minimap HUD screenshot league of legends'],
  ['ref-minimap-strategy', 'strategy game minimap hud starcraft'],
  ['ref-mobile-hud-portrait', 'mobile game HUD portrait layout screenshot'],
  ['ref-stealth-minimap', 'metal gear solid minimap radar stealth'],
];

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const [name, q] of QUERIES) {
    try {
      await page.goto('https://www.bing.com/images/search?q=' + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3500);
      await page.screenshot({ path: path.join(DIR, name + '.png') });
      console.log('OK  ', name, '-', q);
    } catch (e) {
      console.log('ERR ', name, '-', e.message);
    }
  }
  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('REF ERROR:', e.message); process.exit(2); });
