'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Eye, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Waybill { id: string; waybillNumber: string | null; status: string; senderId: string | null; receiverId: string | null; driverId: string | null; originProvince: string | null; destProvince: string | null; createdAt: string }

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: 'پیش‌نویس', color: 'bg-gray-500/10 text-gray-500' },
  submitted: { label: 'ارسال شده', color: 'bg-blue-500/10 text-blue-500' },
  completed: { label: 'تکمیل', color: 'bg-green-500/10 text-green-500' },
  failed: { label: 'ناموفق', color: 'bg-red-500/10 text-red-500' },
}

export default function WaybillsPage() {
  const router = useRouter()
  const [waybills, setWaybills] = useState<Waybill[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  const fetchWaybills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/waybills?search=${encodeURIComponent(search)}&status=${filter}`)
      const data = await res.json()
      setWaybills(Array.isArray(data.data) ? data.data : [])
    } catch { setWaybills([]) }
    setLoading(false)
  }, [search, filter])

  useEffect(() => { fetchWaybills() }, [fetchWaybills])

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/waybills/${id}`, { method: 'DELETE' }); toast.success('حذف شد'); fetchWaybills() } catch { fetchWaybills() }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">باربرگ‌ها</h1><p className="text-muted-foreground">لیست تمام باربرگ‌های ثبت شده</p></div>
        <Button onClick={() => router.push('/panel/waybills/new')}><Plus className="size-4 ml-2" /> باربرگ جدید</Button>
      </div>
      <Card><CardContent className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجو..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="flex gap-1">{[{ k: 'ALL', l: 'همه' }, { k: 'draft', l: 'پیش‌نویس' }, { k: 'submitted', l: 'ارسال شده' }, { k: 'completed', l: 'تکمیل' }, { k: 'failed', l: 'ناموفق' }].map((f) => <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => setFilter(f.k)}>{f.l}</Button>)}</div>
      </div></CardContent></Card>
      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-right text-muted-foreground">
            <th className="pb-3 font-medium">شماره</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">مبدأ</th><th className="pb-3 font-medium">مقصد</th><th className="pb-3 font-medium">تاریخ</th><th className="pb-3 font-medium text-left">عملیات</th>
          </tr></thead><tbody>{loading ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr> : waybills.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr> : waybills.map((w) => {
            const sc = statusMap[w.status] || statusMap.draft
            return (<tr key={w.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-3 font-mono font-medium">{w.waybillNumber || '-'}</td>
              <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sc.color}`}>{sc.label}</span></td>
              <td className="py-3">{w.originProvince || '-'}</td><td className="py-3">{w.destProvince || '-'}</td>
              <td className="py-3 text-muted-foreground text-xs">{new Date(w.createdAt).toLocaleDateString('fa')}</td>
              <td className="py-3"><div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => toast.info('مشاهده')}><Eye className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(w.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div></td>
            </tr>)
          })}</tbody></table>
        </div>
      </CardContent></Card>
    </motion.div>
  )
}
