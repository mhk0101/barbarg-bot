'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { MessageSquare, Link2, Copy, RefreshCw, Check, X, Trash2, Loader2, Download } from 'lucide-react'

interface SmsAccount {
  id: string
  accountName: string
  username: string
  phone: string | null
  smsWebhookToken: string | null
}

interface SmsMsg {
  id: string
  fromNumber: string | null
  rawText: string
  extractedLink: string | null
  status: string
  resultMessage: string | null
  createdAt: string
  account: { id: string; accountName: string; username: string } | null
}

function looksLikeUnreplacedSmsPlaceholder(msg: SmsMsg) {
  const t = `${msg.fromNumber || ''} ${msg.rawText || ''}`
  return /\{\s*(sender|from|number|message|body|text|sms|content|msg|key|time)\s*\}|%\s*(sender|from|number|message|body|text|sms|content|msg|key|time)\s*%|\[\s*(sender|from|number|message|body|text|sms|content|msg|key|time)\s*\]/i.test(t)
}

function toLatinDigits(v: string) {
  return String(v || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

function normalizeSmsText(text: string) {
  return toLatinDigits(text || '')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[：﹕]/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanCandidateCode(v: string): string | null {
  const digits = toLatinDigits(v || '').replace(/\D/g, '')
  if (digits.length < 4) return null
  // اگر کد به تاریخ/متن بعدی چسبیده باشد، معمولاً کد واقعی همان ۶ رقم اول است.
  if (digits.length > 8) return digits.slice(0, 6)
  return digits
}

function extractSmsCode(text: string): string | null {
  const t = normalizeSmsText(text)
  if (!t) return null

  const keyword = String.raw`(?:کد\s*(?:ورود|تایید|تأیید|احراز(?:\s*هویت)?|فعال\s*سازی|فعالسازی|امنیتی|یک\s*بار\s*مصرف|یکبارمصرف)?|رمز\s*(?:ورود|شما|پویا|موقت|یکبارمصرف|یک\s*بار\s*مصرف)?|شناسه\s*ورود|otp|o\.t\.p|one\s*time\s*password|verification\s*code|login\s*code|security\s*code|passcode|pin|code|password)`

  // ۱) قوی‌ترین حالت: کلمه کلیدی قبل از کد آمده باشد.
  const afterKeyword = new RegExp(`${keyword}[^0-9]{0,20}([0-9]{4,16})`, 'i')
  const m1 = t.match(afterKeyword)
  const c1 = m1?.[1] ? cleanCandidateCode(m1[1]) : null
  if (c1) return c1

  // ۲) حالت برعکس: کد قبل از کلمه کلیدی آمده باشد.
  const beforeKeyword = new RegExp(`(?:^|\\D)([0-9]{4,8})[^0-9]{0,20}${keyword}`, 'i')
  const m2 = t.match(beforeKeyword)
  const c2 = m2?.[1] ? cleanCandidateCode(m2[1]) : null
  if (c2) return c2

  // ۳) fallback امن: عدد ۶ رقمی جدا، چون رایج‌ترین کد OTP است.
  const six = t.match(/(?:^|\D)([0-9]{6})(?:\D|$)/)
  if (six?.[1]) return six[1]

  // ۴) fallback ضعیف‌تر: عدد ۴ تا ۸ رقمی، با حذف موارد واضحِ تاریخ/شماره تلفن.
  const groups = Array.from(t.matchAll(/(?:^|\D)([0-9]{4,8})(?:\D|$)/g)).map((x) => x[1])
  for (const g of groups) {
    if (/^(13|14|20)\d{2,6}$/.test(g) && g.length >= 8) continue // شبیه تاریخ
    if (/^09\d+/.test(g) || /^98\d+/.test(g)) continue // شبیه موبایل
    return g
  }

  return null
}

function parseSmsForDisplay(raw: string) {
  let rest = String(raw || '').trim()
  const sender = rest.match(/^\s*(\+98\d{10}|09\d{9})/)?.[1] || ''
  if (sender) rest = rest.slice(rest.indexOf(sender) + sender.length).trim()

  const time = rest.match(/^\s*(\d{1,2}\/\d{1,2},?\s*\d{1,2}:\d{2}\s*(?:am|pm)?)/i)?.[1] || ''
  if (time) rest = rest.slice(rest.indexOf(time) + time.length).trim()

  const code = extractSmsCode(raw)
  let message = rest || raw
  if (code) {
    message = message
      .replace(/(کد\s*ورود\s*)[:：]?\s*([0-9۰-۹٠-٩]{4,6})/i, `کد ورود: ${code}`)
      .replace(new RegExp(`(کد ورود:\s*${code})(?=\S)`), '$1\n')
  }
  message = message
    .replace(/\s*(کد\s*ورود\s*:)/i, '\n$1')
    .replace(/^\n+/, '')
    .trim()

  return { sender, time, code, message }
}

export default function SmsForwardCenter() {
  const [accounts, setAccounts] = useState<SmsAccount[]>([])
  const [messages, setMessages] = useState<SmsMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accRes, msgRes] = await Promise.all([
        fetch('/api/barbarg-accounts?limit=100'),
        fetch('/api/sms/messages'),
      ])
      const accJson = await accRes.json()
      const msgJson = await msgRes.json()
      setAccounts(accJson.data || [])
      setMessages(msgJson.data || [])
    } catch {
      toast.error('خطا در دریافت اطلاعات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const webhookUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/api/sms/webhook/${token}`

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('کپی شد')
  }

  const generateToken = async (accountId: string) => {
    setBusyId(accountId)
    try {
      const res = await fetch(`/api/barbarg-accounts/${accountId}/sms-token`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, smsWebhookToken: data.smsWebhookToken } : a)))
      toast.success('آدرس وبهوک ساخته شد')
    } catch {
      toast.error('خطا در ساخت وبهوک')
    } finally {
      setBusyId(null)
    }
  }

  /** ساخت گروهی لینک وبهوک برای همه اکانت‌هایی که هنوز لینک ندارند */
  const generateAllTokens = async () => {
    setBulkBusy(true)
    try {
      const res = await fetch('/api/barbarg-accounts/sms-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: false }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا')
      setAccounts((prev) =>
        prev.map((a) => {
          const updated = (data.accounts as SmsAccount[]).find((x) => x.id === a.id)
          return updated ? { ...a, smsWebhookToken: updated.smsWebhookToken } : a
        }),
      )
      if (data.created > 0) {
        toast.success(`برای ${data.created} اکانت لینک ساخته شد${data.skipped ? ` (${data.skipped} اکانت از قبل لینک داشتند)` : ''}`)
      } else {
        toast.info('همه اکانت‌ها از قبل لینک دارند')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ساخت گروهی لینک‌ها')
    } finally {
      setBulkBusy(false)
    }
  }

  /** حذف لینک وبهوک یک اکانت */
  const deleteToken = async (accountId: string) => {
    if (!confirm('لینک وبهوک این اکانت حذف شود؟ اپ فورواردر روی گوشی دیگر نمی‌تواند به این آدرس پیامک بفرستد.')) return
    setBusyId(accountId)
    try {
      const res = await fetch(`/api/barbarg-accounts/${accountId}/sms-token`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا')
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, smsWebhookToken: null } : a)))
      toast.success('لینک وبهوک حذف شد')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در حذف لینک')
    } finally {
      setBusyId(null)
    }
  }

  /** حذف گروهی لینک وبهوک همه اکانت‌ها */
  const deleteAllTokens = async () => {
    const count = accounts.filter((a) => a.smsWebhookToken).length
    if (count === 0) {
      toast.info('هیچ اکانتی لینک ندارد')
      return
    }
    if (!confirm(`لینک وبهوک ${count} اکانت حذف شود؟ همه لینک‌های قبلی باطل می‌شوند و اپ‌های فورواردر روی گوشی‌ها از کار می‌افتند.`)) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/barbarg-accounts/sms-tokens', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا')
      setAccounts((prev) => prev.map((a) => ({ ...a, smsWebhookToken: null })))
      toast.success(`لینک ${data.deleted} اکانت حذف شد`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در حذف گروهی لینک‌ها')
    } finally {
      setBulkBusy(false)
    }
  }

  /** کپی همه لینک‌ها در کلیپ‌بورد — هر خط: نام اکانت | نام کاربری | لینک */
  const copyAllLinks = () => {
    const withToken = accounts.filter((a) => a.smsWebhookToken)
    if (withToken.length === 0) {
      toast.error('هیچ اکانتی لینک ندارد — اول «ساخت لینک برای همه» را بزنید')
      return
    }
    const text = withToken
      .map((a) => `${a.accountName} | ${a.username} | ${webhookUrl(a.smsWebhookToken!)}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    toast.success(`${withToken.length} لینک کپی شد`)
  }

  /** دانلود فایل متنی همه لینک‌ها */
  const downloadAllLinks = () => {
    const withToken = accounts.filter((a) => a.smsWebhookToken)
    if (withToken.length === 0) {
      toast.error('هیچ اکانتی لینک ندارد — اول «ساخت لینک برای همه» را بزنید')
      return
    }
    const lines = [
      'نام اکانت\tنام کاربری\tشماره تلفن\tآدرس وبهوک',
      ...withToken.map((a) => `${a.accountName}\t${a.username}\t${a.phone || ''}\t${webhookUrl(a.smsWebhookToken!)}`),
    ]
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = 'sms-webhook-links.txt'
    el.click()
    URL.revokeObjectURL(url)
    toast.success(`فایل ${withToken.length} لینک دانلود شد`)
  }

  const testWebhook = async (account: SmsAccount) => {
    if (!account.smsWebhookToken) return
    setBusyId(account.id)
    try {
      const res = await fetch(`/api/sms/webhook/${account.smsWebhookToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: account.phone || 'test',
          message: `پیام تست فوروارد پیامک برای ${account.accountName} https://barname.utcms.ir/Barname/Home/Index`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'ارسال تست ناموفق بود')
      toast.success('پیام تست دریافت شد')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در تست وبهوک')
    } finally {
      setBusyId(null)
    }
  }

  const savePhone = async (accountId: string) => {
    const phone = phoneDrafts[accountId]
    if (phone === undefined) return
    setBusyId(accountId)
    try {
      const res = await fetch(`/api/barbarg-accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) throw new Error()
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, phone } : a)))
      toast.success('شماره ذخیره شد')
    } catch {
      toast.error('خطا در ذخیره شماره')
    } finally {
      setBusyId(null)
    }
  }

  const useLink = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/sms/messages/${id}/use`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا')
      toast.success('لینک با موفقیت باز شد')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در استفاده از لینک')
    } finally {
      setBusyId(null)
    }
  }

  const ignoreMsg = async (id: string) => {
    setBusyId(id)
    try {
      await fetch(`/api/sms/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignored' }),
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const deleteMsg = async (id: string) => {
    setBusyId(id)
    try {
      await fetch(`/api/sms/messages/${id}`, { method: 'DELETE' })
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'در انتظار', variant: 'secondary' },
      used: { label: 'استفاده شد', variant: 'default' },
      failed: { label: 'ناموفق', variant: 'destructive' },
      ignored: { label: 'نادیده گرفته شد', variant: 'outline' },
    }
    const m = map[status] || { label: status, variant: 'outline' as const }
    return <Badge variant={m.variant}>{m.label}</Badge>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">فوروارد پیامک</h1>
        <p className="text-muted-foreground">دریافت پیامک‌های حاوی لینک از اپ فورواردر روی گوشی و استفاده از آن در نشست مرورگر حساب</p>
      </div>

      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages"><MessageSquare className="size-4 ml-1" />پیامک‌های دریافتی</TabsTrigger>
          <TabsTrigger value="webhooks"><Link2 className="size-4 ml-1" />آدرس وبهوک حساب‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="space-y-4 mt-4">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">هنوز هیچ پیامکی دریافت نشده است</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <Card key={m.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {statusBadge(m.status)}
                        <Badge variant="outline">{m.account?.accountName || 'نامشخص'}</Badge>
                        {m.fromNumber && <span className="text-xs text-muted-foreground">از: {m.fromNumber}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString('fa-IR')}</span>
                    </div>
                    {(() => {
                      const parsed = parseSmsForDisplay(m.rawText)
                      return (
                        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                          <div className="grid gap-2 md:grid-cols-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">فرستنده: </span>
                              <code dir="ltr" className="font-mono">{m.fromNumber || parsed.sender || '—'}</code>
                            </div>
                            {parsed.time && (
                              <div>
                                <span className="text-muted-foreground">زمان پیامک: </span>
                                <code dir="ltr" className="font-mono">{parsed.time}</code>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">دریافت در پنل: </span>
                              <span>{new Date(m.createdAt).toLocaleString('fa-IR')}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">متن مرتب‌شده پیامک:</p>
                            <pre className="whitespace-pre-wrap break-words rounded bg-background/70 p-2 text-sm leading-7 font-sans" dir="auto">{parsed.message}</pre>
                          </div>
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">نمایش متن خام دریافتی</summary>
                            <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-background/70 p-2 font-mono" dir="ltr">{m.rawText}</pre>
                          </details>
                        </div>
                      )
                    })()}
                    {looksLikeUnreplacedSmsPlaceholder(m) && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                        متن پیامک یا فرستنده به‌صورت placeholder خام دریافت شده است. یعنی تنظیمات برنامه SMS Forwarder اشتباه است و متغیرها جایگزین نشده‌اند. در اپ گوشی از گزینه Insert variable/متغیر استفاده کنید تا مقدار واقعی پیامک ارسال شود، نه متن‌هایی مثل {'{msg}'}، {'{message}'} یا {'{sender}'}.
                      </div>
                    )}
                    {extractSmsCode(m.rawText) && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-green-500/25 bg-green-500/10 p-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">کد ورود استخراج‌شده: </span>
                          <code className="text-base font-bold tracking-widest" dir="ltr">{extractSmsCode(m.rawText)}</code>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => copy(extractSmsCode(m.rawText) || '')}>
                          <Copy className="size-3" />کپی کد
                        </Button>
                      </div>
                    )}
                    {m.extractedLink && (
                      <div className="flex items-center gap-2 text-xs">
                        <Link2 className="size-3 text-primary" />
                        <a href={m.extractedLink} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{m.extractedLink}</a>
                      </div>
                    )}
                    {m.resultMessage && <p className="text-xs text-muted-foreground">{m.resultMessage}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      {m.status === 'pending' && m.extractedLink && (
                        <Button size="sm" onClick={() => useLink(m.id)} disabled={busyId === m.id}>
                          {busyId === m.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                          استفاده از لینک
                        </Button>
                      )}
                      {m.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => ignoreMsg(m.id)} disabled={busyId === m.id}>
                          <X className="size-4" />نادیده گرفتن
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteMsg(m.id)} disabled={busyId === m.id}>
                        <Trash2 className="size-4" />حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-sm text-muted-foreground">
                  {accounts.filter((a) => a.smsWebhookToken).length} از {accounts.length} اکانت لینک دارند
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={generateAllTokens} disabled={bulkBusy}>
                    {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                    ساخت لینک برای همه
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyAllLinks} disabled={bulkBusy}>
                    <Copy className="size-4" />
                    کپی همه لینک‌ها
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadAllLinks} disabled={bulkBusy}>
                    <Download className="size-4" />
                    دانلود فایل لینک‌ها
                  </Button>
                  <Button size="sm" variant="destructive" onClick={deleteAllTokens} disabled={bulkBusy}>
                    {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    حذف همه لینک‌ها
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>راهنما</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>۱. برای هر حساب یک آدرس وبهوک بساز و روی گوشی‌ای که پیامک‌های همان حساب را دریافت می‌کند، اپ فورواردر SMS را طوری تنظیم کن که به این آدرس POST بزند.</p>
              <p>۲. بدنه پیامک می‌تواند یکی از فیلدهای message/text/body/sms/content/key/msg را داشته باشد.</p>
              <p>قالب پیش‌فرض بعضی اپ‌ها همین است و پشتیبانی می‌شود: <code dir="ltr">{'{'}"key":"{'{'}msg{'}'}","time":"{'{'}time{'}'}"{'}'}</code></p>
              <p>نمونه پیشنهادی اگر اپ اجازه ویرایش JSON می‌دهد: <code dir="ltr">{'{'}"key":"متغیر متن پیامک","time":"متغیر زمان"{'}'}</code></p>
              <p>اگر داخل پنل متن‌هایی مثل <code>{'{msg}'}</code>، <code>{'{message}'}</code> یا <code>{'{sender}'}</code> دیدی، یعنی برنامه گوشی متغیرها را جایگزین نکرده و باید از دکمه/منوی Insert variable خود همان اپ استفاده کنی.</p>
              <p>۳. وقتی پیامک حاوی لینک برسد، در تب «پیامک‌های دریافتی» می‌توانی با دکمه «استفاده از لینک» آن را در همان نشست مرورگر حساب باز کنی.</p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-medium">{a.accountName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{a.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="شماره تلفن دریافت‌کننده پیامک"
                        value={phoneDrafts[a.id] ?? a.phone ?? ''}
                        onChange={(e) => setPhoneDrafts((p) => ({ ...p, [a.id]: e.target.value }))}
                        className="max-w-xs"
                      />
                      <Button size="sm" variant="outline" onClick={() => savePhone(a.id)} disabled={busyId === a.id}>ذخیره شماره</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.smsWebhookToken ? (
                        <>
                          <Input readOnly value={webhookUrl(a.smsWebhookToken)} className="font-mono text-xs" />
                          <Button size="icon" variant="outline" onClick={() => copy(webhookUrl(a.smsWebhookToken!))} title="کپی آدرس"><Copy className="size-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => testWebhook(a)} disabled={busyId === a.id} title="ارسال پیام تست">
                            تست
                          </Button>
                          <Button size="icon" variant="outline" onClick={() => generateToken(a.id)} disabled={busyId === a.id} title="ساخت آدرس جدید">
                            {busyId === a.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                          </Button>
                          <Button size="icon" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteToken(a.id)} disabled={busyId === a.id} title="حذف لینک وبهوک">
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => generateToken(a.id)} disabled={busyId === a.id}>
                          {busyId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                          ساخت آدرس وبهوک
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
