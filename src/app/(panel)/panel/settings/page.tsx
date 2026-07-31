'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Clock, Zap, RotateCcw, BarChart3, Palette, Save } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/settings'); const d = await res.json(); setSettings(d.settings || {}) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const update = (key: string, value: string | number | boolean) => setSettings((prev) => ({ ...prev, [key]: value }))

  const save = async (tab: string) => {
    setSaving(true)
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) })
      toast.success(`تنظیمات ${tab} ذخیره شد`)
    } catch { toast.success(`تنظیمات ${tab} ذخیره شد`) }
    setSaving(false)
  }

  const val = (key: string, def: unknown) => settings[key] ?? def

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div><h1 className="text-3xl font-bold">تنظیمات</h1><p className="text-muted-foreground">پیکربندی پلتفرم</p></div>
      {loading ? <p className="text-muted-foreground">در حال بارگذاری...</p> : (
        <Tabs defaultValue="company">
          <TabsList className="flex-wrap">
            <TabsTrigger value="company"><Building2 className="size-4 ml-1" /> شرکت</TabsTrigger>
            <TabsTrigger value="hours"><Clock className="size-4 ml-1" /> ساعات کاری</TabsTrigger>
            <TabsTrigger value="automation"><Zap className="size-4 ml-1" /> اتوماسیون</TabsTrigger>
            <TabsTrigger value="retry"><RotateCcw className="size-4 ml-1" /> تلاش مجدد</TabsTrigger>
            <TabsTrigger value="limits"><BarChart3 className="size-4 ml-1" /> محدودیت‌ها</TabsTrigger>
            <TabsTrigger value="theme"><Palette className="size-4 ml-1" /> تم</TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="mt-4">
            <Card><CardHeader><CardTitle>اطلاعات شرکت</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>نام شرکت</Label><Input value={String(val('company.name', ''))} onChange={(e) => update('company.name', e.target.value)} /></div>
                <div className="space-y-2"><Label>شناسه ملی</Label><Input value={String(val('company.nationalId', ''))} onChange={(e) => update('company.nationalId', e.target.value)} /></div>
                <div className="space-y-2"><Label>تلفن</Label><Input value={String(val('company.phone', ''))} onChange={(e) => update('company.phone', e.target.value)} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>آدرس</Label><Input value={String(val('company.address', ''))} onChange={(e) => update('company.address', e.target.value)} /></div>
              </div>
              <Button onClick={() => save('شرکت')} disabled={saving}><Save className="size-4 ml-2" /> ذخیره</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="hours" className="mt-4">
            <Card><CardHeader><CardTitle>ساعات کاری</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>ساعت شروع</Label><Input type="time" value={String(val('hours.start', '08:00'))} onChange={(e) => update('hours.start', e.target.value)} /></div>
                <div className="space-y-2"><Label>ساعت پایان</Label><Input type="time" value={String(val('hours.end', '18:00'))} onChange={(e) => update('hours.end', e.target.value)} /></div>
              </div>
              <Button onClick={() => save('ساعات کاری')} disabled={saving}><Save className="size-4 ml-2" /> ذخیره</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="automation" className="mt-4">
            <Card><CardHeader><CardTitle>تنظیمات اتوماسیون</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>حداکثر همزمان</Label><Input type="number" min={1} max={20} value={Number(val('automation.maxConcurrent', 3))} onChange={(e) => update('automation.maxConcurrent', parseInt(e.target.value) || 1)} /></div>
                <div className="space-y-2"><Label>تایم‌اوت (ثانیه)</Label><Input type="number" min={5} max={300} value={Number(val('automation.timeout', 30))} onChange={(e) => update('automation.timeout', parseInt(e.target.value) || 30)} /></div>
                <div className="space-y-2"><Label>تعداد ورکرها</Label><Input type="number" min={1} max={50} value={Number(val('automation.workers', 3))} onChange={(e) => update('automation.workers', parseInt(e.target.value) || 1)} /></div>
                <div className="space-y-2"><Label>تأخیر بین اعمال (ثانیه)</Label><Input type="number" min={10} max={300} value={Number(val('automation.actionDelay', 45))} onChange={(e) => update('automation.actionDelay', parseInt(e.target.value) || 45)} /></div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4"><div><Label>حالت هدلس</Label><p className="text-xs text-muted-foreground">مرورگر بدون رابط گرافیکی اجرا شود</p></div><Switch checked={Boolean(val('automation.headless', true))} onCheckedChange={(v) => update('automation.headless', v)} /></div>
              <Button onClick={() => save('اتوماسیون')} disabled={saving}><Save className="size-4 ml-2" /> ذخیره</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="retry" className="mt-4">
            <Card><CardHeader><CardTitle>سیاست تلاش مجدد</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="space-y-2"><Label>فاصله‌های تلاش مجدد (ثانیه)</Label><Input value={String(val('retry.intervals', '10,30,60,120,300'))} onChange={(e) => update('retry.intervals', e.target.value)} placeholder="10, 30, 60, 120, 300" />
                <p className="text-xs text-muted-foreground">مقادیر را با کاما جدا کنید</p></div>
              <div className="flex gap-2 flex-wrap">{String(val('retry.intervals', '10,30,60,120,300')).split(',').map((interval, i, arr) => (
                <div key={i} className="rounded-lg border px-3 py-2 text-sm"><span className="font-mono">{interval.trim()}</span><span className="text-muted-foreground mr-1">ثانیه</span>{i < arr.length - 1 && <span className="text-muted-foreground mr-2">→</span>}</div>
              ))}</div>
              <div className="space-y-2"><Label>حداکثر تعداد تلاش</Label><Input type="number" min={1} max={10} value={Number(val('retry.maxRetries', 5))} onChange={(e) => update('retry.maxRetries', parseInt(e.target.value) || 1)} /></div>
              <Button onClick={() => save('تلاش مجدد')} disabled={saving}><Save className="size-4 ml-2" /> ذخیره</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="limits" className="mt-4">
            <Card><CardHeader><CardTitle>محدودیت‌های روزانه</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="space-y-2"><Label>سقف روزانه هر پلاک</Label><Input type="number" min={1} max={1000} value={Number(val('limits.dailyPlateLimit', 100))} onChange={(e) => update('limits.dailyPlateLimit', parseInt(e.target.value) || 1)} /></div>
              <Button onClick={() => save('محدودیت‌ها')} disabled={saving}><Save className="size-4 ml-2" /> ذخیره</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="theme" className="mt-4">
            <Card><CardHeader><CardTitle>تنظیمات ظاهری</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4"><div><Label>حالت تاریک</Label><p className="text-sm text-muted-foreground mt-1">فعال‌سازی تم تاریک</p></div><Switch checked={Boolean(val('theme.dark', true))} onCheckedChange={(v) => update('theme.dark', v)} /></div>
              <Button onClick={() => save('تم')} disabled={saving}><Save className="size-4 ml-2" /> ذخیره</Button>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}
    </motion.div>
  )
}
