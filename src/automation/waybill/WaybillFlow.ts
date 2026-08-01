import type { Page } from 'playwright'
import { browserManager } from '../browser/BrowserManager'
import { captchaSolver } from '../captcha/CaptchaSolver'
import type { WaybillData } from '../interfaces'

const SITE_URL = 'https://barname.utcms.ir'

export interface SubmitResult {
  success: boolean
  trackingCode?: string
  resultMessage: string
  resultType: 'success' | 'error' | 'warning' | 'info'
}

export class WaybillFlow {
  private page: Page
  private accountId: string

  constructor(page: Page, accountId: string) {
    this.page = page
    this.accountId = accountId
  }

  private async waitForPageReady(): Promise<void> {
    // Wait for loading overlay to disappear
    try {
      await this.page.waitForFunction(() => {
        const loading = document.getElementById('loading')
        if (!loading) return true
        const style = window.getComputedStyle(loading)
        return style.display === 'none' || style.visibility === 'hidden' || loading.offsetParent === null
      }, { timeout: 15000 })
    } catch {
      // Force remove loading overlay if it doesn't disappear
      await this.page.evaluate(() => {
        const loading = document.getElementById('loading')
        if (loading) {
          loading.style.display = 'none'
          loading.style.visibility = 'hidden'
          loading.style.pointerEvents = 'none'
          loading.remove()
        }
      })
    }
    await this.page.waitForTimeout(1000)
  }

  async navigateToCreate(): Promise<boolean> {
    const urls = [
      `${SITE_URL}/barname/Document/HagigiHogugi`,
      `${SITE_URL}/Barname/Waybill/Create`,
      `${SITE_URL}/Barname/Waybill/New`,
      `${SITE_URL}/Barname/Waybill`,
    ]

    for (let attempt = 0; attempt < 3; attempt++) {
      for (const url of urls) {
        try {
          await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await this.waitForPageReady()
          if (!this.page.url().includes('Login')) return true
        } catch { continue }
      }
      // Wait before retry to avoid rate limiting
      if (attempt < 2) await new Promise(r => setTimeout(r, 10000 + Math.random() * 5000))
    }
    return false
  }

  async fillForm(
    data: WaybillData,
    opts?: { onStep?: (name: string, ok: boolean, error?: unknown) => Promise<void> | void },
  ): Promise<boolean> {
    // ویزارد واقعی سایت ۱۰ گام دارد:
    //  1 فرستنده | 2 گیرنده | 3 راننده و خودرو | 4 کالا | 5 مبدا بارگیری
    //  6 مقصد تخلیه | 7 مشخصات مبدا/مقصد | 8 کرایه و صدور | 9 تایید | 10 رسید
    // گام‌های ۵ تا ۱۰ پس از دریافت HTML آن‌ها تکمیل می‌شوند.
    const steps: Array<[string, () => Promise<void>]> = [
      ['فرستنده', () => this.fillStep1Sender(data)],
      ['گیرنده', () => this.fillStep2Receiver(data)],
      ['خودرو/راننده', () => this.fillStep3VehicleDriver(data)],
      ['بار', () => this.fillStep4Cargo(data)],
      ['کرایه/مسیر', () => this.fillStep5FareRoute(data)],
    ]

    await this.page.waitForTimeout(1000 + Math.random() * 2000)

    for (const [name, fn] of steps) {
      try {
        await fn()
        await opts?.onStep?.(name, true)
      } catch (e) {
        await opts?.onStep?.(name, false, e)
        return false
      }
    }
    return true
  }

