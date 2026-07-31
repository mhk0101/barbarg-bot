'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, Plus, CalendarClock, Timer, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Schedule { id: string; name: string; cronExpr: string; enabled: boolean; lastRun: string | null; nextRun: string | null }

const cronPresets = [
  { value: '0 8 * * *', label: 'هر روز ساعت ۰۸:۰۰' },
  { value: '0 14 * * *', label: 'هر روز ساعت ۱۴:۰۰' },
  { value: '0 20 * * *', label: 'هر روز ساعت ۲۰:۰۰' },
  { value: '0 2 * * *', label: 'هر روز ساعت ۰۲:۰۰' },
  { value: '0 23 * * *', label: 'هر روز ساعت ۲۳:۰۰' },
  { value: '*/30 * * * *', label: 'هر ۳۰ دقیقه' },
  { value: '0 * * * *', label: 'هر ساعت' },
  { value: '0 8 * * 1-5', label: 'روزهای کاری ۰۸:۰۰' },
]

const cronToLabel = (cron: string) => cronPresets.find((p) => p.value === cron)?.label || cron

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', cron: '0 8 * * *' })
  const [saving, setSaving] = useState(false)

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/scheduler')
      const data = await res.json()
      setSchedules(Array.isArray(data.data) ? data.data : [])
    } catch { setSchedules([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  const activeCount = schedules.filter((s) => s.enabled).length

  const handleAdd = async () => {
    if (!form.name) { toast.error('نام الزامی است'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, cronExpr: form.cron, enabled: true }) })
      if (!res.ok) throw new Error('Failed')
      toast.success('برنامه اضافه شد')
      setDialogOpen(false); setForm({ name: '', cron: '0 8 * * *' }); fetchSchedules()
    } catch { toast.error('خطا') }
    setSaving(false)
  }

  const toggleSchedule = async (s: Schedule) => {
    try {
      await fetch('/api/scheduler', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, enabled: !s.enabled }) })
      setSchedules((prev) => prev.map((x) => x.id === s.id ? { ...x, enabled: !x.enabled } : x))
      toast.success(s.enabled ? 'غیرفعال شد' : 'فعال شد')
    } catch { toast.error('خطا') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('آیا مطمئن هستید؟')) return
    try {
      await fetch(`/api/scheduler?id=${id}`, { method: 'DELETE' })
      toast.success('حذف شد'); fetchSchedules()
    } catch { toast.error('خطا') }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">برنامه‌ریز زمانبندی</h1><p className="text-muted-foreground">مدیریت وظایف زمان‌بندی شده</p></div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="size-4 ml-2" /> افزودن</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CalendarClock className="size-4 text-blue-500" /><span className="text-xs text-muted-foreground">کل برنامه‌ها</span></div><p className="text-2xl font-bold">{schedules.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Timer className="size-4 text-green-500" /><span className="text-xs text-muted-foreground">فعال</span></div><p className="text-2xl font-bold text-green-500">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="size-4 text-yellow-500" /><span className="text-xs text-muted-foreground">غیرفعال</span></div><p className="text-2xl font-bold text-yellow-500">{schedules.length - activeCount}</p></CardContent></Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">برنامه‌ای تعریف نشده</div>
      ) : (
        <Card><CardContent>
          <div className="space-y-3">
            {schedules.map((s) => (
              <div key={s.id} className={`flex items-center justify-between rounded-lg border p-4 transition-all ${!s.enabled ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="size-5 text-primary" /></div>
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{cronToLabel(s.cronExpr)} | {s.cronExpr}</p>
                    {s.lastRun && <p className="text-xs text-muted-foreground">آخرین اجرا: {new Date(s.lastRun).toLocaleString('fa')}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={s.enabled ? 'default' : 'secondary'}>{s.enabled ? 'فعال' : 'غیرفعال'}</Badge>
                  <Switch checked={s.enabled} onCheckedChange={() => toggleSchedule(s)} />
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>برنامه جدید</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-4">
            <div className="space-y-1.5"><Label className="text-sm">نام برنامه <span className="text-destructive">*</span></Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثال: ثبت باربرگ صبح" className="h-9" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-sm">زمان اجرا</Label>
              <Select value={form.cron} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, cron: v })) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cronPresets.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button><Button onClick={handleAdd} disabled={saving}>{saving ? '...' : 'ذخیره'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
