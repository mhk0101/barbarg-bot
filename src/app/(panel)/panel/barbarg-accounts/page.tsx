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
import { Plus, Pencil, Trash2, Search, Shield, ShieldOff, Eye, EyeOff, Users, UserCheck, UserX, CheckCircle, XCircle, Key, Loader2, ChevronLeft, ChevronRight, Globe, Terminal, Clock } from 'lucide-react'

interface BarbargAccount { id: string; accountName: string; username: string; company: string | null; status: string; lastLogin: string | null; lastError: string | null; notes: string | null; createdAt: string; updatedAt: string }
interface Stats { total: number; active: number; disabled: number; successfulToday: number; failedToday: number }
interface Pagination { page: number; limit: number; total: number; totalPages: number }
interface LoginStep { step: string; time: string; status: 'info' | 'success' | 'error' }
interface LoginSession { status: string; steps: LoginStep[]; screenshotPath: string | null; error: string | null; lastCheck: string | null; elapsed: number }

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw)) score++
  if (pw.length >= 14) score++
  if (/[0-9]/.test(pw) && /[A-Za-z]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 2) return { score, label: 'ضعیف', color: 'bg-red-500' }
  if (score <= 4) return { score, label: 'متوسط', color: 'bg-yellow-500' }
  return { score, label: 'قوی', color: 'bg-green-500' }
}