  /**
   * گام ۱ — مشخصات فرستنده  (tab: #pills-1)
   *
   * سلکتورهای واقعی سایت:
   *   #senderSelectType     select  →  "1" حقیقی | "2" حقوقی
   *   #txtSenderOfficeName  نام شرکت      (فقط حقوقی — والدش کلاس hidden دارد)
   *   #txtSenderFirstName   نام
   *   #txtSenderLastName    نام خانوادگی
   *   #txtSenderMobile      موبایل (اجباری، ماسک 999-99999999)
   *   #txtSenderNationalCode شناسه/کد ملی
   *   #txtSenderTell        تلفن
   *   #txtSenderPostalCode  کدپستی
   *   #btnGoLVL2            دکمه «مرحله بعد»
   *
   * نکته: انتخاب نوع فرستنده با جاوااسکریپت فیلدهای مربوطه را
   * نمایش/مخفی می‌کند، پس باید بعد از select صبر کنیم.
   */
  private async fillStep1Sender(data: WaybillData): Promise<void> {
    await this.waitForPageReady()

    const bad = this.validatePerson('فرستنده', {
      firstName: data.senderFirstName, lastName: data.senderLastName,
      mobile: data.senderMobile, nationalId: data.senderNationalId,
      phone: data.senderPhone, postalCode: data.senderPostalCode,
    })
    if (bad.length) throw new Error(`داده‌ی فرستنده نامعتبر است — ${bad.join(' | ')}`)

    // نوع فرستنده: همیشه «حقیقی» (value=1)
    await this.selectPersonType('#senderSelectType', '1', ['senderName', 'senderLastName'])

    await this.fillVisibleFields([
      { selectors: ['#txtSenderFirstName'], value: data.senderFirstName || '' },
      { selectors: ['#txtSenderLastName'], value: data.senderLastName || '' },
      { selectors: ['#txtSenderMobile'], value: data.senderMobile || '' },
      { selectors: ['#txtSenderNationalCode'], value: data.senderNationalId || '' },
      { selectors: ['#txtSenderTell'], value: data.senderPhone || '' },
      { selectors: ['#txtSenderPostalCode'], value: data.senderPostalCode || '' },
    ])

    await this.clickStepNext('#btnGoLVL2', '#pills-2-tab')
    await this.waitForTabActive('pills-2')
  }

  /**
   * گام ۲ — مشخصات گیرنده  (tab: #pills-2)
   *
   * سلکتورهای واقعی سایت:
   *   #receiverSelectType      select  →  "1" حقیقی | "2" حقوقی   (همیشه ۱)
   *   #txtReceiverOfficeName   نام شرکت (فقط حقوقی — والد #receiverOfficeName)
   *   #txtReceiverFirstName    نام            (والد #receiverName  — hidden)
   *   #txtReceiverLastName     نام خانوادگی   (والد #receiverLastName — hidden)
   *   #txtReceiverMobile       موبایل (اجباری، ماسک 9999-9999999)
   *   #txtReceiverNationalCode شناسه/کد ملی
   *   #txtReceiverTell         تلفن
   *   #txtReceiverPostalCode   کدپستی
   *   #btnGoLVL3               دکمه «مرحله بعد»
   */
  private async fillStep2Receiver(data: WaybillData): Promise<void> {
    await this.waitForPageReady()

    const bad = this.validatePerson('گیرنده', {
      firstName: data.receiverFirstName, lastName: data.receiverLastName,
      mobile: data.receiverMobile, nationalId: data.receiverNationalId,
      phone: data.receiverPhone, postalCode: data.receiverPostalCode,
    })
    if (bad.length) throw new Error(`داده‌ی گیرنده نامعتبر است — ${bad.join(' | ')}`)

    // نوع گیرنده: همیشه «حقیقی» (value=1)
    await this.selectPersonType('#receiverSelectType', '1', ['receiverName', 'receiverLastName'])

    await this.fillVisibleFields([
      { selectors: ['#txtReceiverFirstName'], value: data.receiverFirstName || '' },
      { selectors: ['#txtReceiverLastName'], value: data.receiverLastName || '' },
      { selectors: ['#txtReceiverMobile'], value: data.receiverMobile || '' },
      { selectors: ['#txtReceiverNationalCode'], value: data.receiverNationalId || '' },
      { selectors: ['#txtReceiverTell'], value: data.receiverPhone || '' },
      { selectors: ['#txtReceiverPostalCode'], value: data.receiverPostalCode || '' },
    ])

    await this.clickStepNext('#btnGoLVL3', '#pills-3-tab')
    await this.waitForTabActive('pills-3')
  }

