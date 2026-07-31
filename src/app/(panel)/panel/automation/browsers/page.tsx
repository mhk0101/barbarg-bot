'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Globe, RefreshCw } from 'lucide-react'

interface Session { accountId: string; lastModified: string; size: number }

export default function BrowsersPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/automation/browsers'); const d = await res.json(); setSessions(Array.isArray(d.sessions) ? d.sessions : []) } catch { setSessions([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">نشست‌های مرورگر</h1><p className="text-muted-foreground">مدیریت نشست‌های Playwright</p></div>
        <Button variant="outline" onClick={fetchSessions}><RefreshCw className="size-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">نشست‌های فعال</p><p className="text-2xl font-bold text-green-500">{sessions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">حافظه مصرفی</p><p className="text-2xl font-bold">{(sessions.reduce((s, ss) => s + (ss.size || 0), 0) / 1024).toFixed(1)} KB</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">وضعیت مرورگر</p><div className="flex items-center gap-2"><Badge variant="default">متصل</Badge></div></CardContent></Card>
      </div>

      <Card><CardContent>
        {loading ? <p className="py-8 text-center text-muted-foreground">در حال بارگذاری...</p> : sessions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">نشستی ذخیره نشده</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.accountId} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <Globe className="size-5 text-green-500" />
                  <div><p className="font-medium">{s.accountId}</p><p className="text-xs text-muted-foreground">{(s.size / 1024).toFixed(1)} KB</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="default">فعال</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(s.lastModified).toLocaleString('fa')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </motion.div>
  )
}
