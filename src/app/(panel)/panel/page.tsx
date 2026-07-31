'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Users, Car, FileText, CheckCircle, XCircle, Clock, Bot, Zap, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePolling } from '@/hooks/usePolling'

const WeeklyActivityChart = dynamic(
  () => import('./DashboardCharts').then((m) => ({ default: m.WeeklyActivityChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

const StatusDistributionChart = dynamic(
  () => import('./DashboardCharts').then((m) => ({ default: m.StatusDistributionChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

export default function DashboardPage() {
  const [data, setData] = useState({
    stats: { accounts: 0, plates: 0, waybills: 0, completed: 0, failed: 0, pending: 0, activeJobs: 0, successRate: 0, profiles: 0, activeProfiles: 0, totalRuns: 0, successfulRuns: 0, failedRuns: 0 },
    weeklyActivity: [] as { day: string; count: number }[],
    statusDistribution: [] as { name: string; value: number }[],
    workers: [] as { name: string; status: string; progress: number; tasksCompleted: number; tasksFailed: number; lastHeartbeat: string | null }[],
  })

  const loadData = useCallback(() => {
    fetch('/api/dashboard').then((r) => r.json()).then((d) => {
      if (d && typeof d === 'object') setData({
        stats: { accounts: d.stats?.accounts ?? 0, plates: d.stats?.plates ?? 0, waybills: d.stats?.waybills ?? 0, completed: d.stats?.completed ?? 0, failed: d.stats?.failed ?? 0, pending: d.stats?.pending ?? 0, activeJobs: d.stats?.activeJobs ?? 0, successRate: d.stats?.successRate ?? 0, profiles: d.stats?.profiles ?? 0, activeProfiles: d.stats?.activeProfiles ?? 0, totalRuns: d.stats?.totalRuns ?? 0, successfulRuns: d.stats?.successfulRuns ?? 0, failedRuns: d.stats?.failedRuns ?? 0 },
        weeklyActivity: Array.isArray(d.weeklyActivity) ? d.weeklyActivity : [],
        statusDistribution: Array.isArray(d.statusDistribution) ? d.statusDistribution : [],
        workers: Array.isArray(d.workers) ? d.workers : [],
      })
    }).catch(() => {})
  }, [])

  useEffect(() => { loadData() }, [loadData])
  usePolling(loadData, 10000)

  const statCards = [
    { key: 'accounts' as const, label: 'حساب‌ها', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { key: 'plates' as const, label: 'پلاک‌ها', icon: Car, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { key: 'profiles' as const, label: 'پروفایل‌ها', icon: FileText, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { key: 'completed' as const, label: 'تکمیل شده', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    { key: 'failed' as const, label: 'ناموفق', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { key: 'pending' as const, label: 'در انتظار', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ]

  const activeWorkerCount = data.workers.filter((w) => w.status === 'فعال').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">داشبورد</h1><p className="text-muted-foreground">داشبورد سیستم ثبت باربرگ</p></div>
        <Badge variant="outline" className="text-xs"><Zap className="size-3 ml-1" /> بلادرنگ</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div key={card.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div><p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-2xl font-bold">{(data.stats[card.key] ?? 0).toLocaleString('fa')}</p></div>
                    <div className={`size-10 rounded-xl ${card.bg} flex items-center justify-center`}><Icon className={`size-5 ${card.color}`} /></div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'پروفایل فعال', value: data.stats.activeProfiles.toLocaleString('fa'), icon: FileText, color: 'text-cyan-500' },
          { label: 'کل اجراها', value: data.stats.totalRuns.toLocaleString('fa'), icon: TrendingUp, color: 'text-blue-500' },
          { label: 'اجراهای موفق', value: data.stats.successfulRuns.toLocaleString('fa'), icon: CheckCircle, color: 'text-green-500' },
          { label: 'اجراهای ناموفق', value: data.stats.failedRuns.toLocaleString('fa'), icon: XCircle, color: 'text-red-500' },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className={`size-10 rounded-xl bg-muted flex items-center justify-center`}><c.icon className={`size-5 ${c.color}`} /></div>
              <div><p className="text-xs text-muted-foreground">{c.label}</p><p className="text-lg font-bold">{c.value}</p></div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeeklyActivityChart data={data.weeklyActivity} />
        <StatusDistributionChart data={data.statusDistribution} />
      </div>

      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-5" /> وضعیت ورکرها</CardTitle></CardHeader><CardContent className="space-y-4">
        {data.workers.length > 0 ? data.workers.map((w) => (
          <div key={w.name} className="flex items-center gap-4 p-3 rounded-lg border">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="size-5 text-primary" /></div>
            <div className="flex-1"><div className="flex items-center justify-between mb-1"><span className="text-sm font-medium">{w.name}</span><Badge variant={w.status === 'فعال' ? 'default' : w.status === 'خطا' ? 'destructive' : 'secondary'}>{w.status}</Badge></div>
              <div className="h-2 w-full rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${w.progress ?? 0}%` }} /></div>
              <p className="text-xs text-muted-foreground mt-1">✓ {w.tasksCompleted} تکمیل | ✗ {w.tasksFailed} ناموفق</p>
            </div>
          </div>
        )) : (
          <div className="text-center text-muted-foreground py-4">ورکری تعریف نشده</div>
        )}
      </CardContent></Card>
    </div>
  )
}
