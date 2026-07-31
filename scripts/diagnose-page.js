const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://barname.utcms.ir/Barname/Account/Login';

(async () => {
  console.log('=== DETAILED PAGE DIAGNOSTIC ===\n');
  
  const browser = await chromium.launch({ 
    headless: false, 
    channel: 'chrome',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  // Capture all failed requests
  const failedRequests = [];
  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), error: req.failure()?.errorText });
  });
  
  // Capture console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  
  // Capture all responses
  const responses = [];
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      responses.push({ url: resp.url(), status: resp.status() });
    }
  });
  
  console.log('1. Navigating...');
  try {
    await page.goto(SITE_URL, { timeout: 60000, waitUntil: 'load' });
    console.log('   Page loaded:', await page.title());
  } catch (e) {
    console.log('   FAIL:', e.message.split('\n')[0]);
  }
  
  console.log('\n2. Checking loading overlay...');
  const loadingExists = await page.$('#loading');
  console.log('   Loading element:', loadingExists ? 'EXISTS' : 'NOT FOUND');
  
  if (loadingExists) {
    const loadingVisible = await page.evaluate(() => {
      const el = document.getElementById('loading');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });
    console.log('   Loading visible:', loadingVisible);
    
    const loadingText = await page.evaluate(() => {
      const el = document.getElementById('loading');
      return el ? el.textContent?.trim() : '';
    });
    console.log('   Loading text:', loadingText);
  }
  
  console.log('\n3. Waiting 30s for JS initialization...');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const stillLoading = await page.evaluate(() => {
      const el = document.getElementById('loading');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });
    console.log(`   ${(i+1)*5}s - Loading visible: ${stillLoading}`);
    if (!loadingExists || !stillLoading) break;
  }
  
  console.log('\n4. Final page state...');
  console.log('   URL:', page.url());
  console.log('   Title:', await page.title());
  
  const hasForm = await page.$('#NationalCode');
  console.log('   Login form:', hasForm ? 'FOUND' : 'NOT FOUND');
  
  const hasCaptcha = await page.$('#dntCaptchaImg, img[src*="captcha"]');
  console.log('   CAPTCHA:', hasCaptcha ? 'FOUND' : 'NOT FOUND');
  
  // Try to dismiss loading overlay
  console.log('\n5. Trying to dismiss loading overlay...');
  try {
    await page.evaluate(() => {
      const el = document.getElementById('loading');
      if (el) { el.style.display = 'none'; el.remove(); }
    });
    console.log('   Overlay dismissed');
  } catch (e) {
    console.log('   Failed:', e.message);
  }
  
  await page.waitForTimeout(1000);
  
  // Try to click login button
  console.log('\n6. Testing click after overlay dismiss...');
  try {
    const loginBtn = await page.$('#inter, button[type="submit"]');
    if (loginBtn) {
      await loginBtn.click({ timeout: 5000 });
      console.log('   Click SUCCESS');
    } else {
      console.log('   Login button NOT FOUND');
    }
  } catch (e) {
    console.log('   Click FAIL:', e.message.split('\n')[0]);
  }
  
  console.log('\n7. Failed requests:', failedRequests.length);
  failedRequests.forEach(r => console.log(`   - ${r.url}: ${r.error}`));
  
  console.log('\n8. Error responses:', responses.length);
  responses.forEach(r => console.log(`   - ${r.status} ${r.url}`));
  
  console.log('\n9. Console errors:', consoleErrors.length);
  consoleErrors.slice(0, 10).forEach(e => console.log(`   - ${e}`));
  
  await page.screenshot({ path: 'diagnostic/final-state.png', fullPage: true });
  console.log('\n   Screenshot saved: diagnostic/final-state.png');
  
  await browser.close();
  process.exit(0);
})();
