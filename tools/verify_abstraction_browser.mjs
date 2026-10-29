// Run with Vite on port 5173: node tools/verify_abstraction_browser.mjs
// Loads tools/abstraction-preview.html in headless Chrome for Kaufmo and
// Jax, and checks that the abstraction shader compiles and links on their
// real rigged models, changes the picture at each stage, darkens the body
// once it's gone, and leaves the picture exactly as it was when turned
// off. Also prints the frame cost. SwiftShader draws on the CPU, so compare
// the two figures, not either on its own (the preview's "Measure cost"
// button gives real-GPU figures).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: process.argv.includes('--edge') ? 'msedge' : 'chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
try {
  for (const character of ['kaufmo', 'jax']) {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://localhost:5173/tools/abstraction-preview.html?character=${character}`);
    await page.waitForFunction(() => window.__abstractionPreview?.ready, null, { timeout: 120000 });
    const result = await page.evaluate(() => window.__abstractionPreview.check());
    const cost = await page.evaluate(() => window.__abstractionPreview.measureCost());
    const percent = (share) => `${(share * 100).toFixed(2)}%`;
    const check = (name, fn) => {
      try { fn(); console.log(`PASS ${character}: ${name}`); } catch (error) { failed = true; console.error(`FAIL ${character}: ${name}\n  ${error.message}`); }
    };

    check('the shader compiles and links on every shell', () => {
      assert.deepEqual(result.shaderErrors, []);
      assert.ok(result.shells > 0, 'no shells were made');
      assert.equal(result.linked, true);
      assert.deepEqual(errors, []);
    });
    check(`distress alone shows at the silhouette (${percent(result.rim)} of the picture)`, () => {
      assert.ok(result.rim > 0.0005);
    });
    check(`half gone covers more (${percent(result.half)}), all gone more still (${percent(result.gone)})`, () => {
      assert.ok(result.half > result.rim);
      assert.ok(result.gone > result.half);
    });
    check(`once gone the body goes dark (where it stood: brightness ${result.brightnessBefore.toFixed(0)} → ${result.brightnessAfter.toFixed(0)} of 255)`, () => {
      assert.ok(result.brightnessAfter < result.brightnessBefore * 0.7);
    });
    check('turned off, the picture is exactly as it was', () => {
      assert.equal(result.offAgain, 0);
    });
    console.log(`     ${character}: ${cost.width}×${cost.height}, ${cost.without.toFixed(1)} ms/frame without, `
      + `${cost.with.toFixed(1)} ms with (SwiftShader, CPU)`);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
