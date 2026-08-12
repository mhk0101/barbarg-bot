export function toLatinDigits(v: string) {
  return String(v || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

export function normalizeSmsText(text: string) {
  return toLatinDigits(text || '')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[：﹕]/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanCandidateCode(v: string): string | null {
  const digits = toLatinDigits(v || '').replace(/\D/g, '')
  if (digits.length < 4) return null
  if (digits.length > 8) return digits.slice(0, 6)
  return digits
}

export function extractSmsCode(text: string): string | null {
  const t = normalizeSmsText(text)
  if (!t) return null

  const keyword = String.raw`(?:کد\s*(?:ورود|تایید|تأیید|احراز(?:\s*هویت)?|فعال\s*سازی|فعالسازی|امنیتی|یک\s*بار\s*مصرف|یکبارمصرف)?|رمز\s*(?:ورود|شما|پویا|موقت|یکبارمصرف|یک\s*بار\s*مصرف)?|شناسه\s*ورود|otp|o\.t\.p|one\s*time\s*password|verification\s*code|login\s*code|security\s*code|passcode|pin|code|password)`

  const afterKeyword = new RegExp(`${keyword}[^0-9]{0,20}([0-9]{4,16})`, 'i')
  const m1 = t.match(afterKeyword)
  const c1 = m1?.[1] ? cleanCandidateCode(m1[1]) : null
  if (c1) return c1

  const beforeKeyword = new RegExp(`(?:^|\\D)([0-9]{4,8})[^0-9]{0,20}${keyword}`, 'i')
  const m2 = t.match(beforeKeyword)
  const c2 = m2?.[1] ? cleanCandidateCode(m2[1]) : null
  if (c2) return c2

  const six = t.match(/(?:^|\D)([0-9]{6})(?:\D|$)/)
  if (six?.[1]) return six[1]

  const groups = Array.from(t.matchAll(/(?:^|\D)([0-9]{4,8})(?:\D|$)/g)).map((x) => x[1])
  for (const g of groups) {
    if (/^(13|14|20)\d{2,6}$/.test(g) && g.length >= 8) continue
    if (/^09\d+/.test(g) || /^98\d+/.test(g)) continue
    return g
  }

  return null
}
