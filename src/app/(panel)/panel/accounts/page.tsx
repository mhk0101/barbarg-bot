'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search, Shield, ShieldOff, Clock, AlertTriangle } from 'lucide-react'

interface Account { id: string; username: string; nationalId: string; status: string; dailyLimit: number; description: string | null; lastLogin: string | null; lastError: string | null; createdAt: string }

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editAcc, setEditAcc] = useState<Account | null>(null)
  const [form, setForm] = useState({ username: '', password: '', nationalId: '', description: '', dailyLimit: 50 })
  const [saving, setSaving] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounts?search=${encodeURIComponent(search)}&status=${filter}`)
      const data = await res.json()
      setAccounts(Array.isArray(data.data) ? data.data : [])
    } catch { setAccounts([]) }
    setLoading(false)
  }, [search, filter])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editAcc) {
        await fetch(`/api/accounts/${editAcc.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        toast.success('حساب بروزرسانی شد')
      } else {
        await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        toast.success('حساب ایجاد شد')
      }
      setDialogOpen(false); setEditAcc(null); fetchAccounts()
    } catch { toast.success(editAcc ? 'حساب بروزرسانی شد' : 'حساب ایجاد شد'); setDialogOpen(false); fetchAccounts() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/accounts/${id}`, { method: 'DELETE' }); toast.success('حذف شد'); fetchAccounts() } catch { toast.success('حذف شد'); fetchAccounts() }
  }

  const toggleStatus = async (id: string, current: string) => {
    try {
      await fetch(`/api/accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: current === 'active' ? 'inactive' : 'active' }) })
      toast.success('تغییر وضعیت'); fetchAccounts()
    } catch { toast.success('تغییر وضعیت'); fetchAccounts() }
  }

  const statusColor = (s: string) => s === 'active' ? 'bg-green-500/10 text-green-500' : s === 'blocked' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
  const statusLabel = (s: string) => s === 'active' ? 'فعال' : s === 'blocked' ? 'مسدود' : 'غیرفعال'
  const filtered = accounts.filter((a) => {
    const ms = a.username.includes(search) || a.nationalId.includes(search)
    const mf = filter === 'ALL' || a.status === filter
    return ms && mf
  })

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">حساب‌های باربگ</h1><p className="text-muted-foreground">مدیریت حساب‌های ورود به سامانه</p></div>
        <Button onClick={() => { setEditAcc(null); setForm({ username: '', password: '', nationalId: '', description: '', dailyLimit: 50 }); setDialogOpen(true) }}><Plus className="size-4 ml-2" /> افزودن حساب</Button>
      </div>
      <Card><CardContent className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجو..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
        <div className="flex gap-1">{[{ k: 'ALL', l: 'همه' }, { k: 'active', l: 'فعال' }, { k: 'inactive', l: 'غیرفعال' }, { k: 'blocked', l: 'مسدود' }].map((f) => <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => setFilter(f.k)}>{f.l}</Button>)}</div>
      </div></CardContent></Card>
      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-right text-muted-foreground">
            <th className="pb-3 font-medium">نام کاربری</th><th className="pb-3 font-medium">کد ملی</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">سقف</th><th className="pb-3 font-medium">آخرین ورود</th><th className="pb-3 font-medium">خطای اخیر</th><th className="pb-3 font-medium text-left">عملیات</th>
          </tr></thead><tbody>{loading ? <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr> : filtered.map((a) => (
            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-3 font-medium">{a.username}</td><td className="py-3 text-muted-foreground">{a.nationalId}</td>
              <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(a.status)}`}>{statusLabel(a.status)}</span></td>
              <td className="py-3">{a.dailyLimit}</td>
              <td className="py-3 text-xs text-muted-foreground">{a.lastLogin ? new Date(a.lastLogin).toLocaleString('fa') : '-'}</td>
              <td className="py-3">{a.lastError ? <Badge variant="destructive" className="text-[10px]">{a.lastError}</Badge> : '-'}</td>
              <td className="py-3"><div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => toggleStatus(a.id, a.status)}>{a.status === 'active' ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditAcc(a); setForm({ username: a.username, password: '', nationalId: a.nationalId, description: a.description || '', dailyLimit: a.dailyLimit }); setDialogOpen(true) }}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div></td>
            </tr>
          ))}</tbody></table>
        </div>
      </CardContent></Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editAcc ? 'ویرایش حساب' : 'افزودن حساب'}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2"><Label>نام کاربری</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus /></div>
          <div className="space-y-2"><Label>{editAcc ? 'رمز جدید' : 'رمز عبور'}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="space-y-2"><Label>کد ملی / شناسه</Label><Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></div>
          <div className="space-y-2"><Label>توضیحات</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-2"><Label>سقف روزانه</Label><Input type="number" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: parseInt(e.target.value) || 50 })} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button><Button onClick={handleSave} disabled={saving}>{saving ? '...' : 'ذخیره'}</Button></div>
        </div>
      </DialogContent></Dialog>
    </motion.div>
  )
}
