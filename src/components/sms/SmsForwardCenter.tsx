'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { MessageSquare, Link2, Copy, RefreshCw, Check, X, Trash2, Loader2 } from 'lucide-react'

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

export default function SmsForwardCenter() {
  const [accounts, setAccounts] = useState<SmsAccount[]>([])
  const [messages, setMessages] = useState<SmsMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
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

  useEffect(() => { load() }, [load])

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
                    <p className="text-sm bg-muted/50 rounded-md p-2 break-words">{m.rawText}</p>
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
            <CardHeader><CardTitle>راهنما</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>۱. برای هر حساب یک آدرس وبهوک بساز و روی گوشی‌ای که پیامک‌های همان حساب را دریافت می‌کند، اپ فورواردر SMS را طوری تنظیم کن که به این آدرس POST بزند.</p>
              <p>۲. بدنه پیامک باید یکی از فیلدهای message/text/body را داشته باشد (اکثر اپ‌های فورواردر این‌ها را پشتیبانی می‌کنند).</p>
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
                        defaultValue={a.phone || ''}
                        onChange={(e) => setPhoneDrafts((p) => ({ ...p, [a.id]: e.target.value }))}
                        className="max-w-xs"
                      />
                      <Button size="sm" variant="outline" onClick={() => savePhone(a.id)} disabled={busyId === a.id}>ذخیره شماره</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.smsWebhookToken ? (
                        <>
                          <Input readOnly value={webhookUrl(a.smsWebhookToken)} className="font-mono text-xs" />
                          <Button size="icon" variant="outline" onClick={() => copy(webhookUrl(a.smsWebhookToken!))}><Copy className="size-4" /></Button>
                          <Button size="icon" variant="outline" onClick={() => generateToken(a.id)} disabled={busyId === a.id} title="ساخت آدرس جدید">
                            {busyId === a.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
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
