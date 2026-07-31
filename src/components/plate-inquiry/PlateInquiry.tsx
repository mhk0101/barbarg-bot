'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Download, Search, FileText, Loader2 } from 'lucide-react'

const PlateStatusChart = dynamic(
  () => import('./PlateInquiryCharts').then((m) => ({ default: m.PlateStatusChart })),
  { ssr: false, loading: () => <div className="h-[250px] w-full animate-pulse rounded bg-muted" /> }
)

interface PlateRecord { id: string; plateNumber: string; waybillNumber: string; status: string; driver: string; origin: string; dest: string; createdAt: string; error: string | null }
interface Stats { total: number; completed: number; failed: number; pending: number | { _count: { id: number } } }

const statusColor: Record<string, string> = { 'موفق': 'bg-green-500/10 text-green-500', 'ناموفق': 'bg-red-500/10 text-red-500', 'لغو شده': 'bg-gray-500/10 text-gray-500', 'در انتظار': 'bg-yellow-500/10 text-yellow-500' }

export default function PlateInquiry() {
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState<PlateRecord[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, failed: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/plate-inquiry?plate=${encodeURIComponent(search)}`)
      const data = await res.json()
      setRecords(Array.isArray(data.records) ? data.records : [])
      setStats(data.stats || { total: 0, completed: 0, failed: 0, pending: 0 })
    } catch { setRecords([]) }
    setLoading(false)
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const pendingCount = typeof stats.pending === 'object' ? (stats.pending as { _count: { id: number } })?._count?.id || 0 : stats.pending

  const chartData = [
    { name: 'موفق', value: stats.completed, color: '#22c55e' },
    { name: 'ناموفق', value: stats.failed, color: '#ef4444' },
    { name: 'در انتظار', value: pendingCount, color: '#eab308' },
  ].filter((d) => d.value > 0)

  const handleExport = () => {
    const csv = ['شماره پلاک,شماره باربرگ,وضعیت,راننده,مبدأ,مقصد,تاریخ']
    records.forEach((r) => csv.push(`${r.plateNumber},${r.waybillNumber},${r.status},${r.driver},${r.origin},${r.dest},${r.createdAt}`))
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plate-inquiry.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('خروجی اکسل')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">استعلام پلاک</h1><p className="text-muted-foreground">جستجو و بررسی تاریخچه پلاک‌ها</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}><Download className="size-4 ml-2" /> اکسل</Button>
          <Button variant="outline" onClick={() => toast.info('قابلیت PDF به زودی')}><FileText className="size-4 ml-2" /> PDF</Button>
        </div>
      </div>

      <Card><CardContent className="p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1"><label className="text-xs text-muted-foreground">شماره پلاک</label><Input placeholder="جستجوی پلاک..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">فیلتر وضعیت</label><select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option>همه</option><option>موفق</option><option>ناموفق</option><option>در انتظار</option></select></div>
        <div className="flex items-end"><Button onClick={fetchData} className="w-full"><Search className="size-4 ml-2" /> جستجو</Button></div>
      </div></CardContent></Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">کل نتایج</p><p className="text-xl font-bold">{stats.total.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">موفق</p><p className="text-xl font-bold text-green-500">{stats.completed.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ناموفق</p><p className="text-xl font-bold text-red-500">{stats.failed.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">در انتظار</p><p className="text-xl font-bold text-yellow-500">{pendingCount.toLocaleString('fa')}</p></CardContent></Card>
      </div>

      {chartData.length > 0 && (
        <PlateStatusChart data={chartData} />
      )}

      <Card><CardHeader><CardTitle>{loading ? 'در حال بارگذاری...' : `${records.length} رکورد`}</CardTitle></CardHeader><CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-right text-muted-foreground"><th className="pb-3 font-medium">شماره پلاک</th><th className="pb-3 font-medium">شماره باربرگ</th><th className="pb-3 font-medium">تاریخ</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">راننده</th><th className="pb-3 font-medium">مبدأ</th><th className="pb-3 font-medium">مقصد</th></tr></thead>
              <tbody>{records.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
              ) : records.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-3 font-mono font-medium">{r.plateNumber}</td>
                  <td className="py-3 font-mono text-xs">{r.waybillNumber}</td>
                  <td className="py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('fa-IR')}</td>
                  <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status}</span></td>
                  <td className="py-3">{r.driver}</td>
                  <td className="py-3">{r.origin}</td>
                  <td className="py-3">{r.dest}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </motion.div>
  )
}
