'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, Eye, RotateCcw, FileText,
  ExternalLink, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Download,
} from 'lucide-react'

interface Account { id: string; username: string }
interface Worker { id: string; name: string }
interface JobLog { id: string; level: string; message: string; details: unknown; createdAt: string }
interface Job { id: string; status: string; logs: JobLog[] }
interface AutomationResult {
  id: string; taskId: string | null; waybillNumber: string | null; plate: string | null
  driver: string | null; vehicle: string | null; sender: string | null; receiver: string | null
  accountId: string | null; workerId: string | null; browserSessionId: string | null
  status: string; resultMessage: string | null; resultType: string | null; errorCode: string | null
  startedAt: string | null; finishedAt: string | null; duration: number | null; retryCount: number
  screenshotPath: string | null; htmlSnapshotPath: string | null; currentUrl: string | null
  playwrightLog: unknown; createdAt: string; updatedAt: string
  account?: Account | null; worker?: Worker | null; job?: Job | null
  /* فیلدهای تخت‌شده که API از مسیر پروفایل می‌سازد */
  profileName?: string | null
  driverName?: string | null
  driverNationalId?: string | null
  accountHolder?: string | null
  accountUsername?: string | null
  accountStatus?: string | null
  accountLastError?: string | null
  badCredentials?: boolean
}

/* تعداد سطر در هر صفحه — یک جا تعریف می‌شود تا شماره‌ی ردیف
   همیشه با درخواست هماهنگ بماند */
const PAGE_SIZE = 20

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  success: { color: 'bg-green-500/10 text-green-500', label: 'موفق', icon: <CheckCircle className="size-3" /> },
  failed: { color: 'bg-red-500/10 text-red-500', label: 'ناموفق', icon: <XCircle className="size-3" /> },
  warning: { color: 'bg-orange-500/10 text-orange-500', label: 'هشدار', icon: <AlertTriangle className="size-3" /> },
  running: { color: 'bg-blue-500/10 text-blue-500', label: 'در حال اجرا', icon: <Loader2 className="size-3 animate-spin" /> },
  pending: { color: 'bg-gray-500/10 text-gray-500', label: 'در انتظار', icon: <Clock className="size-3" /> },
  /* وضعیت‌هایی که ورکر واقعا می‌نویسد ولی اینجا تعریف نشده بودند */
  completed: { color: 'bg-green-500/10 text-green-500', label: 'موفق', icon: <CheckCircle className="size-3" /> },
  cancelled: { color: 'bg-gray-500/10 text-gray-500', label: 'لغو شده', icon: <XCircle className="size-3" /> },
  paused: { color: 'bg-orange-500/10 text-orange-500', label: 'متوقف', icon: <AlertTriangle className="size-3" /> },
}

