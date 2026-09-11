// Reproduction: localStorage quota exceeded when uploading a FIT file.
// Fills localStorage to ~5MB quota, then uploads a file -> app shows a bogus
// "parse error" and the workout (which parsed fine!) is not displayed.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const FIT_FILE = path.join(__dirname, 'externalHR.fit');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 1. Fill localStorage COMPLETELY: big chunks until failure, then ever-smaller
  // chunks until even a 1-char write fails (simulates years of saved workouts)
  await page.evaluate(() => {
    localStorage.clear();
    let size = 1024 * 1024;
    let i = 0;
    while (size > 0) {
      try {
        localStorage.setItem('junk_' + i++, 'A'.repeat(size));
      } catch {
        size = Math.floor(size / 2);
      }
    }
    // Sanity: even a tiny write must now fail
    try {
      localStorage.setItem('canary', 'x');
      throw new Error('localStorage NOT full — repro setup failed');
    } catch (e) {
      if (String(e).includes('NOT full')) throw e;
    }
  });
  const storedBytes = await page.evaluate(() =>
    Object.keys(localStorage).reduce((n, k) => n + (localStorage.getItem(k)?.length ?? 0), 0)
  );
  console.log(`localStorage filled to ~${(storedBytes / 1024 / 1024).toFixed(2)} MB`);

  // 2. Upload a FIT file
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(FIT_FILE);
  await page.waitForTimeout(5000);

  // 3. Check result
  await page.screenshot({ path: 'quota-repro.png', fullPage: true });
  const hasErrorBar = await page.evaluate(() => {
    const el = document.querySelector('[class*="error"], [class*="Error"]');
    return el ? el.textContent?.trim() : null;
  });
  const hasCharts = await page.evaluate(() => document.querySelectorAll('canvas').length);
  const hasSummary = await page.evaluate(() => !!document.querySelector('[class*="summary"], [class*="Summary"]'));

  const parseError = consoleErrors.find((e) => e.includes('quota') || e.includes('Quota'));
  console.log('--- RESULT ---');
  console.log('Error bar text:', hasErrorBar ?? '(none)');
  console.log('Chart canvases rendered:', hasCharts);
  console.log('Summary shown:', hasSummary);
  console.log('Quota-related console error:', parseError ?? '(none)');

  if (parseError && !hasSummary && hasCharts === 0) {
    console.log('\n*** BUG REPRODUCED: quota error swallowed the successful parse ***');
    process.exitCode = 1;
  } else if (hasSummary && hasCharts > 0 && !parseError) {
    console.log('\n*** PASS: workout displayed despite full localStorage ***');
  } else {
    console.log('\n??? Unexpected state — inspect manually');
    process.exitCode = 2;
  }

  await browser.close();
})();
