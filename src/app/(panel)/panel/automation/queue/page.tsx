'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListOrdered, RefreshCw, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'

interface QueueJob { id: string; type: string; status: string; attempts: number; createdAt: string; startedAt: string | null; completedAt: string | null; error: string | null }

const statusMap: Record<string, { l: string; c: string }> = {
  pending: { l: 'در انتظار', c: 'bg-yellow-500/10 text-yellow-500' },
  processing: { l: 'در حال اجرا', c: 'bg-blue-500/10 text-blue-500' },
  completed: { l: 'تکمیل', c: 'bg-green-500/10 text-green-500' },
  failed: { l: 'ناموفق', c: 'bg-red-500/10 text-red-500' },
  cancelled: { l: 'لغو شده', c: 'bg-gray-500/10 text-gray-500' },
}

export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, pending: 0, processing: 0, completed: 0, failed: 0 })

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/automation/tasks')
      const data = await res.json()
      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
      if (data.stats) setStats(data.stats)
    } catch { setJobs([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])
  usePolling(fetchJobs, 5000)

  const handleRetry = async (id: string) => {
    try { await fetch('/api/automation/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry', jobId: id }) }); toast.success('تلاش مجدد'); fetchJobs() } catch { toast.error('خطا') }
  }

  const handleCancel = async (id: string) => {
    try { await fetch('/api/automation/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', jobId: id }) }); toast.success('لغو شد'); fetchJobs() } catch { toast.error('خطا') }
  }

  const filtered = jobs.filter((j) => j.id.includes(search) || j.type.includes(search))

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">مدیریت صف</h1><p className="text-muted-foreground">مشاهده و مدیریت صف وظایف</p></div>
        <Button variant="outline" onClick={fetchJobs}><RefreshCw className="size-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">کل</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">در انتظار</p><p className="text-2xl font-bold text-yellow-500">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">در حال اجرا</p><p className="text-2xl font-bold text-blue-500">{stats.processing}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">تکمیل</p><p className="text-2xl font-bold text-green-500">{stats.completed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ناموفق</p><p className="text-2xl font-bold text-red-500">{stats.failed}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجو..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div></CardContent></Card>

      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-right text-muted-foreground">
              <th className="pb-3 font-medium">شناسه</th><th className="pb-3 font-medium">نوع</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">تلاش</th><th className="pb-3 font-medium">ایجاد</th><th className="pb-3 font-medium text-left">عملیات</th>
            </tr></thead>
            <tbody>{loading ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr> : filtered.map((j) => {
              const sc = statusMap[j.status] || statusMap.pending
              return (
                <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-3 font-mono text-xs">{j.id.slice(0, 12)}...</td>
                  <td className="py-3 text-sm">{j.type}</td>
                  <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sc.c}`}>{sc.l}</span></td>
                  <td className="py-3 text-center">{j.attempts}</td>
                  <td className="py-3 text-xs text-muted-foreground">{new Date(j.createdAt).toLocaleString('fa')}</td>
                  <td className="py-3"><div className="flex gap-1">
                    {j.status === 'failed' && <Button size="sm" variant="ghost" onClick={() => handleRetry(j.id)}><RefreshCw className="size-4" /></Button>}
                    {(j.status === 'pending' || j.status === 'processing') && <Button size="sm" variant="ghost" onClick={() => handleCancel(j.id)}><Trash2 className="size-4 text-destructive" /></Button>}
                  </div></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </CardContent></Card>
    </motion.div>
  )
}
