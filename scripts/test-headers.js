const { chromium } = require('playwright');

(async () => {
  console.log('=== HEADER DIAGNOSTIC ===\n');
  
  // Test 1: Default headers
  console.log('Test 1: Default Chrome headers');
  let browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  let page = await browser.newPage();
  try {
    await page.goto('https://barname.utcms.ir/Barname/Account/Login', { timeout: 15000, waitUntil: 'domcontentloaded' });
    console.log('  OK:', await page.title());
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n')[0]);
  }
  await browser.close();
  
  // Test 2: With extra headers
  console.log('\nTest 2: With Accept-Language header');
  browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  page = await browser.newPage({
    extraHTTPHeaders: {
      'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });
  try {
    await page.goto('https://barname.utcms.ir/Barname/Account/Login', { timeout: 15000, waitUntil: 'domcontentloaded' });
    console.log('  OK:', await page.title());
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n')[0]);
  }
  await browser.close();
  
  // Test 3: With locale
  console.log('\nTest 3: With fa-IR locale');
  browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] });
  page = await browser.newPage({ locale: 'fa-IR' });
  try {
    await page.goto('https://barname.utcms.ir/Barname/Account/Login', { timeout: 15000, waitUntil: 'domcontentloaded' });
    console.log('  OK:', await page.title());
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n')[0]);
  }
  await browser.close();
  
  console.log('\n=== DIAGNOSIS COMPLETE ===');
  process.exit(0);
})();
