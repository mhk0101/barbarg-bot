"""
یابنده و تست‌کننده خودکار پراکسی‌های ایران - نسخه نامحدود
هرگز متوقف نمی‌شود تا وقتی که یک پراکسی کارآمد پیدا کند
"""

import subprocess
import sys
import importlib
import os
import time
import re
import json
import random
from datetime import datetime
from typing import Dict, List, Optional
import urllib3

# ============================================================
# بخش ۰: نصب خودکار پکیج‌ها
# ============================================================

required_packages = [
    "requests",
    "urllib3",
    "playwright",
]

def install_package(package):
    print(f"[نصب] در حال نصب {package} ...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])
    print(f"[نصب] ✓ {package} نصب شد")

def ensure_packages():
    for pkg in required_packages:
        try:
            importlib.import_module(pkg.replace("-", "_"))
        except ImportError:
            install_package(pkg)

ensure_packages()

try:
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    print("[نصب] ✓ مرورگر Chromium نصب شد")
except Exception as e:
    print(f"[نصب] ⚠️  خطا در نصب مرورگر: {e}")

import requests
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import asyncio

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ============================================================
# بخش اول: جمع‌آوری پراکسی با منابع متعدد
# ============================================================

class ProxyCollector:
    # منابع جدید و متنوع
    SOURCES = {
        "proxy-free.cz": {
            "url": "https://free-proxy.cz/en/proxylist/country/IR/all/ping/all",
            "type": "html_table"
        },
        "free.geonix.com": {
            "url": "https://free.geonix.com/en/iran_islamic_republic_of/",
            "type": "html_text"
        },
        "proxy5.net": {
            "url": "https://proxy5.net/free-proxy/iran",
            "type": "html_table"
        },
        "freeproxy.world": {
            "url": "https://www.freeproxy.world/?country=IR",
            "type": "html_table"
        },
        "proxyelite.info": {
            "url": "https://proxyelite.info/free/asia/iran/",
            "type": "html_text"
        },
        "openray_iran": {
            "url": "https://raw.githubusercontent.com/sakha1370/OpenRay/refs/heads/main/output_iran/iran_top100_checked.txt",
            "type": "raw"
        },
        "openray_all": {
            "url": "https://raw.githubusercontent.com/sakha1370/OpenRay/refs/heads/main/output/all_valid_proxies.txt",
            "type": "raw"
        },
        # منابع جدید
        "proxyscrape_ir": {
            "url": "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=IR&ssl=all&anonymity=all",
            "type": "api"
        },
        "spys_me": {
            "url": "https://spys.me/proxy.txt",
            "type": "raw"
        },
        "pubproxy_ir": {
            "url": "http://pubproxy.com/api/proxy?limit=50&format=txt&country=IR&http=true&https=true",
            "type": "raw"
        }
    }

    def __init__(self, timeout=20, retries=3):
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })

    def _fetch_with_retry(self, url):
        for attempt in range(self.retries):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                resp.raise_for_status()
                return resp
            except Exception as e:
                if attempt < self.retries - 1:
                    wait = (attempt + 1) * 2
                    print(f"      تلاش مجدد {attempt+1}/{self.retries} بعد از {wait} ثانیه...")
                    time.sleep(wait)
                else:
                    raise e

    def fetch_all(self) -> List[Dict]:
        all_proxies = []
        proxy_set = set()

        for source_name, config in self.SOURCES.items():
            try:
                print(f"[جمع‌آوری] در حال دریافت از {source_name}...")
                resp = self._fetch_with_retry(config['url'])
                proxies = self._parse_response(resp.text, source_name, config.get('type', 'raw'))
                for p in proxies:
                    key = f"{p['ip']}:{p['port']}"
                    if key not in proxy_set:
                        proxy_set.add(key)
                        p['source'] = source_name
                        p['source_url'] = config.get('url', '')
                        all_proxies.append(p)
                print(f"[جمع‌آوری] ✓ {source_name}: {len(proxies)} پراکسی پیدا شد")
            except Exception as e:
                print(f"[جمع‌آوری] ✗ {source_name}: {str(e)[:60]}")

        print(f"[جمع‌آوری] در کل {len(all_proxies)} پراکسی یکتا پیدا شد")
        # اولویت با http/https
        http_proxies = [p for p in all_proxies if p.get('scheme') in ['http', 'https']]
        other_proxies = [p for p in all_proxies if p.get('scheme') not in ['http', 'https']]
        return http_proxies + other_proxies

    def _parse_response(self, html: str, source: str, source_type: str) -> List[Dict]:
        if source_type == 'html_table':
            return self._parse_html_table(html, source)
        elif source_type == 'html_text':
            return self._parse_html_text(html, source)
        elif source_type == 'api':
            return self._parse_api(html, source)
        else:
            return self._parse_raw_text(html, source)

    def _parse_api(self, text: str, source: str) -> List[Dict]:
        proxies = []
        lines = text.strip().split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
            parts = line.split(':')
            if len(parts) >= 2:
                ip = parts[0].strip()
                port = parts[1].strip()
                if self._is_valid_ip(ip) and port.isdigit():
                    protocol = parts[2].strip() if len(parts) >= 3 else 'http'
                    proxies.append({
                        'ip': ip,
                        'port': int(port),
                        'protocol': protocol,
                        'scheme': 'http' if protocol in ['http', 'https'] else protocol
                    })
        return proxies

    def _parse_html_table(self, html: str, source: str) -> List[Dict]:
        proxies = []
        patterns = [
            r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*[|│]\s*(\d+)',
            r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*[:：]\s*(\d+)',
            r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\|\s*(\d+)',
        ]
        found = set()
        for pattern in patterns:
            matches = re.findall(pattern, html)
            for ip, port in matches:
                key = f"{ip}:{port}"
                if key not in found and self._is_valid_ip(ip) and 1 <= int(port) <= 65535:
                    found.add(key)
                    protocol = 'http'
                    if 'socks5' in html.lower():
                        protocol = 'socks5'
                    elif 'socks4' in html.lower():
                        protocol = 'socks4'
                    elif 'https' in html.lower():
                        protocol = 'https'
                    proxies.append({
                        'ip': ip,
                        'port': int(port),
                        'protocol': protocol,
                        'scheme': 'http' if protocol in ['http', 'https'] else protocol
                    })
        return proxies

    def _parse_html_text(self, html: str, source: str) -> List[Dict]:
        proxies = []
        pattern = r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*[:：]\s*(\d+)'
        pattern2 = r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\|\s*(\d+)'
        matches = re.findall(pattern, html) + re.findall(pattern2, html)
        found = set()
        for ip, port in matches:
            key = f"{ip}:{port}"
            if key not in found and self._is_valid_ip(ip) and 1 <= int(port) <= 65535:
                found.add(key)
                protocol = 'http'
                if 'socks5' in html.lower():
                    protocol = 'socks5'
                elif 'socks4' in html.lower():
                    protocol = 'socks4'
                elif 'https' in html.lower():
                    protocol = 'https'
                proxies.append({
                    'ip': ip,
                    'port': int(port),
                    'protocol': protocol,
                    'scheme': 'http' if protocol in ['http', 'https'] else protocol
                })
        return proxies

    def _parse_raw_text(self, text: str, source: str) -> List[Dict]:
        proxies = []
        pattern = r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*[:：]\s*(\d+)'
        matches = re.findall(pattern, text)
        for ip, port in matches:
            if self._is_valid_ip(ip) and 1 <= int(port) <= 65535:
                proxies.append({
                    'ip': ip,
                    'port': int(port),
                    'protocol': 'http',
                    'scheme': 'http'
                })
        return proxies

    @staticmethod
    def _is_valid_ip(ip: str) -> bool:
        parts = ip.split('.')
        if len(parts) != 4:
            return False
        for part in parts:
            if not part.isdigit() or not 0 <= int(part) <= 255:
                return False
        return True


