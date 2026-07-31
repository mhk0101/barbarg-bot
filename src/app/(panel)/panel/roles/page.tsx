'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, Users, Eye, Pencil, Trash2, Plus, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Role { name: string; label: string; permissions: string[] }

const permissionGroups = [
  { group: 'عملیات', items: ['مشاهده باربرگ', 'ایجاد باربرگ', 'ویرایش باربرگ', 'حذف باربرگ'] },
  { group: 'اطلاعات پایه', items: ['مشاهده رانندگان', 'ایجاد رانندگان', 'مشاهده خودروها', 'ایجاد خودروها', 'مشاهده پلاک‌ها', 'ایجاد پلاک‌ها'] },
  { group: 'اتوماسیون', items: ['کنترل ربات', 'مشاهده صف', 'مدیریت ورکرها'] },
  { group: 'گزارش‌ها', items: ['مشاهده گزارش‌ها', 'خروجی اکسل', 'خروجی PDF'] },
  { group: 'سیستم', items: ['تنظیمات', 'مدیریت کاربران', 'لاگ‌ها', 'اعلان‌ها'] },
]

const permToKey: Record<string, string> = {
  'مشاهده باربرگ': 'view_waybill', 'ایجاد باربرگ': 'create_waybill', 'ویرایش باربرگ': 'edit_waybill', 'حذف باربرگ': 'delete_waybill',
  'مشاهده رانندگان': 'view_drivers', 'ایجاد رانندگان': 'create_drivers', 'مشاهده خودروها': 'view_vehicles', 'ایجاد خودروها': 'create_vehicles',
  'مشاهده پلاک‌ها': 'view_plates', 'ایجاد پلاک‌ها': 'create_plates',
  'کنترل ربات': 'control_bot', 'مشاهده صف': 'view_queue', 'مدیریت ورکرها': 'manage_workers',
  'مشاهده گزارش‌ها': 'view_reports', 'خروجی اکسل': 'export_excel', 'خروجی PDF': 'export_pdf',
  'تنظیمات': 'manage_settings', 'مدیریت کاربران': 'manage_users', 'لاگ‌ها': 'view_logs', 'اعلان‌ها': 'view_notifications',
}

const keyToPerm = Object.fromEntries(Object.entries(permToKey).map(([k, v]) => [v, k]))

const defaultForm = { name: '', label: '', permissions: [] as string[] }
const roleColors: Record<string, string> = {
  owner: 'bg-purple-500/10 text-purple-500',
  admin: 'bg-blue-500/10 text-blue-500',
  operator: 'bg-green-500/10 text-green-500',
  viewer: 'bg-gray-500/10 text-gray-500',
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/roles')
      const data = await res.json()
      setRoles(Array.isArray(data.data) ? data.data : [])
    } catch {
      setRoles([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  const openCreate = () => {
    setEditRole(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  const openEdit = (role: Role) => {
    setEditRole(role)
    setForm({ name: role.name, label: role.label, permissions: [...role.permissions] })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.label) { toast.error('نام و برچسب الزامی است'); return }
    setSaving(true)
    try {
      const method = editRole ? 'PUT' : 'POST'
      const res = await fetch('/api/roles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success(editRole ? 'نقش بروزرسانی شد' : 'نقش ایجاد شد')
      setDialogOpen(false)
      fetchRoles()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'خطا')
    }
    setSaving(false)
  }

  const handleDelete = async (name: string) => {
    try {
      const res = await fetch(`/api/roles?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('حذف شد')
      setDeleteConfirm(null)
      fetchRoles()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'خطا')
    }
  }

  const togglePerm = (perm: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }))
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">نقش‌ها و دسترسی‌ها</h1><p className="text-muted-foreground">مدیریت نقش‌های کاربری</p></div>
        <Button onClick={openCreate}><Plus className="size-4 ml-2" />افزودن نقش</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {roles.map((r) => {
            const colorClass = roleColors[r.name] || 'bg-muted text-muted-foreground'
            const permCount = r.permissions.includes('*') ? 'همه' : r.permissions.length
            const displayPerms = r.permissions.includes('*')
              ? permissionGroups.flatMap((g) => g.items)
              : r.permissions.map((p) => keyToPerm[p]).filter(Boolean)
            return (
              <Card key={r.name}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className={colorClass}>{r.label}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="size-3" /></Button>
                      {r.name !== 'owner' && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(r.name)}><Trash2 className="size-3 text-destructive" /></Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{permCount} دسترسی</p>
                  <div className="space-y-1">
                    {displayPerms.slice(0, 4).map((p) => (
                      <p key={p} className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="size-3 text-green-500" /> {p}
                      </p>
                    ))}
                    {displayPerms.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{displayPerms.length - 4} مورد دیگر</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && roles.length > 0 && (
        <Card>
          <CardHeader><CardTitle>ماتریس دسترسی‌ها</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="pb-3 font-medium">دسترسی</th>
                    {roles.map((r) => (
                      <th key={r.name} className="pb-3 font-medium text-center">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionGroups.flatMap((g) => [
                    <tr key={`group-${g.group}`}>
                      <td colSpan={roles.length + 1} className="pt-4 pb-1 text-xs font-semibold text-muted-foreground">{g.group}</td>
                    </tr>,
                    ...g.items.map((item) => {
                      const permKey = permToKey[item]
                      return (
                        <tr key={item} className="border-b last:border-0">
                          <td className="py-2 text-xs">{item}</td>
                          {roles.map((r) => (
                            <td key={r.name} className="py-2 text-center">
                              {r.permissions.includes('*') || r.permissions.includes(permKey) ? (
                                <Check className="size-4 text-green-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    }),
                  ])}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRole ? 'ویرایش نقش' : 'افزودن نقش جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">نام نقش (انگلیسی) *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلا: supervisor"
                disabled={!!editRole}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">برچسب (فارسی) *</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="مثلا: سرپرست"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">دسترسی‌ها</Label>
              <div className="max-h-[300px] overflow-y-auto space-y-3 border rounded-lg p-3">
                {permissionGroups.map((g) => (
                  <div key={g.group}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{g.group}</p>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((item) => {
                        const permKey = permToKey[item]
                        const checked = form.permissions.includes(permKey)
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => togglePerm(permKey)}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors ${checked ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 hover:bg-muted'}`}
                          >
                            {checked && <Check className="size-3" />}
                            {item}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-4 ml-1 animate-spin" />}
                {saving ? '...' : 'ذخیره'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف نقش</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground pt-2">
            آیا از حذف نقش <strong>{deleteConfirm}</strong> مطمئن هستید؟
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>لغو</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>حذف</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
