'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { FileSpreadsheet, FileText, Download, Loader2, BarChart3, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface AutomationRow {
  id: string
  plate: string | null
  driver: string | null
  vehicle: string | null
  sender: string | null
  receiver: string | null
  status: string
  resultMessage: string | null
  resultType: string | null
  duration: number | null
  retryCount: number
  accountId: string | null
  accountUsername: string | null
  workerName: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

interface Account {
  id: string
  username: string
}

interface PreviewData {
  summary: { total: number; successful: number; failed: number; pending: number; totalRetries: number; avgDuration: number }
  rows: AutomationRow[]
  total: number
}

function statusColor(s: string) {
  if (s === 'completed') return 'bg-green-500/10 text-green-500'
  if (s === 'failed') return 'bg-red-500/10 text-red-500'
  if (s === 'paused') return 'bg-yellow-500/10 text-yellow-500'
  return 'bg-blue-500/10 text-blue-500'
}

function statusLabel(s: string) {
  const map: Record<string, string> = { completed: 'موفق', failed: 'ناموفق', pending: 'در انتظار', paused: 'متوقف', running: 'در حال اجرا' }
  return map[s] || s
}

function formatDuration(ms: number | null) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function ReportExportPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('all')
  const [plate, setPlate] = useState('')
  const [driver, setDriver] = useState('')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data.data) ? data.data : []
        setAccounts(list.map((a: { id: string; username: string }) => ({ id: a.id, username: a.username })))
      })
      .catch(() => {})
  }, [])

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (status !== 'all') params.set('status', status)
    if (plate) params.set('plate', plate)
    if (driver) params.set('driver', driver)
    if (accountId) params.set('account', accountId)
    return params.toString()
  }, [dateFrom, dateTo, status, plate, driver, accountId])

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true)
    try {
      const qs = buildQueryParams()
      const res = await fetch(`/api/reports/export?format=csv&${qs}`)
      if (!res.ok) throw new Error('Preview failed')
      const text = await res.text()
      const lines = text.split('\n').filter(l => l.trim())
      const totalRows = Math.max(0, lines.length - 1)
      const previewRows: AutomationRow[] = lines.slice(1, 11).map(line => {
        const parts = line.split(',')
        return {
          id: parts[0] || '',
          plate: parts[1] || null,
          driver: parts[2] || null,
          vehicle: parts[3] || null,
          sender: parts[4] || null,
          receiver: parts[5] || null,
          status: parts[6] || '',
          resultMessage: parts[7] || null,
          resultType: parts[8] || null,
          duration: parts[9] ? parseInt(parts[9]) : null,
          retryCount: parts[10] ? parseInt(parts[10]) : 0,
          accountId: null,
          accountUsername: parts[11] || null,
          workerName: null,
          startedAt: parts[12] || null,
          finishedAt: parts[13] || null,
          createdAt: parts[14] || '',
        }
      })
      const completed = previewRows.filter(r => r.status === 'Completed').length
      const failed = previewRows.filter(r => r.status === 'Failed').length
      const totalRetries = previewRows.reduce((s, r) => s + r.retryCount, 0)
      const durations = previewRows.filter(r => r.duration != null).map(r => r.duration!)
      const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0
      setPreview({
        summary: { total: totalRows, successful: completed, failed, pending: totalRows - completed - failed, totalRetries, avgDuration },
        rows: previewRows,
        total: totalRows,
      })
    } catch {
      setPreview(null)
      toast.error('خطا در دریافت پیش‌نمایش')
    }
    setLoadingPreview(false)
  }, [buildQueryParams])

  const handleExport = async (format: string) => {
    setExporting(format)
    try {
      const qs = buildQueryParams()
      const res = await fetch(`/api/reports/export?format=${format}&${qs}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv'
      const mime = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'pdf' ? 'application/pdf' : 'text/csv'
      const url = URL.createObjectURL(new Blob([blob], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `barbarg-report-${Date.now()}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`فایل ${ext.toUpperCase()} دانلود شد`)
    } catch {
      toast.error('خطا در تولید خروجی')
    }
    setExporting(null)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">خروجی گزارش</h1>
          <p className="text-muted-foreground">تولید و دانلود گزارش عملیات ثبت باربرگ</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm">از تاریخ</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">تا تاریخ</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">وضعیت</Label>
              <Select value={status} onValueChange={v => setStatus(v ?? 'all')}>
                <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="completed">موفق</SelectItem>
                  <SelectItem value="failed">ناموفق</SelectItem>
                  <SelectItem value="paused">متوقف</SelectItem>
                  <SelectItem value="pending">در انتظار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">شماره پلاک</Label>
              <Input value={plate} onChange={e => setPlate(e.target.value)} placeholder="مثال: 12ع345" className="h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">نام راننده</Label>
              <Input value={driver} onChange={e => setDriver(e.target.value)} placeholder="نام راننده" className="h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">حساب</Label>
              <Select value={accountId} onValueChange={v => setAccountId(v ?? '')}>
                <SelectTrigger className="w-full h-9"><SelectValue placeholder="همه حساب‌ها" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">همه حساب‌ها</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <Button variant="outline" onClick={loadPreview} disabled={loadingPreview}>
              {loadingPreview ? <Loader2 className="size-4 ml-2 animate-spin" /> : <BarChart3 className="size-4 ml-2" />}
              پیش‌نمایش
            </Button>
            <div className="flex-1" />
            <Button onClick={() => handleExport('xlsx')} disabled={exporting === 'xlsx'} className="bg-green-600 hover:bg-green-700 text-white">
              {exporting === 'xlsx' ? <Loader2 className="size-4 ml-2 animate-spin" /> : <FileSpreadsheet className="size-4 ml-2" />}
              دانلود اکسل
            </Button>
            <Button onClick={() => handleExport('pdf')} disabled={exporting === 'pdf'} className="bg-red-600 hover:bg-red-700 text-white">
              {exporting === 'pdf' ? <Loader2 className="size-4 ml-2 animate-spin" /> : <FileText className="size-4 ml-2" />}
              دانلود PDF
            </Button>
            <Button onClick={() => handleExport('csv')} disabled={exporting === 'csv'} className="bg-blue-600 hover:bg-blue-700 text-white">
              {exporting === 'csv' ? <Loader2 className="size-4 ml-2 animate-spin" /> : <Download className="size-4 ml-2" />}
              دانلود CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {loadingPreview && (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
          </CardContent>
        </Card>
      )}

      {!loadingPreview && preview && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><BarChart3 className="size-4 text-blue-500" /><span className="text-xs text-muted-foreground">کل عملیات</span></div><p className="text-2xl font-bold">{preview.summary.total.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="size-4 text-green-500" /><span className="text-xs text-muted-foreground">موفق</span></div><p className="text-2xl font-bold text-green-500">{preview.summary.successful.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><XCircle className="size-4 text-red-500" /><span className="text-xs text-muted-foreground">ناموفق</span></div><p className="text-2xl font-bold text-red-500">{preview.summary.failed.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="size-4 text-yellow-500" /><span className="text-xs text-muted-foreground">در انتظار</span></div><p className="text-2xl font-bold text-yellow-500">{preview.summary.pending.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Download className="size-4 text-purple-500" /><span className="text-xs text-muted-foreground">تعداد تلاش</span></div><p className="text-2xl font-bold text-purple-500">{preview.summary.totalRetries.toLocaleString('fa')}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">پیش‌نمایش (۱۰ ردیف اول از {preview.total.toLocaleString('fa')} ردیف)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-right text-muted-foreground">
                      <th className="pb-3 font-medium">ردیف</th>
                      <th className="pb-3 font-medium">پلاک</th>
                      <th className="pb-3 font-medium">راننده</th>
                      <th className="pb-3 font-medium">فرستنده</th>
                      <th className="pb-3 font-medium">گیرنده</th>
                      <th className="pb-3 font-medium">وضعیت</th>
                      <th className="pb-3 font-medium">پیام</th>
                      <th className="pb-3 font-medium">مدت</th>
                      <th className="pb-3 font-medium">حساب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, idx) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="py-3 font-medium">{r.plate || '-'}</td>
                        <td className="py-3">{r.driver || '-'}</td>
                        <td className="py-3 text-muted-foreground">{r.sender || '-'}</td>
                        <td className="py-3 text-muted-foreground">{r.receiver || '-'}</td>
                        <td className="py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(r.status)}`}>
                            {statusLabel(r.status.toLowerCase())}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.resultMessage || '-'}</td>
                        <td className="py-3 text-muted-foreground">{formatDuration(r.duration)}</td>
                        <td className="py-3 text-muted-foreground">{r.accountUsername || '-'}</td>
                      </tr>
                    ))}
                    {preview.rows.length === 0 && (
                      <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
