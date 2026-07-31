'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Download } from 'lucide-react'
import { toast } from 'sonner'

interface LogEntry { id: string; action: string; resource: string; details: Record<string, unknown> | null; createdAt: string }

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch(`/api/activity-logs?search=${encodeURIComponent(search)}`); const d = await res.json(); setLogs(Array.isArray(d.data) ? d.data : []) } catch { setLogs([]) }
    setLoading(false)
  }, [search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">لاگ‌ها</h1><p className="text-muted-foreground">لاگ سیستم</p></div>
        <Button variant="outline" onClick={() => toast.success('خروجی')}><Download className="size-4 ml-2" /> خروجی</Button>
      </div>
      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجو..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div></CardContent></Card>
      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-right text-muted-foreground">
            <th className="pb-3 font-medium">زمان</th><th className="pb-3 font-medium">عملیت</th><th className="pb-3 font-medium">منبع</th><th className="pb-3 font-medium">جزئیات</th>
          </tr></thead><tbody>{loading ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr> : logs.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">لاگی یافت نشد</td></tr> : logs.map((l) => (
            <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(l.createdAt).toLocaleString('fa')}</td>
              <td className="py-3 font-medium">{l.action}</td>
              <td className="py-3"><Badge variant="outline">{l.resource}</Badge></td>
              <td className="py-3 text-xs text-muted-foreground max-w-[200px] truncate">{l.details ? JSON.stringify(l.details) : '-'}</td>
            </tr>
          ))}</tbody></table>
        </div>
      </CardContent></Card>
    </motion.div>
  )
}
