'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePolling } from '@/hooks/usePolling'
import { BarChart3, Search, ChevronLeft, ChevronRight, Loader2, Car, CheckCircle, XCircle, Clock, RefreshCw, ArrowLeft } from 'lucide-react'

interface RecentMessage {
  message: string
  status: string
  date: string
}

interface PlateAnalyticsItem {
  plateNumber: string
  driver: string | null
  nationalId: string | null
  account: string | null
  totalRegistrations: number
  successfulRegistrations: number
  failedRegistrations: number
  successRate: number
  failureRate: number
  lastExecution: string | null
  lastSuccessfulExecution: string | null
  lastFailedExecution: string | null
  averageDuration: number
  retryCount: number
  recentMessages: RecentMessage[]
}

function formatDuration(ms: number): string {
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

function SuccessRateBadge({ rate }: { rate: number }) {
  if (rate > 80) return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{rate}%</Badge>
  if (rate >= 50) return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{rate}%</Badge>
  return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{rate}%</Badge>
}

export default function PlateAnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<PlateAnalyticsItem[]>([])
  const [summary, setSummary] = useState({ totalPlates: 0, totalRegistrations: 0, overallSuccessRate: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [driverFilter, setDriverFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (driverFilter) params.set('driver', driverFilter)
      if (accountFilter) params.set('account', accountFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/plate-analytics?${params.toString()}`)
      const json = await res.json()
      setData(Array.isArray(json.plates) ? json.plates : [])
      setSummary(json.summary || { totalPlates: 0, totalRegistrations: 0, overallSuccessRate: 0 })
    } catch {}
    setLoading(false)
  }, [dateFrom, dateTo, driverFilter, accountFilter, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])
  usePolling(fetchData, 10000)

  const filteredData = data.filter(item =>
    !search || item.plateNumber.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filteredData.length / pageSize)
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, driverFilter, accountFilter, statusFilter])

  const summaryCards = [
    { label: 'کل پلاک‌ها', value: summary.totalPlates, icon: Car, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'کل ثبت‌نام‌ها', value: summary.totalRegistrations, icon: BarChart3, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'نرخ موفقیت کل', value: `${summary.overallSuccessRate}%`, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">تحلیل پلاک‌ها</h1>
          <p className="text-muted-foreground">آمار و تحلیل عملکرد ثبت‌نام پلاک‌ها</p>
        </div>
        <Badge variant="outline" className="text-xs"><RefreshCw className="size-3 ml-1" /> بروزرسانی خودکار</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-2xl font-bold">{typeof card.value === 'number' ? card.value.toLocaleString('fa') : card.value}</p>
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

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="جستجوی شماره پلاک..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Input
              type="date"
              placeholder="از تاریخ"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
            />
            <Input
              type="date"
              placeholder="تا تاریخ"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
            />
            <Input
              placeholder="راننده"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="w-[130px]"
            />
            <Input
              placeholder="حساب"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-[130px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="">همه وضعیت‌ها</option>
              <option value="completed">موفق</option>
              <option value="failed">ناموفق</option>
              <option value="pending">در انتظار</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Car className="size-12 mb-3 opacity-50" />
              <p>داده‌ای یافت نشد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>پلاک</TableHead>
                  <TableHead>راننده</TableHead>
                  <TableHead>حساب</TableHead>
                  <TableHead>کل</TableHead>
                  <TableHead>موفق</TableHead>
                  <TableHead>ناموفق</TableHead>
                  <TableHead>نرخ موفقیت</TableHead>
                  <TableHead>آخرین اجرا</TableHead>
                  <TableHead>مدت متوسط</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((item) => (
                  <TableRow key={item.plateNumber} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/panel/plate-analytics/${encodeURIComponent(item.plateNumber)}`)}>
                    <TableCell className="font-mono font-bold">{item.plateNumber}</TableCell>
                    <TableCell>{item.driver || '-'}</TableCell>
                    <TableCell>{item.account || '-'}</TableCell>
                    <TableCell>{item.totalRegistrations.toLocaleString('fa')}</TableCell>
                    <TableCell className="text-green-500">{item.successfulRegistrations.toLocaleString('fa')}</TableCell>
                    <TableCell className="text-red-500">{item.failedRegistrations.toLocaleString('fa')}</TableCell>
                    <TableCell><SuccessRateBadge rate={item.successRate} /></TableCell>
                    <TableCell className="text-xs">{formatDate(item.lastExecution)}</TableCell>
                    <TableCell>{formatDuration(item.averageDuration)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/panel/plate-analytics/${encodeURIComponent(item.plateNumber)}`) }}>
                        <ArrowLeft className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            نمایش {(page - 1) * pageSize + 1} تا {Math.min(page * pageSize, filteredData.length)} از {filteredData.length.toLocaleString('fa')} نتیجه
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="size-4" /> قبلی
            </Button>
            <span className="text-sm">{page.toLocaleString('fa')} / {totalPages.toLocaleString('fa')}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              بعدی <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