  private async fillStep3VehicleDriver(data: WaybillData): Promise<void> {
    // سایت جدید: در مرحله سوم، خودرو و راننده باید از «لیست ثبت‌شده» انتخاب شوند
    // (dropdown/combobox) و دیگر تایپ دستی مشخصات وجود ندارد.
    //  • خودرو با تطبیق «پلاک» انتخاب می‌شود.
    //  • راننده با تطبیق «نام» یا «کد ملی» انتخاب می‌شود.
    await this.waitForPageReady()

    const vehicleOk = await this.selectFromRegisteredList({
      labelKeywords: ['خودرو', 'وسیله', 'ناوگان', 'پلاک'],
      nativeSelectors: ['#VehicleId', '#Vehicle', '#VehicleSelect', '[name="VehicleId"]', '[name="Vehicle"]'],
      customTriggerSelectors: ['#VehicleId', '#Vehicle', '.vehicle-select', '[data-field="vehicle"]'],
      queries: [data.plateNumber, data.vehicleSerialNumber || ''].filter(Boolean),
    })
    if (!vehicleOk) {
      throw new Error('انتخاب خودرو از لیست ناموفق بود — پلاک را در فهرست ثبت‌شده پیدا نکردم (پلاک/سلکتور را بررسی کنید)')
    }

    // انتخاب خودرو ممکن است فهرست راننده‌ها را از سرور بارگذاری کند
    await this.waitForPageReady()
    await this.page.waitForTimeout(800)

    const driverOk = await this.selectFromRegisteredList({
      labelKeywords: ['راننده'],
      nativeSelectors: ['#DriverId', '#Driver', '#DriverSelect', '[name="DriverId"]', '[name="Driver"]'],
      customTriggerSelectors: ['#DriverId', '#Driver', '.driver-select', '[data-field="driver"]'],
      queries: [data.driverName, data.driverNationalId || ''].filter(Boolean),
    })
    if (!driverOk) {
      throw new Error('انتخاب راننده از لیست ناموفق بود — نام/کد ملی را در فهرست ثبت‌شده پیدا نکردم (داده/سلکتور را بررسی کنید)')
    }

    await this.clickNext()
    await this.page.waitForTimeout(1500)
  }

  /**
   * یک آیتم را از «لیست ثبت‌شده» انتخاب می‌کند. هم `<select>` بومی و هم
   * dropdownهای سفارشی (kendo / select2 / ng-select / role=combobox) را پوشش می‌دهد.
   * تطبیق بر اساس متنِ گزینه انجام می‌شود و ارقام فارسی/عربی نرمال‌سازی می‌شوند تا
   * پلاک/کدملی درست پیدا شود. `queries` به ترتیب اولویت امتحان می‌شوند.
   */
  private async selectFromRegisteredList(opts: {
    labelKeywords: string[]
    nativeSelectors: string[]
    customTriggerSelectors: string[]
    queries: string[]
  }): Promise<boolean> {
    const { labelKeywords, nativeSelectors, customTriggerSelectors, queries } = opts
    if (queries.length === 0) return false

    // ── استراتژی ۱: <select> بومی ──
    // علاوه بر سلکتورهای صریح، هر <select> که برچسبش شامل یکی از کلیدواژه‌ها باشد را هم پیدا می‌کنیم.
    const labelSelects = await this.page.evaluate((keywords: string[]) => {
      const norm = (s: string) => (s || '').replace(/\s+/g, '')
      const found: string[] = []
      Array.from(document.querySelectorAll('select')).forEach((sel, i) => {
        let labelText = ''
        if (sel.id) {
          const l = document.querySelector(`label[for="${CSS.escape(sel.id)}"]`)
          if (l) labelText += l.textContent || ''
        }
        const group = sel.closest('.form-group, .mb-3, .field, .form-row, .col, .row')
        const gl = group?.querySelector('label')
        if (gl) labelText += ' ' + (gl.textContent || '')
        if (keywords.some((k) => norm(labelText).includes(norm(k)))) {
          if (!sel.id) sel.setAttribute('data-auto-idx', String(i))
          found.push(sel.id ? `#${sel.id}` : `select[data-auto-idx="${i}"]`)
        }
      })
      return found
    }, labelKeywords)

    for (const selector of [...nativeSelectors, ...labelSelects]) {
      try {
        const el = await this.page.$(selector)
        if (!el) continue
        const tag = await el.evaluate((n) => n.tagName)
        if (tag !== 'SELECT') continue
        const value = await el.evaluate((node, qs: string[]) => {
          const norm = (s: string) =>
            (s || '')
              .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
              .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
              .replace(/\s+/g, '')
          const options = Array.from((node as HTMLSelectElement).options)
          for (const q of qs) {
            const nq = norm(q)
            if (!nq) continue
            const hit = options.find((o) => norm(o.textContent || '').includes(nq))
            if (hit) return hit.value
          }
          return null
        }, queries)
        if (value) {
          await el.selectOption(value)
          await this.page.waitForTimeout(400)
          return true
        }
      } catch {
        continue
      }
    }

    // ── استراتژی ۲: dropdown سفارشی (باز کردن، جستجو، کلیک روی گزینه منطبق) ──
    // علاوه بر سلکتورهای صریح، triggerهای سفارشی نزدیک برچسب را هم کشف می‌کنیم تا
    // مستقل از idهای دقیق کار کند.
    const labelTriggers = await this.page.evaluate((keywords: string[]) => {
      const norm = (s: string) => (s || '').replace(/\s+/g, '')
      const found: string[] = []
      const widgets = Array.from(
        document.querySelectorAll(
          '[role="combobox"], [class*="select2"], [class*="k-dropdown"], [class*="k-combobox"], [class*="ng-select"], [class*="chosen"]',
        ),
      )
      widgets.forEach((w, i) => {
        const group = w.closest('.form-group, .mb-3, .field, .form-row, .col, .row')
        const labelText = group?.querySelector('label')?.textContent || w.getAttribute('aria-label') || ''
        if (keywords.some((k) => norm(labelText).includes(norm(k)))) {
          w.setAttribute('data-auto-trigger', String(i))
          found.push(`[data-auto-trigger="${i}"]`)
        }
      })
      return found
    }, labelKeywords)

    for (const trigger of [...customTriggerSelectors, ...labelTriggers]) {
      try {
        const t = await this.page.$(trigger)
        if (!t) continue
        await t.click()
        await this.page.waitForTimeout(600)

        // اگر باکس جستجو باز شد، اولین query را تایپ کن تا فهرست فیلتر شود
        const search = await this.page.$(
          '.select2-search__field, .k-list-filter input, .ng-input > input, input[role="searchbox"], input[type="search"]',
        )
        if (search) {
          await search.fill(queries[0])
          await this.page.waitForTimeout(900)
        }

        const clicked = await this.page.evaluate((qs: string[]) => {
          const norm = (s: string) =>
            (s || '')
              .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
              .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
              .replace(/\s+/g, '')
          const items = Array.from(
            document.querySelectorAll(
              'li, [role="option"], .k-list-item, .select2-results__option, .ng-option, .dropdown-item',
            ),
          ) as HTMLElement[]
          for (const q of qs) {
            const nq = norm(q)
            if (!nq) continue
            const hit = items.find((it) => it.offsetParent !== null && norm(it.textContent || '').includes(nq))
            if (hit) {
              hit.click()
              return true
            }
          }
          return false
        }, queries)

        if (clicked) {
          await this.page.waitForTimeout(400)
          return true
        }
      } catch {
        continue
      }
    }

    return false
  }

