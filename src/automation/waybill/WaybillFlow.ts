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

  private async fillStep1Sender(data: WaybillData): Promise<void> {
    if (data.senderType) {
      await this.selectDropdown(['#SenderType', '[name="SenderType"]'], data.senderType)
    }
    await this.fillFields([
      { selectors: ['#SenderNationalId', '#senderNationalId', '[name="SenderNationalId"]'], value: data.senderNationalId },
      { selectors: ['#SenderMobile', '#senderMobile', '[name="SenderMobile"]'], value: data.senderMobile },
      { selectors: ['#SenderFirstName', '#senderFirstName', '[name="SenderFirstName"]'], value: data.senderFirstName },
      { selectors: ['#SenderLastName', '#senderLastName', '[name="SenderLastName"]'], value: data.senderLastName },
      { selectors: ['#SenderPhone', '#senderPhone', '[name="SenderPhone"]'], value: data.senderPhone || '' },
      { selectors: ['#SenderPostalCode', '#senderPostalCode', '[name="SenderPostalCode"]'], value: data.senderPostalCode || '' },
    ])
    await this.clickNext()
    await this.page.waitForTimeout(1500)
  }

  private async fillStep2Receiver(data: WaybillData): Promise<void> {
    if (data.receiverType) {
      await this.selectDropdown(['#ReceiverType', '[name="ReceiverType"]'], data.receiverType)
    }
    await this.fillFields([
      { selectors: ['#ReceiverNationalId', '#receiverNationalId', '[name="ReceiverNationalId"]'], value: data.receiverNationalId },
      { selectors: ['#ReceiverMobile', '#receiverMobile', '[name="ReceiverMobile"]'], value: data.receiverMobile },
      { selectors: ['#ReceiverFirstName', '#receiverFirstName', '[name="ReceiverFirstName"]'], value: data.receiverFirstName },
      { selectors: ['#ReceiverLastName', '#receiverLastName', '[name="ReceiverLastName"]'], value: data.receiverLastName },
      { selectors: ['#ReceiverPhone', '#receiverPhone', '[name="ReceiverPhone"]'], value: data.receiverPhone || '' },
      { selectors: ['#ReceiverPostalCode', '#receiverPostalCode', '[name="ReceiverPostalCode"]'], value: data.receiverPostalCode || '' },
    ])
    await this.clickNext()
    await this.page.waitForTimeout(1500)
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
    for (let attempt = 0; attempt < 3; attempt++) {
      const captchaResult = await captchaSolver.solveCaptcha(this.page)
      if (!captchaResult.needsManualReview) {
        const input = await this.page.$('#DNTCaptchaInputText')
        if (input) { await input.fill(captchaResult.text); return { solved: true, needsManual: false } }
      }
      await captchaSolver.refreshCaptcha(this.page)
      await this.page.waitForTimeout(1500)
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