export default function BarbargAccountsPage() {
  const [accounts, setAccounts] = useState<BarbargAccount[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, disabled: 0, successfulToday: 0, failedToday: 0 })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<BarbargAccount | null>(null)
  const [form, setForm] = useState({ accountName: '', username: '', password: '', confirmPassword: '', company: '', status: 'active', notes: '' })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [loginSession, setLoginSession] = useState<LoginSession | null>(null)
  const [loginAccountId, setLoginAccountId] = useState<string | null>(null)
  const [loginAccountName, setLoginAccountName] = useState('')
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepsEndRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [loginSession?.steps])

  const handleSave = async () => {
    if (!form.accountName || !form.username) { toast.error('نام حساب و نام کاربری الزامی است'); return }
    if (!editItem && !form.password) { toast.error('رمز عبور الزامی است'); return }
    if (form.password && form.password !== form.confirmPassword) { toast.error('رمز عبور و تکرار آن مطابقت ندارند'); return }
    if (form.password && form.password.length < 6) { toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { accountName: form.accountName, username: form.username, company: form.company || null, status: form.status, notes: form.notes || null }
      if (form.password) payload.password = form.password
      if (editItem) { await fetch(`/api/barbarg-accounts/${editItem.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); toast.success('حساب بروزرسانی شد') }
      else { await fetch('/api/barbarg-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); toast.success('حساب جدید ایجاد شد') }
      setDialogOpen(false); setEditItem(null); setForm({ accountName: '', username: '', password: '', confirmPassword: '', company: '', status: 'active', notes: '' }); fetchAccounts(); fetchStats()
    } catch { toast.error('خطا در ذخیره') }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`آیا از حذف "${name}" مطمئن هستید؟`)) return
    try { await fetch(`/api/barbarg-accounts/${id}`, { method: 'DELETE' }); toast.success('حساب حذف شد'); fetchAccounts(); fetchStats() } catch { toast.error('خطا در حذف') }
  }

  const toggleStatus = async (id: string, current: string) => {
    try { await fetch(`/api/barbarg-accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: current === 'active' ? 'disabled' : 'active' }) }); toast.success('تغییر وضعیت'); fetchAccounts(); fetchStats() } catch { toast.error('خطا') }
  }

  const pollLoginStatus = useCallback(async (accountId: string) => {
    try {
      const res = await fetch(`/api/barbarg-accounts/test-login?accountId=${accountId}`)
      const data: LoginSession = await res.json()
      setLoginSession(data)
      if (['login_success', 'login_failed', 'timeout', 'error', 'not_found'].includes(data.status)) {
        if (loginPollRef.current) { clearInterval(loginPollRef.current); loginPollRef.current = null }
        fetchAccounts(); fetchStats()
      }
    } catch {}
  }, [fetchAccounts, fetchStats])

  const handleTestLogin = async (id: string, accountName: string) => {
    setLoginAccountId(id)
    setLoginAccountName(accountName)
    setLoginSession({ status: 'opening', steps: [], screenshotPath: null, error: null, lastCheck: null, elapsed: 0 })
    setLoginDialogOpen(true)

    try {
      const res = await fetch('/api/barbarg-accounts/test-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: id }) })
      const data = await res.json()
      if (data.sessionId) {
        setLoginSession({ status: data.status || 'waiting_captcha', steps: data.steps || [], screenshotPath: null, error: null, lastCheck: null, elapsed: 0 })
        loginPollRef.current = setInterval(() => pollLoginStatus(id), 2000)
      } else if (data.error) {
        setLoginSession({ status: 'error', steps: [{ step: data.error, time: new Date().toLocaleTimeString('fa-IR'), status: 'error' }], screenshotPath: null, error: data.error, lastCheck: null, elapsed: 0 })
      }
    } catch (e) {
      setLoginSession({ status: 'error', steps: [{ step: 'خطا در اتصال', time: new Date().toLocaleTimeString('fa-IR'), status: 'error' }], screenshotPath: null, error: 'خطا در اتصال', lastCheck: null, elapsed: 0 })
    }
  }

  const handleConfirmLogin = async () => {
    if (!loginAccountId) return
    try {
      const res = await fetch('/api/barbarg-accounts/test-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: loginAccountId, action: 'confirm' }) })
      const data = await res.json()
      setLoginSession((prev) => prev ? { ...prev, status: data.status, steps: data.steps || prev.steps } : null)
      fetchAccounts(); fetchStats()
    } catch {}
  }

  const handleCancelLogin = async () => {
    if (!loginAccountId) return
    try { await fetch('/api/barbarg-accounts/test-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: loginAccountId, action: 'cancel' }) }) } catch {}
    if (loginPollRef.current) { clearInterval(loginPollRef.current); loginPollRef.current = null }
    setLoginDialogOpen(false); setLoginSession(null); setLoginAccountId(null)
  }

  useEffect(() => {
    return () => { if (loginPollRef.current) clearInterval(loginPollRef.current) }
  }, [])

  const openCreate = () => { setEditItem(null); setForm({ accountName: '', username: '', password: '', confirmPassword: '', company: '', status: 'active', notes: '' }); setShowPassword(false); setDialogOpen(true) }
  const openEdit = (a: BarbargAccount) => { setEditItem(a); setForm({ accountName: a.accountName, username: a.username, password: '', confirmPassword: '', company: a.company || '', status: a.status, notes: a.notes || '' }); setShowPassword(false); setDialogOpen(true) }

  const pw = passwordStrength(form.password)
  const sc = (s: string) => s === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'
  const sl = (s: string) => s === 'active' ? 'فعال' : 'غیرفعال'

  const loginStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    opening: { label: 'باز کردن مرورگر', color: 'text-blue-500', icon: Globe },
    waiting_captcha: { label: 'منتظر ورود کاربر', color: 'text-yellow-500', icon: Loader2 },
    login_success: { label: 'ورود موفق', color: 'text-green-500', icon: CheckCircle },
    login_failed: { label: 'ورود ناموفق', color: 'text-red-500', icon: XCircle },
    timeout: { label: 'زمان تمام شد', color: 'text-orange-500', icon: XCircle },
    error: { label: 'خطا', color: 'text-red-500', icon: XCircle },
    not_found: { label: 'یافت نشد', color: 'text-gray-500', icon: XCircle },
  }

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
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی نام، نام کاربری، شرکت..." className="pr-9" value={search} onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })) }} autoFocus /></div>
        <div className="flex gap-1">{[{ k: 'ALL', l: 'همه' }, { k: 'active', l: 'فعال' }, { k: 'disabled', l: 'غیرفعال' }].map((f) => <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => { setFilter(f.k); setPagination((p) => ({ ...p, page: 1 })) }}>{f.l}</Button>)}</div>
      </div></CardContent></Card>

      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-right text-muted-foreground">
              <th className="pb-3 font-medium">نام حساب</th><th className="pb-3 font-medium">نام کاربری</th><th className="pb-3 font-medium">شرکت</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">آخرین ورود</th><th className="pb-3 font-medium">خطای اخیر</th><th className="pb-3 font-medium">تاریخ ایجاد</th><th className="pb-3 font-medium text-left">عملیات</th>
            </tr></thead>
            <tbody>{loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground"><Loader2 className="size-6 mx-auto animate-spin" /></td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-3 font-medium">{a.accountName}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{a.username}</td>
                <td className="py-3">{a.company || '-'}</td>
                <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${sc(a.status)}`}>{sl(a.status)}</span></td>
                <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">{a.lastLogin ? new Date(a.lastLogin).toLocaleString('fa') : '-'}</td>
                <td className="py-3 max-w-[150px]">{a.lastError ? <Badge variant="destructive" className="text-[10px] truncate" title={a.lastError}>{a.lastError}</Badge> : <span className="text-muted-foreground">-</span>}</td>
                <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString('fa')}</td>
                <td className="py-3"><div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleTestLogin(a.id, a.accountName)} disabled={loginAccountId === a.id && loginDialogOpen} title="تست ورود">
                    {loginAccountId === a.id && loginDialogOpen ? <Loader2 className="size-4 animate-spin" /> : <Key className="size-4 text-blue-500" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(a.id, a.status)} title={a.status === 'active' ? 'غیرفعال کردن' : 'فعال کردن'}>
                    {a.status === 'active' ? <ShieldOff className="size-4 text-yellow-500" /> : <Shield className="size-4 text-green-500" />}
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? 'ویرایش حساب' : 'حساب جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5"><Label className="text-sm">نام حساب <span className="text-destructive">*</span></Label><Input value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} placeholder="نام نمایشی حساب" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-sm">نام کاربری (کد ملی) <span className="text-destructive">*</span></Label><Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="کد ملی صاحب حساب" /></div>
            <div className="space-y-1.5"><Label className="text-sm">{editItem ? 'رمز جدید (خالی = بدون تغییر)' : 'رمز عبور'} {form.password && <span className={`text-xs ${pw.color.replace('bg-', 'text-')}`}>{pw.label}</span>}</Label>
              <div className="relative"><Input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="pl-9" placeholder={editItem ? 'رمز جدید...' : 'رمز عبور...'} />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              {form.password && <div className="flex gap-1 mt-1"><div className={`h-1 flex-1 rounded ${pw.score >= 1 ? pw.color : 'bg-muted'}`} /><div className={`h-1 flex-1 rounded ${pw.score >= 3 ? pw.color : 'bg-muted'}`} /><div className={`h-1 flex-1 rounded ${pw.score >= 5 ? pw.color : 'bg-muted'}`} /></div>}
            </div>
            <div className="space-y-1.5"><Label className="text-sm">تکرار رمز عبور</Label>
              <div className="relative"><Input type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} className="pl-9" placeholder="تکرار رمز عبور..." />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              {form.password && form.confirmPassword && form.password !== form.confirmPassword && <p className="text-xs text-destructive mt-1">رمز عبور مطابقت ندارد</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-sm">شرکت</Label><Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="نام شرکت..." /></div>
              <div className="space-y-1.5"><Label className="text-sm">وضعیت</Label>
                <select className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="active">فعال</option><option value="disabled">غیرفعال</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-sm">توضیحات</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="توضیحات اختیاری..." /></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button><Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin ml-2" /> : null} {saving ? '...' : 'ذخیره'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={loginDialogOpen} onOpenChange={(open) => { if (!open) handleCancelLogin() }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="size-5" />
              تست ورود — {loginAccountName}
            </DialogTitle>
          </DialogHeader>

          {loginSession && (
            <div className="space-y-4 overflow-y-auto flex-1 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => { const cfg = loginStatusConfig[loginSession.status] || loginStatusConfig.error; const Icon = cfg.icon; return <><Icon className={`size-5 ${cfg.color} ${loginSession.status === 'waiting_captcha' ? 'animate-spin' : ''}`} /><span className={`font-medium ${cfg.color}`}>{cfg.label}</span></> })()}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  <span>{Math.floor(loginSession.elapsed / 60)}:{String(loginSession.elapsed % 60).padStart(2, '0')}</span>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 max-h-[300px] overflow-y-auto" dir="ltr">
                <div className="space-y-1 font-mono text-xs">
                  {loginSession.steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="text-muted-foreground shrink-0">{s.time}</span>
                      <span className={`shrink-0 ${s.status === 'success' ? 'text-green-500' : s.status === 'error' ? 'text-red-500' : 'text-blue-500'}`}>
                        {s.status === 'success' ? '✓' : s.status === 'error' ? '✗' : '→'}
                      </span>
                      <span className="text-foreground">{s.step}</span>
                    </div>
                  ))}
                  {loginSession.status === 'waiting_captcha' && (
                    <div className="flex items-center gap-2 py-0.5 text-yellow-500">
                      <Loader2 className="size-3 animate-spin" />
                      <span>منتظر...</span>
                    </div>
                  )}
                  <div ref={stepsEndRef} />
                </div>
              </div>

              {loginSession.lastCheck && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-sm text-destructive">
                  <span className="font-medium">پیام سایت:</span> {loginSession.lastCheck}
                </div>
              )}

              {loginSession.status === 'waiting_captcha' && (
                <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
                  مرورگر باز شد. کپچا را وارد کنید و دکمه ورود را بزنید. سپس دکمه «ورود انجام شد» را بزنید.
                </div>
              )}

              {loginSession.status === 'login_success' && (
                <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle className="size-4" /> ورود با موفقیت انجام شد. نشست ذخیره شد.
                </div>
              )}

              {(loginSession.status === 'login_failed' || loginSession.status === 'timeout' || loginSession.status === 'error') && (
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <XCircle className="size-4" /> {loginSession.error || 'ورود ناموفق بود'}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            {loginSession?.status === 'waiting_captcha' && (
              <Button onClick={handleConfirmLogin} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="size-4 ml-2" /> ورود انجام شد
              </Button>
            )}
            <Button variant="outline" onClick={handleCancelLogin}>
              {['login_success', 'login_failed', 'timeout', 'error', 'not_found'].includes(loginSession?.status || '') ? 'بستن' : 'لغو'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
