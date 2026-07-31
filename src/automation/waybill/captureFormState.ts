import type { Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

/**
 * از وضعیت فعلی فرم یک «عکس کامل» می‌گیرد تا بشه سلکتورهای دقیق نوشت:
 *   diagnostics/<label>.png   → اسکرین‌شات کامل صفحه
 *   diagnostics/<label>.html  → HTML کامل صفحه
 *   diagnostics/<label>.json  → فهرست ساختاریافته‌ی همه‌ی فیلدها (input/select/dropdown/button)
 *
 * تمرکز روی فیلدهای «قابل‌مشاهده» است، چون فرم‌های چندمرحله‌ای معمولاً همه‌ی
 * مرحله‌ها را در DOM نگه می‌دارند و فقط مرحله‌ی فعال را نشان می‌دهند.
 */
export interface FieldInfo {
  kind: 'input' | 'select' | 'custom-dropdown' | 'button'
  tag: string
  type?: string
  id?: string
  name?: string
  className?: string
  role?: string
  placeholder?: string
  label?: string
  value?: string
  visible: boolean
  options?: Array<{ value: string; text: string }>
  dataAttrs?: string[]
  outerHTML?: string
}

export interface FormStateSnapshot {
  label: string
  url: string
  title: string
  activeStepText: string
  fields: FieldInfo[]
  capturedAt: string
}

export async function captureFormState(
  page: Page,
  label: string,
  outDir = 'diagnostics',
): Promise<FormStateSnapshot> {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const html = await page.content()
  fs.writeFileSync(path.join(outDir, `${label}.html`), html, 'utf-8')
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true })

  const snapshot = await page.evaluate((lbl) => {
    const isVisible = (el: Element): boolean => {
      const he = el as HTMLElement
      if (he.offsetParent === null && getComputedStyle(he).position !== 'fixed') return false
      const style = getComputedStyle(he)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
      const rect = he.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const labelFor = (el: Element): string => {
      const aria = el.getAttribute('aria-label')
      if (aria) return aria.trim()
      const id = (el as HTMLElement).id
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`)
        if (l?.textContent) return l.textContent.trim()
      }
      const wrap = el.closest('label')
      if (wrap?.textContent) return wrap.textContent.replace(el.textContent || '', '').trim()
      // برچسب مجاور در گروه فرم (bootstrap: .form-group > label + input)
      const group = el.closest('.form-group, .mb-3, .field, .form-row')
      const gl = group?.querySelector('label')
      if (gl?.textContent) return gl.textContent.trim()
      return ''
    }

    const dataAttrs = (el: Element): string[] =>
      Array.from(el.attributes)
        .filter((a) => a.name.startsWith('data-'))
        .map((a) => `${a.name}="${a.value}"`)

    const fields: unknown[] = []

    // input / textarea
    document.querySelectorAll('input, textarea').forEach((el) => {
      const input = el as HTMLInputElement
      if (input.type === 'hidden') return
      fields.push({
        kind: 'input',
        tag: el.tagName,
        type: input.type,
        id: input.id,
        name: input.getAttribute('name') || '',
        className: input.getAttribute('class') || '',
        placeholder: input.getAttribute('placeholder') || '',
        label: labelFor(el),
        value: input.value,
        visible: isVisible(el),
        dataAttrs: dataAttrs(el),
        outerHTML: el.outerHTML.slice(0, 300),
      })
    })

    // select با گزینه‌ها
    document.querySelectorAll('select').forEach((el) => {
      const sel = el as HTMLSelectElement
      fields.push({
        kind: 'select',
        tag: el.tagName,
        id: sel.id,
        name: sel.getAttribute('name') || '',
        className: sel.getAttribute('class') || '',
        label: labelFor(el),
        value: sel.value,
        visible: isVisible(el),
        options: Array.from(sel.options).map((o) => ({ value: o.value, text: o.textContent?.trim() || '' })),
        dataAttrs: dataAttrs(el),
        outerHTML: el.outerHTML.slice(0, 300),
      })
    })

    // dropdown های سفارشی (kendo / select2 / role=combobox) — مهم برای مرحله خودرو/راننده
    document
      .querySelectorAll(
        '[role="combobox"], [role="listbox"], [class*="k-dropdown"], [class*="k-combobox"], [class*="select2"], [class*="chosen"], [class*="ng-select"]',
      )
      .forEach((el) => {
        fields.push({
          kind: 'custom-dropdown',
          tag: el.tagName,
          id: (el as HTMLElement).id,
          name: el.getAttribute('name') || '',
          className: el.getAttribute('class') || '',
          role: el.getAttribute('role') || '',
          label: labelFor(el),
          text: el.textContent?.trim().slice(0, 80) || '',
          visible: isVisible(el),
          dataAttrs: dataAttrs(el),
          outerHTML: el.outerHTML.slice(0, 500),
        })
      })

    // دکمه‌ها (شامل «بعدی» / «ثبت»)
    document.querySelectorAll('button, a.btn, input[type="submit"], input[type="button"]').forEach((el) => {
      fields.push({
        kind: 'button',
        tag: el.tagName,
        type: el.getAttribute('type') || '',
        id: (el as HTMLElement).id,
        name: el.getAttribute('name') || '',
        className: el.getAttribute('class') || '',
        label: (el.textContent?.trim() || el.getAttribute('value') || '').slice(0, 60),
        visible: isVisible(el),
        outerHTML: el.outerHTML.slice(0, 200),
      })
    })

    // متن مرحله‌ی فعال (استپر / wizard)
    let activeStepText = ''
    const active = document.querySelector(
      '.step.active, .nav-link.active, .wizard-step.active, [class*="active"][class*="step"], .stepper .active',
    )
    if (active?.textContent) activeStepText = active.textContent.trim().slice(0, 120)

    return {
      label: lbl,
      url: location.href,
      title: document.title,
      activeStepText,
      fields,
      capturedAt: new Date().toISOString(),
    }
  }, label)

  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(snapshot, null, 2), 'utf-8')

  // خلاصه‌ی خوانا در کنسول
  const s = snapshot as FormStateSnapshot
  const visible = s.fields.filter((f) => f.visible)
  // eslint-disable-next-line no-console
  console.log(`\n📸 [${label}]  URL: ${s.url}`)
  if (s.activeStepText) console.log(`   مرحله فعال: ${s.activeStepText}`)
  console.log(`   فیلدهای قابل‌مشاهده: ${visible.length} / کل: ${s.fields.length}`)
  for (const f of visible) {
    const key = f.id ? `#${f.id}` : f.name ? `[name=${f.name}]` : f.className?.split(' ')[0] || f.tag
    const extra = f.kind === 'select' && f.options ? ` (${f.options.length} گزینه)` : ''
    // eslint-disable-next-line no-console
    console.log(`     • ${f.kind.padEnd(15)} ${key.padEnd(30)} ${f.label || ''}${extra}`)
  }

  return s
}