# ============================================================
# بخش دوم: پیش‌فیلتر با requests (سریع)
# ============================================================

def quick_test_proxy(proxy_info: Dict, target_url: str, timeout=10) -> bool:
    """تست سریع با requests برای غربالگری اولیه"""
    addr = f"{proxy_info['ip']}:{proxy_info['port']}"
    scheme = proxy_info.get('scheme', 'http')
    proxy_dict = {
        'http': f"{scheme}://{addr}",
        'https': f"{scheme}://{addr}"
    }
    try:
        resp = requests.get(target_url, proxies=proxy_dict, timeout=timeout, verify=False)
        if resp.status_code == 200 and len(resp.text) > 100:
            return True
        else:
            return False
    except:
        return False


# ============================================================
# بخش سوم: تست با Playwright (نهایی)
# ============================================================

class PlaywrightTester:
    def __init__(self, target_url: str, timeout=30):
        self.target_url = target_url
        self.timeout = timeout

    async def test_proxy_async(self, proxy_info: Dict) -> Dict:
        addr = f"{proxy_info['ip']}:{proxy_info['port']}"
        scheme = proxy_info.get('scheme', 'http')
        
        result = {
            **proxy_info,
            'test_time': datetime.now().isoformat(),
            'success': False,
            'full_load': False,
            'detected_ip': None,
            'page_title': None,
            'error': None,
            'latency': None
        }
        
        start = time.time()
        
        try:
            async with async_playwright() as p:
                proxy_server = f"{scheme}://{addr}"
                browser = await p.chromium.launch(
                    headless=False,
                    proxy={"server": proxy_server},
                    args=[
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--ignore-certificate-errors',
                        '--ignore-ssl-errors',
                    ]
                )
                
                context = await browser.new_context(
                    viewport={'width': 1280, 'height': 720},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                )
                
                page = await context.new_page()
                page.set_default_timeout(self.timeout * 1000)
                
                # بررسی IP
                print(f"    🌐 بررسی آی‌پی...")
                try:
                    await page.goto("https://api.ipify.org?format=json", wait_until="domcontentloaded")
                    content = await page.text_content("body")
                    ip_data = json.loads(content.strip())
                    result['detected_ip'] = ip_data.get('ip', 'نامشخص')
                    print(f"    🌐 IP شناسایی‌شده: {result['detected_ip']}")
                except Exception:
                    try:
                        await page.goto("https://ipinfo.io/json", wait_until="domcontentloaded")
                        content = await page.text_content("body")
                        ip_data = json.loads(content.strip())
                        result['detected_ip'] = ip_data.get('ip', 'نامشخص')
                        print(f"    🌐 IP شناسایی‌شده: {result['detected_ip']}")
                    except:
                        result['detected_ip'] = 'نامشخص'
                        print(f"    ⚠️  دریافت IP ناموفق")
                
                await asyncio.sleep(random.uniform(1, 2))
                
                # بارگذاری سایت هدف
                print(f"    🚀 بارگذاری {self.target_url} ...")
                try:
                    await page.goto(self.target_url, wait_until="domcontentloaded", timeout=self.timeout * 1000)
                except Exception as e:
                    try:
                        await page.goto(self.target_url, wait_until="load", timeout=self.timeout * 1000)
                    except Exception as e2:
                        raise e2
                
                await page.wait_for_selector("body", timeout=self.timeout * 1000)
                await asyncio.sleep(random.uniform(2, 4))
                
                # بررسی موفقیت
                full_load = False
                try:
                    username_field = await page.query_selector("input[name='Username']")
                    if username_field:
                        full_load = True
                        print("    ✅ فرم لاگین پیدا شد")
                    else:
                        title = await page.title()
                        if title and len(title) > 5:
                            full_load = True
                            print(f"    ✅ صفحه بارگذاری شد (عنوان: {title})")
                        else:
                            body_text = await page.text_content("body")
                            if body_text and len(body_text) > 100:
                                full_load = True
                                print("    ✅ صفحه محتوای کافی دارد")
                except:
                    full_load = True
                
                result['latency'] = round(time.time() - start, 3)
                result['page_title'] = await page.title() if await page.title() else 'بدون عنوان'
                
                if full_load:
                    result['success'] = True
                    result['full_load'] = True
                    print(f"    ✅ بارگذاری کامل (تاخیر: {result['latency']}s)")
                    print("    🔒 مرورگر ۵ ثانیه باز می‌ماند...")
                    await asyncio.sleep(5)
                else:
                    result['error'] = 'بارگذاری کامل نشد'
                    print("    ❌ بارگذاری کامل نشد")
                
                await browser.close()
                
        except Exception as e:
            error_msg = str(e)
            if "proxy" in error_msg.lower() or "connect" in error_msg.lower():
                result['error'] = f'خطای پراکسی: {error_msg[:60]}'
            else:
                result['error'] = f'خطا: {error_msg[:60]}'
            print(f"    ❌ {result['error']}")
        
        return result

    def test_proxy(self, proxy_info: Dict) -> Dict:
        return asyncio.run(self.test_proxy_async(proxy_info))

    def test_all(self, proxies: List[Dict], max_to_test=30) -> List[Dict]:
        results = []
        total = len(proxies)
        if max_to_test:
            proxies = proxies[:max_to_test]
            total = len(proxies)

        print(f"\n[تست مرورگر - Playwright] شروع تست {total} پراکسی (یکی‌یکی)")
        print(f"[تست مرورگر] آدرس هدف: {self.target_url}")
        print("-" * 70)

        for idx, proxy in enumerate(proxies, 1):
            print(f"\n[{idx}/{total}] تست {proxy['ip']}:{proxy['port']} (منبع: {proxy.get('source', 'ناشناخته')})")
            result = self.test_proxy(proxy)
            results.append(result)
            if result['success'] and result['full_load']:
                print("    🎉 پراکسی موفق پیدا شد!")
                return results  # بلافاصله برمی‌گردد
            # اگر موفق نشد، ادامه می‌دهد

        print("-" * 70)
        return results


