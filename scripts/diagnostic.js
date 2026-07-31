const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://barname.utcms.ir';
const LOGIN_URL = `${SITE_URL}/Barname/Account/Login`;
const OUTPUT_DIR = path.join(process.cwd(), 'diagnostic');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

async function runDiagnostic() {
  ensureDir(OUTPUT_DIR);
  const report = { timestamp: new Date().toISOString(), tests: [] };

  // Test 1: Basic HTTPS
  console.log('\n=== TEST 1: Basic HTTPS Connection ===');
  try {
    const result = await new Promise((resolve, reject) => {
      https.get(SITE_URL, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, length: data.length }));
      }).on('error', reject);
    });
    console.log(`  Status: ${result.status}, Length: ${result.length}`);
    report.tests.push({ name: 'HTTPS', status: 'PASS', details: result });
  } catch (e) {
    console.log(`  FAIL: ${e.message}`);
    report.tests.push({ name: 'HTTPS', status: 'FAIL', error: e.message });
  }

  // Test 2: Playwright with different configs
  const configs = [
    { name: 'Chrome headed (default)', opts: { headless: false, channel: 'chrome' } },
    { name: 'Chrome headed + proxy', opts: { headless: false, channel: 'chrome', proxy: { server: 'http://127.0.0.1:10808' } } },
    { name: 'Chrome headed + custom UA', opts: { headless: false, channel: 'chrome', args: ['--no-sandbox'] }, context: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } },
    { name: 'Chromium headed', opts: { headless: false, args: ['--no-sandbox'] } },
  ];

  for (const config of configs) {
    console.log(`\n=== TEST 2: ${config.name} ===`);
    let browser = null;
    try {
      browser = await chromium.launch(config.opts);
      const contextOpts = { viewport: { width: 1366, height: 768 } };
      if (config.context) Object.assign(contextOpts, config.context);
      const context = await browser.newContext(contextOpts);
      const page = await context.newPage();

      // Capture failed requests
      const failedRequests = [];
      page.on('requestfailed', (req) => {
        failedRequests.push({ url: req.url(), error: req.failure()?.errorText });
      });

      // Capture console errors
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      console.log('  Navigating...');
      const startTime = Date.now();
      try {
        await page.goto(LOGIN_URL, { timeout: 30000, waitUntil: 'load' });
        const elapsed = Date.now() - startTime;
        console.log(`  Loaded in ${elapsed}ms`);
        console.log(`  Title: ${await page.title()}`);
        console.log(`  URL: ${page.url()}`);

        // Check for login form
        const hasLoginForm = await page.$('#NationalCode, input[name="NationalCode"]');
        console.log(`  Login form: ${hasLoginForm ? 'FOUND' : 'NOT FOUND'}`);

        // Check for CAPTCHA
        const hasCaptcha = await page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha"]');
        console.log(`  CAPTCHA image: ${hasCaptcha ? 'FOUND' : 'NOT FOUND'}`);

        // Check for loading indicator
        const bodyText = await page.textContent('body');
        const hasLoading = bodyText.includes('صبر کنید') || bodyText.includes('لطفاً');
        console.log(`  Loading text: ${hasLoading ? 'YES (page stuck loading)' : 'NO (page loaded)'}`);

        // Save screenshot
        const ssPath = path.join(OUTPUT_DIR, `test-${config.name.replace(/[^a-z0-9]/gi, '_')}.png`);
        await page.screenshot({ path: ssPath, fullPage: true });
        console.log(`  Screenshot: ${ssPath}`);

        // Save page source
        const html = await page.content();
        const htmlPath = path.join(OUTPUT_DIR, `test-${config.name.replace(/[^a-z0-9]/gi, '_')}.html`);
        fs.writeFileSync(htmlPath, html);
        console.log(`  HTML saved: ${htmlPath} (${html.length} bytes)`);

        if (failedRequests.length > 0) {
          console.log(`  Failed requests: ${failedRequests.length}`);
          failedRequests.forEach(r => console.log(`    - ${r.url}: ${r.error}`));
        }
        if (consoleErrors.length > 0) {
          console.log(`  Console errors: ${consoleErrors.length}`);
          consoleErrors.slice(0, 5).forEach(e => console.log(`    - ${e}`));
        }

        report.tests.push({
          name: config.name, status: 'PASS',
          elapsed, title: await page.title(), url: page.url(),
          hasLoginForm: !!hasLoginForm, hasCaptcha: !!hasCaptcha, hasLoading,
          failedRequests: failedRequests.length, consoleErrors: consoleErrors.length,
          screenshot: ssPath, html: htmlPath
        });

      } catch (e) {
        console.log(`  FAIL: ${e.message.split('\n')[0]}`);
        const ssPath = path.join(OUTPUT_DIR, `fail-${config.name.replace(/[^a-z0-9]/gi, '_')}.png`);
        try { await page.screenshot({ path: ssPath, fullPage: true }); } catch {}
        report.tests.push({ name: config.name, status: 'FAIL', error: e.message.split('\n')[0], failedRequests, consoleErrors });
      }

    } catch (e) {
      console.log(`  LAUNCH FAIL: ${e.message}`);
      report.tests.push({ name: config.name, status: 'LAUNCH_FAIL', error: e.message });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // Save report
  const reportPath = path.join(OUTPUT_DIR, 'diagnostic-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n=== REPORT SAVED: ${reportPath} ===`);

  process.exit(0);
}

runDiagnostic().catch(e => { console.error(e); process.exit(1); });