  private async fillStep4Cargo(data: WaybillData): Promise<void> {
    await this.fillFields([
      { selectors: ['#CargoName', '#cargoName', '[name="CargoName"]'], value: data.cargoName },
      { selectors: ['#CargoPackaging', '#cargoPackaging', '[name="CargoPackaging"]'], value: data.cargoPackaging || '' },
      { selectors: ['#CargoWeight', '#cargoWeight', '[name="CargoWeight"]'], value: data.cargoWeight || '' },
      { selectors: ['#CargoQuantity', '#cargoQuantity', '[name="CargoQuantity"]'], value: data.cargoQuantity || '' },
    ])
    await this.clickNext()
    await this.page.waitForTimeout(1500)
  }

  private async fillStep5FareRoute(data: WaybillData): Promise<void> {
    await this.fillFields([
      { selectors: ['#AdvanceFare', '#advanceFare', '[name="AdvanceFare"]'], value: data.advanceFare || '' },
      { selectors: ['#FareAmount', '#fareAmount', '[name="FareAmount"]'], value: data.freightCost || '' },
      { selectors: ['#TransportInsurance', '#transportInsurance', '[name="TransportInsurance"]'], value: data.transportInsurance || '' },
      { selectors: ['#TotalAmount', '#totalAmount', '[name="TotalAmount"]'], value: data.totalAmount || '' },
      { selectors: ['#InsuranceRate', '#insuranceRate', '[name="InsuranceRate"]'], value: data.insuranceRate || '' },
      { selectors: ['#InsuranceAmount', '#insuranceAmount', '[name="InsuranceAmount"]'], value: data.insuranceAmount || '' },
    ])
    if (data.fareType) {
      await this.selectDropdown(['#FareType', '[name="FareType"]'], data.fareType)
    }
    await this.clickNext()
    await this.page.waitForTimeout(2000)
  }

  async handleCaptcha(): Promise<{ solved: boolean; needsManual: boolean; screenshotPath?: string }> {
    // اگر اصلاً کپچایی در این صفحه نیست، کاری لازم نیست
    const hasCaptcha = await this.page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]')
    if (!hasCaptcha) return { solved: true, needsManual: false }

    for (let attempt = 0; attempt < 4; attempt++) {
      const cap = await captchaSolver.solveAndFill(this.page)
      if (cap.filled) return { solved: true, needsManual: false }
      await captchaSolver.refreshCaptcha(this.page)
      await this.page.waitForTimeout(900)
    }

