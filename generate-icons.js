/**
 * generate-icons.js
 * Generates PNG icons for Chrome Web Store from the SVG icon.
 * Run: node generate-icons.js
 * Output: extension/icons/icon16.png, icon32.png, icon48.png, icon128.png
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath   = path.join(__dirname, 'extension', 'icons', 'icon.svg');
const outDir    = path.join(__dirname, 'extension', 'icons');

const SIZES = [16, 32, 48, 128];

const svgContent = fs.readFileSync(svgPath, 'utf8');

// Embed SVG in an HTML page sized to each icon dimension
function buildHtml(size) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
  img { width: ${size}px; height: ${size}px; display: block; }
</style>
</head>
<body>
  <img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}" />
</body>
</html>`;
}

(async () => {
  console.log('Generating PNG icons...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(buildHtml(size), { waitUntil: 'networkidle0' });

    const outPath = path.join(outDir, `icon${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`  ✓ icon${size}.png`);
  }

  await browser.close();
  console.log('\nAll icons generated in extension/icons/');
  console.log('Reload the extension at chrome://extensions/ to see the new icon.');
})();
