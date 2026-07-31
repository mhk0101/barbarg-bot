const { chromium } = require('playwright');

(async () => {
  console.log('=== LAUNCH METHOD DIAGNOSTIC ===\n');
  
  const methods = [
    { name: 'Chrome with channel', opts: { headless: false, channel: 'chrome', args: ['--no-sandbox'] } },
    { name: 'Chrome without channel', opts: { headless: false, args: ['--no-sandbox'] } },
    { name: 'Chrome with explicit path', opts: { headless: false, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] } },
  ];
  
  for (const method of methods) {
    console.log(`Test: ${method.name}`);
    let browser = null;
    try {
      browser = await chromium.launch(method.opts);
      const page = await browser.newPage();
      await page.goto('https://barname.utcms.ir/Barname/Account/Login', { timeout: 15000, waitUntil: 'domcontentloaded' });
      console.log('  OK:', await page.title());
    } catch (e) {
      console.log('  FAIL:', e.message.split('\n')[0]);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
  
  console.log('\n=== DONE ===');
  process.exit(0);
})();
