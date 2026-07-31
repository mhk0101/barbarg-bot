'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Download, Search, AlertTriangle, XCircle, Clock, RefreshCw, Eye, Image, Code, Globe, ChevronLeft, ChevronRight, Loader2, Play, RotateCw } from 'lucide-react'

interface ErrorEntry {
  id: string; plate: string | null; driver: string | null; vehicle: string | null
  sender: string | null; receiver: string | null; waybillNumber: string | null
  status: string; resultMessage: string | null; resultType: string | null
  errorCode: string | null; retryCount: number; duration: number | null
  screenshotPath: string | null; htmlSnapshotPath: string | null
  currentUrl: string | null; playwrightLog: Record<string, unknown> | null
  worker: { id: string; name: string; status: string } | null
  accountId: string | null
  startedAt: string | null; finishedAt: string | null; createdAt: string
}

interface Counts { all: number; failed: number; paused: number; error: number }
interface Pagination { page: number; limit: number; total: number; totalPages: number }

const statusConfig: Record<string, { label: string; color: string }> = {
  failed: { label: 'ناموفق', color: 'bg-red-500/10 text-red-500 border-red-500/30' },
  paused: { label: 'متوقف', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  error: { label: 'خطا', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
}

export default function ErrorCenter() {
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [counts, setCounts] = useState<Counts>({ all: 0, failed: 0, paused: 0, error: 0 })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedError, setSelectedError] = useState<ErrorEntry | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [confirmRetry, setConfirmRetry] = useState<ErrorEntry | null>(null)

  const fetchErrors = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: filter, search, page: String(pagination.page), limit: String(pagination.limit) })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/error-center?${params}`)
      const d = await res.json()
      setErrors(Array.isArray(d.data) ? d.data : [])
      if (d.counts) setCounts(d.counts)
      if (d.pagination) setPagination(d.pagination)
    } catch { setErrors([]) }
    setLoading(false)
  }, [filter, search, pagination.page, pagination.limit, dateFrom, dateTo])

  useEffect(() => { fetchErrors() }, [fetchErrors])
  usePolling(fetchErrors, 10000)

  const handleRetry = async (resultId: string) => {
    setRetryingId(resultId)
    try {
      const res = await fetch('/api/error-center', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry', resultId }) })
      const data = await res.json()
      if (data.success) { toast.success('تلاش مجدد ایجاد شد'); fetchErrors() }
      else { toast.error(data.error || 'خطا در ایجاد تلاش مجدد') }
    } catch { toast.error('خطا در اتصال') }
    setRetryingId(null)
  }

  const handleExport = () => {
    const csv = ['تاریخ,پلاک,راننده,خودرو,فرستنده,گیرنده,شماره باربرگ,پیام خطا,حساب,ورکر,وضعیت,تلاش,مدت,آدرس']
    errors.forEach((e) => csv.push(`"${e.createdAt}","${e.plate || ''}","${e.driver || ''}","${e.vehicle || ''}","${e.sender || ''}","${e.receiver || ''}","${e.waybillNumber || ''}","${e.resultMessage || ''}","${e.accountId || ''}","${e.worker?.name || ''}","${e.status}",${e.retryCount},${e.duration || 0},"${e.currentUrl || ''}"`))
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `errors-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('خروجی تولید شد')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">مرکز مدیریت خطاها</h1><p className="text-muted-foreground">تمام خطاهای اتوماسیون از نتایج اجرا</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchErrors}><RefreshCw className="size-4" /></Button>
          <Button variant="outline" onClick={handleExport}><Download className="size-4 ml-2" /> خروجی</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="size-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">کل خطاها</span></div><p className="text-2xl font-bold">{counts.all}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><XCircle className="size-4 text-red-500" /><span className="text-xs text-muted-foreground">ناموفق</span></div><p className="text-2xl font-bold text-red-500">{counts.failed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="size-4 text-yellow-500" /><span className="text-xs text-muted-foreground">متوقف</span></div><p className="text-2xl font-bold text-yellow-500">{counts.paused}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="size-4 text-orange-500" /><span className="text-xs text-muted-foreground">خطای سیستم</span></div><p className="text-2xl font-bold text-orange-500">{counts.error}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی پلاک، راننده، حساب، پیام خطا..." className="pr-9" value={search} onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })) }} /></div>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })) }} className="w-[150px]" placeholder="از تاریخ" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })) }} className="w-[150px]" placeholder="تا تاریخ" />
        <div className="flex gap-1">{[{ k: 'all', l: 'همه' }, { k: 'failed', l: 'ناموفق' }, { k: 'paused', l: 'متوقف' }, { k: 'error', l: 'خطا' }].map((f) => <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => { setFilter(f.k); setPagination((p) => ({ ...p, page: 1 })) }}>{f.l}</Button>)}</div>
      </div></CardContent></Card>

      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-right text-muted-foreground">
              <th className="pb-3 font-medium">تاریخ</th><th className="pb-3 font-medium">پلاک</th><th className="pb-3 font-medium">راننده</th><th className="pb-3 font-medium">پیام خطا</th><th className="pb-3 font-medium">حساب</th><th className="pb-3 font-medium">ورکر</th><th className="pb-3 font-medium">تلاش</th><th className="pb-3 font-medium">مدت</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">عملیات</th>
            </tr></thead>
            <tbody>{loading ? (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground"><Loader2 className="size-6 mx-auto animate-spin" /></td></tr>
            ) : errors.length === 0 ? (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">خطایی یافت نشد</td></tr>
            ) : errors.map((e) => {
              const sc = statusConfig[e.status] || statusConfig.failed
              return (<tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => { setSelectedError(e); setDetailOpen(true) }}>
                <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString('fa')}</td>
                <td className="py-3 font-mono text-xs font-medium">{e.plate || '-'}</td>
                <td className="py-3 text-xs">{e.driver || '-'}</td>
                <td className="py-3 text-xs max-w-[200px] truncate" title={e.resultMessage || ''}>{e.resultMessage || '-'}</td>
                <td className="py-3 text-xs">{e.accountId || '-'}</td>
                <td className="py-3 text-xs">{e.worker?.name || '-'}</td>
                <td className="py-3 text-center text-xs">{e.retryCount}</td>
                <td className="py-3 text-center text-xs">{e.duration ? `${Math.round(e.duration / 1000)}s` : '-'}</td>
                <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${sc.color}`}>{sc.label}</span></td>
                <td className="py-3"><div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setSelectedError(e); setDetailOpen(true) }} title="جزئیات"><Eye className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setConfirmRetry(e) }} disabled={retryingId === e.id} title="تلاش مجدد">
                    {retryingId === e.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4 text-blue-500" />}
                  </Button>
                </div></td>
              </tr>)
            })}</tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-xs text-muted-foreground">صفحه {pagination.page} از {pagination.totalPages} | کل: {pagination.total}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}><ChevronRight className="size-4" /></Button>
              <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}><ChevronLeft className="size-4" /></Button>
            </div>
          </div>
        )}
      </CardContent></Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-destructive" /> جزئیات خطا</DialogTitle></DialogHeader>
          {selectedError && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div><p className="text-xs text-muted-foreground">پلاک</p><p className="font-mono text-sm font-medium">{selectedError.plate || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">راننده</p><p className="text-sm">{selectedError.driver || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">خودرو</p><p className="text-sm">{selectedError.vehicle || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">فرستنده</p><p className="text-sm">{selectedError.sender || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">گیرنده</p><p className="text-sm">{selectedError.receiver || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">شماره باربرگ</p><p className="font-mono text-sm">{selectedError.waybillNumber || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">حساب</p><p className="text-sm font-mono">{selectedError.accountId || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">ورکر</p><p className="text-sm">{selectedError.worker?.name || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">وضعیت</p><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${statusConfig[selectedError.status]?.color || ''}`}>{statusConfig[selectedError.status]?.label || selectedError.status}</span></div>
                <div><p className="text-xs text-muted-foreground">تعداد تلاش</p><p className="text-sm">{selectedError.retryCount}</p></div>
                <div><p className="text-xs text-muted-foreground">مدت اجرا</p><p className="text-sm">{selectedError.duration ? `${Math.round(selectedError.duration / 1000)} ثانیه` : '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">تاریخ</p><p className="text-sm">{new Date(selectedError.createdAt).toLocaleString('fa')}</p></div>
              </div>

              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">پیام خطا (دقیقاً همان‌طور که سایت نمایش داده)</p>
                <p className="text-sm text-destructive font-medium">{selectedError.resultMessage || 'پیامی ثبت نشده'}</p>
              </div>

              {selectedError.currentUrl && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Globe className="size-3" /> آدرس صفحه</p>
                  <p className="text-xs font-mono truncate" dir="ltr">{selectedError.currentUrl}</p>
                </div>
              )}

              {selectedError.screenshotPath && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Image className="size-3" /> اسکرین‌شات</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{selectedError.screenshotPath}</p>
                </div>
              )}

              {selectedError.htmlSnapshotPath && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Code className="size-3" /> اسنپشات HTML</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{selectedError.htmlSnapshotPath}</p>
                </div>
              )}

              {selectedError.playwrightLog && typeof selectedError.playwrightLog === 'object' && (
                <div className="rounded-lg bg-muted/50 border p-3">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Play className="size-3" /> Playwright Log</p>
                  <pre className="text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">{JSON.stringify(selectedError.playwrightLog as object, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRetry} onOpenChange={(open) => { if (!open) setConfirmRetry(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCw className="size-5 text-blue-500" /> تلاش مجدد</DialogTitle></DialogHeader>
          {confirmRetry && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">آیا از تلاش مجدد برای این خطا مطمئن هستید؟</p>
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">پلاک:</span><span className="font-mono">{confirmRetry.plate || '-'}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">راننده:</span><span>{confirmRetry.driver || '-'}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">پیام خطا:</span><span className="truncate max-w-[200px]">{confirmRetry.resultMessage || '-'}</span></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmRetry(null)}>لغو</Button>
                <Button onClick={() => { handleRetry(confirmRetry.id); setConfirmRetry(null) }} className="bg-blue-600 hover:bg-blue-700">
                  <RotateCw className="size-4 ml-2" /> تلاش مجدد
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
