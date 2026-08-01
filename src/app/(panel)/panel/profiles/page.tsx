'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Search, Power, PowerOff,
  Settings, CheckCircle, XCircle, BarChart3, Loader2, ChevronLeft, ChevronRight,
  Send, User, Truck, Package, MapPin, CreditCard, Eye, ChevronDown,
} from 'lucide-react'

interface Profile {
  id: string; name: string; status: string; plateNumber: string
  senderType: string | null; receiverType: string | null
  vehicleSerialNumber: string | null; vehicleMotorNumber: string | null
  vehicleInsurancePage: string | null; vehicleSparePlate: string | null
  vehicleType: string | null; cargoCapacity: string | null
  passengerCapacity: string | null; loaderType: string | null
  thirdPartyInsurance: string | null; activityLicense: string | null
  driverName: string; driverNationalId: string; driverMobile: string | null
  driverLicense: string | null; driverCard: string | null
  driverIdNumber: string | null; driverGender: string | null
  senderFirstName: string; senderLastName: string; senderMobile: string
  senderPhone: string | null; senderNationalId: string; senderPostalCode: string | null
  receiverFirstName: string; receiverLastName: string; receiverMobile: string
  receiverPhone: string | null; receiverNationalId: string; receiverPostalCode: string | null
  cargoName: string; cargoCategory: string | null; cargoPackaging: string | null
  cargoWeight: string | null; cargoQuantity: string | null; cargoValue: string | null
  originProvince: string; originCity: string; originAddress: string | null
  originPostalCode: string | null; destProvince: string; destCity: string
  destAddress: string | null; destPostalCode: string | null
  advanceFare: string | null; fareType: string | null
  freightCost: string | null; transportInsurance: string | null
  totalAmount: string | null; insuranceRate: string | null
  insuranceAmount: string | null; paymentMethod: string | null
  captchaAnswer: string | null
  registrationsPerDay: number; intervalMinutes: number; maxRetries: number
  retryIntervalSec: number; priority: number; accountId: string | null
  barbargAccount: { id: string; accountName: string; username: string } | null
  lastRun: string | null; nextRun: string | null
  totalRuns: number; successfulRuns: number; failedRuns: number
  lastError: string | null; notes: string | null
  createdAt: string; updatedAt: string
}

interface Account { id: string; accountName: string; username: string }

interface Stats {
  total: number; active: number; disabled: number
  totalRuns: number; successfulRuns: number; failedRuns: number
}

const emptyForm: Record<string, string | number> = {
  name: '', senderType: '', senderFirstName: '', senderLastName: '',
  senderMobile: '', senderPhone: '', senderNationalId: '', senderPostalCode: '',
  receiverType: '', receiverFirstName: '', receiverLastName: '',
  receiverMobile: '', receiverPhone: '', receiverNationalId: '', receiverPostalCode: '',
  plateNumber: '', vehicleSerialNumber: '', vehicleMotorNumber: '',
  vehicleInsurancePage: '', vehicleSparePlate: '', vehicleType: '',
  cargoCapacity: '', passengerCapacity: '', loaderType: '',
  thirdPartyInsurance: '', activityLicense: '',
  driverName: '', driverNationalId: '', driverMobile: '',
  driverLicense: '', driverCard: '', driverIdNumber: '', driverGender: '',
  accountId: '',
  cargoName: '', cargoCategory: '', cargoPackaging: '',
  cargoWeight: '', cargoQuantity: '', cargoValue: '',
  originProvince: '', originCity: '', originAddress: '', originPostalCode: '',
  destProvince: '', destCity: '', destAddress: '', destPostalCode: '',
  advanceFare: '', fareType: '', freightCost: '', transportInsurance: '',
  totalAmount: '', insuranceRate: '', insuranceAmount: '', paymentMethod: '',
  captchaAnswer: '',
  registrationsPerDay: 10, intervalMinutes: 60, maxRetries: 3,
  retryIntervalSec: 30, priority: 0, notes: '',
}

