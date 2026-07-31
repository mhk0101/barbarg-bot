'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePolling } from '@/hooks/usePolling'
import { ArrowRight, Loader2, Car, CheckCircle, XCircle, Clock, RotateCcw, Timer, RefreshCw } from 'lucide-react'

const DailyChart = dynamic(
  () => import('../PlateAnalyticsCharts').then((m) => ({ default: m.DailyChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

const SuccessFailPieChart = dynamic(
  () => import('../PlateAnalyticsCharts').then((m) => ({ default: m.SuccessFailPieChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

const HourlyChart = dynamic(
  () => import('../PlateAnalyticsCharts').then((m) => ({ default: m.HourlyChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

const TrendChart = dynamic(
  () => import('../PlateAnalyticsCharts').then((m) => ({ default: m.TrendChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

interface PlateInfo { plateNumber: string; driver: string | null; nationalId: string | null; account: string | null; status: string | null }
interface PlateStats { total: number; successful: number; failed: number; successRate: number; averageDuration: number; retryCount: number }
interface DailyData { date: string; total: number; successful: number; failed: number }
interface HourlyData { hour: number; total: number; successful: number; failed: number }
interface MessageData { message: string; count: number; lastSeen: string; status: string }
interface RecentExecution { id: string; status: string; message: string | null; duration: number | null; date: string; worker: string | null; account: string | null }

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} ثانیه`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes} دقیقه ${remainingSeconds} ثانیه`
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">موفق</Badge>
  if (status === 'failed') return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">ناموفق</Badge>
  return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">در انتظار</Badge>
}

function SuccessRateBadge({ rate }: { rate: number }) {
  if (rate > 80) return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{rate}%</Badge>
  if (rate >= 50) return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{rate}%</Badge>
  return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{rate}%</Badge>
}

export default function PlateAnalyticsDetailPage() {
  const params = useParams()
  const router = useRouter()
  const plateNumber = decodeURIComponent(params.plateNumber as string)

  const [plate, setPlate] = useState<PlateInfo>({ plateNumber, driver: null, nationalId: null, account: null, status: null })
  const [stats, setStats] = useState<PlateStats>({ total: 0, successful: 0, failed: 0, successRate: 0, averageDuration: 0, retryCount: 0 })
  const [daily, setDaily] = useState<DailyData[]>([])
  const [hourly, setHourly] = useState<HourlyData[]>([])
  const [trend, setTrend] = useState<DailyData[]>([])
  const [messages, setMessages] = useState<MessageData[]>([])
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/plate-analytics/${encodeURIComponent(plateNumber)}`)
      const data = await res.json()
      if (data.error) return
      setPlate(data.plate || { plateNumber, driver: null, nationalId: null, account: null, status: null })
      setStats(data.stats || { total: 0, successful: 0, failed: 0, successRate: 0, averageDuration: 0, retryCount: 0 })
      setDaily(Array.isArray(data.daily) ? data.daily : [])
      setHourly(Array.isArray(data.hourly) ? data.hourly : [])
      setTrend(Array.isArray(data.trend) ? data.trend : [])
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setRecentExecutions(Array.isArray(data.recentExecutions) ? data.recentExecutions : [])
    } catch {}
    setLoading(false)
  }, [plateNumber])

  useEffect(() => { fetchData() }, [fetchData])
  usePolling(fetchData, 10000)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const statCards = [
    { label: 'کل ثبت‌نام‌ها', value: stats.total.toLocaleString('fa'), icon: Car, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'موفق', value: stats.successful.toLocaleString('fa'), icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'ناموفق', value: stats.failed.toLocaleString('fa'), icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'نرخ موفقیت', value: `${stats.successRate}%`, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'مدت متوسط', value: formatDuration(stats.averageDuration), icon: Timer, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { label: 'تلاش مجدد', value: stats.retryCount.toLocaleString('fa'), icon: RotateCcw, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/panel/plate-analytics')}>
            <ArrowRight className="size-4 ml-1" /> بازگشت
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold font-mono">{plateNumber}</h1>
              {plate.status && <StatusBadge status={plate.status} />}
            </div>
            <p className="text-muted-foreground">
              {plate.driver && `راننده: ${plate.driver}`}
              {plate.driver && plate.account && ' | '}
              {plate.account && `حساب: ${plate.account}`}
              {!plate.driver && !plate.account && 'اطلاعات پروفایل یافت نشد'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs"><RefreshCw className="size-3 ml-1" /> بروزرسانی خودکار</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-2xl font-bold">{card.value}</p>
                    </div>
                    <div className={`size-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                      <Icon className={`size-5 ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DailyChart data={daily} />
        <SuccessFailPieChart successful={stats.successful} failed={stats.failed} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HourlyChart data={hourly} />
        <TrendChart data={trend} />
      </div>

      {messages.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">تاریخچه پیام‌ها</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>پیام</TableHead>
                  <TableHead>تعداد</TableHead>
                  <TableHead>آخرین مشاهده</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((msg, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[300px] truncate">{msg.message}</TableCell>
                    <TableCell>{msg.count.toLocaleString('fa')}</TableCell>
                    <TableCell className="text-xs">{formatDate(msg.lastSeen)}</TableCell>
                    <TableCell><StatusBadge status={msg.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {recentExecutions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">آخرین اجراها</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>پیام</TableHead>
                  <TableHead>مدت</TableHead>
                  <TableHead>ورکر</TableHead>
                  <TableHead>حساب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExecutions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell className="text-xs">{formatDate(exec.date)}</TableCell>
                    <TableCell><StatusBadge status={exec.status} /></TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{exec.message || '-'}</TableCell>
                    <TableCell>{formatDuration(exec.duration)}</TableCell>
                    <TableCell className="text-xs">{exec.worker || '-'}</TableCell>
                    <TableCell className="text-xs">{exec.account || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
