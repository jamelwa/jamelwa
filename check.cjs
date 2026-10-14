// CHROMIUM_PATH=$(command -v chromium) NODE_PATH=/usr/lib/node_modules node check.cjs
const assert = require('node:assert/strict');
const snapshot = require('./docs/contributions.json');

module.exports = async function check(page, url = 'http://127.0.0.1:8766/') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'success');
  const expectedYears = Array.from({ length: Number(snapshot.asOf.slice(0, 4)) - 2024 + 1 }, (_, i) => Number(snapshot.asOf.slice(0, 4)) - i);
  assert.deepEqual(snapshot.years.map(y => y.year), expectedYears, 'Only 2024 onward, newest first');
  assert.equal(await page.locator('.year').count(), expectedYears.length);
  assert.equal(await page.locator('#heading-2023').count(), 0);
  assert.equal(await page.locator('.day').count(), snapshot.years.reduce((sum, y) => sum + y.days.length, 0));
  assert.equal(await page.locator('header, footer, select, input, a, .summary, .inspector').count(), 0, 'Graph only');
  assert.equal(await page.locator('#status').isHidden(), true);
  assert.equal(await page.locator('.day').evaluateAll((cells, asOf) => cells.every(cell => cell.dataset.date <= asOf), snapshot.asOf), true, 'No future count claims');
  for (const year of snapshot.years) {
    assert.equal(await page.locator(`#heading-${year.year} + .year-meta`).innerText(), `${year.total.toLocaleString('en-US')} contributions`);
    const day = year.days.find(d => d.count > 0) || year.days[0];
    const cell = page.locator(`.day[data-date="${day.date}"]`);
    await cell.click();
    assert.equal(await page.locator('#tooltip').innerText(), await cell.getAttribute('aria-label'));
    assert.equal(await page.locator('#tooltip').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#tooltip').isHidden(), true);
  }
  const leap = page.locator('.day[data-date="2024-02-29"]');
  await leap.focus();
  assert.equal(await leap.evaluate(el => Number(el.style.gridRow)), 6);
  assert.match(await page.locator('#tooltip').innerText(), /Feb 29, 2024/);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator(':focus').getAttribute('data-date'), '2024-03-01');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator(':focus').getAttribute('data-date'), '2024-03-08');
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator(':focus').getAttribute('data-date'), '2024-01-01');
  await page.keyboard.press('End'); await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator(':focus').getAttribute('data-date'), '2024-12-31');
  await page.keyboard.press('Escape');
  const hover = page.locator('.day[data-date="2024-01-02"]');
  await hover.hover();
  await page.waitForFunction(() => document.querySelector('#tooltip').matches(':popover-open'));
  assert.equal(await page.locator('#tooltip').innerText(), await hover.getAttribute('aria-label'));
  await page.locator('#tooltip').hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#tooltip').isVisible(), true, 'Tooltip remains hoverable');
  await page.keyboard.press('Escape');

  for (const width of [320, 375, 414, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    await page.locator('.day').last().click();
    const box = await page.locator('#tooltip').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900, `Tooltip fits at ${width}px`);
    await page.keyboard.press('Escape');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const touchContext = await page.context().browser().newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  try {
    const touch = await touchContext.newPage();
    await touch.goto(url); await touch.locator('.day').first().waitFor();
    await touch.locator('.day').first().tap();
    assert.equal(await touch.locator('#tooltip').isVisible(), true, 'Touch shows counts');
    await touch.locator('h2').first().tap();
    assert.equal(await touch.locator('#tooltip').isHidden(), true, 'Outside tap dismisses');
  } finally { await touchContext.close(); }

  for (const mutation of [
    d => { d.years[0].total++; },
    d => { d.years[0].days[1].date = d.years[0].days[0].date; },
    d => { d.years[0].days[0].count = -1; },
    d => { d.years[0].days.pop(); },
  ]) {
    const broken = structuredClone(snapshot); mutation(broken);
    await page.route('**/contributions.json', route => route.fulfill({ json: broken }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'error');
    assert.equal(await page.locator('#retry').isVisible(), true);
    assert.equal(await page.locator('.day').count(), 0);
    await page.unroute('**/contributions.json');
  }
  await page.route('**/contributions.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'error');
  await page.unroute('**/contributions.json');
  await page.locator('#retry').click();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'success');
  assert.equal(await page.locator('#retry').isHidden(), true);
  assert.deepEqual(errors, []);
  return { result: 'PASS', checks: 'graph only, daily totals, leap day, future dates, hover/touch/keyboard tooltips, 6 widths, invalid data and retry' };
};

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    try { console.log(await module.exports(await browser.newPage(), process.argv[2])); }
    finally { await browser.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
