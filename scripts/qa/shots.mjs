// Headless QA: walks the home page through every chapter at a given viewport and saves screenshots.
// Usage: node scripts/qa/shots.mjs [baseUrl] [w]x[h] [prefix]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5270';
const [w, h] = (process.argv[3] || '1440x900').split('x').map(Number);
const prefix = process.argv[4] || `${w}`;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const out = new URL('../../qa-shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference', isMobile: w < 768, hasTouch: w < 768 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

const stops = [
  ['01-hero', '.chapter--hero', 0],
  ['02-turn-a', '.chapter--turn', 0.08],
  ['03-turn-b', '.chapter--turn', 0.45],
  ['04-turn-c', '.chapter--turn', 0.92],
  ['05-room-a', '.chapter--room', 0.12],
  ['06-room-b', '.chapter--room', 0.75],
  ['07-how', '#how', -0.0],
  ['08-pipe-a', '.chapter--pipe', 0.25],
  ['09-pipe-b', '.chapter--pipe', 0.8],
  ['10-who', '.sheet--who', 0.3],
  ['11-here', '#here', 0.1],
  ['12-rules', '.sheet--rules', 0.05],
  ['13-faq', '#faq', 0],
  ['14-close-a', '.chapter--close', 0.3],
  ['15-close-b', '.chapter--close', 0.97],
  ['16-foot', '.foot', 0],
];
for (const [name, sel, p] of stops) {
  if (only && !only.some((o) => name.includes(o))) continue;
  const y = await page.evaluate(([sel, p]) => {
    const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const top = r.top + window.scrollY;
    const span = Math.max(0, el.offsetHeight - window.innerHeight);
    return Math.round(top + span * p);
  }, [sel, p]);
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(1900);
  const t = await page.evaluate(() => (window.__stage ? +window.__stage.getT().toFixed(3) : null));
  await page.screenshot({ path: `${out}${prefix}-${name}.png` });
  console.log(name, 'y', y, 'T', t);
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
