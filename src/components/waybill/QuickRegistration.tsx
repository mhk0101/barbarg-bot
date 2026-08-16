'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Play, Search, Car, History, Trash2 } from 'lucide-react'
import { registrationService } from '@/lib/services/RegistrationService'
import { logService } from '@/lib/services/LogService'

interface Template {
  id: string; plateNumber: string; driverName: string; senderFirstName: string; senderLastName: string
  receiverFirstName: string; receiverLastName: string; originProvince: string; destProvince: string
  freightCost: string; useCount: number; isFavorite: boolean; createdAt: string
}

interface QuickJob {
  id: string; plateNumber: string; targetCount: number; completedCount: number; status: string; createdAt: string
}

export default function QuickRegistration() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [search, setSearch] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [countDialog, setCountDialog] = useState(false)
  const [targetCount, setTargetCount] = useState(10)
  const [jobs, setJobs] = useState<QuickJob[]>([])
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyData, setHistoryData] = useState<Array<{ id: string; plateNumber: string; status: string; date: string }>>([])
  const [starting, setStarting] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/templates'); const d = await res.json(); setTemplates(Array.isArray(d.data) ? d.data : []) } catch { setTemplates([]) }
    setLoading(false)
  }, [])

  const fetchJobs = useCallback(async () => {
    try { const res = await fetch('/api/quick-jobs'); const d = await res.json(); setJobs(Array.isArray(d.data) ? d.data : []) } catch {}
  }, [])

  useEffect(() => { fetchTemplates(); fetchJobs() }, [fetchTemplates, fetchJobs])

  const filtered = templates.filter((t) => t.plateNumber.includes(search) || t.driverName.includes(search) || t.senderFirstName.includes(search))

  const startQuickRegistration = async () => {
    if (!selectedTemplate || starting) return
    setStarting(true)
    try {
      const res = await fetch('/api/quick-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate.id, plateNumber: selectedTemplate.plateNumber, targetCount }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'خطا در شروع ثبت سریع') }
      await registrationService.saveHistory({ plateNumber: selectedTemplate.plateNumber, status: 'queue_started' })
      logService.log('quick_reg_start', 'registration', `${selectedTemplate.plateNumber} - هدف: ${targetCount}`, 'info')
      toast.success(`ثبت سریع ${targetCount} باربرگ شروع شد!`)
      setCountDialog(false); setSelectedTemplate(null); fetchJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'خطا در شروع ثبت سریع') }
    finally { setStarting(false) }
  }

  const viewHistory = async (plate: string) => {
    try {
      const res = await fetch(`/api/history?plate=${encodeURIComponent(plate)}`)
      const d = await res.json()
      // پاسخ /api/history به شکل { records, stats, pagination } است
      const recs = Array.isArray(d.records) ? d.records : []
      setHistoryData(recs.map((r: { id: string; plateNumber: string; status: string; createdAt: string }) => ({
        id: r.id,
        plateNumber: r.plateNumber,
        status: r.status === 'completed' ? 'success' : (r.status === 'failed' ? 'failed' : 'pending'),
        date: new Date(r.createdAt).toLocaleString('fa-IR'),
      })))
      setHistoryOpen(true)
    } catch { setHistoryData([]); setHistoryOpen(true) }
  }

  const handleDeleteTemplate = async (t: Template) => {
    if (!window.confirm(`قالب «${t.plateNumber}» حذف شود؟ کارهای ثبت سریعِ وابسته هم حذف می‌شوند.`)) return
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'خطا در حذف') }
      toast.success(`قالب «${t.plateNumber}» حذف شد`)
      fetchTemplates(); fetchJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'خطا در حذف قالب') }
  }

  const handleDeleteJob = async (id: string) => {
    if (!window.confirm('این آیتم از صف ثبت سریع حذف شود؟')) return
    try {
      const res = await fetch(`/api/quick-jobs?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'خطا در حذف') }
      toast.success('از صف حذف شد')
      fetchJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'خطا در حذف از صف') }
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'آماده', color: 'bg-yellow-500/10 text-yellow-500' },
    running: { label: 'در حال اجرا', color: 'bg-blue-500/10 text-blue-500' },
    completed: { label: 'تکمیل', color: 'bg-green-500/10 text-green-500' },
    failed: { label: 'ناموفق', color: 'bg-red-500/10 text-red-500' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">ثبت سریع باربرگ</h1><p className="text-muted-foreground">انتخاب پلاک و بارگذاری خودکار اطلاعات قبلی</p></div>
      </div>

      {jobs.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">صف ثبت سریع</CardTitle></CardHeader><CardContent>
          <div className="space-y-3">
            {jobs.map((job) => {
              const sc = statusConfig[job.status] || statusConfig.pending
              const progress = job.targetCount > 0 ? (job.completedCount / job.targetCount) * 100 : 0
              return (
                <div key={job.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><Badge className={sc.color}>{sc.label}</Badge><span className="font-mono font-bold">{job.plateNumber}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{job.completedCount}/{job.targetCount}</span>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteJob(job.id)} title="حذف از صف">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                </div>
              )
            })}
          </div>
        </CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>قالب‌های ذخیره شده</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجو..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
          {loading ? <p className="text-center text-muted-foreground py-8">در حال بارگذاری...</p> : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">قالبی یافت نشد</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <div key={t.id} className="rounded-lg border p-4 hover:border-primary/50 transition-all cursor-pointer space-y-2" onClick={() => { setSelectedTemplate(t); setCountDialog(true) }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Car className="size-4 text-primary" /><span className="font-mono font-bold">{t.plateNumber}</span></div>
                    {t.isFavorite && <Badge variant="default" className="text-[10px]">مورد علاقه</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.driverName} | {t.senderFirstName} {t.senderLastName} → {t.receiverFirstName} {t.receiverLastName}</p>
                  <p className="text-xs text-muted-foreground">{t.originProvince} → {t.destProvince}{t.freightCost ? ` | ${t.freightCost} ریال` : ''}</p>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-[10px] text-muted-foreground">{t.useCount} بار استفاده شده</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); viewHistory(t.plateNumber) }} title="تاریخچه"><History className="size-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t) }} title="حذف قالب"><Trash2 className="size-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={countDialog} onOpenChange={setCountDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>ثبت سریع باربرگ</DialogTitle></DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2"><Car className="size-4 text-primary" /><span className="font-mono font-bold">{selectedTemplate.plateNumber}</span></div>
                <p className="text-sm text-muted-foreground">راننده: {selectedTemplate.driverName}</p>
                <p className="text-sm text-muted-foreground">مسیر: {selectedTemplate.originProvince} → {selectedTemplate.destProvince}</p>
                {selectedTemplate.freightCost && <p className="text-sm text-muted-foreground">کرایه: {selectedTemplate.freightCost} ریال</p>}
              </div>
              <div className="space-y-2"><Label>تعداد باربرگ</Label>
                <Input type="number" value={targetCount} onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)} min={1} max={100} className="h-10 text-center text-lg" /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCountDialog(false)}>انصراف</Button>
                <Button onClick={startQuickRegistration} disabled={starting} className="bg-green-600 hover:bg-green-700"><Play className="size-4 ml-2" /> {starting ? 'در حال شروع…' : 'شروع'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>تاریخچه ثبت</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {historyData.length === 0 ? <p className="text-center text-muted-foreground py-4">تاریخچه‌ای یافت نشد</p> : historyData.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={h.status === 'success' ? 'default' : h.status === 'failed' ? 'destructive' : 'secondary'}
                    className="text-[10px]"
                  >
                    {h.status === 'success' ? 'موفق' : h.status === 'failed' ? 'ناموفق' : 'در انتظار'}
                  </Badge>
                  <span className="text-sm">{h.date}</span>
                </div>
                <span className="text-xs text-muted-foreground">{h.plateNumber}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
