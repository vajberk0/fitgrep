// Full storage lifecycle test on IndexedDB:
// 1. Upload -> saved + listed in "Previous Workouts"
// 2. Reload page -> file list persists (IndexedDB)
// 3. Re-open stored file from list
// 4. Delete -> removed from list
// 5. Legacy localStorage-format data migrates into IndexedDB
const { chromium } = require('playwright');
const path = require('path');

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) failures++;
}

(async () => {
  const FIT_FILE = path.join(__dirname, 'externalHR.fit');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // ── 0. Seed legacy localStorage data (old format) to test migration ──
  const b64 = require('fs').readFileSync(FIT_FILE).toString('base64');
  await page.addInitScript((data) => {
    // Derive a fake meta for externalHR.fit; startTime/sport values just need to be plausible
    localStorage.setItem('fitgrep_files_meta', JSON.stringify([
      {
        filename: 'legacy-ride.fit',
        sport: 'cycling',
        startTime: '2024-05-01T08:00:00.000Z',
        totalDistance: 12345,
        totalDuration: 3600,
        savedAt: '2024-05-01T09:00:00.000Z',
      },
    ]));
    localStorage.setItem('fitgrep_file:legacy-ride.fit', data);
  }, b64);

  await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);

  // ── 1. Legacy migration ──
  const legacyListed = await page.evaluate(() => document.body.textContent.includes('legacy-ride.fit'));
  const legacyMigrated = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('fitgrep', 1);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const entry = await new Promise((res, rej) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get('legacy-ride.fit');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return entry && entry.buffer instanceof ArrayBuffer && entry.buffer.byteLength > 0;
  });
  const legacyKeysGone = await page.evaluate(() =>
    localStorage.getItem('fitgrep_files_meta') === null &&
    localStorage.getItem('fitgrep_file:legacy-ride.fit') === null
  );
  check('legacy file listed in Previous Workouts', legacyListed);
  check('legacy file migrated into IndexedDB', legacyMigrated);
  check('legacy localStorage keys cleaned up', legacyKeysGone);

  // ── 2. Upload a new file ──
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(FIT_FILE);
  await page.waitForTimeout(4000);
  const uploadShown = await page.evaluate(() => document.querySelectorAll('canvas').length > 0);
  check('new upload renders charts', uploadShown);

  // Back to upload screen
  await page.click('.btn-new');
  await page.waitForTimeout(800);
  const bothListed = await page.evaluate(() => {
    const t = document.body.textContent;
    return t.includes('legacy-ride.fit') && t.includes('externalHR.fit');
  });
  check('both files listed after upload', bothListed);

  // ── 3. Reload -> list persists from IndexedDB ──
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const persisted = await page.evaluate(() => {
    const t = document.body.textContent;
    return t.includes('legacy-ride.fit') && t.includes('externalHR.fit');
  });
  check('file list persists across reload (IndexedDB)', persisted);

  // ── 4. Re-open stored file from the list ──
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.file-card')];
    const card = cards.find((c) => c.textContent.includes('externalHR.fit'));
    card.click();
  });
  await page.waitForTimeout(4000);
  const reopened = await page.evaluate(() => document.querySelectorAll('canvas').length > 0);
  check('stored file re-opens and renders', reopened);

  // ── 5. Delete ──
  await page.click('.btn-new');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.file-card')];
    const card = cards.find((c) => c.textContent.includes('legacy-ride.fit'));
    card.querySelector('.delete-btn').click();
  });
  await page.waitForTimeout(1500);
  const afterDelete = await page.evaluate(() => document.body.textContent.includes('legacy-ride.fit'));
  check('deleted file removed from list', !afterDelete);

  if (pageErrors.length) {
    console.log('Page errors:', pageErrors);
    failures++;
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL LIFECYCLE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
