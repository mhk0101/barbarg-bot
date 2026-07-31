'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Play, Pause, Zap, History, Settings, Search, Loader2, Trash2 } from 'lucide-react'

interface PlateCard {
  id: string; plateNumber: string; province: string; status: string; enabled: boolean
  dailyTarget: number; dailyCount: number; priority: number; workingStart: string; workingEnd: string
  driver: { name: string } | null; vehicle: { vehicleType: string } | null; account: { username: string } | null
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'فعال', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  paused: { label: 'متوقف', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  completed: { label: 'تکمیل', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
}

export default function PlateCards() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [plates, setPlates] = useState<PlateCard[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ plateNumber: '', province: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; plateNumber: string } | null>(null)

  const fetchPlates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/plates?search=${encodeURIComponent(search)}&limit=100`)
      const data = await res.json()
      setPlates(Array.isArray(data.data) ? data.data : [])
    } catch { setPlates([]) }
    setLoading(false)
  }, [search])

  useEffect(() => { fetchPlates() }, [fetchPlates])

  const togglePlate = async (plate: PlateCard) => {
    try {
      await fetch(`/api/plates/${plate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !plate.enabled, status: plate.enabled ? 'paused' : 'active' }),
      })
      setPlates((prev) => prev.map((p) => p.id === plate.id ? { ...p, enabled: !p.enabled, status: plate.enabled ? 'paused' : 'active' } : p))
      toast.success('تغییر وضعیت')
    } catch { toast.error('خطا در تغییر وضعیت') }
  }

  const handleAdd = async () => {
    if (!form.plateNumber || !form.province) { toast.error('فیلدهای الزامی را پر کنید'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/plates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Failed')
      toast.success('پلاک اضافه شد')
      setAddOpen(false)
      setForm({ plateNumber: '', province: '' })
      fetchPlates()
    } catch { toast.error('خطا در افزودن پلاک') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/plates/${id}`, { method: 'DELETE' })
      toast.success('پلاک حذف شد')
      setDeleteConfirm(null)
      fetchPlates()
    } catch { toast.error('خطا در حذف پلاک') }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">مدیریت پلاک‌ها</h1><p className="text-muted-foreground">کارت‌های پلاک با تنظیمات اتوماسیون</p></div>
        <Button onClick={() => setAddOpen(true)}><Plus className="size-4 ml-2" /> افزودن پلاک</Button>
      </div>

      <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی پلاک..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : plates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">پلاکی یافت نشد</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plates.map((plate, i) => {
            const remaining = Math.max(0, plate.dailyTarget - plate.dailyCount)
            const progress = Math.min(100, (plate.dailyCount / plate.dailyTarget) * 100)
            const displayStatus = !plate.enabled ? 'paused' : plate.dailyCount >= plate.dailyTarget ? 'completed' : 'active'
            const sc = statusConfig[displayStatus] || statusConfig.active

            return (
              <motion.div key={plate.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className={`transition-all hover:shadow-lg hover:border-primary/30 ${!plate.enabled ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center"><span className="text-xs font-bold text-primary">🚗</span></div>
                        <div><p className="font-mono font-bold">{plate.plateNumber}</p><p className="text-[10px] text-muted-foreground">{plate.province} | {plate.vehicle?.vehicleType || '-'}</p></div>
                      </div>
                      <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{plate.driver?.name || 'بدون راننده'}</span>
                      <Badge variant="outline" className="mr-auto text-[10px]">{plate.priority === 0 ? 'عادی' : plate.priority === 1 ? 'بالا' : 'پایین'}</Badge>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">پیشرفت</span><span className="font-medium">{plate.dailyCount}/{plate.dailyTarget}</span></div>
                      <Progress value={progress} className="h-2" />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>✓ {plate.dailyCount} تکمیل</span><span>● {remaining} باقیمانده</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>{plate.workingStart}-{plate.workingEnd}</span>
                      <Badge variant={plate.enabled ? 'default' : 'secondary'} className="mr-auto text-[9px] py-0">{plate.enabled ? 'اتوماسیون' : 'غیرفعال'}</Badge>
                    </div>

                    <div className="flex gap-1.5 pt-2 border-t">
                      <Button size="sm" variant="default" className="flex-1 h-7 text-[11px]" onClick={() => router.push('/panel/quick-waybill')}>
                        <Zap className="size-3 ml-1" /> ثبت سریع
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => togglePlate(plate)}>
                        {plate.enabled ? <Pause className="size-3" /> : <Play className="size-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => router.push('/panel/history')}><History className="size-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => router.push('/panel/plates')}><Settings className="size-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDeleteConfirm({ id: plate.id, plateNumber: plate.plateNumber })}><Trash2 className="size-3 text-destructive" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>افزودن پلاک</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-4">
            <div className="space-y-1.5"><Label className="text-sm">شماره پلاک <span className="text-destructive">*</span></Label><Input value={form.plateNumber} onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))} className="h-9" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-sm">استان <span className="text-destructive">*</span></Label><Input value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} className="h-9" /></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setAddOpen(false)}>لغو</Button><Button onClick={handleAdd} disabled={saving}>{saving ? '...' : 'ذخیره'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>حذف پلاک</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">آیا از حذف پلاک <span className="font-mono font-medium text-foreground">"{deleteConfirm?.plateNumber}"</span> مطمئن هستید؟</p>
            <p className="text-xs text-destructive">این عمل قابل بازگشت نیست.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>لغو</Button>
              <Button variant="destructive" onClick={() => { if (deleteConfirm) handleDelete(deleteConfirm.id) }}>
                <Trash2 className="size-4 ml-2" /> حذف
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
