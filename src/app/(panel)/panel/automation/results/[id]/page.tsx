'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  ArrowRight, RotateCcw, Image, Download, Clock, CheckCircle, XCircle,
  AlertTriangle, Loader2, ExternalLink, Globe, FileText,
} from 'lucide-react'

interface Account { id: string; username: string }
interface Worker { id: string; name: string; status: string }
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
  success: { color: 'bg-green-500/10 text-green-500', label: 'موفق', icon: <CheckCircle className="size-4" /> },
  failed: { color: 'bg-red-500/10 text-red-500', label: 'ناموفق', icon: <XCircle className="size-4" /> },
  warning: { color: 'bg-orange-500/10 text-orange-500', label: 'هشدار', icon: <AlertTriangle className="size-4" /> },
  running: { color: 'bg-blue-500/10 text-blue-500', label: 'در حال اجرا', icon: <Loader2 className="size-4 animate-spin" /> },
  pending: { color: 'bg-gray-500/10 text-gray-500', label: 'در انتظار', icon: <Clock className="size-4" /> },
}

export default function AutomationResultDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [result, setResult] = useState<AutomationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  const fetchResult = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/automation/results?id=${id}`)
      if (res.ok) {
        const data = await res.json()
        setResult(data)
      } else {
        toast.error('نتیجه یافت نشد')
        router.push('/panel/automation/results')
      }
    } catch {
      toast.error('خطا در دریافت اطلاعات')
    }
    setLoading(false)
  }, [id, router])

  useEffect(() => { fetchResult() }, [fetchResult])

  const handleRetry = async () => {
    if (!result) return
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
        fetchResult()
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

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="py-8 text-center text-muted-foreground">در حال بارگذاری...</div>
      </motion.div>
    )
  }

  if (!result) return null

  const sc = statusConfig[result.status] || statusConfig.pending

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/panel/automation/results')}>
            <ArrowRight className="size-4 ml-1" /> بازگشت
          </Button>
          <div>
            <h1 className="text-3xl font-bold">جزئیات نتیجه اتوماسیون</h1>
            <p className="text-muted-foreground">{result.id}</p>
          </div>
        </div>
        <Button onClick={handleRetry} disabled={retrying}>
          <RotateCcw className="size-4 ml-2" />
          {retrying ? 'در حال ارسال...' : 'تلاش مجدد'}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">وضعیت</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sc.color}`}>
              {sc.icon} {sc.label}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">پلاک</p>
            <p className="text-lg font-bold">{result.plate || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">شماره باربرگ</p>
            <p className="text-lg font-bold">{result.waybillNumber || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">مدت اجرا</p>
            <p className="text-lg font-bold">{formatDuration(result.duration)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">اطلاعات کامل</TabsTrigger>
          <TabsTrigger value="timeline">زمان‌بندی</TabsTrigger>
          <TabsTrigger value="logs">لاگ</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle>اطلاعات عمومی</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'پلاک', value: result.plate },
                  { label: 'شماره باربرگ', value: result.waybillNumber },
                  { label: 'راننده', value: result.driver },
                  { label: 'وسیله نقلیه', value: result.vehicle },
                  { label: 'فرستنده', value: result.sender },
                  { label: 'گیرنده', value: result.receiver },
                  { label: 'حساب', value: result.account?.username },
                  { label: 'ورکر', value: result.worker?.name },
                  { label: 'شناسه مرورگر', value: result.browserSessionId },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="font-medium text-sm">{item.value || '-'}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>وضعیت اجرا</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">پیام نتیجه</p>
                  <p className="text-sm">{result.resultMessage || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">نوع نتیجه</p>
                  <p className="text-sm">{result.resultType || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">کد خطا</p>
                  <p className="text-sm">{result.errorCode || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">تعداد تلاش مجدد</p>
                  <p className="text-sm">{result.retryCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">آدرس فعلی</p>
                  {result.currentUrl ? (
                    <a href={result.currentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline flex items-center gap-1 break-all">
                      <Globe className="size-3 shrink-0" /> {result.currentUrl}
                    </a>
                  ) : <p className="text-sm">-</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">شناسه وظیفه</p>
                  <p className="text-sm text-muted-foreground break-all">{result.taskId || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {result.screenshotPath && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Image className="size-4" /> اسکرین‌شات</CardTitle></CardHeader>
              <CardContent>
                <img
                  src={result.screenshotPath}
                  alt="اسکرین‌شات عملیات"
                  className="rounded-lg border max-w-full"
                />
              </CardContent>
            </Card>
          )}

          {result.htmlSnapshotPath && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" /> فایل HTML</CardTitle></CardHeader>
              <CardContent>
                <a
                  href={result.htmlSnapshotPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-500 hover:underline"
                >
                  <Download className="size-4" /> دانلود فایل HTML
                  <ExternalLink className="size-3" />
                </a>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <Card>
            <CardHeader><CardTitle>زمان‌بندی عملیات</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-3 rounded-full bg-gray-400" />
                  <div>
                    <p className="text-sm font-medium">ایجاد شده</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(result.createdAt).toLocaleString('fa')}
                    </p>
                  </div>
                </div>
                {result.startedAt && (
                  <div className="flex items-center gap-3">
                    <div className="size-3 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-sm font-medium">شروع اجرا</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(result.startedAt).toLocaleString('fa')}
                      </p>
                    </div>
                  </div>
                )}
                {result.finishedAt && (
                  <div className="flex items-center gap-3">
                    <div className={`size-3 rounded-full ${result.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="text-sm font-medium">
                        {result.status === 'success' ? 'تکمیل شد' : 'پایان یافت'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(result.finishedAt).toLocaleString('fa')}
                      </p>
                    </div>
                  </div>
                )}
                {result.updatedAt && result.updatedAt !== result.createdAt && (
                  <div className="flex items-center gap-3">
                    <div className="size-3 rounded-full bg-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">آخرین بروزرسانی</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(result.updatedAt).toLocaleString('fa')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Playwright Log</CardTitle></CardHeader>
            <CardContent>
              {result.playwrightLog ? (
                <div className="rounded-lg bg-muted p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {typeof result.playwrightLog === 'string'
                      ? result.playwrightLog
                      : JSON.stringify(result.playwrightLog, null, 2)}
                  </pre>
                </div>
              ) : result.job?.logs && result.job.logs.length > 0 ? (
                <div className="space-y-2">
                  {result.job.logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 rounded border p-2 text-sm">
                      <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                        {log.level}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString('fa')}
                      </span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">لاگی موجود نیست</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
