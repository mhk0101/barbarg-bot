'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'

const DailyChart = dynamic(
  () => import('./ReportCharts').then((m) => ({ default: m.DailyChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

const WeeklyChart = dynamic(
  () => import('./ReportCharts').then((m) => ({ default: m.WeeklyChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

interface ReportStats { total: number; completed: number; failed: number; pending: number; successRate: number; totalWaybills: number; totalAccounts: number; totalPlates: number }
interface DailyData { day: string; success: number; failed: number }
interface WeeklyData { week: string; success: number; failed: number }

export default function ReportsPage() {
  const [stats, setStats] = useState<ReportStats>({ total: 0, completed: 0, failed: 0, pending: 0, successRate: 0, totalWaybills: 0, totalAccounts: 0, totalPlates: 0 })
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      setStats(data.stats || { total: 0, completed: 0, failed: 0, pending: 0, successRate: 0, totalWaybills: 0, totalAccounts: 0, totalPlates: 0 })
      setDailyData(Array.isArray(data.dailyData) ? data.dailyData : [])
      setWeeklyData(Array.isArray(data.weeklyData) ? data.weeklyData : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExport = (type: string) => {
    const csv = ['تاریخ,موفق,ناموفق']
    dailyData.forEach((d) => csv.push(`${d.day},${d.success},${d.failed}`))
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `report-${type}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success(`خروجی ${type} تولید شد`)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">گزارش‌ها</h1><p className="text-muted-foreground">گزارش عملکرد سیستم</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('excel')}><Download className="size-4 ml-2" /> اکسل</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">کل عملیات</p><p className="text-2xl font-bold">{stats.total.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">موفق</p><p className="text-2xl font-bold text-green-500">{stats.completed.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ناموفق</p><p className="text-2xl font-bold text-red-500">{stats.failed.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">در انتظار</p><p className="text-2xl font-bold text-yellow-500">{stats.pending.toLocaleString('fa')}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">نرخ موفقیت</p><p className="text-2xl font-bold text-green-500">{stats.successRate}%</p></CardContent></Card>
          </div>

          <Tabs defaultValue="daily">
            <TabsList><TabsTrigger value="daily">روزانه</TabsTrigger><TabsTrigger value="weekly">هفتگی</TabsTrigger></TabsList>
            <TabsContent value="daily" className="pt-4">
              <DailyChart data={dailyData} />
            </TabsContent>
            <TabsContent value="weekly" className="pt-4">
              <WeeklyChart data={weeklyData} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </motion.div>
  )
}