# ============================================================
# بخش چهارم: گزارش
# ============================================================

class ResultReporter:
    @staticmethod
    def generate_report(results: List[Dict], output_file: str = None) -> str:
        lines = []
        lines.append("=" * 70)
        lines.append("📋 گزارش تست پراکسی‌های ایران (Playwright)")
        lines.append(f"تاریخ: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("=" * 70)

        full = [r for r in results if r.get('full_load', False)]
        fail = [r for r in results if not r.get('success', False)]

        lines.append(f"\n📊 خلاصه:")
        lines.append(f"  ✅ موفق: {len(full)}")
        lines.append(f"  ❌ ناموفق: {len(fail)}")
        lines.append(f"  📝 مجموع: {len(results)}")

        if full:
            lines.append(f"\n✅ پراکسی‌های موفق:")
            lines.append("-" * 60)
            for i, r in enumerate(full, 1):
                lines.append(f"\n  [{i}] {r['ip']}:{r['port']}")
                lines.append(f"      منبع: {r.get('source', 'ناشناخته')}")
                lines.append(f"      IP شناسایی‌شده: {r.get('detected_ip', 'نامشخص')}")
                lines.append(f"      تاخیر: {r.get('latency', 'نامشخص')}s")
                lines.append(f"      عنوان: {r.get('page_title', 'بدون عنوان')}")

        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            print(f"\n[گزارش] ذخیره در {output_file}")

        json_file = output_file.replace('.txt', '.json') if output_file else 'results.json'
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"[گزارش] ذخیره JSON در {json_file}")

        return '\n'.join(lines)

    @staticmethod
    def print_summary(results: List[Dict]):
        full = [r for r in results if r.get('full_load', False)]
        print("\n" + "=" * 70)
        print("🎯 خلاصه نهایی")
        print("=" * 70)
        if full:
            print(f"\n🌟 {len(full)} پراکسی موفق:\n")
            for i, r in enumerate(full, 1):
                print(f"  {i}. {r['ip']}:{r['port']}  (IP نمایشی: {r.get('detected_ip', 'نامشخص')}، تاخیر: {r.get('latency', 'نامشخص')}s)")
        else:
            print("\n❌ هیچ پراکسی موفقی پیدا نشد!")


