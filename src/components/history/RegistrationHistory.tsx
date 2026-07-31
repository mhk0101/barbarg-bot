'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Download, Search, Loader2 } from 'lucide-react'

interface HistoryEntry {
  id: string; plateNumber: string; waybillNumber: string; status: string; driver: string
  createdAt: string; completedAt: string | null; attempts: number; error: string | null
}

export default function RegistrationHistory() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [records, setRecords] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0 })
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/history?search=${encodeURIComponent(search)}&status=${filter}`)
      const data = await res.json()
      setRecords(Array.isArray(data.records) ? data.records : [])
      setStats(data.stats || { total: 0, completed: 0, failed: 0 })
    } catch { setRecords([]) }
    setLoading(false)
  }, [search, filter])

  useEffect(() => { fetchData() }, [fetchData])

  const statusConfig: Record<string, { label: string; color: string }> = {
    completed: { label: 'موفق', color: 'bg-green-500/10 text-green-500' },
    failed: { label: 'ناموفق', color: 'bg-red-500/10 text-red-500' },
    pending: { label: 'در انتظار', color: 'bg-yellow-500/10 text-yellow-500' },
    active: { label: 'در حال اجرا', color: 'bg-blue-500/10 text-blue-500' },
  }

  const handleExport = () => {
    const csv = ['پلاک,شماره باربرگ,وضعیت,راننده,تاریخ,تلاش‌ها,پیام خطا']
    records.forEach((r) => csv.push(`${r.plateNumber},${r.waybillNumber},${r.status},${r.driver},${r.createdAt},${r.attempts},${r.error || ''}`))
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'registration-history.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('خروجی اکسل')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">تاریخچه ثبت باربرگ</h1><p className="text-muted-foreground">تاریخچه تمام ثبت‌نام‌های انجام شده</p></div>
        <Button variant="outline" onClick={handleExport}><Download className="size-4 ml-2" /> خروجی</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">کل</p><p className="text-2xl font-bold">{stats.total.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">موفق</p><p className="text-2xl font-bold text-green-500">{stats.completed.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ناموفق</p><p className="text-2xl font-bold text-red-500">{stats.failed.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">نرخ موفقیت</p><p className="text-2xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی پلاک، باربرگ یا راننده..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
        <div className="flex gap-1">{[
          { k: 'ALL', l: 'همه' }, { k: 'completed', l: 'موفق' }, { k: 'failed', l: 'ناموفق' }, { k: 'pending', l: 'در انتظار' },
        ].map((f) => <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => setFilter(f.k)}>{f.l}</Button>)}</div>
      </div></CardContent></Card>

      <Card><CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-right text-muted-foreground">
                <th className="pb-3 font-medium">پلاک</th><th className="pb-3 font-medium">شماره باربرگ</th><th className="pb-3 font-medium">تاریخ</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">راننده</th><th className="pb-3 font-medium">تلاش‌ها</th><th className="pb-3 font-medium">پیام</th>
              </tr></thead>
              <tbody>{records.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
              ) : records.map((h) => {
                const sc = statusConfig[h.status] || statusConfig.pending
                return (<tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-3 font-mono">{h.plateNumber}</td><td className="py-3 font-mono text-xs">{h.waybillNumber}</td>
                  <td className="py-3 text-muted-foreground">{new Date(h.createdAt).toLocaleDateString('fa-IR')}</td>
                  <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sc.color}`}>{sc.label}</span></td>
                  <td className="py-3">{h.driver}</td><td className="py-3 text-center">{h.attempts}</td>
                  <td className="py-3 text-xs max-w-[200px] truncate">{h.error || '—'}</td>
                </tr>)
              })}</tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </motion.div>
  )
}
