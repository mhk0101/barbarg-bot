'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, AlertTriangle, XCircle, Info, BellOff, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface Notification { id: string; type: string; title: string; message: string; read: boolean; createdAt: string }

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'موفق' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'هشدار' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'خطا' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'سیستم' },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/notifications'); const d = await res.json(); setNotifications(Array.isArray(d.data) ? d.data : []) } catch { setNotifications([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])
  usePolling(fetchNotifications, 15000)

  const unreadCount = notifications.filter((n) => !n.read).length
  const markAsRead = async (id: string) => { await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n)) }
  const markAllRead = async () => { await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAll: true }) }); setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))); toast.success('همه خوانده شد') }
  const filtered = notifications.filter((n) => activeTab === 'all' || (activeTab === 'unread' && !n.read) || n.type === activeTab)

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><div className="flex items-center gap-3"><h1 className="text-3xl font-bold">اعلان‌ها</h1>{unreadCount > 0 && <Badge variant="destructive">{unreadCount}</Badge>}</div><p className="text-muted-foreground">مدیریت اعلان‌ها</p></div>
        <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}><BellOff className="size-4 ml-2" /> خواندن همه</Button>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList><TabsTrigger value="all">همه</TabsTrigger><TabsTrigger value="unread">خوانده نشده</TabsTrigger><TabsTrigger value="success">موفق</TabsTrigger><TabsTrigger value="warning">هشدار</TabsTrigger><TabsTrigger value="error">خطا</TabsTrigger><TabsTrigger value="info">سیستم</TabsTrigger></TabsList>
        <TabsContent value={activeTab} className="mt-4"><Card><CardContent className="p-0"><div className="divide-y">
          {loading ? <div className="py-8 text-center text-muted-foreground">در حال بارگذاری...</div> : filtered.length === 0 ? <div className="flex flex-col items-center py-12 text-muted-foreground"><p>اعلانی وجود ندارد</p></div> : filtered.map((n) => {
            const config = typeConfig[n.type] || typeConfig.info
            const Icon = config.icon
            return (<div key={n.id} className={`flex items-start gap-4 p-4 hover:bg-muted/50 cursor-pointer ${!n.read ? 'bg-muted/30' : ''}`} onClick={() => markAsRead(n.id)}>
              <div className={`rounded-lg p-2 ${config.bg} mt-0.5`}><Icon className={`size-5 ${config.color}`} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><h3 className={`font-medium ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</h3><Badge variant="outline" className="text-xs">{config.label}</Badge></div>
                <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground"><Clock className="size-3" />{new Date(n.createdAt).toLocaleString('fa')}</div>
              </div>
              {!n.read && <div className="mt-2 size-2.5 rounded-full bg-blue-500 shrink-0" />}
            </div>)
          })}
        </div></CardContent></Card></TabsContent>
      </Tabs>
    </motion.div>
  )
}
