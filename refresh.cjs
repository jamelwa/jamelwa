// Refresh public contribution counts, validate the chart, then render its profile image.
// Serve docs on loopback before running; GH_TOKEN is read only here, never in the browser.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  if (!process.env.GH_TOKEN) throw Error('GH_TOKEN is required');
  const now = new Date(), asOf = now.toISOString().slice(0, 10);
  const years = Array.from({ length: now.getUTCFullYear() - 2024 + 1 }, (_, i) => now.getUTCFullYear() - i);
  const query = `query { user(login: "hungryfool-klg") { ${years.map(year => `
    y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year === now.getUTCFullYear() ? now.toISOString() : `${year}-12-31T23:59:59Z`}") {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }
    }`).join('\n')} } }`;
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'jamelwa-profile-refresh' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`GitHub returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data?.user) throw Error('GitHub could not return the contribution calendar');
  const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  const snapshot = {
    username: 'hungryfool-klg', fetchedAt: now.toISOString(), asOf,
    source: 'https://docs.github.com/en/graphql/reference/objects#contributioncalendar',
    years: years.map(year => {
      const calendar = result.data.user[`y${year}`].contributionCalendar;
      return {
        year, total: calendar.totalContributions,
        days: calendar.weeks.flatMap(week => week.contributionDays)
          .filter(day => day.date <= asOf)
          .map(day => ({ date: day.date, count: day.contributionCount, level: levels.indexOf(day.contributionLevel) })),
      };
    }),
  };
  const file = path.join(__dirname, 'docs/contributions.json');
  const previous = JSON.parse(await fs.readFile(file, 'utf8'));
  // A same-day rerun with unchanged counts should not create a timestamp-only commit.
  if (JSON.stringify({ ...previous, fetchedAt: snapshot.fetchedAt }) !== JSON.stringify(snapshot)) {
    await fs.writeFile(file, JSON.stringify(snapshot) + '\n');
  }

  const url = process.argv[2] || 'http://127.0.0.1:8766/';
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage();
    // Loaded after writing the new snapshot so assertions use the refreshed data.
    console.log(await require('./check.cjs')(page, url));
    await page.setViewportSize({ width: 900, height: 850 });
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'success');
    await page.mouse.move(0, 0); await page.keyboard.press('Escape');
    await page.locator('main').screenshot({ path: path.join(__dirname, 'docs/contributions.png') });
    console.log(`Refreshed ${years.join(', ')} through ${asOf}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