# ============================================================
# بخش پنجم: حلقه بی‌نهایت تا پیدا شدن
# ============================================================

def main_loop():
    TARGET = "https://barname.utcms.ir/Barname/Account/Login"
    print("=" * 70)
    print("🇮🇷 ابزار خودکار تست پراکسی‌های ایران (نسخه نامحدود)")
    print("=" * 70)
    print(f"سایت هدف: {TARGET}")
    print("=" * 70)
    print("برنامه تا پیدا شدن یک پراکسی کارآمد، به کار خود ادامه می‌دهد...")
    print("برای توقف، Ctrl+C را بزنید.\n")

    attempt = 0
    while True:
        attempt += 1
        print(f"\n{'='*70}")
        print(f"🔁 تلاش شماره {attempt}")
        print(f"{'='*70}")

        # مرحله ۱: جمع‌آوری
        print("\n[مرحله ۱] جمع‌آوری پراکسی‌ها...")
        collector = ProxyCollector(timeout=20, retries=3)
        proxies = collector.fetch_all()
        if not proxies:
            print("❌ هیچ پراکسی‌ای پیدا نشد، ۳۰ ثانیه صبر کرده و دوباره تلاش می‌کنم...")
            time.sleep(30)
            continue

        # مرحله ۲: پیش‌فیلتر سریع (اختیاری)
        print(f"\n[پیش‌فیلتر] تست سریع {len(proxies)} پراکسی با requests...")
        quick_ok = []
        for p in proxies[:50]:  # فقط ۵۰ عدد اول برای سرعت
            if quick_test_proxy(p, TARGET, timeout=5):
                quick_ok.append(p)
        if quick_ok:
            print(f"[پیش‌فیلتر] {len(quick_ok)} پراکسی از تست سریع عبور کردند.")
            proxies_to_test = quick_ok
        else:
            print("[پیش‌فیلتر] هیچ پراکسی از تست سریع عبور نکرد، همه را با مرورگر تست می‌کنم.")
            proxies_to_test = proxies[:30]  # محدود به ۳۰ عدد

        # مرحله ۳: تست با مرورگر
        print("\n[مرحله ۲] تست پراکسی‌ها با Playwright...")
        tester = PlaywrightTester(target_url=TARGET, timeout=30)
        results = tester.test_all(proxies_to_test, max_to_test=30)

        # مرحله ۴: بررسی موفقیت
        successful = [r for r in results if r.get('full_load', False)]
        if successful:
            print("\n🎉 یک پراکسی کارآمد پیدا شد!")
            reporter = ResultReporter()
            reporter.generate_report(results, output_file=f"گزارش_موفق_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
            reporter.print_summary(results)
            # برنامه را با موفقیت پایان می‌دهیم
            break
        else:
            print("\n❌ در این دور هیچ پراکسی موفقی پیدا نشد.")
            print("⏳ ۳۰ ثانیه صبر کرده و دوباره با منابع جدید تلاش می‌کنم...")
            time.sleep(30)


if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        print("\n\n⏹ برنامه توسط کاربر متوقف شد.")
        sys.exit(0)