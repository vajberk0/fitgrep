/**
 * Regression test: vertical lap lines on distance axis
 *
 * Bug: When the chart uses distance instead of time as the x-axis,
 * lap boundary mark lines were positioned at each lap's *own* distance
 * (e.g., 1000m for every 1km lap) instead of the *cumulative* distance
 * at the lap start. This caused all lap lines to cluster near x=1000.
 *
 * Fix: Compute cumulative distance at each lap start by looking up
 * the record whose elapsed time matches the lap's startElapsed.
 */

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const FIT_FILE = path.join(__dirname, 'externalHR.fit');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.error(`[CONSOLE error] ${msg.text()}`);
  });
  page.on('pageerror', err => console.error(`[PAGE ERROR] ${err.message}`));

  await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Upload the FIT file
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    console.log('ERROR: Could not find file input!');
    await browser.close();
    process.exit(1);
  }

  console.log('Uploading externalHR.fit...');
  await fileInput.setInputFiles(FIT_FILE);
  await page.waitForTimeout(8000);

  // ─── Test: Verify lap mark lines in TIME mode ───
  // The WorkoutChart component exposes its ECharts instance as `chartEl.__echarts`
  // specifically for tests (avoids scanning enumerable props for getOption, which
  // was fragile across ECharts versions).
  console.log('\n=== TIME AXIS MODE ===');
  const timeResult = await page.evaluate(() => {
    const chartEl = document.querySelector('.chart-el');
    const chart = chartEl && chartEl.__echarts;
    if (!chart) return { error: 'No chart found' };

    const option = chart.getOption();
    const series = option.series || [];
    const markLines = (series[0]?.markLine?.data) || [];

    return {
      mode: 'time',
      markLineCount: markLines.length,
      markLinePositions: markLines.map(ml => ml.xAxis),
    };
  });
  console.log('Time mode mark lines:', JSON.stringify(timeResult));

  // ─── Switch to DISTANCE mode ───
  console.log('\n=== SWITCHING TO DISTANCE MODE ===');
  const distBtn = await page.$('.axis-btn:has-text("Distance")');
  if (distBtn) {
    await distBtn.click();
    await page.waitForTimeout(3000);
  }

  // ─── Test: Verify lap mark lines in DISTANCE mode ───
  console.log('\n=== DISTANCE AXIS MODE ===');
  const distanceResult = await page.evaluate(() => {
    const chartEl = document.querySelector('.chart-el');
    const chart = chartEl && chartEl.__echarts;
    if (!chart) return { error: 'No chart found' };

    const option = chart.getOption();
    const series = option.series || [];
    const data = series[0]?.data || [];
    const markLines = (series[0]?.markLine?.data) || [];

    // Check that mark lines are spread across the chart, not bunched at 1000
    const xValues = data.map(d => d?.[0]).filter(x => x != null);
    const markLineXValues = markLines.map(ml => ml.xAxis).filter(x => x != null);

    // Calculate spread: max - min of mark line positions
    const spread = Math.max(...markLineXValues) - Math.min(...markLineXValues);
    const totalRange = xValues[xValues.length - 1] - xValues[0];

    // Each mark line should be at a distinct cumulative distance
    const uniquePositions = new Set(markLineXValues.map(x => Math.round(x)));

    return {
      mode: 'distance',
      markLineCount: markLineXValues.length,
      markLinePositions: markLineXValues,
      totalDataRange: totalRange,
      markLineSpread: spread,
      uniquePositions: uniquePositions.size,
      // Verify mark lines are roughly evenly spaced (within 50% of expected spacing)
      expectedSpacing: totalRange / (markLineXValues.length + 1),
      minSpacing: Math.min(...markLineXValues.slice(1).map((x, i) => x - markLineXValues[i])),
    };
  });
  console.log('Distance mode mark lines:', JSON.stringify(distanceResult));

  // ─── Assertions ───
  let passed = true;

  // In distance mode, mark lines should be spread across the chart
  if (distanceResult.uniquePositions < distanceResult.markLineCount) {
    console.error(`FAIL: Mark lines overlap! ${distanceResult.markLineCount} lines but only ${distanceResult.uniquePositions} unique positions`);
    passed = false;
  }

  // Mark line spread should be > 80% of total data range
  const spreadRatio = distanceResult.markLineSpread / distanceResult.totalRange;
  if (spreadRatio < 0.8) {
    console.error(`FAIL: Mark lines not spread across chart. Spread ratio: ${spreadRatio.toFixed(2)} (expected > 0.8)`);
    passed = false;
  }

  // Mark lines should be roughly evenly spaced (within 50% of expected)
  const spacingRatio = distanceResult.minSpacing / distanceResult.expectedSpacing;
  if (spacingRatio < 0.5 || spacingRatio > 1.5) {
    console.error(`FAIL: Mark lines not evenly spaced. Spacing ratio: ${spacingRatio.toFixed(2)}`);
    passed = false;
  }

  if (passed) {
    console.log('\n✅ All checks passed! Lap lines are correctly positioned on distance axis.');
  } else {
    console.error('\n❌ Lap line positioning test FAILED!');
    await page.screenshot({ path: 'fitgrep-lap-lines-failed.png', fullPage: true });
    console.log('Screenshot saved: fitgrep-lap-lines-failed.png');
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: 'fitgrep-lap-lines-distance.png', fullPage: true });
  console.log('Screenshot saved: fitgrep-lap-lines-distance.png');

  await browser.close();
  console.log('\nDone!');
})();
