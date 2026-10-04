import { chromium } from 'playwright';

const url = 'http://localhost:4175/game%20screens/roomselection.html';
const shotDir = 'C:\\Users\\dorsa\\AppData\\Local\\Temp\\claude\\c--Users-dorsa-OneDrive-Documents-COMS-3-CGV-Game-C-A\\3faeb38b-153e-45a6-9828-1e3ece15b82b\\scratchpad';

async function checkRoom(roomKey, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

  page.on('console', (msg) => console.log(`[${label}][console:${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log(`[${label}][pageerror]`, err.message));
  page.on('crash', () => console.log(`[${label}][CRASHED]`));
  page.on('requestfailed', (req) => console.log(`[${label}][requestfailed]`, req.url(), req.failure()?.errorText));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log(`[${label}][http ${res.status()}]`, res.url());
  });

  console.log(`[${label}] navigating...`);
  await page.goto(url, { waitUntil: 'load' });
  console.log(`[${label}] clicking room button...`);
  await page.click(`button[data-room="${roomKey}"]`);

  console.log(`[${label}] waiting for load to finish...`);
  await page.waitForFunction(
    () => !document.getElementById('overlay').classList.contains('loading'),
    undefined,
    { timeout: 60000 },
  );
  console.log(`[${label}] loaded, screenshotting...`);
  await page.screenshot({ path: `${shotDir}/${label}_1_ready.png`, timeout: 60000 });

  console.log(`[${label}] clicking overlay to lock pointer...`);
  await page.click('#overlay');
  await page.waitForTimeout(500);
  console.log(`[${label}] locked, screenshotting...`);
  await page.screenshot({ path: `${shotDir}/${label}_2_locked.png`, timeout: 60000 });

  console.log(`[${label}] pressing S...`);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyS');
  console.log(`[${label}] moved, screenshotting...`);
  await page.screenshot({ path: `${shotDir}/${label}_3_moved.png`, timeout: 60000 });

  console.log(`[${label}] done, closing.`);
  await browser.close();
}

await checkRoom('pomni', 'pomni');
console.log('=== pomni done, starting tadc ===');
await checkRoom('tadc', 'tadc');