    const screenshotPath = await browserManager.screenshot(this.page, 'captcha-needs-manual')
    return { solved: false, needsManual: true, screenshotPath }
  }

  async submit(): Promise<SubmitResult> {
    try {
      const submitBtn = await this.page.$('button[type="submit"], .btn-primary, button:has-text("ثبت")')
      if (submitBtn) await submitBtn.click()
      await this.page.waitForTimeout(5000)

      return await this.readPageResult()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, resultMessage: msg, resultType: 'error' }
    }
  }

  private async readPageResult(): Promise<SubmitResult> {
    const messageSelectors = [
      '.alert',
      '.toast',
      '.message',
      '[role="alert"]',
      '.swal2-popup',
      '.modal-body',
      '.result-message',
      '.alert-success',
      '.alert-danger',
      '.alert-warning',
      '.alert-info',
      '.toast-success',
      '.toast-error',
      '.swal2-html-container',
      '.swal2-content',
      '.notification',
      '.msg',
      '.status-message',
      '.response-message',
      '.error-message',
      '.success-message',
    ]

    for (const selector of messageSelectors) {
      try {
        const elements = await this.page.$$(selector)
        for (const el of elements) {
          const text = await el.textContent()
          if (text && text.trim().length > 0) {
            const trimmed = text.trim()
            const resultType = await this.detectResultType(el)
            const isTrackingCode = /WB-|بارنامه\s*#\d+/.test(trimmed)
            return {
              success: resultType === 'success' || isTrackingCode,
              trackingCode: isTrackingCode ? trimmed : undefined,
              resultMessage: trimmed,
              resultType,
            }
          }
        }
      } catch { continue }
    }

    const bodyText = await this.page.textContent('body') || ''

    const successPatterns = [
      /موفق.* WB-\d+/,
      /بارنامه.*#\d+/,
      /WB-\d+/,
      /ثبت.*موفق/,
      /با موفقیت/,
      /انجام شد/,
    ]
    for (const pattern of successPatterns) {
      const match = bodyText.match(pattern)
      if (match) {
        const trackingMatch = bodyText.match(/WB-\d+|بارنامه\s*#\d+/)
        return {
          success: true,
          trackingCode: trackingMatch?.[0],
          resultMessage: match[0],
          resultType: 'success',
        }
      }
    }

    const errorPatterns = [
      /خطا[:\s]*([^\n<]+)/,
      /خطای[:\s]*([^\n<]+)/,
      /ناموفق/,
      /عدم/,
      /مجاز نیست/,
      /منقضی/,
      /موجود نیست/,
    ]
    for (const pattern of errorPatterns) {
      const match = bodyText.match(pattern)
      if (match) {
        return {
          success: false,
          resultMessage: match[0],
          resultType: 'error',
        }
      }
    }

    return { success: false, resultMessage: 'نتیجه نامشخص', resultType: 'info' }
  }

  private async detectResultType(el: PlaywrightElementHandle): Promise<'success' | 'error' | 'warning' | 'info'> {
    if (!el) return 'info'
    try {
      const className = await el.getAttribute('class') || ''
      const style = await el.getAttribute('style') || ''
      const combined = className + style

      if (/alert-success|toast-success|swal2-success|#28a745|#23c55e|#4caf50/i.test(combined)) {
        return 'success'
      }
      if (/alert-danger|alert-error|toast-error|swal2-error|#dc3545|#ef4444|#f44336/i.test(combined)) {
        return 'error'
      }
      if (/alert-warning|toast-warning|swal2-warning|#ffc107|#f97316|#ff9800/i.test(combined)) {
        return 'warning'
      }

      const bgColor = await el.evaluate((e: HTMLElement) => window.getComputedStyle(e).backgroundColor)
      if (/rgb\(40,\s*167/.test(bgColor) || /rgb\(34,\s*197/.test(bgColor)) return 'success'
      if (/rgb\(220,\s*53/.test(bgColor) || /rgb\(239,\s*68/.test(bgColor)) return 'error'
      if (/rgb\(255,\s*193/.test(bgColor) || /rgb\(249,\s*115/.test(bgColor)) return 'warning'

      return 'info'
    } catch {
      return 'info'
    }
  }

  /* ---------------- کمک‌کننده‌های مخصوص فرم بارنامه ---------------- */

  /** آیا عنصر واقعاً روی صفحه دیده می‌شود؟ (والد hidden هم بررسی می‌شود) */

  /* ---------------- اعتبارسنجی داده پیش از ارسال ---------------- */

  /** قاعده‌ی رایج کد پستی ایران */
  private static checkPostal(v?: string): string | null {
    if (!v) return null
    const s = String(v).replace(/\D/g, '')
    if (s.length !== 10) return `کدپستی باید ۱۰ رقم باشد (مقدار: ${v})`
    if (/^(\d)\1{9}$/.test(s)) return `کدپستی نامعتبر (همه ارقام یکسان): ${v}`
    if (!/^[13-9]{4}[1346-9][013-9]{5}$/.test(s)) return `کدپستی با الگوی مجاز نمی‌خواند: ${v}`
    return null
  }

  /** کد ملی ۱۰ رقمی با رقم کنترلی (یا شناسه‌ی حقوقی ۱۱ رقمی) */
  private static checkNationalCode(v?: string): string | null {
    if (!v) return null
    const s = String(v).replace(/\D/g, '')
    if (s.length === 11 && s.startsWith('10')) return null
    if (s.length !== 10) return `کد ملی باید ۱۰ رقم باشد (مقدار: ${v})`
    if (/^(\d)\1{9}$/.test(s)) return `کد ملی نامعتبر (همه ارقام یکسان): ${v}`
    let sum = 0
    for (let i = 0; i < 9; i++) sum += parseInt(s[i], 10) * (10 - i)
    const r = sum % 11
    const expect = r < 2 ? r : 11 - r
    if (parseInt(s[9], 10) !== expect) return `رقم کنترلی کد ملی اشتباه است (مقدار: ${v})`
    return null
  }

  private static checkMobile(v?: string): string | null {
    if (!v) return 'شماره موبایل اجباری است'
    const s = String(v).replace(/\D/g, '')
    if (s.length !== 11) return `موبایل باید ۱۱ رقم باشد (مقدار: ${v})`
    if (!s.startsWith('09')) return `موبایل باید با ۰۹ شروع شود (مقدار: ${v})`
    return null
  }

  private static checkTell(v?: string): string | null {
    if (!v) return null
    const s = String(v).replace(/\D/g, '')
    if (s.length < 8 || s.length > 11) return `طول شماره تلفن نامعتبر (مقدار: ${v})`
    if (!s.startsWith('0')) return `تلفن باید با ۰ شروع شود (مقدار: ${v})`
    return null
  }

  /**
   * داده‌ی یک شخص را قبل از تایپ بررسی می‌کند تا خطاها زودتر و
   * با پیام روشن گزارش شوند (به‌جای شکست مبهم در «مرحله بعد»).
   */
  private validatePerson(
    who: string,
    p: { firstName?: string; lastName?: string; mobile?: string; nationalId?: string; phone?: string; postalCode?: string },
  ): string[] {
    const errs: string[] = []
    if (!p.firstName) errs.push(`${who}: نام اجباری است`)
    if (!p.lastName) errs.push(`${who}: نام خانوادگی اجباری است`)
    const m = WaybillFlow.checkMobile(p.mobile); if (m) errs.push(`${who}: ${m}`)
    const n = WaybillFlow.checkNationalCode(p.nationalId); if (n) errs.push(`${who}: ${n}`)
    const t = WaybillFlow.checkTell(p.phone); if (t) errs.push(`${who}: ${t}`)
    const c = WaybillFlow.checkPostal(p.postalCode); if (c) errs.push(`${who}: ${c}`)
    return errs
  }

  /** خطاهای اعتبارسنجی زنده‌ی خود سایت را می‌خواند */
  private async readFieldErrors(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll('small.help-block').forEach((el) => {
        const he = el as HTMLElement
        const invalid = he.getAttribute('data-fv-result') === 'INVALID'
        if (!invalid && he.offsetParent === null) return
        const t = (he.innerText || '').trim()
        if (!t) return
        const f = he.getAttribute('data-fv-for') || ''
        out.push(f ? `${f}: ${t}` : t)
      })
      return Array.from(new Set(out)).slice(0, 8)
    }).catch(() => [] as string[])
  }

  private async isVisible(selector: string): Promise<boolean> {
    try {
      return await this.page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null
        if (!el) return false
        // والدهای با کلاس hidden / d-none / display:none
        let n: HTMLElement | null = el
        while (n) {
          const s = getComputedStyle(n)
          if (s.display === 'none' || s.visibility === 'hidden') return false
          if (n.classList.contains('hidden') || n.classList.contains('d-none')) return false
          n = n.parentElement
        }
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }, selector)
    } catch { return false }
  }

  /**
   * انتخاب «نوع شخص» (حقیقی/حقوقی) و اطمینان از نمایان شدن فیلدهای وابسته.
   *
   * سایت این بخش‌ها را با کلاس `hidden` پنهان می‌کند و فقط با رویداد
   * change جی‌کوئری بازشان می‌کند. اگر آن اسکریپت اجرا نشود، فیلدها
   * مخفی می‌مانند و پر نمی‌شوند؛ پس در صورت نیاز خودمان بازشان می‌کنیم.
   *
   * @param selector    سلکتور المان select
   * @param value       "1" حقیقی | "2" حقوقی
   * @param wrapperIds  آیدی div‌هایی که باید نمایان شوند
   */
  private async selectPersonType(
    selector: string,
    value: string,
    wrapperIds: string[],
  ): Promise<void> {
    await this.selectByValue(selector, value)
    // تغییر نوع، فیلدها را نمایش/مخفی می‌کند
    await this.page.waitForTimeout(450)

    // اگر اسکریپت سایت کلاس hidden را برنداشت، دستی برمی‌داریم
    await this.page.evaluate((ids) => {
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el) {
          el.classList.remove('hidden')
          el.classList.remove('d-none')
        }
      }
    }, wrapperIds).catch(() => { /* ignore */ })
    await this.page.waitForTimeout(150)
  }

  /** انتخاب گزینه از select بر اساس value، همراه با رویدادهای لازم */
  private async selectByValue(selector: string, value: string): Promise<boolean> {
    try {
      const el = await this.page.$(selector)
      if (!el) return false
      try {
        await el.selectOption(value)
      } catch {
        await this.page.evaluate(
          ({ sel, val }) => {
            const s = document.querySelector(sel) as HTMLSelectElement | null
            if (!s) return
            s.value = val
            s.dispatchEvent(new Event('change', { bubbles: true }))
            s.dispatchEvent(new Event('input', { bubbles: true }))
          },
          { sel: selector, val: value },
        )
      }
      // برخی فرم‌ها به jQuery change وابسته‌اند
      await this.page.evaluate(
        ({ sel }) => {
          const w = window as unknown as { jQuery?: (s: string) => { trigger: (e: string) => void } }
          if (w.jQuery) { try { w.jQuery(sel).trigger('change') } catch { /* ignore */ } }
        },
        { sel: selector },
      ).catch(() => {})
      return true
    } catch { return false }
  }

  /**
   * فقط فیلدهای قابل‌مشاهده را پر می‌کند و مقدار را تأیید می‌کند.
   * فیلدهای ماسک‌دار (مثل موبایل) با تایپ کاراکتری پر می‌شوند.
   */
  private async fillVisibleFields(fields: Array<{ selectors: string[]; value: string }>): Promise<void> {
    for (const f of fields) {
      if (!f.value) continue
      for (const sel of f.selectors) {
        const el = await this.page.$(sel)
        if (!el) continue

        // اگر مخفی است، والدهای پنهان‌کننده را باز کن و دوباره بررسی کن
        if (!(await this.isVisible(sel))) {
          await this.page.evaluate((s) => {
            let n = document.querySelector(s) as HTMLElement | null
            while (n) {
              n.classList?.remove('hidden')
              n.classList?.remove('d-none')
              if (n.style && n.style.display === 'none') n.style.display = ''
              n = n.parentElement
            }
          }, sel).catch(() => { /* ignore */ })
          await this.page.waitForTimeout(80)
          if (!(await this.isVisible(sel))) break // واقعاً مخفی است، رد شو
        }

        try {
          await el.click({ clickCount: 3 }).catch(() => {})
          await el.fill('')
          await this.page.waitForTimeout(20 + Math.random() * 40)
          // تایپ کاراکتری تا ماسک‌های jQuery درست کار کنند
          await el.type(f.value, { delay: 10 + Math.random() * 15 })
          // رویدادهای اعتبارسنجی سایت (FormValidation روی blur/change گوش می‌دهد)
          await this.page.evaluate((s) => {
            const i = document.querySelector(s) as HTMLInputElement | null
            if (!i) return
            i.dispatchEvent(new Event('input', { bubbles: true }))
            i.dispatchEvent(new Event('change', { bubbles: true }))
            i.dispatchEvent(new Event('blur', { bubbles: true }))
            const w = window as unknown as { jQuery?: (el: unknown) => { trigger: (e: string) => unknown } }
            if (w.jQuery) { try { w.jQuery(i).trigger('change'); w.jQuery(i).trigger('blur') } catch { /* ignore */ } }
          }, sel).catch(() => { /* ignore */ })
        } catch {
          try { await el.fill(f.value) } catch { /* ignore */ }
        }

        // تأیید مقدار؛ اگر ماسک تغییرش داده، ارقام را مقایسه می‌کنیم
        try {
          const actual = await this.page.evaluate((s) => {
            const i = document.querySelector(s) as HTMLInputElement | null
            return i ? i.value : ''
          }, sel)
          const onlyDigits = (v: string) => v.replace(/\D/g, '')
          const ok = actual === f.value ||
            (/^\d+$/.test(f.value) && onlyDigits(actual) === f.value)
          if (!ok && actual.trim() === '') {
            await this.page.evaluate(
              ({ s, v }) => {
                const i = document.querySelector(s) as HTMLInputElement | null
                if (i) {
                  i.value = v
                  i.dispatchEvent(new Event('input', { bubbles: true }))
                  i.dispatchEvent(new Event('change', { bubbles: true }))
                  i.dispatchEvent(new Event('blur', { bubbles: true }))
                }
              },
              { s: sel, v: f.value },
            )
          }
        } catch { /* ignore */ }

        break
      }
    }
  }

  /** کلیک دکمه‌ی «مرحله بعد» با پشتیبانی از دکمه‌ی پنهانِ ناوبری تب */
  private async clickStepNext(primarySelector: string, fallbackTabSelector?: string): Promise<void> {
    const btn = await this.page.$(primarySelector)
    if (btn) {
      await btn.click().catch(async () => {
        await this.page.evaluate((s) => {
          (document.querySelector(s) as HTMLElement | null)?.click()
        }, primarySelector)
      })
      await this.page.waitForTimeout(1200)
      return
    }
    if (fallbackTabSelector) {
      await this.page.evaluate((s) => {
        (document.querySelector(s) as HTMLElement | null)?.click()
      }, fallbackTabSelector).catch(() => {})
      await this.page.waitForTimeout(1200)
      return
    }
    await this.clickNext()
  }

  /**
   * صبر می‌کند تا تب موردنظر فعال شود.
   * اگر فعال نشد یعنی اعتبارسنجی سایت جلوی رفتن به گام بعد را گرفته —
   * در این حالت پیام خطا را می‌خوانیم و throw می‌کنیم.
   */
  private async waitForTabActive(tabPaneId: string, timeoutMs = 12000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const active = await this.page.evaluate((id) => {
        const p = document.getElementById(id)
        return !!(p && p.classList.contains('active') && p.classList.contains('show'))
      }, tabPaneId).catch(() => false)
      if (active) { await this.page.waitForTimeout(500); return }
      await this.page.waitForTimeout(400)
    }

    // نرفت جلو → دلیلش را پیدا کن (با نام فیلد)
    const errs = await this.readFieldErrors()
    const extra = await this.page.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll('.alert-danger, .validation-summary-errors').forEach((el) => {
        const t = (el as HTMLElement).innerText.trim()
        if (t) out.push(t)
      })
      return out.slice(0, 3)
    }).catch(() => [] as string[])
    errs.push(...extra)

    throw new Error(
      errs.length
        ? `اعتبارسنجی سایت اجازه‌ی رفتن به گام بعد را نداد: ${errs.join(' | ')}`
        : `گام بعدی (${tabPaneId}) باز نشد`,
    )
  }

  private async fillFields(fields: Array<{ selectors: string[]; value: string }>): Promise<void> {
    for (const field of fields) {
      if (!field.value) continue
      for (const selector of field.selectors) {
        try {
          const el = await this.page.$(selector)
          if (el) { await el.click(); await el.fill(field.value); await this.page.waitForTimeout(300); break }
        } catch { continue }
      }
    }
  }

  private async selectDropdown(selectors: string[], value: string): Promise<void> {
    for (const selector of selectors) {
      try {
        const el = await this.page.$(selector)
        if (el) {
          await el.click()
          await this.page.waitForTimeout(500)
          const option = await this.page.$(`option:has-text("${value}")`)
          if (option) {
            const optionValue = await option.getAttribute('value')
            if (optionValue) {
              await el.selectOption(optionValue)
              await this.page.waitForTimeout(300)
              return
            }
          }
          const item = await this.page.$(`li:has-text("${value}"), [role="option"]:has-text("${value}")`)
          if (item) {
            await item.click()
            await this.page.waitForTimeout(300)
            return
          }
          break
        }
      } catch { continue }
    }
  }

  private async clickNext(): Promise<void> {
    try {
      const btn = await this.page.$('button:has-text("بعدی"), button:has-text("مرحله بعد"), .btn-next')
      if (btn) { await btn.click(); await this.page.waitForTimeout(1500) }
    } catch {}
  }
}

type PlaywrightElementHandle = Awaited<ReturnType<Page['$']>>