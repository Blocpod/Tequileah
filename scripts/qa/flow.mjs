// Walks an application flow end to end (keyboard first), including an invalid email, and screenshots key states.
// Usage: node scripts/qa/flow.mjs [baseUrl] [builder|investor] [w]x[h]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5270';
const kind = process.argv[3] || 'builder';
const [w, h] = (process.argv[4] || '1440x900').split('x').map(Number);
const out = new URL('../../qa-shots/', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/${kind === 'builder' ? 'apply' : 'investors'}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: `${out}${w}-flow-${kind}-${n}.png` });
const q = () => page.$eval('.step-q:not([hidden]) .step-q__q', (e) => e.textContent.trim());
const tap = () => page.click('.step-q:not([hidden]) input:not([type=radio]):not([type=checkbox]), .step-q:not([hidden]) textarea').catch(() => {});
const press = async () => { await page.keyboard.press('Enter'); await page.waitForTimeout(450); };

console.log('1', await q()); await shot('1'); await tap();
await press(); console.log('empty-name error:', await page.$eval('.step-q:not([hidden]) .step-q__err', (e) => e.textContent));
await page.keyboard.type('Ana Test'); await press();
console.log('2', await q()); await tap();
await page.keyboard.type('not-an-email'); await press();
console.log('bad-email error:', await page.$eval('.step-q:not([hidden]) .step-q__err', (e) => e.textContent));
await page.fill('.step-q:not([hidden]) input', 'ana@example.com'); await press();
if (kind === 'investor') { console.log('3', await q()); await tap(); await press(); }
console.log('place q:', await q());
await page.click(`.step-q:not([hidden]) .chip:has-text("${kind === 'builder' ? 'Kendall' : 'Palm Beach'}")`);
await page.waitForTimeout(900); await shot('2-place');
await press();
console.log('next q:', await q());
if (kind === 'builder') {
  await tap(); await page.keyboard.type('A scheduling tool for barbershops in Hialeah, with 40 shops using it.'); await page.click('[data-next]'); await page.waitForTimeout(450);
  await tap(); await page.keyboard.type('https://example.com'); await press();
  await page.click('.step-q:not([hidden]) .chip:has-text("Engineering")'); await page.click('.step-q:not([hidden]) .chip:has-text("Design")');
} else {
  await page.click('.step-q:not([hidden]) .chip:has-text("Seed")'); await press();
  await page.click('.step-q:not([hidden]) .chip:has-text("AI")');
}
await shot('3-last');
await page.click('[data-next]');
await page.waitForTimeout(1400); await shot('4-sending');
await page.waitForTimeout(2600); await shot('5-done');
console.log('done:', await page.$eval('.done__t', (e) => e.textContent), 'focused:', await page.evaluate(() => document.activeElement?.className));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
