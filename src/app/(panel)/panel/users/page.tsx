'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Users,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react'

interface User {
  id: string
  email: string
  name: string
  phone: string | null
  department: string | null
  role: string
  status: string
  avatar: string | null
  notes: string | null
  mustChangePassword: boolean
  failedAttempts: number
  lockedUntil: string | null
  lastLogin: string | null
  lastActivity: string | null
  createdAt: string
  updatedAt: string
}

interface Stats {
  total: number
  active: number
  blocked: number
  locked: number
  byRole: { owner: number; admin: number; operator: number; viewer: number }
  recentLogins: { id: string; name: string; email: string; lastLogin: string; role: string }[]
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface FormData {
  name: string
  email: string
  password: string
  confirmPassword: string
  phone: string
  department: string
  notes: string
  role: string
  status: string
}

const initialForm: FormData = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  department: '',
  notes: '',
  role: 'operator',
  status: 'active',
}

const roleLabel: Record<string, string> = {
  owner: 'مالک',
  admin: 'مدیر',
  operator: 'اپراتور',
  viewer: 'مشاهده‌گر',
}

const roleBadgeClass: Record<string, string> = {
  owner: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  admin: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  operator: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  viewer: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  if (score <= 1) return { score, label: 'ضعیف', color: 'bg-red-500' }
  if (score <= 2) return { score, label: 'متوسط', color: 'bg-orange-500' }
  if (score <= 3) return { score, label: 'خوب', color: 'bg-yellow-500' }
  if (score <= 4) return { score, label: 'قوی', color: 'bg-green-500' }
  return { score, label: 'بسیار قوی', color: 'bg-emerald-500' }
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState<FormData>(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'delete' | 'reset' | 'lock' | 'unlock'
    userId: string
    userName: string
  }>({ open: false, type: 'delete', userId: '', userName: '' })
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null)
  const [showResetPassword, setShowResetPassword] = useState(false)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchUsers = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '10')
      if (search) params.set('search', search)
      if (filterRole !== 'all') params.set('role', filterRole)
      if (filterStatus !== 'all') params.set('status', filterStatus)

      const res = await fetch(`/api/auth/users?${params}`)
      const d = await res.json()
      setUsers(Array.isArray(d.data) ? d.data : [])
      if (d.pagination) setPagination(d.pagination)
    } catch {
      setUsers([])
    }
    setLoading(false)
  }, [search, filterRole, filterStatus])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/users/stats')
      const d = await res.json()
      setStats(d)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchUsers(1)
  }, [fetchStats, fetchUsers])

  useEffect(() => {
    refreshInterval.current = setInterval(() => {
      fetchUsers(pagination.page)
      fetchStats()
    }, 30000)
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current)
    }
  }, [fetchUsers, fetchStats, pagination.page])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => fetchUsers(1), 400)
  }

  const openCreateDialog = () => {
    setEditUser(null)
    setForm(initialForm)
    setShowPassword(false)
    setDialogOpen(true)
  }

  const openEditDialog = (u: User) => {
    setEditUser(u)
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      confirmPassword: '',
      phone: u.phone || '',
      department: u.department || '',
      notes: u.notes || '',
      role: u.role,
      status: u.status,
    })
    setShowPassword(false)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.email) {
      toast.error('نام و ایمیل الزامی هستند')
      return
    }
    if (!editUser && !form.password) {
      toast.error('رمز عبور الزامی است')
      return
    }
    if (form.password && form.password !== form.confirmPassword) {
      toast.error('رمز عبور و تکرار آن مطابقت ندارند')
      return
    }

    setSaving(true)
    try {
      if (editUser) {
        const body: Record<string, unknown> = {
          id: editUser.id,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          department: form.department || null,
          notes: form.notes || null,
          role: form.role,
          status: form.status,
        }
        if (form.password) body.password = form.password

        const res = await fetch('/api/auth/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'خطا در بروزرسانی')
        }
        toast.success('کاربر بروزرسانی شد')
      } else {
        const res = await fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
            phone: form.phone || undefined,
            department: form.department || undefined,
            notes: form.notes || undefined,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'خطا در ایجاد کاربر')
        }
        toast.success('کاربر ایجاد شد')
      }
      setDialogOpen(false)
      setEditUser(null)
      setForm(initialForm)
      fetchUsers(pagination.page)
      fetchStats()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطا در ذخیره‌سازی'
      toast.error(message)
    }
    setSaving(false)
  }

  const handleConfirmAction = async () => {
    const { type, userId } = confirmDialog
    try {
      if (type === 'delete') {
        const res = await fetch(`/api/auth/users?id=${userId}`, { method: 'DELETE' })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success('کاربر حذف شد')
      } else if (type === 'reset') {
        const res = await fetch('/api/auth/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId, action: 'resetPassword' }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        const data = await res.json()
        setResetPasswordResult(data.newPassword)
        setShowResetPassword(true)
        toast.success('رمز عبور بازنشانی شد')
      } else if (type === 'lock') {
        const res = await fetch('/api/auth/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId, action: 'lock' }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success('حساب قفل شد')
      } else if (type === 'unlock') {
        const res = await fetch('/api/auth/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId, action: 'unlock' }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
        toast.success('حساب باز شد')
      }
      setConfirmDialog({ open: false, type: 'delete', userId: '', userName: '' })
      fetchUsers(pagination.page)
      fetchStats()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطا در عملیات'
      toast.error(message)
    }
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) fetchUsers(page)
  }

  const strength = getPasswordStrength(form.password)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">کاربران</h1>
          <p className="text-muted-foreground">مدیریت کاربران سیستم</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchUsers(pagination.page); fetchStats() }}>
            <RefreshCw className="size-4" />
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="size-4 ml-2" />
            کاربر جدید
          </Button>
        </div>
      </div>

      {/* Dashboard Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'کل کاربران', value: stats?.total ?? 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-500/10' },
          { label: 'فعال', value: stats?.active ?? 0, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-500/10' },
          { label: 'مسدود', value: stats?.blocked ?? 0, icon: UserX, color: 'text-red-600', bg: 'bg-red-500/10' },
          { label: 'قفل شده', value: stats?.locked ?? 0, icon: Lock, color: 'text-orange-600', bg: 'bg-orange-500/10' },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`${item.bg} p-2.5 rounded-lg`}>
                    <item.icon className={`size-5 ${item.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-bold">{item.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="جستجو بر اساس نام یا ایمیل..."
                className="pr-9"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <Select value={filterRole} onValueChange={(v) => { if (v) { setFilterRole(v); setTimeout(() => fetchUsers(1), 0) } }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="نقش" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه نقش‌ها</SelectItem>
                <SelectItem value="owner">مالک</SelectItem>
                <SelectItem value="admin">مدیر</SelectItem>
                <SelectItem value="operator">اپراتور</SelectItem>
                <SelectItem value="viewer">مشاهده‌گر</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { if (v) { setFilterStatus(v); setTimeout(() => fetchUsers(1), 0) } }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="blocked">مسدود</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  <th className="p-3 font-medium">نام</th>
                  <th className="p-3 font-medium">ایمیل</th>
                  <th className="p-3 font-medium">نقش</th>
                  <th className="p-3 font-medium">وضعیت</th>
                  <th className="p-3 font-medium">آخرین ورود</th>
                  <th className="p-3 font-medium">آخرین فعالیت</th>
                  <th className="p-3 font-medium text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="size-6 animate-spin mx-auto mb-2" />
                      در حال بارگذاری...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      کاربری یافت نشد
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3 text-muted-foreground">{u.email}</td>
                      <td className="p-3">
                        <Badge className={roleBadgeClass[u.role] || ''}>
                          {roleLabel[u.role] || u.role}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={u.status === 'active' ? 'default' : 'destructive'}>
                          {u.status === 'active' ? 'فعال' : 'مسدود'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString('fa-IR') : '-'}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {u.lastActivity ? new Date(u.lastActivity).toLocaleString('fa-IR') : '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(u)} title="ویرایش">
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDialog({
                              open: true,
                              type: u.lockedUntil && new Date(u.lockedUntil) > new Date() ? 'unlock' : 'lock',
                              userId: u.id,
                              userName: u.name,
                            })}
                            title={u.lockedUntil && new Date(u.lockedUntil) > new Date() ? 'باز کردن قفل' : 'قفل کردن'}
                          >
                            {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                              <Unlock className="size-4 text-orange-500" />
                            ) : (
                              <Lock className="size-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDialog({
                              open: true,
                              type: 'reset',
                              userId: u.id,
                              userName: u.name,
                            })}
                            title="بازنشانی رمز"
                          >
                            <KeyRound className="size-4 text-blue-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDialog({
                              open: true,
                              type: 'delete',
                              userId: u.id,
                              userName: u.name,
                            })}
                            title="حذف"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <p className="text-sm text-muted-foreground">
                صفحه {pagination.page} از {pagination.totalPages} | مجموع: {pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => goToPage(pagination.page + 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editUser ? 'ویرایش کاربر' : 'کاربر جدید'}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">اطلاعات کاربر</TabsTrigger>
              <TabsTrigger value="access">نقش و دسترسی</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>نام *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="نام کاربر"
                />
              </div>
              <div className="space-y-2">
                <Label>ایمیل *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>{editUser ? 'رمز جدید (خالی برای عدم تغییر)' : 'رمز عبور *'}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="pl-9"
                    placeholder={editUser ? 'فقط در صورت نیاز به تغییر' : 'رمز عبور'}
                  />
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i < strength.score ? strength.color : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">قدرت رمز: {strength.label}</p>
                  </div>
                )}
              </div>
              {!editUser && (
                <div className="space-y-2">
                  <Label>تکرار رمز عبور *</Label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="تکرار رمز عبور"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>تلفن</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="شماره تلفن"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>بخش</Label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="نام بخش"
                />
              </div>
              <div className="space-y-2">
                <Label>توضیحات</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="توضیحات اضافی"
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="access" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>نقش</Label>
                <Select value={form.role} onValueChange={(v) => { if (v) setForm({ ...form, role: v }) }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">مالک</SelectItem>
                    <SelectItem value="admin">مدیر</SelectItem>
                    <SelectItem value="operator">اپراتور</SelectItem>
                    <SelectItem value="viewer">مشاهده‌گر</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.role === 'owner' && 'دسترسی کامل به تمام بخش‌ها'}
                  {form.role === 'admin' && 'مدیریت کاربران و تنظیمات'}
                  {form.role === 'operator' && 'عملیات و ثبت اطلاعات'}
                  {form.role === 'viewer' && 'فقط مشاهده اطلاعات'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>وضعیت</Label>
                <Select value={form.status} onValueChange={(v) => { if (v) setForm({ ...form, status: v }) }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="blocked">مسدود</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editUser && editUser.lockedUntil && new Date(editUser.lockedUntil) > new Date() && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <p className="text-sm text-orange-600">
                    این حساب تا {new Date(editUser.lockedUntil).toLocaleString('fa-IR')} قفل است
                  </p>
                </div>
              )}
              {editUser && editUser.mustChangePassword && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-600">
                    کاربر در ورود بعدی باید رمز عبور خود را تغییر دهد
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              لغو
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin ml-2" />}
              {editUser ? 'بروزرسانی' : 'ایجاد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.type === 'delete' && 'حذف کاربر'}
              {confirmDialog.type === 'reset' && 'بازنشانی رمز عبور'}
              {confirmDialog.type === 'lock' && 'قفل حساب'}
              {confirmDialog.type === 'unlock' && 'باز کردن حساب'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog.type === 'delete' && `آیا از حذف "${confirmDialog.userName}" اطمینان دارید؟ این عملیات قابل بازگشت نیست.`}
            {confirmDialog.type === 'reset' && `آیا از بازنشانی رمز عبور "${confirmDialog.userName}" اطمینان دارید؟ رمز جدید پس از بازنشانی نمایش داده می‌شود.`}
            {confirmDialog.type === 'lock' && `آیا از قفل کردن حساب "${confirmDialog.userName}" اطمینان دارید؟ حساب به مدت ۱۵ دقیقه قفل خواهد شد.`}
            {confirmDialog.type === 'unlock' && `آیا از باز کردن حساب "${confirmDialog.userName}" اطمینان دارید؟`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>
              انصراف
            </Button>
            <Button
              variant={confirmDialog.type === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
            >
              {confirmDialog.type === 'delete' && 'حذف'}
              {confirmDialog.type === 'reset' && 'بازنشانی'}
              {confirmDialog.type === 'lock' && 'قفل کردن'}
              {confirmDialog.type === 'unlock' && 'باز کردن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Result Dialog */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>رمز عبور جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              رمز عبور جدید کاربر ایجاد شد. این رمز را به کاربر اطلاع دهید:
            </p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-sm font-mono break-all" dir="ltr">
                {resetPasswordResult}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(resetPasswordResult || '')
                  toast.success('کپی شد')
                }}
              >
                کپی
              </Button>
            </div>
            <p className="text-xs text-orange-500">
              کاربر در ورود بعدی باید رمز عبور خود را تغییر دهد.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowResetPassword(false); setResetPasswordResult(null) }}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
