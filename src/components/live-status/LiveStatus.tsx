'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { RefreshCw, Bot, Cpu, Activity } from 'lucide-react'

export default function LiveStatus() {
  const [data, setData] = useState({ running: false, paused: false, completed: 0, failed: 0, pending: 0, active: 0 })
  const [logs, setLogs] = useState<Array<{ id: string; level: string; message: string; timestamp: string }>>([])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/trigger')
      const d = await res.json()
      if (d.status) setData({ running: d.status.running, paused: d.status.paused, completed: d.queue?.completed || 0, failed: d.queue?.failed || 0, pending: d.queue?.pending || 0, active: d.queue?.active || 0 })
      if (d.logs) setLogs(d.logs)
    } catch {}
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  usePolling(fetchData, 3000)

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div><h1 className="text-3xl font-bold">وضعیت بلادرنگ</h1><p className="text-muted-foreground">نظارت زنده بر عملکرد سیستم</p></div>

      <Card><CardContent className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className={`size-4 rounded-full ${data.running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-xl font-bold">{data.running ? 'در حال اجرا' : 'متوقف'}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: 'در انتظار', v: data.pending, c: 'text-yellow-500' },
            { l: 'در حال اجرا', v: data.active, c: 'text-blue-500' },
            { l: 'تکمیل شده', v: data.completed, c: 'text-green-500' },
            { l: 'ناموفق', v: data.failed, c: 'text-red-500' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{s.l}</p><p className={`text-2xl font-bold ${s.c}`}>{s.v}</p></div>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>لاگ بلادرنگ</CardTitle></CardHeader><CardContent>
        <div className="space-y-1 max-h-[300px] overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? <p className="text-center text-muted-foreground py-8">لاگی موجود نیست</p> : logs.map((log) => (
            <div key={log.id} className="flex items-center gap-3 rounded px-3 py-1.5 hover:bg-muted/30">
              <span className="text-muted-foreground w-16 text-[10px]">{new Date(log.timestamp).toLocaleTimeString('fa')}</span>
              <Badge variant={log.level === 'error' ? 'destructive' : log.level === 'success' ? 'default' : 'secondary'} className="w-14 justify-center text-[10px]">
                {log.level === 'error' ? 'خطا' : log.level === 'success' ? 'موفق' : 'اطلاعات'}
              </Badge>
              <span className="text-xs">{log.message}</span>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </motion.div>
  )
}
