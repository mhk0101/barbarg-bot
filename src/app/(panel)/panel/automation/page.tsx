'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Play, Square, Pause, Zap, Clock, CheckCircle, XCircle, Globe, Key, RefreshCw } from 'lucide-react'
import { usePolling } from '@/hooks/usePolling'

interface LogEntry { id: string; level: string; message: string; timestamp: string }
interface QueueStatus { waiting: number; active: number; completed: number; failed: number }

export default function AutomationCenter() {
  const [botRunning, setBotRunning] = useState(false)
  const [botPaused, setBotPaused] = useState(false)
  const [queue, setQueue] = useState<QueueStatus>({ waiting: 0, active: 0, completed: 0, failed: 0 })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [plateNumber, setPlateNumber] = useState('')
  const [targetCount, setTargetCount] = useState(10)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [accounts, setAccounts] = useState<Array<{ id: string; username: string }>>([])
  const [sessionStatus, setSessionStatus] = useState<Array<{ accountId: string; lastModified: string }>>([])
  const [workers, setWorkers] = useState<Array<{ id: string; name: string; status: string; tasksCompleted: number; tasksFailed: number }>>([])
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/trigger')
      const data = await res.json()
      if (data.status) { setBotRunning(data.status.running); setBotPaused(data.status.paused) }
      if (data.queue) setQueue(data.queue)
      if (data.logs) setLogs(data.logs)
    } catch {}
  }, [])

  const fetchSessions = useCallback(async () => {
    try { const res = await fetch('/api/automation/session'); const d = await res.json(); setSessionStatus(d.sessions || []) } catch {}
  }, [])

  const fetchAccounts = useCallback(async () => {
    try { const res = await fetch('/api/barbarg-accounts?status=active&limit=100'); const d = await res.json(); setAccounts(Array.isArray(d.data) ? d.data.map((a: { id: string; accountName: string; username: string }) => ({ id: a.id, username: `${a.accountName} (${a.username})` })) : []) } catch {}
  }, [])

  const fetchWorkers = useCallback(async () => {
    try { const res = await fetch('/api/automation/workers'); const d = await res.json(); setWorkers(d.workers || []) } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchSessions()
    fetchAccounts()
    fetchWorkers()
  }, [fetchStatus, fetchSessions, fetchAccounts, fetchWorkers])

  usePolling(fetchStatus, 5000)

  const handleAction = async (action: string) => {
    try {
      const res = await fetch('/api/automation/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = await res.json()
      if (data.success) { toast.success(data.message); fetchStatus() } else { toast.error(data.error) }
    } catch { toast.error('خطا در اتصال') }
  }

  const handleTrigger = async () => {
    if (!plateNumber) { toast.error('شماره پلاک را وارد کنید'); return }
    if (!selectedAccountId) { toast.error('حساب را انتخاب کنید'); return }
    try {
      const res = await fetch('/api/automation/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger', plateNumber, count: targetCount, accountId: selectedAccountId }),
      })
      const data = await res.json()
      if (data.success) { toast.success(`${data.jobs.length} وظیفه در صف اضافه شد`); setPlateNumber(''); fetchStatus() }
      else { toast.error(data.error) }
    } catch { toast.error('خطا در اتصال') }
  }

  const handleStartLogin = async () => {
    try {
      toast.info('مرورگر باز شد. لطفاً وارد شوید...')
      const res = await fetch('/api/automation/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start-login', accountId: 'default' }) })
      const data = await res.json()
      if (data.success) { toast.success('نشست ذخیره شد!'); fetchSessions() } else { toast.error(data.error || 'ورود ناموفق') }
    } catch { toast.error('خطا') }
  }

  const botStatusText = botRunning ? (botPaused ? 'متوقف موقت' : 'در حال اجرا') : 'متوقف'
  const botStatusColor = botRunning ? (botPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse') : 'bg-gray-400'

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">مرکز کنترل اتوماسیون</h1><p className="text-muted-foreground">مدیریت و نظارت بر ربات ثبت باربرگ</p></div>
      </div>

      <Card><CardContent className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className={`size-4 rounded-full ${botStatusColor}`} />
          <span className="text-xl font-bold">{botStatusText}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {!botRunning && <Button onClick={() => handleAction('start')} className="bg-green-600 hover:bg-green-700"><Play className="size-4 ml-2" /> شروع بات</Button>}
          {botRunning && !botPaused && <><Button onClick={() => handleAction('stop')} variant="destructive"><Square className="size-4 ml-2" /> توقف</Button><Button onClick={() => handleAction('pause')} variant="outline"><Pause className="size-4 ml-2" /> توقف موقت</Button></>}
          {botPaused && <><Button onClick={() => handleAction('resume')} className="bg-blue-600 hover:bg-blue-700"><Play className="size-4 ml-2" /> ادامه</Button><Button onClick={() => handleAction('stop')} variant="destructive"><Square className="size-4 ml-2" /> توقف</Button></>}
          <Button variant="outline" onClick={fetchStatus}><RefreshCw className="size-4" /></Button>
        </div>
      </CardContent></Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="size-4 text-yellow-500" /><span className="text-xs text-muted-foreground">در انتظار</span></div><p className="text-2xl font-bold">{queue.waiting}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Zap className="size-4 text-blue-500" /><span className="text-xs text-muted-foreground">در حال اجرا</span></div><p className="text-2xl font-bold">{queue.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle className="size-4 text-green-500" /><span className="text-xs text-muted-foreground">تکمیل شده</span></div><p className="text-2xl font-bold text-green-500">{queue.completed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><XCircle className="size-4 text-red-500" /><span className="text-xs text-muted-foreground">ناموفق</span></div><p className="text-2xl font-bold text-red-500">{queue.failed}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="trigger">
        <TabsList><TabsTrigger value="trigger">ثبت سریع</TabsTrigger><TabsTrigger value="session">نشست مرورگر</TabsTrigger><TabsTrigger value="workers">ورکرها</TabsTrigger><TabsTrigger value="logs">لاگ</TabsTrigger></TabsList>

        <TabsContent value="trigger" className="pt-4">
          <Card><CardHeader><CardTitle>ثبت سریع باربرگ</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>حساب باربگ</Label>
                <select className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                  <option value="">انتخاب حساب</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label>شماره پلاک</Label><Input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="۱۲ الف ۴۵۶۷۸" /></div>
              <div className="space-y-2"><Label>تعداد</Label><Input type="number" value={targetCount} onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)} min={1} /></div>
              <div className="flex items-end"><Button onClick={handleTrigger} className="w-full"><Zap className="size-4 ml-2" /> افزودن به صف</Button></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="session" className="pt-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Globe className="size-4" /> نشست مرورگر</CardTitle></CardHeader><CardContent className="space-y-4">
            <Button onClick={handleStartLogin} className="w-full md:w-auto"><Key className="size-4 ml-2" /> ورود دستی به سایت</Button>
            <p className="text-sm text-muted-foreground">مرورگر باز می‌شود. وارد شوید تا نشست ذخیره شود.</p>
            {sessionStatus.length > 0 ? (
              <div className="space-y-2">{sessionStatus.map((s) => (
                <div key={s.accountId} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2"><Badge variant="default">فعال</Badge><span className="text-sm">{s.accountId}</span></div>
                  <span className="text-xs text-muted-foreground">{new Date(s.lastModified).toLocaleString('fa')}</span>
                </div>
              ))}</div>
            ) : <p className="text-sm text-muted-foreground">نشستی ذخیره نشده</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="workers" className="pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">ورکری یافت نشد</p>
            ) : workers.map((w) => (
              <Card key={w.id}><CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between"><span className="font-medium">{w.name}</span><Badge variant={w.status === 'active' ? 'default' : 'secondary'}>{w.status === 'active' ? 'فعال' : 'بیکار'}</Badge></div>
                <p className="text-xs text-muted-foreground">تکمیل: {w.tasksCompleted} | ناموفق: {w.tasksFailed}</p>
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="pt-4">
          <Card><CardContent>
            <div className="space-y-1 max-h-[400px] overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? <p className="text-center text-muted-foreground py-8">لاگی موجود نیست</p> : logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 rounded px-3 py-1.5 hover:bg-muted/30">
                  <span className="text-muted-foreground w-16 text-[10px]">{new Date(log.timestamp).toLocaleTimeString('fa')}</span>
                  <Badge variant={log.level === 'error' ? 'destructive' : log.level === 'success' ? 'default' : 'secondary'} className="w-14 justify-center text-[10px]">
                    {log.level === 'error' ? 'خطا' : log.level === 'success' ? 'موفق' : 'اطلاعات'}
                  </Badge>
                  <span className="text-xs">{log.message}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
