// axe-core scan of every page at desktop + mobile. Usage: node scripts/qa/a11y.mjs [baseUrl]
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
const base = process.argv[2] || 'http://localhost:5270';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
let total = 0;
for (const [w, h] of [[1440, 900], [390, 844]]) for (const path of ['/', '/apply/', '/investors/']) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  // reveal everything so contrast is measured on final states
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(800);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  total += r.violations.length;
  console.log(w, path, r.violations.length ? r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`).join('\n   ') : 'clean');
  await page.close();
}
console.log('total violations', total);
await browser.close();
