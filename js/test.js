/**
 * Test: Cookie dialog blocking on 20+ websites
 * Run: node test.js
 */

const { chromium } = require('playwright');
const { blockCookieDialogs } = require('./index');
const fs = require('fs');
const path = require('path');

const TEST_URLS = [
  // Google & co
  'https://www.google.com',
  'https://www.youtube.com',

  // Social media
  'https://www.linkedin.com',
  'https://www.instagram.com',
  'https://www.reddit.com',

  // News / EU
  'https://www.bbc.com',
  'https://www.reuters.com',
  'https://www.spiegel.de',
  'https://www.lefigaro.fr',

  // E-commerce
  'https://www.amazon.de',
  'https://www.ebay.de',
  'https://www.booking.com',

  // Tech
  'https://stackoverflow.com',
  'https://github.com',

  // Streaming
  'https://www.spotify.com',
  'https://www.twitch.tv',

  // Various EU / GDPR heavy
  'https://www.theguardian.com',
  'https://www.lemonde.fr',
  'https://www.zeit.de',
  'https://www.orf.at',
  'https://www.nytimes.com',
];

async function runTests() {
  const screenshotDir = path.join(__dirname, '..', 'screenshots', 'js');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    bypassCSP: true,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  });

  const results = [];

  for (const url of TEST_URLS) {
    const page = await context.newPage();
    let status = 'OK';
    const domain = new URL(url).hostname.replace('www.', '');

    try {
      console.log(`Testing: ${url}`);

      await blockCookieDialogs(page);
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });

      // Wait a bit for click handlers to do their work
      await page.waitForTimeout(3000);

      const screenshotPath = path.join(screenshotDir, `${domain}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      console.log(`  -> Screenshot saved: ${screenshotPath}`);
    } catch (e) {
      status = `ERROR: ${e.message.slice(0, 80)}`;
      console.log(`  -> Error: ${e.message.slice(0, 120)}`);
    } finally {
      results.push({ url, domain, status });
      await page.close();
    }
  }

  await browser.close();

  // Print summary
  console.log('\n--- Test Summary ---');
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.status === 'OK').length}`);
  console.log(`Errors: ${results.filter(r => r.status !== 'OK').length}`);
  console.log('');
  for (const r of results) {
    console.log(`  ${r.status === 'OK' ? 'PASS' : 'FAIL'} ${r.domain} - ${r.status}`);
  }
}

runTests().catch(console.error);
