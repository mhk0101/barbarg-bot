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
import { Plus, Play, Pause, Zap, Pencil, Trash2, Search, Loader2 } from 'lucide-react'

interface VehiclePlate { id: string; plateNumber: string; dailyCount: number; dailyTarget: number; enabled: boolean; status: string }
interface VehicleCard {
  id: string; vehicleType: string; status: string; trailerInfo: string | null; vehicleCard: string | null
  technicalInspection: string | null; vehicleInsurance: string | null
  driver: { name: string; id: string } | null; plates: VehiclePlate[]
  _count: { plates: number; waybills: number }
}

export default function VehicleCards() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [vehicles, setVehicles] = useState<VehicleCard[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editItem, setEditItem] = useState<VehicleCard | null>(null)
  const [form, setForm] = useState({ vehicleType: '', trailerInfo: '', driverId: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  const fetchVehicles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vehicles?search=${encodeURIComponent(search)}`)
      const data = await res.json()
      setVehicles(Array.isArray(data.data) ? data.data : [])
    } catch { setVehicles([]) }
    setLoading(false)
  }, [search])

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  const toggleVehicle = async (v: VehicleCard) => {
    const newStatus = v.status === 'active' ? 'paused' : 'active'
    try {
      await fetch(`/api/vehicles/${v.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
      setVehicles((prev) => prev.map((x) => x.id === v.id ? { ...x, status: newStatus } : x))
      toast.success('تغییر وضعیت')
    } catch { toast.error('خطا') }
  }

  const handleAdd = async () => {
    if (!form.vehicleType) { toast.error('نوع خودرو الزامی است'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/vehicles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Failed')
      toast.success('خودرو اضافه شد')
      setAddOpen(false); setForm({ vehicleType: '', trailerInfo: '', driverId: '' }); fetchVehicles()
    } catch { toast.error('خطا در افزودن') }
    setSaving(false)
  }

  const handleEdit = async () => {
    if (!editItem) return
    setSaving(true)
    try {
      await fetch(`/api/vehicles/${editItem.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('بروزرسانی شد')
      setEditOpen(false); setEditItem(null); fetchVehicles()
    } catch { toast.error('خطا در بروزرسانی') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/vehicles/${id}`, { method: 'DELETE' })
      toast.success('حذف شد'); fetchVehicles()
    } catch { toast.error('خطا در حذف') }
  }

  const confirmDelete = (id: string, name: string) => {
    setDeleteConfirm({ id, name })
  }

  const openEdit = (v: VehicleCard) => {
    setEditItem(v)
    setForm({ vehicleType: v.vehicleType, trailerInfo: v.trailerInfo || '', driverId: v.driver?.id || '' })
    setEditOpen(true)
  }

  const filtered = vehicles.filter((v) => {
    if (!search) return true
    return v.vehicleType.toLowerCase().includes(search.toLowerCase()) ||
      v.plates.some((p) => p.plateNumber.includes(search)) ||
      v.driver?.name?.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">مدیریت خودروها</h1><p className="text-muted-foreground">کارت‌های خودرو با ثبت سریع</p></div>
        <Button onClick={() => setAddOpen(true)}><Plus className="size-4 ml-2" /> افزودن خودرو</Button>
      </div>
      <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی نوع خودرو، پلاک یا راننده..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">خودرویی یافت نشد</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v, i) => {
            const totalCompleted = v.plates.reduce((sum, p) => sum + p.dailyCount, 0)
            const totalTarget = v.plates.reduce((sum, p) => sum + p.dailyTarget, 0)
            const remaining = Math.max(0, totalTarget - totalCompleted)
            const progress = totalTarget > 0 ? Math.min(100, (totalCompleted / totalTarget) * 100) : 0
            const isActive = v.status === 'active'
            const displayStatus = !isActive ? 'paused' : totalCompleted >= totalTarget && totalTarget > 0 ? 'completed' : 'active'

            return (
              <motion.div key={v.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className={`transition-all hover:shadow-lg hover:border-primary/30 ${!isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center"><span className="text-xs">🚛</span></div>
                        <div><p className="font-bold">{v.vehicleType}</p><p className="text-[10px] text-muted-foreground">{v._count.plates} پلاک | {v._count.waybills} باربرگ</p></div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`size-2 rounded-full ${displayStatus === 'active' ? 'bg-green-500 animate-pulse' : displayStatus === 'paused' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                        <Badge variant={displayStatus === 'active' ? 'default' : 'secondary'}>
                          {displayStatus === 'active' ? 'فعال' : displayStatus === 'paused' ? 'متوقف' : 'تکمیل'}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{v.driver?.name || 'بدون راننده'}</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">پیشرفت</span><span className="font-medium">{totalCompleted}/{totalTarget}</span></div>
                      <Progress value={progress} className="h-2" />
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        <span className="text-green-500">✓ {totalCompleted}</span>
                        <span className="text-red-500">✗ {v.plates.reduce((s, p) => s + Math.max(0, p.dailyTarget - p.dailyCount), 0)}</span>
                        <span className="text-muted-foreground">● {remaining}</span>
                      </div>
                    </div>

                    {v.trailerInfo && <p className="text-[10px] text-muted-foreground">تریلر: {v.trailerInfo}</p>}

                    <div className="flex gap-1.5 pt-2 border-t">
                      <Button size="sm" variant="default" className="flex-1 h-7 text-[11px]" onClick={() => router.push('/panel/quick-waybill')}>
                        <Zap className="size-3 ml-1" /> ثبت سریع
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => toggleVehicle(v)}>
                        {isActive ? <Pause className="size-3" /> : <Play className="size-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(v)}><Pencil className="size-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => confirmDelete(v.id, v.vehicleType)}><Trash2 className="size-3 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>افزودن خودرو</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-4">
            <div className="space-y-1.5"><Label className="text-sm">نوع خودرو <span className="text-destructive">*</span></Label><Input value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} placeholder="کامیون، تریلی، ون..." className="h-9" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-sm">اطلاعات تریلر</Label><Input value={form.trailerInfo} onChange={(e) => setForm((f) => ({ ...f, trailerInfo: e.target.value }))} className="h-9" /></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setAddOpen(false)}>لغو</Button><Button onClick={handleAdd} disabled={saving}>{saving ? '...' : 'ذخیره'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ویرایش خودرو</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-4">
            <div className="space-y-1.5"><Label className="text-sm">نوع خودرو</Label><Input value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-sm">اطلاعات تریلر</Label><Input value={form.trailerInfo} onChange={(e) => setForm((f) => ({ ...f, trailerInfo: e.target.value }))} className="h-9" /></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setEditOpen(false)}>لغو</Button><Button onClick={handleEdit} disabled={saving}>{saving ? '...' : 'ذخیره'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>حذف خودرو</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">آیا از حذف <span className="font-medium text-foreground">"{deleteConfirm?.name}"</span> مطمئن هستید؟</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>لغو</Button>
              <Button variant="destructive" onClick={() => { if (deleteConfirm) { handleDelete(deleteConfirm.id); setDeleteConfirm(null) } }}>
                <Trash2 className="size-4 ml-2" /> حذف
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
