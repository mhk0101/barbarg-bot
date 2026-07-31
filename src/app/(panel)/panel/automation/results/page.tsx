'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, Eye, RotateCcw, Image, FileText,
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
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  success: { color: 'bg-green-500/10 text-green-500', label: 'موفق', icon: <CheckCircle className="size-3" /> },
  failed: { color: 'bg-red-500/10 text-red-500', label: 'ناموفق', icon: <XCircle className="size-3" /> },
  warning: { color: 'bg-orange-500/10 text-orange-500', label: 'هشدار', icon: <AlertTriangle className="size-3" /> },
  running: { color: 'bg-blue-500/10 text-blue-500', label: 'در حال اجرا', icon: <Loader2 className="size-3 animate-spin" /> },
  pending: { color: 'bg-gray-500/10 text-gray-500', label: 'در انتظار', icon: <Clock className="size-3" /> },
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
      params.set('limit', '20')
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

  usePolling(fetchResults, 5000)

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
        <Button variant="outline" onClick={fetchResults}><RefreshCw className="size-4" /></Button>
      </div>

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  <th className="pb-3 font-medium">تاریخ</th>
                  <th className="pb-3 font-medium">پلاک</th>
                  <th className="pb-3 font-medium">شماره باربرگ</th>
                  <th className="pb-3 font-medium">حساب</th>
                  <th className="pb-3 font-medium">ورکر</th>
                  <th className="pb-3 font-medium">وضعیت</th>
                  <th className="pb-3 font-medium">پیام</th>
                  <th className="pb-3 font-medium">مدت</th>
                  <th className="pb-3 font-medium">تلاش</th>
                  <th className="pb-3 font-medium">اسکرین‌شات</th>
                  <th className="pb-3 font-medium text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr>
                ) : results.length === 0 ? (
                  <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
                ) : results.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  return (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDetail(r)}
                    >
                      <td className="py-3 text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString('fa')}
                      </td>
                      <td className="py-3 font-medium">{r.plate || '-'}</td>
                      <td className="py-3 text-muted-foreground">{r.waybillNumber || '-'}</td>
                      <td className="py-3">{r.account?.username || '-'}</td>
                      <td className="py-3 text-muted-foreground">{r.worker?.name || '-'}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="py-3 text-xs max-w-[200px] truncate text-muted-foreground">
                        {r.resultMessage || '-'}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {formatDuration(r.duration)}
                      </td>
                      <td className="py-3 text-center">
                        {r.retryCount > 0 ? (
                          <Badge variant="outline" className="text-[10px]">{r.retryCount}</Badge>
                        ) : '-'}
                      </td>
                      <td className="py-3">
                        {r.screenshotPath ? (
                          <Image className="size-4 text-green-500" />
                        ) : '-'}
                      </td>
                      <td className="py-3">
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