export default function AutomationResultsPage() {
  const [results, setResults] = useState<AutomationResult[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedResult, setSelectedResult] = useState<AutomationResult | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const fetchResults = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/automation/results?${params}`)
      const data = await res.json()
      setResults(Array.isArray(data.data) ? data.data : [])
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages)
        setTotal(data.pagination.total)
      }
    } catch {
      setResults([])
    }
    setLoading(false)
  }, [page, statusFilter, search, dateFrom, dateTo])

  useEffect(() => { fetchResults() }, [fetchResults])

  /* بروزرسانی خودکار حذف شد — کاربر خودش دکمه را می‌زند.
     ولی در پس‌زمینه فقط تعداد را می‌پاییم تا اگر نتیجه‌ی تازه‌ای آمد،
     به او اطلاع بدهیم (خود جدول دست‌نخورده می‌ماند). */
  const [pendingNew, setPendingNew] = useState(0)
  const seenTotal = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      if (document.hidden) return
      try {
        const params = new URLSearchParams({ page: '1', limit: '1' })
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (search) params.set('search', search)
        if (dateFrom) params.set('dateFrom', dateFrom)
        if (dateTo) params.set('dateTo', dateTo)
        const res = await fetch(`/api/automation/results?${params}`)
        const d = await res.json()
        const t = d?.pagination?.total ?? 0
        if (!alive) return
        if (seenTotal.current === null) { seenTotal.current = t; return }
        if (t > seenTotal.current) setPendingNew(t - seenTotal.current)
      } catch { /* مهم نیست */ }
    }
    const id = setInterval(check, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [statusFilter, search, dateFrom, dateTo])

  /* وقتی کاربر خودش بروزرسانی کرد، شمارنده صفر می‌شود */
  const handleRefresh = useCallback(async () => {
    setPendingNew(0)
    seenTotal.current = null
    await fetchResults()
    toast.success('فهرست بروزرسانی شد')
  }, [fetchResults])

  const openDetail = async (result: AutomationResult) => {
    try {
      const res = await fetch(`/api/automation/results?id=${result.id}`)
      const full = await res.json()
      setSelectedResult(full)
    } catch {
      setSelectedResult(result)
    }
    setDetailOpen(true)
  }

  const handleRetry = async (result: AutomationResult) => {
    setRetrying(true)
    try {
      const res = await fetch('/api/automation/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry',
          jobId: result.taskId,
          plate: result.plate,
          waybillNumber: result.waybillNumber,
          driver: result.driver,
          accountId: result.accountId,
        }),
      })
      const data = await res.json()
      if (data.success || data.id) {
        toast.success('تلاش مجدد ثبت شد')
        fetchResults()
      } else {
        toast.error(data.error || 'خطا در ثبت تلاش مجدد')
      }
    } catch {
      toast.error('خطا در اتصال')
    }
    setRetrying(false)
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">نتایج اتوماسیون</h1>
          <p className="text-muted-foreground">مشاهده و مدیریت نتایج عملیات خودکار</p>
        </div>
        <Button
          variant={pendingNew > 0 ? 'default' : 'outline'}
          onClick={handleRefresh}
          disabled={loading}
          className="relative"
        >
          <RefreshCw className={`size-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
          {pendingNew > 0 && (
            <span className="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {pendingNew > 9 ? '۹+' : pendingNew.toLocaleString('fa-IR')}
            </span>
          )}
        </Button>
      </div>

      {/* این صفحه خودکار تازه نمی‌شود — به کاربر یادآوری کن */}
      <AnimatePresence>
        {pendingNew > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
          >
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-primary" />
              <span>
                <b>{pendingNew.toLocaleString('fa-IR')}</b> نتیجه‌ی جدید ثبت شده —
                برای دیدنشان دکمه‌ی بروزرسانی را بزنید
              </span>
            </div>
            <Button size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`size-3.5 ml-1.5 ${loading ? 'animate-spin' : ''}`} />
              بروزرسانی کن
            </Button>
          </motion.div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <Clock className="size-3.5 shrink-0" />
            <span>
              این صفحه خودکار بروز نمی‌شود. برای دیدن نتایج تازه،
              دکمه‌ی «بروزرسانی» را بزنید.
            </span>
          </div>
        )}
      </AnimatePresence>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="جستجو بر اساس پلاک، راننده، حساب، ورکر، پیام..."
                className="pr-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                autoFocus
              />
            </div>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="w-[150px]"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="w-[150px]"
            />
            <div className="flex gap-1">
              {[
                { k: 'all', l: 'همه' },
                { k: 'success', l: 'موفق' },
                { k: 'failed', l: 'ناموفق' },
                { k: 'warning', l: 'هشدار' },
                { k: 'running', l: 'در حال اجرا' },
                { k: 'pending', l: 'در انتظار' },
              ].map((f) => (
                <Button
                  key={f.k}
                  size="sm"
                  variant={statusFilter === f.k ? 'default' : 'outline'}
                  onClick={() => { setStatusFilter(f.k); setPage(1) }}
                >
                  {f.l}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {total.toLocaleString('fa')} نتیجه
      </div>

      <Card>
        <CardContent>
          {/* ستون اسکرین‌شات حذف شد؛ جدول همچنان اسکرول افقی دارد تا متن‌ها روی هم نیفتند. */}
          <p className="mb-2 text-[11px] text-muted-foreground lg:hidden">
            برای دیدن همه‌ی ستون‌ها، جدول را به چپ و راست بکشید
          </p>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[1780px] table-auto border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th style={{ width: 56 }}   className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">ردیف</th>
                  <th style={{ width: 150 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">تاریخ و ساعت</th>
                  <th style={{ width: 120 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">پلاک</th>
                  <th style={{ width: 130 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">راننده</th>
                  <th style={{ width: 120 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">کد ملی راننده</th>
                  <th style={{ width: 130 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">دارنده‌ی حساب</th>
                  <th style={{ width: 120 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">کد ملی حساب</th>
                  <th style={{ width: 90 }}   className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">رمز</th>
                  <th style={{ width: 120 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">کد پیگیری</th>
                  <th style={{ width: 110 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">وضعیت</th>
                  <th style={{ width: 240 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-right font-medium">پیام</th>
                  <th style={{ width: 110 }}  className="sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-3 text-left font-medium">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr>
                ) : results.length === 0 ? (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
                ) : results.map((r, idx) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  /* شماره‌ی پیوسته در کل صفحه‌ها، نه فقط صفحه‌ی جاری */
                  const rowNo = (page - 1) * PAGE_SIZE + idx + 1
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/30 [&>td]:border-b [&>td]:border-border/60"
                      onClick={() => openDetail(r)}
                    >
                      <td className="px-3 py-3 text-xs font-medium text-muted-foreground">
                        {rowNo.toLocaleString('fa-IR')}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString('fa-IR', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-3 font-medium whitespace-nowrap">{r.plate || '-'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.driverName || '-'}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{r.driverNationalId || '-'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.accountHolder || '-'}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{r.accountUsername || '-'}</td>
                      <td className="px-3 py-3">
                        {/* رمز واقعی هرگز نمایش داده نمی‌شود — فقط درستی‌اش */}
                        {r.badCredentials ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive whitespace-nowrap">
                            <XCircle className="size-3" /> اشتباه
                          </span>
                        ) : r.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600 whitespace-nowrap">
                            <CheckCircle className="size-3" /> درست
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-medium">
                        {r.waybillNumber
                          ? <span className="text-green-600">{r.waybillNumber}</span>
                          : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        <span className="line-clamp-2 break-words" title={r.resultMessage || ''}>
                          {r.resultMessage || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => openDetail(r)}>
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRetry(r)}
                            disabled={retrying}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحه {page.toLocaleString('fa')} از {totalPages.toLocaleString('fa')}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>جزئیات نتیجه اتوماسیون</DialogTitle>
          </DialogHeader>

          {selectedResult && (
            <Tabs defaultValue="info" className="pt-4">
              <TabsList>
                <TabsTrigger value="info">اطلاعات</TabsTrigger>
                <TabsTrigger value="timeline">زمان‌بندی</TabsTrigger>
                <TabsTrigger value="logs">لاگ</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">پلاک</p>
                    <p className="font-medium">{selectedResult.plate || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">شماره باربرگ</p>
                    <p className="font-medium">{selectedResult.waybillNumber || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">راننده</p>
                    <p className="font-medium">{selectedResult.driver || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">وضعیت</p>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${(statusConfig[selectedResult.status] || statusConfig.pending).color}`}>
                      {(statusConfig[selectedResult.status] || statusConfig.pending).label}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">حساب</p>
                    <p className="font-medium">{selectedResult.account?.username || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ورکر</p>
                    <p className="font-medium">{selectedResult.worker?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">مرورگر</p>
                    <p className="font-medium text-xs">{selectedResult.browserSessionId || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">آدرس فعلی</p>
                    <p className="font-medium text-xs break-all">{selectedResult.currentUrl || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">پیام نتیجه</p>
                    <p className="text-sm">{selectedResult.resultMessage || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">کد خطا</p>
                    <p className="font-medium">{selectedResult.errorCode || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">مدت اجرا</p>
                    <p className="font-medium">{formatDuration(selectedResult.duration)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">تعداد تلاش مجدد</p>
                    <p className="font-medium">{selectedResult.retryCount}</p>
                  </div>
                </div>

                {selectedResult.screenshotPath && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">اسکرین‌شات</p>
                    <img
                      src={selectedResult.screenshotPath}
                      alt="اسکرین‌شات"
                      className="rounded-lg border max-w-full"
                    />
                  </div>
                )}

                {selectedResult.htmlSnapshotPath && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">فایل HTML</p>
                    <a
                      href={selectedResult.htmlSnapshotPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                    >
                      <Download className="size-4" /> دانلود فایل HTML
                    </a>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleRetry(selectedResult)}
                    disabled={retrying}
                  >
                    <RotateCcw className="size-4 ml-2" />
                    {retrying ? 'در حال ارسال...' : 'تلاش مجدد'}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="pt-4">
                <div className="space-y-3">
                  {selectedResult.startedAt && (
                    <div className="flex items-center gap-3">
                      <div className="size-3 rounded-full bg-blue-500" />
                      <div>
                        <p className="text-sm font-medium">شروع اجرا</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(selectedResult.startedAt).toLocaleString('fa')}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedResult.finishedAt && (
                    <div className="flex items-center gap-3">
                      <div className={`size-3 rounded-full ${selectedResult.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-sm font-medium">
                          {selectedResult.status === 'success' ? 'تکمیل شد' : 'پایان یافت'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(selectedResult.finishedAt).toLocaleString('fa')}
                        </p>
                      </div>
                    </div>
                  )}
                  {!selectedResult.startedAt && !selectedResult.finishedAt && (
                    <p className="text-sm text-muted-foreground">زمان‌بندی موجود نیست</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="logs" className="pt-4">
                {selectedResult.playwrightLog ? (
                  <div className="rounded-lg bg-muted p-4 overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {typeof selectedResult.playwrightLog === 'string'
                        ? selectedResult.playwrightLog
                        : JSON.stringify(selectedResult.playwrightLog, null, 2)}
                    </pre>
                  </div>
                ) : selectedResult.job?.logs && selectedResult.job.logs.length > 0 ? (
                  <div className="space-y-2">
                    {selectedResult.job.logs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 rounded border p-2 text-sm">
                        <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {log.level}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleTimeString('fa')}
                        </span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لاگی موجود نیست</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
