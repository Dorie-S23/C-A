// Rebuild the three Way Out dialogue portraits from the established sprite art.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const jobs = [
  { key: 'kinger', source: 'public/models/game screens/sprites/kinger.png', crop: [5, 0, 79, 88] },
  { key: 'gangle', source: 'public/models/game screens/sprites/gangle.png', crop: [40, 0, 125, 112] },
  { key: 'zooble', source: 'public/models/game screens/sprites/zooble.png', crop: [0, 0, 90, 82] },
];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
try {
  for (const job of jobs) {
    const source = await fs.readFile(job.source);
    const dataUrl = await page.evaluate(async ({ base64, mime, crop }) => {
      const image = new Image();
      image.src = `data:${mime};base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 384;
      const context = canvas.getContext('2d');
      const [x, y, width, height] = crop;
      const scale = Math.min(344 / width, 344 / height);
      const drawWidth = width * scale, drawHeight = height * scale;
      context.drawImage(image, x, y, width, height,
        (384 - drawWidth) / 2, (384 - drawHeight) / 2, drawWidth, drawHeight);
      return canvas.toDataURL('image/webp', 0.94);
    }, { base64: source.toString('base64'), mime: 'image/png', crop: job.crop });
    const output = path.join('public/models/objects/2D dialogue icons', `${job.key}.webp`);
    await fs.writeFile(output, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`Prepared ${output}`);
  }
} finally {
  await browser.close();
}
