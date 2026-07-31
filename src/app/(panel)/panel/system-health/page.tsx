'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Database,
  HardDrive,
  Server,
  Cpu,
  MemoryStick,
  Globe,
  FolderOpen,
  Monitor,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  Play,
  Pause,
  XOctagon,
  Tag,
} from 'lucide-react'

interface ComponentHealth {
  status: 'ok' | 'error' | 'degraded'
  message?: string
  lastCheck: string
  label: string
  [key: string]: unknown
}

interface HealthData {
  overallStatus: string
  timestamp: string
  components: Record<string, ComponentHealth>
  info: {
    version: string
    lastSuccessfulExecution: string | null
    lastFailedExecution: string | null
    lastDatabaseConnection: string | null
    lastRedisPing: string | null
    lastWorkerHeartbeat: string | null
  }
}

const STATUS_MAP = {
  ok: { color: 'bg-green-500', badge: 'default' as const, label: 'سالم' },
  error: { color: 'bg-red-500', badge: 'destructive' as const, label: 'خطا' },
  degraded: { color: 'bg-yellow-500', badge: 'secondary' as const, label: 'تخریب‌یافته' },
}

const OVERALL_MAP = {
  healthy: { label: 'سالم', badge: 'default' as const, icon: CheckCircle, color: 'text-green-500' },
  degraded: { label: 'تخریب‌یافته', badge: 'secondary' as const, icon: AlertTriangle, color: 'text-yellow-500' },
  critical: { label: 'بحرانی', badge: 'destructive' as const, icon: XCircle, color: 'text-red-500' },
}

const COMPONENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  postgresql: Database,
  redis: HardDrive,
  bullmq: Layers,
  worker: Server,
  playwright: Monitor,
  browserSessions: FolderOpen,
  website: Globe,
  storage: HardDrive,
  memory: MemoryStick,
  cpu: Cpu,
  queueStats: Activity,
  runningJobs: Play,
  failedJobs: XOctagon,
}

const INFO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  version: Tag,
  lastSuccessfulExecution: CheckCircle,
  lastFailedExecution: XCircle,
  lastDatabaseConnection: Database,
  lastRedisPing: HardDrive,
  lastWorkerHeartbeat: Server,
}

const INFO_LABELS: Record<string, string> = {
  version: 'نسخه',
  lastSuccessfulExecution: 'آخرین اجرای موفق',
  lastFailedExecution: 'آخرین اجرای ناموفق',
  lastDatabaseConnection: 'آخرین اتصال پایگاه داده',
  lastRedisPing: 'آخرین پینگ ردیس',
  lastWorkerHeartbeat: 'آخرین هارت‌بیت ورکر',
}

function StatusDot({ status }: { status: string }) {
  const info = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? STATUS_MAP.error
  return <span className={`inline-block size-2.5 rounded-full ${info.color}`} />
}

function formatPersianDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/system-health')
      const d = await res.json()
      if (d && typeof d === 'object') setData(d)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const i = setInterval(fetchData, 2000)
    return () => clearInterval(i)
  }, [fetchData])

  const overall = data ? OVERALL_MAP[data.overallStatus as keyof typeof OVERALL_MAP] ?? OVERALL_MAP.critical : null

  const componentEntries = data
    ? Object.entries(data.components).map(([key, comp]) => ({ key, ...comp }))
    : []

  const infoEntries = data
    ? Object.entries(data.info).map(([key, value]) => ({
        key,
        label: INFO_LABELS[key] ?? key,
        value,
        Icon: INFO_ICONS[key] ?? Clock,
      }))
    : []

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">سلامت سیستم</h1>
          <p className="text-muted-foreground">وضعیت تمام اجزای سیستم</p>
        </div>
        {data && overall && (
          <div className="flex items-center gap-3">
            <Badge variant={overall.badge} className="text-xs gap-1">
              {React.createElement(overall.icon, { className: "size-3" })}
              {overall.label}
            </Badge>
            <Badge variant="outline" className="text-xs gap-1">
              <RefreshCw className="size-3" />
              {formatPersianDate(data.timestamp)}
            </Badge>
          </div>
        )}
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <RefreshCw className="size-6 animate-spin ml-2" />
          در حال بارگذاری...
        </div>
      )}

      {data && overall && (
        <Card className={`border-2 ${data.overallStatus === 'healthy' ? 'border-green-500/30' : data.overallStatus === 'degraded' ? 'border-yellow-500/30' : 'border-red-500/30'}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`size-14 rounded-2xl flex items-center justify-center ${data.overallStatus === 'healthy' ? 'bg-green-500/10' : data.overallStatus === 'degraded' ? 'bg-yellow-500/10' : 'bg-red-500/10'}`}>
                {React.createElement(overall.icon, { className: `size-7 ${overall.color}` })}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">وضعیت کلی سیستم</p>
                <p className={`text-2xl font-bold ${overall.color}`}>{overall.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {componentEntries.map((comp, i) => {
            const Icon = COMPONENT_ICONS[comp.key] ?? Activity
            const st = STATUS_MAP[comp.status] ?? STATUS_MAP.error
            return (
              <motion.div
                key={comp.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="size-9 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="size-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{comp.label}</span>
                      </div>
                      <StatusDot status={comp.status} />
                    </div>
                    {comp.message && (
                      <p className="text-xs text-muted-foreground mb-2 truncate" title={String(comp.message)}>
                        {comp.message}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <Badge variant={st.badge} className="text-[10px]">{st.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{formatPersianDate(comp.lastCheck)}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {infoEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4" />
              اطلاعات سیستم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {infoEntries.map((item) => (
                <div key={item.key} className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <item.Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium truncate" title={String(item.value ?? '-')}>
                      {item.key === 'version'
                        ? `v${item.value}`
                        : typeof item.value === 'string'
                          ? formatPersianDate(item.value)
                          : String(item.value ?? '-')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
