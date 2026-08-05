import type { Page } from 'playwright'
import { browserManager } from '../browser/BrowserManager'
import { captchaSolver } from '../captcha/CaptchaSolver'
import { waitForSwalError, readSwalError, SWAL_ERROR_MARK } from '../browser/Resilience'
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
    // مثل تستر: بی‌درنگ overlay را حذف می‌کنیم به‌جای انتظار ۱۵ ثانیه‌ای.
    // این لایه روی کل صفحه می‌افتد و همه‌ی کلیک‌ها/تایپ‌ها را می‌بلعد.
    await this.page.evaluate(() => {
      const loading = document.getElementById('loading')
      if (loading) loading.remove()
      // هر overlay تمام‌صفحه‌ی دیگر که ممکن است جلوی کلیک را بگیرد
      document.querySelectorAll('.blockUI, .loading-overlay, .page-loader').forEach((el) => {
        (el as HTMLElement).remove()
      })
    }).catch(() => { /* ignore */ })

    // صبر کوتاه تا رندر پایدار شود
    await this.page.waitForTimeout(400)
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
      ['کالا', () => this.fillStep4Cargo(data)],
      ['مبدا', () => this.fillStep5Origin(data)],
      ['مقصد', () => this.fillStep6Destination(data)],
      ['بازبینی مسیر', () => this.fillStep7Review()],
      ['کرایه', () => this.fillStep8Fare(data)],
    ]

    await this.page.waitForTimeout(1000 + Math.random() * 2000)

    for (const [name, fn] of steps) {
      try {
        // پیش از هر گام صفحه را تمیز کن (تستر هم همین کار را می‌کند)
        await this.waitForPageReady()
        await fn()
        await opts?.onStep?.(name, true)
        // مکث انسانی بین گام‌ها
        await this.page.waitForTimeout(400 + Math.random() * 500)
      } catch (e) {
        await opts?.onStep?.(name, false, e)
        // دلیل واقعی شکست را نگه می‌داریم تا در لاگ دیده شود
        this.lastError = `گام «${name}»: ${e instanceof Error ? e.message : String(e)}`
        return false
      }
    }
    this.lastError = ''
    return true
  }

  /** آخرین دلیل شکست fillForm (برای گزارش دقیق در لاگ) */
  public lastError = ''

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

  /**
   * گام ۳ — راننده و خودرو  (tab: #pills-3)
   *
   * دو حالت:
   *   A «تجمیعی» (#frmpelaqTajmi): پلاک از #PelakComboTajmi و راننده از
   *     #DriverListTajmi انتخاب می‌شوند. مقدار هر آپشن پلاک یک JSON است
   *     که شامل irTagPart1..4 می‌شود.
   *   B «دستی» (#frmpelaq): اجزای پلاک تایپ می‌شوند و کد ملی راننده در
   *     #txtDriverSearch وارد می‌شود.
   */
  private async fillStep3VehicleDriver(data: WaybillData): Promise<void> {
    await this.waitForPageReady()

    const parts = WaybillFlow.parsePlate(data.plateNumber)
    if (!parts) throw new Error(`پلاک «${data.plateNumber}» قابل تجزیه نیست (قالب مورد انتظار: 45 ع 923 17)`)

    const mode = await this.page.evaluate(() => {
      const vis = (el: HTMLElement | null) => {
        if (!el) return false
        if (el.classList.contains('d-none')) return false
        const s = getComputedStyle(el)
        return s.display !== 'none' && s.visibility !== 'hidden'
      }
      return {
        tajmi: vis(document.getElementById('frmpelaqTajmi')),
        manual: vis(document.getElementById('frmpelaq')),
      }
    }).catch(() => ({ tajmi: false, manual: false }))

    if (mode.tajmi) {
      // مکث پیش از انتخاب پلاک — فهرست با AJAX پر می‌شود
      await this.page.waitForTimeout(3000)

      // اگر هنوز نیامده، تا ۱۲ ثانیه‌ی دیگر منتظر بمان
      for (let i = 0; i < 24; i++) {
        const n = await this.page.evaluate(() =>
          document.querySelectorAll('#PelakComboTajmi option').length).catch(() => 0)
        if (n > 1) break
        await this.page.waitForTimeout(500)
      }

      // ---- انتخاب پلاک از لیست ----
      const picked = await this.page.evaluate((want: string[]) => {
        const sel = document.getElementById('PelakComboTajmi') as HTMLSelectElement | null
        if (!sel) return null
        const digits = (t: string) => String(t)
          .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
          .replace(/\D/g, '')
        const apply = (o: HTMLOptionElement) => {
          sel.value = o.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          const w = window as unknown as { jQuery?: (x: unknown) => { val: (v: string) => { trigger: (e: string) => void } } }
          if (w.jQuery) { try { w.jQuery(sel).val(o.value).trigger('change') } catch { /* ignore */ } }
          return (o.textContent || '').trim()
        }
        for (const o of Array.from(sel.options)) {
          if (!o.value) continue
          try {
            const j = JSON.parse(o.value)
            if (String(j.irTagPart1) === want[0] && String(j.irTagPart4) === want[1] && String(j.irTagPart2) === want[2]) {
              return apply(o)
            }
          } catch { /* not json */ }
          const d = digits(o.textContent || '')
          if (want.every((w2) => d.includes(w2))) return apply(o)
        }
        return null
      }, [parts.two, parts.three, parts.iran]).catch(() => null)

      if (!picked) {
        // ممکن است فهرست هنوز از سرور نیامده باشد یا سایت خطا داده باشد
        const swal = await waitForSwalError(this.page, 2500)
        const count = await this.page.evaluate(() =>
          document.querySelectorAll('#PelakComboTajmi option').length).catch(() => 0)
        if (swal) {
          throw new Error(`${SWAL_ERROR_MARK} ${swal}`)
        }
        if (count <= 1) {
          // فهرست خالی است ⇒ مشکل موقتی سمت سایت، قابل تلاش مجدد
          throw new Error(`${SWAL_ERROR_MARK} فهرست پلاک‌ها خالی است (سایت پاسخ نداد)`)
        }
        throw new Error(`پلاک «${data.plateNumber}» در فهرست ناوگان این حساب نیست — ابتدا در سامانه ثبت شود`)
      }

      // لیست راننده با AJAX پر می‌شود
      await this.page.waitForTimeout(1500)
      for (let i = 0; i < 12; i++) {
        const n = await this.page.evaluate(() =>
          document.querySelectorAll('#DriverListTajmi option').length).catch(() => 0)
        if (n > 1) break
        await this.page.waitForTimeout(500)
      }

      const drv = await this.page.evaluate(({ name, nid }: { name: string; nid: string }) => {
        const sel = document.getElementById('DriverListTajmi') as HTMLSelectElement | null
        if (!sel) return null
        const clean = (t: string) => String(t).replace(/[\u200c\s]+/g, ' ').trim()
        const target = clean(name)
        let hit: HTMLOptionElement | null = null
        for (const o of Array.from(sel.options)) {
          if (!o.value || o.value === '0') continue
          const t = clean(o.textContent || '')
          if (t === target || t.includes(target) || (nid && (o.value.includes(nid) || t.includes(nid)))) { hit = o; break }
        }
        if (!hit) {
          const real = Array.from(sel.options).filter((o) => o.value && o.value !== '0')
          if (real.length === 1) hit = real[0]
        }
        if (!hit) return null
        sel.value = hit.value
        sel.dispatchEvent(new Event('change', { bubbles: true }))
        const w = window as unknown as { jQuery?: (x: unknown) => { val: (v: string) => { trigger: (e: string) => void } } }
        if (w.jQuery) { try { w.jQuery(sel).val(hit.value).trigger('change') } catch { /* ignore */ } }
        return clean(hit.textContent || '')
      }, { name: data.driverName ?? '', nid: data.driverNationalId ?? '' }).catch(() => null)

      if (!drv) {
        const swal = await waitForSwalError(this.page, 2000)
        const dcount = await this.page.evaluate(() =>
          document.querySelectorAll('#DriverListTajmi option').length).catch(() => 0)
        if (swal) throw new Error(`${SWAL_ERROR_MARK} ${swal}`)
        if (dcount <= 1) throw new Error(`${SWAL_ERROR_MARK} فهرست رانندگان خالی است (سایت پاسخ نداد)`)
        throw new Error(`راننده «${data.driverName}» در فهرست این پلاک نیست`)
      }
      await this.page.waitForTimeout(1000)
    } else if (mode.manual) {
      // ---- ورود دستی ----
      const letter = WaybillFlow.PLATE_LETTERS[parts.letter]
      await this.fillVisibleFields([
        { selectors: ['#pelakIrNum'], value: parts.two },
        { selectors: ['#pelakCenter'], value: parts.three },
      ])
      if (letter) await this.selectByValue('#pelakCombo', letter)
      await this.fillVisibleFields([
        { selectors: ['#pelakFirst'], value: parts.iran },
        { selectors: ['#txtDriverSearch'], value: data.driverNationalId || '' },
      ])
      await this.page.waitForTimeout(1500)
    } else {
      throw new Error('فرم پلاک در گام ۳ قابل مشاهده نیست')
    }

    await this.clickStepNext('#btnGoLVL4', '#pills-4-tab')
    await this.waitForTabActive('pills-4')
  }

  /** حروف مجاز پلاک → value در #pelakCombo */
  private static readonly PLATE_LETTERS: Record<string, string> = {
    'الف': '1', 'ب': '2', 'پ': '3', 'ت': '4', 'ث': '5', 'ج': '6', 'چ': '7', 'ح': '8',
    'خ': '9', 'د': '10', 'ذ': '11', 'ر': '12', 'ز': '13', 'ژ': '14', 'س': '15', 'ش': '16',
    'ص': '17', 'ض': '18', 'ط': '19', 'ظ': '20', 'ع': '21', 'غ': '22', 'ف': '23', 'ق': '24',
    'ک': '25', 'گ': '26', 'ل': '27', 'م': '28', 'ن': '29', 'و': '30', 'ه': '31', 'ی': '32',
  }

  /** «45 ع 923 17» → { two:'45', letter:'ع', three:'923', iran:'17' } */
  private static parsePlate(v?: string): { two: string; letter: string; three: string; iran: string } | null {
    if (!v) return null
    const s = String(v)
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/ايران|ایران/g, ' ')
      .trim()
    const m = s.match(/(\d{2})\s*[-\s]?\s*([\u0600-\u06FF]+)\s*[-\s]?\s*(\d{3})\s*[-\s]?\s*(\d{2})/)
    if (!m) return null
    return { two: m[1], letter: m[2].trim(), three: m[3], iran: m[4] }
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

  /**
   * گام ۴ — مشخصات کالا  (tab: #pills-4)
   *
   * جریان متفاوت: کالا از طریق یک «مودال» اضافه می‌شود.
   *   ۱) #btnAddLoad → مودال باز می‌شود
   *   ۲) #txtLoadName یک autocomplete است؛ باید از لیست انتخاب شود
   *   ۳) #txtWeight (تن) | #ddBoxType | #txtBoxNum | #txtLoadDetail
   *   ۴) #btnInsertLoad → ردیف در #gridfullLoaddata
   *   ۵) #txtLoadsValue (ارزش ریالی) → #btnGoLVL5
   */
  private async fillStep4Cargo(data: WaybillData): Promise<void> {
    await this.waitForPageReady()

    if (!data.cargoName) throw new Error('نام کالا در پروفایل تعیین نشده است')

    // ۱) باز کردن مودال
    const addBtn = await this.page.$('#btnAddLoad')
    if (!addBtn) throw new Error('دکمه «افزودن کالای جدید» پیدا نشد')
    await addBtn.click().catch(() => { /* ignore */ })

    let open = false
    for (let i = 0; i < 20; i++) {
      await this.page.waitForTimeout(300)
      open = await this.page.evaluate(() => {
        const el = document.getElementById('txtLoadName')
        return !!(el && (el as HTMLElement).offsetParent !== null)
      }).catch(() => false)
      if (open) break
    }
    if (!open) throw new Error('مودال «ثبت کالا» باز نشد')
    await this.page.waitForTimeout(400)

    // ۲) نام کالا از autocomplete
    const nameEl = await this.page.$('#txtLoadName')
    if (!nameEl) throw new Error('فیلد نام کالا پیدا نشد')
    await nameEl.click({ clickCount: 3 }).catch(() => { /* ignore */ })
    await nameEl.fill('')
    await nameEl.type(data.cargoName, { delay: 110 })
    await this.page.evaluate(() => {
      const i = document.getElementById('txtLoadName')
      if (!i) return
      i.dispatchEvent(new Event('input', { bubbles: true }))
      i.dispatchEvent(new Event('keyup', { bubbles: true }))
      const w = window as unknown as { jQuery?: (x: unknown) => { trigger: (e: string) => { trigger: (e2: string) => void } } }
      if (w.jQuery) { try { w.jQuery(i).trigger('keydown').trigger('keyup') } catch { /* ignore */ } }
    }).catch(() => { /* ignore */ })

    let picked: string | null = null
    for (let i = 0; i < 24; i++) {
      await this.page.waitForTimeout(300)
      picked = await this.page.evaluate((want: string) => {
        const lists = document.querySelectorAll('ul.ui-autocomplete, .ui-menu')
        for (const ul of Array.from(lists)) {
          if ((ul as HTMLElement).offsetParent === null) continue
          const items = Array.from(ul.querySelectorAll('li'))
            .filter((li) => ((li as HTMLElement).innerText || '').trim())
          if (!items.length) continue
          const exact = items.find((li) => ((li as HTMLElement).innerText || '').trim() === want)
          const target = (exact || items[0]) as HTMLElement
          const a = (target.querySelector('a') || target) as HTMLElement
          a.click()
          return (target.innerText || '').trim()
        }
        return null
      }, data.cargoName).catch(() => null)
      if (picked) break
    }
    await this.page.waitForTimeout(500)

    // ۳) وزن / بسته‌بندی / تعداد
    await this.fillVisibleFields([
      { selectors: ['#txtWeight'], value: data.cargoWeight || '' },
    ])

    const boxVal = WaybillFlow.BOX_TYPES[data.cargoPackaging ?? ''] ?? WaybillFlow.BOX_TYPES['سایر']
    await this.selectByValue('#ddBoxType', boxVal)

    await this.fillVisibleFields([
      { selectors: ['#txtBoxNum'], value: data.cargoQuantity || '' },
    ])

    // ۴) ثبت کالا
    const insBtn = await this.page.$('#btnInsertLoad')
    if (!insBtn) throw new Error('دکمه «ثبت کالای جدید» پیدا نشد')
    await insBtn.click().catch(() => { /* ignore */ })
    await this.page.waitForTimeout(1500)

    let rows = 0
    for (let i = 0; i < 16; i++) {
      rows = await this.page.evaluate(() =>
        document.querySelectorAll('#gridfullLoaddata tr').length).catch(() => 0)
      if (rows > 0) break
      await this.page.waitForTimeout(400)
    }
    if (rows === 0) {
      const errs = await this.readFieldErrors()
      throw new Error(
        `کالا به جدول اضافه نشد${picked ? '' : ' (نام کالا از لیست پیشنهادی انتخاب نشد)'}` +
        (errs.length ? ` — ${errs.join(' | ')}` : ''),
      )
    }

    // بستن مودال در صورت باز ماندن
    await this.page.evaluate(() => {
      const b = document.querySelector('.modal.show [data-bs-dismiss="modal"]') as HTMLElement | null
      if (b) b.click()
    }).catch(() => { /* ignore */ })
    await this.page.waitForTimeout(700)

    // ۵) ارزش بار
    await this.fillVisibleFields([
      { selectors: ['#txtLoadsValue'], value: data.cargoValue || '' },
    ])

    await this.clickStepNext('#btnGoLVL5', '#pills-5-tab')
    await this.waitForTabActive('pills-5')
  }

  /** نوع بسته‌بندی → value در #ddBoxType */
  private static readonly BOX_TYPES: Record<string, string> = {
    'کارتن': '8', 'جعبه': '9', 'کیسه': '10', 'گونی': '11', 'جامبو': '12',
    'بشکه': '18072', 'رول': '18073', 'فله': '18074', 'عدل': '18075',
    'شاخه': '18076', 'سایر': '18077',
  }

  /**
   * گام ۵ — مبدا بارگیری  (tab: #pills-5)
   * گام ۶ — مقصد تخلیه    (tab: #pills-6)
   *
   * سایت پیش‌فرض حالت «نقشه» را نشان می‌دهد و بخش ورود دستی
   * (#normalmabda / #normalmagsad) کلاس d-none دارد؛ نمایانش می‌کنیم.
   * فهرست شهر با AJAX پس از انتخاب استان پر می‌شود.
   */
  private async fillLocation(
    kind: 'origin' | 'dest',
    loc: { province?: string; city?: string; address?: string; postalCode?: string },
  ): Promise<void> {
    const cfg = kind === 'origin'
      ? { wrap: 'normalmabda', state: '#ddStateSource', city: '#ddCitySource',
          postal: '#sourcePostalCode', addr: '#txtAddressSource', next: '#btnGoLVL6',
          tab: '#pills-6-tab', pane: 'pills-6', label: 'مبدا' }
      : { wrap: 'normalmagsad', state: '#ddStateDest', city: '#ddCityDest',
          postal: '#destPostalCode', addr: '#txtAddressDest', next: '#btnGoLVL7',
          tab: '#pills-7-tab', pane: 'pills-7', label: 'مقصد' }

    await this.waitForPageReady()

    if (!loc.province) throw new Error(`استان ${cfg.label} تعیین نشده است`)
    if (!loc.city) throw new Error(`شهر ${cfg.label} تعیین نشده است`)
    if (!loc.address) throw new Error(`آدرس ${cfg.label} تعیین نشده است`)

    await this.page.evaluate((id) => {
      const el = document.getElementById(id)
      if (el) { el.classList.remove('d-none'); el.classList.remove('hidden') }
    }, cfg.wrap).catch(() => { /* ignore */ })
    await this.page.waitForTimeout(300)

    const pv = WaybillFlow.PROVINCES[loc.province]
    if (!pv) throw new Error(`استان «${loc.province}» در فهرست سایت نیست`)
    await this.selectByValue(cfg.state, pv)
    await this.page.waitForTimeout(800)

    // صبر تا فهرست شهر با AJAX پر شود
    for (let i = 0; i < 20; i++) {
      const n = await this.page.evaluate((sel) =>
        document.querySelectorAll(sel + ' option').length, cfg.city).catch(() => 0)
      if (n > 1) break
      await this.page.waitForTimeout(400)
    }

    const picked = await this.page.evaluate(({ sel, want }: { sel: string; want: string }) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null
      if (!el) return null
      const clean = (t: string) => String(t).replace(/[\u200c\s]+/g, ' ').trim()
      const target = clean(want)
      let hit: HTMLOptionElement | null = null
      for (const o of Array.from(el.options)) {
        if (o.value && clean(o.textContent || '') === target) { hit = o; break }
      }
      if (!hit) for (const o of Array.from(el.options)) {
        if (o.value && clean(o.textContent || '').includes(target)) { hit = o; break }
      }
      if (!hit) return null
      el.value = hit.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      const w = window as unknown as { jQuery?: (x: unknown) => { val: (v: string) => { trigger: (e: string) => void } } }
      if (w.jQuery) { try { w.jQuery(el).val(hit.value).trigger('change') } catch { /* ignore */ } }
      return clean(hit.textContent || '')
    }, { sel: cfg.city, want: loc.city }).catch(() => null)

    if (!picked) throw new Error(`شهر «${loc.city}» در استان «${loc.province}» یافت نشد`)

    const fields: Array<{ selectors: string[]; value: string }> = []
    if (loc.postalCode) fields.push({ selectors: [cfg.postal], value: loc.postalCode })
    fields.push({ selectors: [cfg.addr], value: loc.address })
    await this.fillVisibleFields(fields)

    await this.clickStepNext(cfg.next, cfg.tab)
    await this.waitForTabActive(cfg.pane)
  }

  private async fillStep5Origin(data: WaybillData): Promise<void> {
    await this.fillLocation('origin', {
      province: data.originProvince, city: data.originCity,
      address: data.originAddress, postalCode: data.originPostalCode,
    })
  }

  private async fillStep6Destination(data: WaybillData): Promise<void> {
    await this.fillLocation('dest', {
      province: data.destProvince, city: data.destCity,
      address: data.destAddress, postalCode: data.destPostalCode,
    })
  }

  /** گام ۷ — فقط نمایش؛ دکمه‌ی بعدی id ندارد */
  private async fillStep7Review(): Promise<void> {
    await this.waitForPageReady()
    const ok = await this.page.evaluate(() => {
      const b = document.querySelector('#pills-7 button.btn-next[data-to="#pills-8-tab"]') as HTMLElement | null
      if (!b) return false
      b.click()
      return true
    }).catch(() => false)
    if (!ok) throw new Error('دکمه‌ی «مرحله بعد» در گام ۷ پیدا نشد')
    await this.waitForTabActive('pills-8')
  }

  /** گام ۸ — کرایه و صدور سند */
  private async fillStep8Fare(data: WaybillData): Promise<void> {
    await this.waitForPageReady()

    if (!data.freightCost) throw new Error('مبلغ کرایه در پروفایل تعیین نشده است')

    await this.fillVisibleFields([{ selectors: ['#txtkeraye'], value: data.freightCost }])
    if (data.advanceFare) {
      await this.fillVisibleFields([{ selectors: ['#txtPishKeraye'], value: data.advanceFare }])
    }
    if (data.loadingTime) {
      await this.fillVisibleFields([{ selectors: ['#loadingTime'], value: data.loadingTime }])
    }

    const btn = await this.page.$('#btnregisterbarname')
    if (!btn) throw new Error('دکمه «ثبت بارنامه» پیدا نشد')
    await btn.click().catch(() => { /* ignore */ })
    await this.page.waitForTimeout(2000)
    await this.waitForTabActive('pills-9')
  }

  /**
   * گام ۹ — تایید نهایی: کپچای دوم را حل می‌کند و سند را ثبت می‌کند.
   * کد رهگیری را برمی‌گرداند.
   */
  private async fillStep9Confirm(): Promise<string> {
    await this.waitForPageReady()

    const cap = await captchaSolver.solveAndFill(this.page)
    if (!cap.filled) {
      for (let i = 0; i < 4 && !cap.filled; i++) {
        await captchaSolver.refreshCaptcha(this.page)
        const again = await captchaSolver.solveAndFill(this.page)
        if (again.filled) break
        if (i === 3) throw new Error('کپچای گام نهایی حل نشد')
      }
    }

    const btn = await this.page.$('#btnRegisterFinished')
    if (!btn) throw new Error('دکمه «ثبت نهایی سند حمل» پیدا نشد')
    await btn.click().catch(() => { /* ignore */ })

    // پس از کلیک، یا کد رهگیری می‌آید یا پاپ‌آپ خطا ظاهر می‌شود.
    // پاپ‌آپ فقط چند ثانیه می‌ماند، پس همزمان هر دو را می‌پاییم.
    for (let i = 0; i < 40; i++) {
      const code = await this.page.evaluate(() =>
        (document.getElementById('TrackingCodeNumber') as HTMLInputElement | null)?.value || '',
      ).catch(() => '')
      if (code) return code

      const swal = await readSwalError(this.page)
      if (swal) {
        // خطای سمت سرور ⇒ قابل تلاش مجدد (لایه‌ی بالاتر صبر می‌کند)
        throw new Error(`${SWAL_ERROR_MARK} هنگام ثبت نهایی: ${swal}`)
      }

      await this.page.waitForTimeout(500)
    }

    const errs = await this.readFieldErrors()
    throw new Error(`کد رهگیری دریافت نشد${errs.length ? ` — ${errs.join(' | ')}` : ''}`)
  }

  /**
   * کپچای صفحه‌ی فعلی را حل می‌کند (اگر وجود داشته باشد).
   * در ویزارد جدید کپچا فقط در گام ۹ ظاهر می‌شود، پس در گام‌های
   * قبلی این متد بی‌صدا موفق برمی‌گردد.
   */
  async handleCaptcha(): Promise<{ solved: boolean; needsManual: boolean; screenshotPath?: string }> {
    const hasCaptcha = await this.page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]')
    if (!hasCaptcha) return { solved: true, needsManual: false }

    for (let attempt = 0; attempt < 4; attempt++) {
      const cap = await captchaSolver.solveAndFill(this.page)
      if (cap.filled) return { solved: true, needsManual: false }
      await captchaSolver.refreshCaptcha(this.page)
      await this.page.waitForTimeout(1500)
    }

    const screenshotPath = await browserManager.screenshot(this.page, 'captcha-needs-manual')
    return { solved: false, needsManual: true, screenshotPath }
  }

  /**
   * ثبت نهایی: گام ۹ را کامل می‌کند (کپچا + دکمه‌ی ثبت) و نتیجه را
   * به شکلی برمی‌گرداند که پردازشگر انتظار دارد.
   */
  async submit(): Promise<SubmitResult> {
    try {
      const code = await this.fillStep9Confirm()
      return {
        success: true,
        trackingCode: code,
        resultMessage: `بارنامه با کد رهگیری ${code} ثبت شد`,
        resultType: 'success',
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, resultMessage: msg, resultType: 'error' }
    }
  }

  /** استان‌ها → value در #ddStateSource / #ddStateDest */
  private static readonly PROVINCES: Record<string, string> = {
    'آذربایجان شرقی': '4', 'آذربایجان شرقى': '4', 'آذربایجان غربی': '5', 'آذربایجان غربى': '5',
    'اردبیل': '25', 'اصفهان': '11', 'البرز': '31', 'ایلام': '18', 'بوشهر': '22', 'تهران': '1',
    'چهارمحال و بختیاری': '16', 'چهارمحال و بختیارى': '16', 'خراسان جنوبی': '30',
    'خراسان رضوی': '10', 'خراسان شمالی': '29', 'خوزستان': '7', 'زنجان': '20', 'سمنان': '23',
    'سیستان و بلوچستان': '12', 'فارس': '8', 'قزوین': '27', 'قم': '26', 'گلستان': '28',
    'گیلان': '2', 'لرستان': '17', 'مازندران': '3', 'مرکزی': '24', 'مرکزى': '24',
    'هرمزگان': '14', 'همدان': '15', 'کردستان': '13', 'کرمان': '9', 'کرمانشاه': '6',
    'کهگیلویه و بویر احمد': '19', 'یزد': '21',
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