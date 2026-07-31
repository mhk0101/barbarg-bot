'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Cpu, RotateCcw, Eye, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface Worker { id: string; name: string; status: string; lastHeartbeat: string | null; tasksCompleted: number; tasksFailed: number }

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkers = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/automation/workers'); const d = await res.json(); setWorkers(Array.isArray(d.workers) ? d.workers : []) } catch { setWorkers([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])
  usePolling(fetchWorkers, 5000)

  const activeCount = workers.filter((w) => w.status === 'active').length
  const totalCompleted = workers.reduce((s, w) => s + (w.tasksCompleted || 0), 0)
  const totalFailed = workers.reduce((s, w) => s + (w.tasksFailed || 0), 0)
  const errorRate = totalCompleted > 0 ? ((totalFailed / totalCompleted) * 100).toFixed(1) : '0'

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">مدیریت ورکرها</h1><p className="text-muted-foreground">نظارت و مدیریت ورکرهای پردازش</p></div>
        <Button variant="outline" onClick={fetchWorkers}><RefreshCw className="size-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">ورکرهای فعال</p><p className="text-2xl font-bold text-green-500">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">کل وظایف انجام شده</p><p className="text-2xl font-bold">{totalCompleted.toLocaleString('fa')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">نرخ خطا</p><p className="text-2xl font-bold text-red-500">{errorRate}٪</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? <div className="col-span-2 py-8 text-center text-muted-foreground">در حال بارگذاری...</div> : workers.length === 0 ? (
          <div className="col-span-2 py-8 text-center text-muted-foreground">ورکری یافت نشد</div>
        ) : workers.map((w) => (
          <Card key={w.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{w.name}</span>
                <Badge variant={w.status === 'active' ? 'default' : w.status === 'error' ? 'destructive' : 'secondary'}>
                  {w.status === 'active' ? 'فعال' : w.status === 'error' ? 'خطا' : 'بیکار'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>انجام شده: {w.tasksCompleted}</span>
                <span>ناموفق: {w.tasksFailed}</span>
              </div>
              <p className="text-xs text-muted-foreground">آخرین ضربان قلب: {w.lastHeartbeat ? new Date(w.lastHeartbeat).toLocaleString('fa') : '-'}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.success('ریستارت شد')}><RotateCcw className="size-3 ml-1" /> ریستارت</Button>
                <Button size="sm" variant="ghost" onClick={() => toast.info('لاگ')}><Eye className="size-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  )
}
