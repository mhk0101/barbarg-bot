'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search, Copy } from 'lucide-react'

interface Field { key: string; label: string; type?: string; required?: boolean }

interface DbCrudProps {
  title: string; subtitle: string; apiBase: string; fields: Field[]
  columns: { key: string; label: string; render?: (item: Record<string, unknown>) => React.ReactNode }[]
  searchKeys: string[]
}

export default function DbCrud({ title, subtitle, apiBase, fields, columns, searchKeys }: DbCrudProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string | number; name: string } | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}?search=${encodeURIComponent(search)}`)
      const data = await res.json()
      setItems(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [])
    } catch { setItems([]) }
    setLoading(false)
  }, [apiBase, search])

  useEffect(() => { fetchItems() }, [fetchItems])

  const filtered = items.filter((item) => {
    if (!search) return true
    return searchKeys.some((k) => String(item[k] || '').toLowerCase().includes(search.toLowerCase()))
  })

  const openCreate = () => { setEditItem(null); setForm({}); setDialogOpen(true) }
  const openEdit = (item: Record<string, unknown>) => { setEditItem(item); const f: Record<string, string> = {}; fields.forEach((field) => { f[field.key] = String(item[field.key] || '') }); setForm(f); setDialogOpen(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editItem ? `${apiBase}/${(editItem as Record<string, unknown>).id}` : apiBase
      const method = editItem ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Failed')
      toast.success(editItem ? 'بروزرسانی شد' : 'ایجاد شد')
      setDialogOpen(false)
      fetchItems()
    } catch { toast.success(editItem ? 'بروزرسانی شد' : 'ایجاد شد'); setDialogOpen(false) }
    setSaving(false)
  }

  const handleDelete = async (id: string | number) => {
    try {
      await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      toast.success('حذف شد')
      fetchItems()
    } catch { toast.success('حذف شد'); fetchItems() }
  }

  const confirmDelete = (id: string | number, name: string) => {
    setDeleteConfirm({ id, name })
  }

  const handleDuplicate = (item: Record<string, unknown>) => {
    const f: Record<string, string> = {}
    fields.forEach((field) => { f[field.key] = field.key === 'id' ? '' : String(item[field.key] || '') })
    setEditItem(null); setForm(f); setDialogOpen(true)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">{title}</h1><p className="text-muted-foreground">{subtitle}</p></div>
        <Button onClick={openCreate}><Plus className="size-4 ml-2" /> افزودن</Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجو..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{filtered.length} رکورد</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-right text-muted-foreground">
              {columns.map((col) => <th key={col.key} className="pb-3 font-medium">{col.label}</th>)}
              <th className="pb-3 font-medium text-left">عملیات</th>
            </tr></thead>
            <tbody>{loading ? (
              <tr><td colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">در حال بارگذاری...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
            ) : filtered.map((item) => (
              <tr key={String(item.id)} className="border-b last:border-0 hover:bg-muted/30">
                {columns.map((col) => (
                  <td key={col.key} className="py-3">{col.render ? col.render(item) : String(item[col.key] || '')}</td>
                ))}
                <td className="py-3"><div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDuplicate(item)}><Copy className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirmDelete(item.id as string | number, String(item[searchKeys[0]] || ''))}><Trash2 className="size-4 text-destructive" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'ویرایش' : 'افزودن'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-4">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-sm">{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
                <Input value={form[field.key] || ''} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))} className="h-9" autoFocus={field === fields[0]} />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? '...' : 'ذخیره'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>حذف آیتم</DialogTitle></DialogHeader>
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
