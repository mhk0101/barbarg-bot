'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search, Shield, ShieldOff, Eye, EyeOff, Users, UserCheck, UserX, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight, Clock, Download } from 'lucide-react'

interface BarbargAccount { id: string; accountName: string; username: string; company: string | null; status: string; lastLogin: string | null; lastError: string | null; notes: string | null; createdAt: string; updatedAt: string }
interface Stats { total: number; active: number; disabled: number; successfulToday: number; failedToday: number }
interface Pagination { page: number; limit: number; total: number; totalPages: number }
interface ImportSession { status: string; logs: string[]; error: string | null; elapsed: number; attempt?: number; profileId?: string | null; data?: Record<string, unknown> | null }

export default function BarbargAccountsPage() {
  const [accounts, setAccounts] = useState<BarbargAccount[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, disabled: 0, successfulToday: 0, failedToday: 0 })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<BarbargAccount | null>(null)
  const [form, setForm] = useState({ accountName: '', username: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/barbarg-accounts?search=${encodeURIComponent(search)}&status=${filter}&page=${pagination.page}&limit=${pagination.limit}`)
      const d = await res.json()
      setAccounts(Array.isArray(d.data) ? d.data : [])
      if (d.pagination) setPagination(d.pagination)
    } catch { setAccounts([]) }
    setLoading(false)
  }, [search, filter, pagination.page, pagination.limit])

  const fetchStats = useCallback(async () => {
    try { const res = await fetch('/api/barbarg-accounts?stats=true'); const d = await res.json(); if (d.stats) setStats(d.stats) } catch {}
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])
  useEffect(() => { fetchStats() }, [fetchStats])

  const [importingId, setImportingId] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importSession, setImportSession] = useState<ImportSession | null>(null)
  const [importAccountName, setImportAccountName] = useState('')
  const importPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollImportStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/barbarg-accounts/import-profile?accountId=${id}`)
      const d: ImportSession = await res.json()
      setImportSession(d)
      if (['success', 'failed', 'cancelled', 'not_found'].includes(d.status)) {
        if (importPollRef.current) { clearInterval(importPollRef.current); importPollRef.current = null }
        setImportingId(null)
        fetchAccounts(); fetchStats()
        if (d.status === 'success') toast.success('دریافت اطلاعات با موفقیت انجام شد')
        if (d.status === 'failed') toast.error(d.error || 'دریافت اطلاعات ناموفق بود')
        if (d.status === 'cancelled') toast.warning('دریافت اطلاعات متوقف شد')
      }
    } catch {}
  }, [fetchAccounts, fetchStats])

  /**
   * دریافت اطلاعات از سامانه با تلاش نامحدود برای خطاهای موقتی.
   * کاربر هر زمان بخواهد با دکمه توقف عملیات را قطع می‌کند.
   */
  const handleImportProfile = async (id: string, name: string) => {
    if (importingId) return
    setImportingId(id)
    setImportAccountName(name)
    setImportSession({ status: 'running', logs: ['در حال شروع عملیات...'], error: null, elapsed: 0, attempt: 0 })
    setImportDialogOpen(true)
    try {
      const res = await fetch('/api/barbarg-accounts/import-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id, createProfile: true, async: true }),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error || 'شروع عملیات ناموفق بود')
      setImportSession({ status: d.status || 'running', logs: d.logs || [], error: null, elapsed: 0, attempt: 0 })
      importPollRef.current = setInterval(() => pollImportStatus(id), 2000)
    } catch (e) {
      setImportSession({ status: 'failed', logs: [], error: e instanceof Error ? e.message : 'خطا در شروع عملیات', elapsed: 0 })
      setImportingId(null)
    }
  }

  const handleCancelImport = async () => {
    if (!importingId) { setImportDialogOpen(false); return }
    try {
      await fetch('/api/barbarg-accounts/import-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: importingId, action: 'cancel' }),
      })
      setImportSession((p) => p ? { ...p, status: 'cancelled', error: 'درخواست توقف ارسال شد' } : p)
    } catch {}
    if (importPollRef.current) { clearInterval(importPollRef.current); importPollRef.current = null }
    setImportingId(null)
  }

  const handleSave = async () => {
    if (!form.accountName.trim() || !form.username.trim()) { toast.error('نام حساب و نام کاربری الزامی است'); return }
    if (!editItem && !form.password) { toast.error('رمز عبور الزامی است'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { accountName: form.accountName.trim(), username: form.username.trim() }
      if (form.password) payload.password = form.password
      const url = editItem ? `/api/barbarg-accounts/${editItem.id}` : '/api/barbarg-accounts'
      const res = await fetch(url, { method: editItem ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'خطا در ذخیره')
      toast.success(editItem ? 'حساب بروزرسانی شد' : 'حساب جدید ایجاد شد')
      setDialogOpen(false); setEditItem(null); setForm({ accountName: '', username: '', password: '' }); fetchAccounts(); fetchStats()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'خطا در ذخیره') }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`آیا از حذف "${name}" مطمئن هستید؟`)) return
    try { await fetch(`/api/barbarg-accounts/${id}`, { method: 'DELETE' }); toast.success('حساب حذف شد'); fetchAccounts(); fetchStats() } catch { toast.error('خطا در حذف') }
  }

  const toggleStatus = async (id: string, current: string) => {
    try { await fetch(`/api/barbarg-accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: current === 'active' ? 'disabled' : 'active' }) }); toast.success('تغییر وضعیت'); fetchAccounts(); fetchStats() } catch { toast.error('خطا') }
  }

  useEffect(() => {
    return () => { if (importPollRef.current) clearInterval(importPollRef.current) }
  }, [])

  const openCreate = () => { setEditItem(null); setForm({ accountName: '', username: '', password: '' }); setShowPassword(false); setDialogOpen(true) }
  const openEdit = (a: BarbargAccount) => { setEditItem(a); setForm({ accountName: a.accountName, username: a.username, password: '' }); setShowPassword(false); setDialogOpen(true) }

  const sc = (s: string) => s === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'
  const sl = (s: string) => s === 'active' ? 'فعال' : 'غیرفعال'

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">حساب‌های باربگ</h1><p className="text-muted-foreground">مدیریت حساب‌های ورود به سامانه باربگ</p></div>
        <Button onClick={openCreate}><Plus className="size-4 ml-2" /> افزودن حساب</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Users className="size-4 text-blue-500" /><span className="text-xs text-muted-foreground">کل حساب‌ها</span></div><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><UserCheck className="size-4 text-green-500" /><span className="text-xs text-muted-foreground">فعال</span></div><p className="text-2xl font-bold text-green-500">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><UserX className="size-4 text-red-500" /><span className="text-xs text-muted-foreground">غیرفعال</span></div><p className="text-2xl font-bold text-red-500">{stats.disabled}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle className="size-4 text-green-500" /><span className="text-xs text-muted-foreground">ورود موفق امروز</span></div><p className="text-2xl font-bold text-green-500">{stats.successfulToday}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><XCircle className="size-4 text-red-500" /><span className="text-xs text-muted-foreground">خطای امروز</span></div><p className="text-2xl font-bold text-red-500">{stats.failedToday}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی نام حساب یا نام کاربری..." className="pr-9" value={search} onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })) }} autoFocus /></div>
        <div className="flex gap-1">{[{ k: 'ALL', l: 'همه' }, { k: 'active', l: 'فعال' }, { k: 'disabled', l: 'غیرفعال' }].map((f) => <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => { setFilter(f.k); setPagination((p) => ({ ...p, page: 1 })) }}>{f.l}</Button>)}</div>
      </div></CardContent></Card>

      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-right text-muted-foreground">
              <th className="pb-3 font-medium">نام حساب</th><th className="pb-3 font-medium">نام کاربری</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">آخرین ورود</th><th className="pb-3 font-medium">خطای اخیر</th><th className="pb-3 font-medium">تاریخ ایجاد</th><th className="pb-3 font-medium text-left">عملیات</th>
            </tr></thead>
            <tbody>{loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground"><Loader2 className="size-6 mx-auto animate-spin" /></td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-3 font-medium">{a.accountName}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{a.username}</td>
                <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${sc(a.status)}`}>{sl(a.status)}</span></td>
                <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">{a.lastLogin ? new Date(a.lastLogin).toLocaleString('fa') : '-'}</td>
                <td className="py-3 max-w-[150px]">{a.lastError ? <Badge variant="destructive" className="text-[10px] truncate" title={a.lastError}>{a.lastError}</Badge> : <span className="text-muted-foreground">-</span>}</td>
                <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString('fa')}</td>
                <td className="py-3"><div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(a.id, a.status)} title={a.status === 'active' ? 'غیرفعال کردن' : 'فعال کردن'}>
                    {a.status === 'active' ? <ShieldOff className="size-4 text-yellow-500" /> : <Shield className="size-4 text-green-500" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleImportProfile(a.id, a.accountName)}
                    disabled={importingId === a.id}
                    title="دریافت اطلاعات خودکار راننده"
                  >
                    {importingId === a.id
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Download className="size-4 text-emerald-500" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="ویرایش"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id, a.accountName)} title="حذف"><Trash2 className="size-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-xs text-muted-foreground">صفحه {pagination.page} از {pagination.totalPages} | کل: {pagination.total}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}><ChevronRight className="size-4" /></Button>
              <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}><ChevronLeft className="size-4" /></Button>
            </div>
          </div>
        )}
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'ویرایش حساب' : 'حساب جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label className="text-sm">نام حساب <span className="text-destructive">*</span></Label>
              <Input value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} placeholder="نام نمایشی حساب" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">نام کاربری <span className="text-destructive">*</span></Label>
              <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="نام کاربری / کد ملی" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{editItem ? 'رمز عبور (خالی = بدون تغییر)' : <>رمز عبور <span className="text-destructive">*</span></>}</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="pl-9" placeholder={editItem ? 'رمز جدید...' : 'رمز عبور...'} />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button><Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin ml-2" /> : null} {saving ? '...' : 'ذخیره'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (importSession?.status === 'running' && !open) return; setImportDialogOpen(open) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-5" />
              دریافت اطلاعات خودکار راننده — {importAccountName}
            </DialogTitle>
          </DialogHeader>

          {importSession && (
            <div className="space-y-4 overflow-y-auto flex-1 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {importSession.status === 'running' ? <Loader2 className="size-5 text-yellow-500 animate-spin" />
                    : importSession.status === 'success' ? <CheckCircle className="size-5 text-green-500" />
                    : <XCircle className="size-5 text-red-500" />}
                  <span className={`font-medium ${importSession.status === 'success' ? 'text-green-500' : importSession.status === 'running' ? 'text-yellow-500' : 'text-red-500'}`}>
                    {importSession.status === 'running' && `در حال اجرا${importSession.attempt ? ` — تلاش ${importSession.attempt}` : ''}`}
                    {importSession.status === 'success' && 'موفق'}
                    {importSession.status === 'failed' && 'ناموفق'}
                    {importSession.status === 'cancelled' && 'متوقف شد'}
                    {importSession.status === 'not_found' && 'یافت نشد'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  <span>{Math.floor((importSession.elapsed || 0) / 60)}:{String((importSession.elapsed || 0) % 60).padStart(2, '0')}</span>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 max-h-[360px] overflow-y-auto" dir="ltr">
                <div className="space-y-1 font-mono text-xs">
                  {(importSession.logs || []).map((line, i) => (
                    <div key={i} className="py-0.5 text-foreground">{line}</div>
                  ))}
                  {importSession.status === 'running' && (
                    <div className="flex items-center gap-2 py-0.5 text-yellow-500">
                      <Loader2 className="size-3 animate-spin" />
                      <span>تلاش‌ها ادامه دارد؛ در خطاهای موقتی مثل بلاک IP یا مشغولی سایت، ربات صبر می‌کند و دوباره شروع می‌کند...</span>
                    </div>
                  )}
                </div>
              </div>

              {importSession.error && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-sm text-destructive">
                  <span className="font-medium">پیام:</span> {importSession.error}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            {importSession?.status === 'running' ? (
              <Button variant="destructive" onClick={handleCancelImport} disabled={!importingId}>
                توقف عملیات
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                بستن
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
