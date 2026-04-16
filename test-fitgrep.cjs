const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const FIT_FILE = path.join(__dirname, 'externalHR.fit');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Capture console logs and errors
  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error(`[PAGE ERROR] ${err.message}`));

  // Navigate to the app
  await page.goto('https://fitgrep.je.mk/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000); // wait for app to initialize

  // Screenshot before
  await page.screenshot({ path: 'fitgrep-before.png', fullPage: true });
  console.log('--- Screen BEFORE uploading .FIT file ---');

  // Dump all clickable elements
  const clickable = await page.evaluate(() => {
    const all = document.querySelectorAll('button, [role="button"], input, a');
    return Array.from(all).map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().substring(0, 100),
      class: el.className?.substring(0, 80),
      type: el.type || null,
      accept: el.accept || null,
      id: el.id
    }));
  });
  console.log('\n--- All clickable elements ---');
  clickable.forEach((c, i) => console.log(`[${i}] <${c.tag}> "${c.text}" type="${c.type}" accept="${c.accept}" class="${c.class}"`));

  // Upload the .FIT file via the file input
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    console.log('\n--- Found file input, uploading externalHR.fit... ---');
    await fileInput.setInputFiles(FIT_FILE);
    await page.waitForTimeout(5000); // wait for parsing + rendering

    // Screenshot after
    await page.screenshot({ path: 'fitgrep-after.png', fullPage: true });
    console.log('\n--- Screen AFTER uploading .FIT file ---');

    // Inspect what changed
    const afterState = await page.evaluate(() => {
      const body = document.body;
      return {
        totalElements: document.querySelectorAll('*').length,
        bodyText: body.textContent?.substring(0, 2000),
        hasCharts: !!document.querySelector('canvas'),
        chartCanvases: document.querySelectorAll('canvas').length,
        hasMap: !!document.querySelector('.leaflet-container'),
        hasStats: !!document.querySelector('[class*="stats"], [class*="Stats"]'),
        hasSummary: !!document.querySelector('[class*="summary"], [class*="Summary"]'),
        hasUploadZone: !!document.querySelector('[class*="upload"], [class*="Upload"]'),
      };
    });
    console.log(`\n--- Post-upload state ---`);
    console.log(`Total DOM elements: ${afterState.totalElements}`);
    console.log(`Has charts (canvas): ${afterState.hasCharts} (${afterState.chartCanvases} canvases)`);
    console.log(`Has map: ${afterState.hasMap}`);
    console.log(`Has stats panel: ${afterState.hasStats}`);
    console.log(`Has summary: ${afterState.hasSummary}`);
    console.log(`Upload zone still visible: ${afterState.hasUploadZone}`);

    // Get workout summary info
    const summary = await page.evaluate(() => {
      const summaryEls = document.querySelectorAll('[class*="summary"], [class*="Summary"], [class*="workout"], [class*="Workout"]');
      return Array.from(summaryEls).map(el => ({
        text: el.textContent?.trim().substring(0, 300),
        class: el.className?.substring(0, 80)
      }));
    });
    if (summary.length > 0) {
      console.log('\n--- Summary/Workout elements ---');
      summary.forEach(s => console.log(`  "${s.text}" (${s.class})`));
    }

    // Get stats panel info
    const statsEls = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="stats"], [class*="Stats"], [class*="metric"], [class*="Metric"]');
      return Array.from(els).map(el => ({
        text: el.textContent?.trim().substring(0, 200),
        class: el.className?.substring(0, 80)
      }));
    });
    if (statsEls.length > 0) {
      console.log('\n--- Stats/Metric elements ---');
      statsEls.forEach(s => console.log(`  "${s.text}" (${s.class})`));
    }

    // Get chart info
    const chartInfo = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return Array.from(canvases).map(c => ({
        width: c.width, height: c.height,
        parentClass: c.parentElement?.className?.substring(0, 80),
        siblingText: c.parentElement?.previousElementSibling?.textContent?.trim().substring(0, 100)
      }));
    });
    if (chartInfo.length > 0) {
      console.log('\n--- Chart canvases ---');
      chartInfo.forEach(c => console.log(`  Canvas: ${c.width}x${c.height}, parent: ${c.parentClass}, label: ${c.siblingText}`));
    }

  } else {
    console.log('Could NOT find file input!');
    const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 3000));
    console.log('\n--- Body HTML (first 3000 chars) ---');
    console.log(bodyHtml);
  }

  await browser.close();
  console.log('\nDone! Screenshots saved to fitgrep-before.png and fitgrep-after.png');
})();
