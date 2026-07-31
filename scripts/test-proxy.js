const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false, 
    channel: 'chrome',
    proxy: { server: 'socks5://127.0.0.1:10808' },
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  try {
    await page.goto('https://barname.utcms.ir/Barname/Account/Login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    console.log('SUCCESS! Title:', await page.title());
    console.log('URL:', page.url());
    const hasForm = await page.$('#NationalCode');
    console.log('Login form:', hasForm ? 'FOUND' : 'NOT FOUND');
    const hasCaptcha = await page.$('#dntCaptchaImg, img[src*="captcha"]');
    console.log('CAPTCHA:', hasCaptcha ? 'FOUND' : 'NOT FOUND');
    await page.screenshot({ path: 'diagnostic/proxy-test.png', fullPage: true });
    console.log('Screenshot saved');
  } catch (e) {
    console.log('FAIL:', e.message.split('\n')[0]);
  }
  await browser.close();
  process.exit(0);
})();
