import type { Page } from 'playwright'
import * as fs from 'fs'

/**
 * یک‌بار مصرف: هنگام رسیدن به «گام سوم - مشخصات راننده و خودرو»،
 * ساختار واقعی صفحه رو (HTML کامل + عناصر مرتبط با dropdown ها) ذخیره می‌کنه
 * تا بشه selector دقیق نوشت.
 *
 * نحوه استفاده:
 *  1. این فایل رو کنار WaybillFlow.ts بذار (مثلاً src/automation/waybill/diagnoseVehicleDriverStep.ts)
 *  2. توی WaybillFlow.ts این ایمپورت رو اضافه کن:
 *       import { diagnoseVehicleDriverStep } from './diagnoseVehicleDriverStep'
 *  3. اول خط fillStep3VehicleDriver این رو موقتاً اضافه کن:
 *       await diagnoseVehicleDriverStep(this.page)
 *  4. اسکریپت رو یک بار به‌صورت headed (غیر headless) اجرا کن تا برسه به این مرحله.
 *  5. فایل‌های خروجی توی پوشه diagnostics/ ساخته میشن — step3-full.html و step3-elements.json
 *     رو برام بفرست تا selectorهای دقیق dropdown خودرو و راننده رو بنویسم.
 */
export async function diagnoseVehicleDriverStep(page: Page, outDir = 'diagnostics'): Promise<void> {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // 1. HTML کامل صفحه (برای بررسی آفلاین)
  const html = await page.content()
  fs.writeFileSync(`${outDir}/step3-full.html`, html)

  // 2. اسکرین‌شات کامل صفحه
  await page.screenshot({ path: `${outDir}/step3.png`, fullPage: true })

  // 3. پیدا کردن عناصر مرتبط با dropdown های خودرو و راننده
  const info = await page.evaluate(() => {
    function describe(el: Element) {
      return {
        tag: el.tagName,
        id: (el as HTMLElement).id,
        name: el.getAttribute('name'),
        className: el.getAttribute('class'),
        role: el.getAttribute('role'),
        placeholder: el.getAttribute('placeholder'),
        dataAttrs: Array.from(el.attributes)
          .filter((a) => a.name.startsWith('data-'))
          .map((a) => `${a.name}="${a.value}"`),
        text: el.textContent?.trim().slice(0, 80),
        outerHTML: el.outerHTML.slice(0, 600),
      }
    }

    const results: Record<string, unknown[]> = {
      selects: [],
      comboboxes: [],
      kendoWidgets: [],
      select2Widgets: [],
      nearVehicleLabel: [],
      nearDriverLabel: [],
    }

    document.querySelectorAll('select').forEach((el) => (results.selects as unknown[]).push(describe(el)))
    document
      .querySelectorAll('[role="combobox"], [role="listbox"]')
      .forEach((el) => (results.comboboxes as unknown[]).push(describe(el)))
    document
      .querySelectorAll('[class*="k-dropdown"], [class*="k-combobox"], [class*="k-widget"]')
      .forEach((el) => (results.kendoWidgets as unknown[]).push(describe(el)))
    document
      .querySelectorAll('[class*="select2"], [class*="chosen"]')
      .forEach((el) => (results.select2Widgets as unknown[]).push(describe(el)))

    // پیدا کردن عناصری که برچسب «خودرو» یا «راننده» دارن و چک کردن چند عنصر مجاور
    const all = Array.from(document.querySelectorAll('label, span, div, button'))
    for (const el of all) {
      const t = el.textContent?.trim() || ''
      if (t === 'خودرو' || t.includes('انتخاب خودرو')) {
        ;(results.nearVehicleLabel as unknown[]).push(describe(el))
        const parent = el.closest('div')
        if (parent) (results.nearVehicleLabel as unknown[]).push({ parentOuterHTML: parent.outerHTML.slice(0, 800) })
      }
      if (t === 'راننده' || t === 'راننده *' || t.includes('انتخاب راننده')) {
        ;(results.nearDriverLabel as unknown[]).push(describe(el))
        const parent = el.closest('div')
        if (parent) (results.nearDriverLabel as unknown[]).push({ parentOuterHTML: parent.outerHTML.slice(0, 800) })
      }
    }

    return results
  })

  fs.writeFileSync(`${outDir}/step3-elements.json`, JSON.stringify(info, null, 2))
  // eslint-disable-next-line no-console
  console.log('✅ Diagnostics saved to', outDir)
}