const STEPS = [
  { label: 'مشخصات فرستنده', icon: Send },
  { label: 'مشخصات گیرنده', icon: User },
  { label: 'وسیله و راننده', icon: Truck },
  { label: 'مشخصات بار', icon: Package },
  { label: 'کرایه و مسیر', icon: CreditCard },
  { label: 'بازبینی', icon: Eye },
]

const SENDER_TYPES = ['حقیقی', 'حقوقی']  // مطابق سایت: 1=حقیقی (پیش‌فرض)، 2=حقوقی
const RECEIVER_TYPES = ['شرکتی', 'نیمه‌شرکتی', 'حقیقی', 'حاجی']
const INSURANCE_OPTIONS = ['دارد', 'ندارد']
const GENDER_OPTIONS = ['مرد', 'زن']
const FARE_TYPES = ['نقدی', '信用ی', 'ترکیبی']
const CARGO_TYPES = [
  'آهن آلات', 'پلیمری', 'سیمان', 'گندم', 'برنج', 'شکر', 'روغن',
  'مواد شیمیایی', 'کود', 'مصالح ساختمانی', 'لوازم خانگی', 'پوشاک',
  'مواد غذایی', 'دارو', 'لوازم یدکی', 'مبلمان', 'سنگ', 'چوب',
  'کاغذ', 'قهوه', 'چای', 'میوه', 'سبزیجات', 'گوشت', ' لبنیات',
  '弹药', 'سایر',
]

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, disabled: 0, totalRuns: 0, successfulRuns: 0, failedRuns: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [step, setStep] = useState(0)
  const limit = 20

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/registration-profiles?search=${encodeURIComponent(search)}&status=${filter}&page=${page}&limit=${limit}`
      )
      const data = await res.json()
      setProfiles(Array.isArray(data.data) ? data.data : [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch {
      setProfiles([])
    }
    setLoading(false)
  }, [search, filter, page])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/registration-profiles/stats')
      const data = await res.json()
      setStats(data)
    } catch { /* empty */ }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/barbarg-accounts?limit=100')
      const data = await res.json()
      setAccounts(Array.isArray(data.data) ? data.data : [])
    } catch { /* empty */ }
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const openCreate = () => {
    setEditProfile(null)
    setForm({ ...emptyForm })
    setStep(0)
    setDialogOpen(true)
  }

  const openEdit = (p: Profile) => {
    setEditProfile(p)
    setForm({
      name: p.name, senderType: p.senderType || '',
      senderFirstName: p.senderFirstName, senderLastName: p.senderLastName,
      senderMobile: p.senderMobile, senderPhone: p.senderPhone || '',
      senderNationalId: p.senderNationalId, senderPostalCode: p.senderPostalCode || '',
      receiverType: p.receiverType || '',
      receiverFirstName: p.receiverFirstName, receiverLastName: p.receiverLastName,
      receiverMobile: p.receiverMobile, receiverPhone: p.receiverPhone || '',
      receiverNationalId: p.receiverNationalId, receiverPostalCode: p.receiverPostalCode || '',
      plateNumber: p.plateNumber, vehicleSerialNumber: p.vehicleSerialNumber || '',
      vehicleMotorNumber: p.vehicleMotorNumber || '',
      vehicleInsurancePage: p.vehicleInsurancePage || '',
      vehicleSparePlate: p.vehicleSparePlate || '',
      vehicleType: p.vehicleType || '', cargoCapacity: p.cargoCapacity || '',
      passengerCapacity: p.passengerCapacity || '', loaderType: p.loaderType || '',
      thirdPartyInsurance: p.thirdPartyInsurance || '', activityLicense: p.activityLicense || '',
      driverName: p.driverName, driverNationalId: p.driverNationalId,
      driverMobile: p.driverMobile || '', driverLicense: p.driverLicense || '',
      driverCard: p.driverCard || '', driverIdNumber: p.driverIdNumber || '',
      driverGender: p.driverGender || '',
      accountId: p.accountId || '',
      cargoName: p.cargoName, cargoCategory: p.cargoCategory || '',
      cargoPackaging: p.cargoPackaging || '', cargoWeight: p.cargoWeight || '',
      cargoQuantity: p.cargoQuantity || '', cargoValue: p.cargoValue || '',
      originProvince: p.originProvince, originCity: p.originCity,
      originAddress: p.originAddress || '', originPostalCode: p.originPostalCode || '',
      destProvince: p.destProvince, destCity: p.destCity,
      destAddress: p.destAddress || '', destPostalCode: p.destPostalCode || '',
      advanceFare: p.advanceFare || '', fareType: p.fareType || '',
      freightCost: p.freightCost || '', transportInsurance: p.transportInsurance || '',
      totalAmount: p.totalAmount || '', insuranceRate: p.insuranceRate || '',
      insuranceAmount: p.insuranceAmount || '', paymentMethod: p.paymentMethod || '',
      captchaAnswer: p.captchaAnswer || '',
      registrationsPerDay: p.registrationsPerDay, intervalMinutes: p.intervalMinutes,
      maxRetries: p.maxRetries, retryIntervalSec: p.retryIntervalSec,
      priority: p.priority, notes: p.notes || '',
    })
    setStep(0)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.plateNumber || !form.driverName || !form.driverNationalId) {
      toast.error('فیلدهای الزامی را پر کنید')
      return
    }
    setSaving(true)
    try {
      const body = { ...form, accountId: form.accountId || null }
      if (editProfile) {
        const res = await fetch(`/api/registration-profiles/${editProfile.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        toast.success('پروفایل بروزرسانی شد')
      } else {
        const res = await fetch('/api/registration-profiles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        toast.success('پروفایل ایجاد شد')
      }
      setDialogOpen(false); setEditProfile(null); fetchProfiles(); fetchStats()
    } catch {
      toast.error('خطا در ذخیره‌سازی')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/registration-profiles/${id}`, { method: 'DELETE' })
      toast.success('حذف شد'); fetchProfiles(); fetchStats()
    } catch { toast.error('خطا در حذف') }
  }

  const handleToggle = async (id: string) => {
    try {
      await fetch(`/api/registration-profiles/${id}/toggle`, { method: 'POST' })
      toast.success('تغییر وضعیت'); fetchProfiles(); fetchStats()
    } catch { toast.error('خطا در تغییر وضعیت') }
  }

  const updateField = (key: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const statCards = [
    { label: 'کل پروفایل‌ها', value: stats.total, icon: BarChart3, color: 'text-blue-500' },
    { label: 'فعال', value: stats.active, icon: CheckCircle, color: 'text-green-500' },
    { label: 'غیرفعال', value: stats.disabled, icon: XCircle, color: 'text-red-500' },
    { label: 'کل اجراها', value: stats.totalRuns, icon: Settings, color: 'text-purple-500' },
    { label: 'موفق', value: stats.successfulRuns, icon: CheckCircle, color: 'text-emerald-500' },
    { label: 'ناموفق', value: stats.failedRuns, icon: XCircle, color: 'text-orange-500' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">پروفایل‌های ثبت‌نام</h1>
          <p className="text-muted-foreground">مدیریت پروفایل‌های ثبت بارنامه خودکار</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4 ml-2" />افزودن پروفایل</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${s.color}`}><s.icon className="size-5" /></div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="جستجو بر اساس نام، پلاک، راننده..." className="pr-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} autoFocus />
            </div>
            <div className="flex gap-1">
              {[{ k: 'all', l: 'همه' }, { k: 'active', l: 'فعال' }, { k: 'disabled', l: 'غیرفعال' }].map((f) => (
                <Button key={f.k} size="sm" variant={filter === f.k ? 'default' : 'outline'} onClick={() => { setFilter(f.k); setPage(1) }}>{f.l}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  <th className="pb-3 font-medium">نام پروفایل</th>
                  <th className="pb-3 font-medium">پلاک</th>
                  <th className="pb-3 font-medium">راننده</th>
                  <th className="pb-3 font-medium">مبدأ → مقصد</th>
                  <th className="pb-3 font-medium">اکانت</th>
                  <th className="pb-3 font-medium">ثبت در روز</th>
                  <th className="pb-3 font-medium">وضعیت</th>
                  <th className="pb-3 font-medium">آخرین اجرا</th>
                  <th className="pb-3 font-medium text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />در حال بارگذاری...</td></tr>
                ) : profiles.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">پروفایلی یافت نشد</td></tr>
                ) : profiles.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-3 font-medium">{p.name}</td>
                    <td className="py-3 text-muted-foreground">{p.plateNumber}</td>
                    <td className="py-3">{p.driverName}</td>
                    <td className="py-3 text-xs">{p.originCity} → {p.destCity}</td>
                    <td className="py-3 text-xs text-muted-foreground">{p.barbargAccount?.accountName || '-'}</td>
                    <td className="py-3 text-center">{p.registrationsPerDay}</td>
                    <td className="py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        {p.status === 'active' ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">{p.lastRun ? new Date(p.lastRun).toLocaleString('fa') : '-'}</td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleToggle(p.id)}>
                          {p.status === 'active' ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">صفحه {page} از {totalPages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronRight className="size-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg">{editProfile ? 'ویرایش پروفایل' : 'افزودن پروفایل جدید'}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b">
            {STEPS.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  step === i
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <s.icon className="size-3.5" />
                <span>{i + 1}. {s.label}</span>
              </button>
            ))}
          </div>

          <div className="py-4 min-h-[400px]">
            {step === 0 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۱: مشخصات فرستنده" />
                <div className="grid grid-cols-2 gap-4">
                  <FieldSelect label="نوع فرستنده *" value={form.senderType as string} onChange={(v) => updateField('senderType', v)} options={SENDER_TYPES} placeholder="انتخاب کنید" />
                  <Field label="کدملی *" value={form.senderNationalId as string} onChange={(v) => updateField('senderNationalId', v)} placeholder="کدملی" />
                  <Field label="شماره موبایل *" value={form.senderMobile as string} onChange={(v) => updateField('senderMobile', v)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" />
                  <Field label="نام *" value={form.senderFirstName as string} onChange={(v) => updateField('senderFirstName', v)} placeholder="نام" />
                  <Field label="نام خانوادگی *" value={form.senderLastName as string} onChange={(v) => updateField('senderLastName', v)} placeholder="نام خانوادگی" />
                  <Field label="شماره ثابت" value={form.senderPhone as string} onChange={(v) => updateField('senderPhone', v)} placeholder="۰۲۱۱۲۳۴۵۶۷۸" />
                  <Field label="کدپستی" value={form.senderPostalCode as string} onChange={(v) => updateField('senderPostalCode', v)} placeholder="کدپستی" />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۲: مشخصات گیرنده" />
                <div className="grid grid-cols-2 gap-4">
                  <FieldSelect label="نوع گیرنده *" value={form.receiverType as string} onChange={(v) => updateField('receiverType', v)} options={RECEIVER_TYPES} placeholder="انتخاب کنید" />
                  <Field label="کدملی *" value={form.receiverNationalId as string} onChange={(v) => updateField('receiverNationalId', v)} placeholder="کدملی" />
                  <Field label="شماره موبایل *" value={form.receiverMobile as string} onChange={(v) => updateField('receiverMobile', v)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" />
                  <Field label="نام *" value={form.receiverFirstName as string} onChange={(v) => updateField('receiverFirstName', v)} placeholder="نام" />
                  <Field label="نام خانوادگی *" value={form.receiverLastName as string} onChange={(v) => updateField('receiverLastName', v)} placeholder="نام خانوادگی" />
                  <Field label="شماره ثابت" value={form.receiverPhone as string} onChange={(v) => updateField('receiverPhone', v)} placeholder="۰۲۱۱۲۳۴۵۶۷۸" />
                  <Field label="کدپستی" value={form.receiverPostalCode as string} onChange={(v) => updateField('receiverPostalCode', v)} placeholder="کدپستی" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <SectionTitle title="مرحله ۳: مشخصات وسیله" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">حساب کاربری</Label>
                      <Select value={(form.accountId as string) || 'none'} onValueChange={(v) => updateField('accountId', (v ?? '') === 'none' ? '' : (v ?? ''))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب اکانت" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون اکانت</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.accountName} ({a.username})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Field label="شماره پلاک *" value={form.plateNumber as string} onChange={(v) => updateField('plateNumber', v)} placeholder="۱۲ الف ۳۴۵" />
                    <Field label="شماره مسلسل" value={form.vehicleSerialNumber as string} onChange={(v) => updateField('vehicleSerialNumber', v)} />
                    <Field label="شماره موتور" value={form.vehicleMotorNumber as string} onChange={(v) => updateField('vehicleMotorNumber', v)} />
                    <FieldSelect label="برگه بیمه" value={form.vehicleInsurancePage as string} onChange={(v) => updateField('vehicleInsurancePage', v)} options={INSURANCE_OPTIONS} placeholder="انتخاب کنید" />
                    <FieldSelect label="پلاک یدکی" value={form.vehicleSparePlate as string} onChange={(v) => updateField('vehicleSparePlate', v)} options={INSURANCE_OPTIONS} placeholder="انتخاب کنید" />
                  </div>
                </div>

                <div className="space-y-4">
                  <SectionTitle title="مشخصات راننده" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="راننده *" value={form.driverName as string} onChange={(v) => updateField('driverName', v)} placeholder="نام و نام خانوادگی" />
                    <Field label="تلفن همراه" value={form.driverMobile as string} onChange={(v) => updateField('driverMobile', v)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" />
                    <Field label="شماره گواهینامه" value={form.driverLicense as string} onChange={(v) => updateField('driverLicense', v)} />
                    <Field label="شماره کارت" value={form.driverCard as string} onChange={(v) => updateField('driverCard', v)} />
                    <Field label="شماره شناسنامه" value={form.driverIdNumber as string} onChange={(v) => updateField('driverIdNumber', v)} />
                    <Field label="کد ملی راننده" value={form.driverNationalId as string} onChange={(v) => updateField('driverNationalId', v)} />
                    <FieldSelect label="جنسیت" value={form.driverGender as string} onChange={(v) => updateField('driverGender', v)} options={GENDER_OPTIONS} placeholder="انتخاب کنید" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۴: مشخصات بار" />
                <div className="grid grid-cols-2 gap-4">
                  <FieldSelect label="کالای قابل بارگیری *" value={form.cargoName as string} onChange={(v) => updateField('cargoName', v)} options={CARGO_TYPES} placeholder="انتخاب کنید" />
                  <Field label="نوع بسته‌بندی" value={form.cargoPackaging as string} onChange={(v) => updateField('cargoPackaging', v)} />
                  <Field label="وزن بار" value={form.cargoWeight as string} onChange={(v) => updateField('cargoWeight', v)} placeholder="کیلوگرم" />
                  <Field label="تعداد" value={form.cargoQuantity as string} onChange={(v) => updateField('cargoQuantity', v)} placeholder="تعداد" />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۵: کرایه و مسیر حمل" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="پیش کرایه" value={form.advanceFare as string} onChange={(v) => updateField('advanceFare', v)} placeholder="مبلغ" />
                  <FieldSelect label="نوع کرایه" value={form.fareType as string} onChange={(v) => updateField('fareType', v)} options={FARE_TYPES} placeholder="انتخاب کنید" />
                  <Field label="بیمه باربری" value={form.transportInsurance as string} onChange={(v) => updateField('transportInsurance', v)} />
                  <Field label="کلیه موارد" value={form.totalAmount as string} onChange={(v) => updateField('totalAmount', v)} placeholder="مبلغ کل" />
                  <Field label="نرخ بیمه حمل" value={form.insuranceRate as string} onChange={(v) => updateField('insuranceRate', v)} placeholder="درصد" />
                  <Field label="مبلغ بیمه حمل" value={form.insuranceAmount as string} onChange={(v) => updateField('insuranceAmount', v)} placeholder="مبلغ" />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۶: بازبینی مشخصات" />
                <ReviewSummary form={form} accounts={accounts} />

                <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                  <Field label="کد امنیتی *" value={form.captchaAnswer as string} onChange={(v) => updateField('captchaAnswer', v)} placeholder="کپچا" />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ChevronRight className="size-4 ml-1" />مرحله قبل
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)}>
                  مرحله بعد<ChevronLeft className="size-4 mr-1" />
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="size-4 ml-1 animate-spin" />}
                  {saving ? '...' : 'ذخیره و تأیید'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-foreground border-b pb-2">{title}</h3>
}

function ReviewSummary({ form, accounts }: { form: Record<string, string | number>; accounts: Account[] }) {
  const account = accounts.find((a) => a.id === form.accountId)
  const sections = [
    {
      title: 'فرستنده',
      icon: Send,
      fields: [
        ['نوع', form.senderType],
        ['کدملی', form.senderNationalId],
        ['موبایل', form.senderMobile],
        ['نام', form.senderFirstName],
        ['نام خانوادگی', form.senderLastName],
        ['تلفن', form.senderPhone],
        ['کدپستی', form.senderPostalCode],
      ],
    },
    {
      title: 'گیرنده',
      icon: User,
      fields: [
        ['نوع', form.receiverType],
        ['کدملی', form.receiverNationalId],
        ['موبایل', form.receiverMobile],
        ['نام', form.receiverFirstName],
        ['نام خانوادگی', form.receiverLastName],
        ['تلفن', form.receiverPhone],
        ['کدپستی', form.receiverPostalCode],
      ],
    },
    {
      title: 'وسیله و راننده',
      icon: Truck,
      fields: [
        ['اکانت', account ? `${account.accountName}` : '-'],
        ['پلاک', form.plateNumber],
        ['شماره مسلسل', form.vehicleSerialNumber],
        ['شماره موتور', form.vehicleMotorNumber],
        ['برگه بیمه', form.vehicleInsurancePage],
        ['پلاک یدکی', form.vehicleSparePlate],
        ['راننده', form.driverName],
        ['موبایل راننده', form.driverMobile],
        ['گواهینامه', form.driverLicense],
        ['شماره کارت', form.driverCard],
        ['شناسنامه', form.driverIdNumber],
        ['کد ملی', form.driverNationalId],
        ['جنسیت', form.driverGender],
      ],
    },
    {
      title: 'بار',
      icon: Package,
      fields: [
        ['کالا', form.cargoName],
        ['بسته‌بندی', form.cargoPackaging],
        ['وزن', form.cargoWeight],
        ['تعداد', form.cargoQuantity],
      ],
    },
    {
      title: 'کرایه و مسیر',
      icon: CreditCard,
      fields: [
        ['پیش کرایه', form.advanceFare],
        ['نوع کرایه', form.fareType],
        ['بیمه باربری', form.transportInsurance],
        ['کلیه موارد', form.totalAmount],
        ['نرخ بیمه', form.insuranceRate],
        ['مبلغ بیمه', form.insuranceAmount],
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {sections.map((sec) => (
        <div key={sec.title} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <sec.icon className="size-3.5" />
            {sec.title}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {sec.fields.map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <span className="text-xs font-medium">{(value as string) || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  )
}

function FieldSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value || 'none'} onValueChange={(v) => onChange((v ?? '') === 'none' ? '' : (v ?? ''))}>
        <SelectTrigger className="h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">انتخاب کنید</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
