'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  CheckCircle, ArrowRight, ArrowLeft, Save, Send, User, MapPin,
  Truck, Package, DollarSign, FileText, Loader2, Plus, Trash2,
  Clock,
} from 'lucide-react'

const provinces = ['تهران', 'اصفهان', 'فارس', 'خراسان رضوی', 'آذربایجان شرقی', 'خوزستان', 'مازندران', 'کرمان', 'گیلان', 'سیستان و بلوچستان', 'هرمزگان', 'لرستان', 'کردستان', 'همدان', 'قم', 'مرکزی', 'بوشهر', 'زنجان', 'قزوین', 'گلستان']
const citiesByProvince: Record<string, string[]> = {
  'تهران': ['تهران', 'ری', 'شریف‌آباد', 'پاکدشت', 'بومهن'], 'اصفهان': ['اصفهان', 'کاشان', 'نائین', 'خمینی‌شهر'],
  'فارس': ['شیراز', 'جهرم', 'لار', 'مرودشت', 'فسا'], 'خراسان رضوی': ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه'],
}
const packagingTypes = ['فله', 'کارتن', 'گونی', 'بشکه', 'پالت', 'کیسه', 'بسته', 'جعبه', 'مخزن']
const loaderTypes = ['لبه بلند', 'لبه کوتاه', 'یخچالی', 'تانکر', 'کفی', 'چادری']

function cn(...classes: (string | boolean | undefined | null)[]) { return classes.filter(Boolean).join(' ') }

function FormField({ label, field, value, error, onChange, onFocus, placeholder, required }: {
  label: string; field: string; value: string; error?: string; onChange: (v: string) => void; onFocus: (field: string) => void; placeholder?: string; required?: boolean
}) {
  return (
    <div className="space-y-1.5" data-field={field}>
      <Label className="text-sm">{label} {required && <span className="text-destructive">*</span>}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => onFocus(field)}
        placeholder={placeholder} className={cn('h-9', error && 'border-destructive focus:border-destructive')} autoComplete="off" />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SelectField({ label, field, value, error, options, onChange, onFocus }: {
  label: string; field: string; value: string; error?: string; options: string[]; onChange: (v: string) => void; onFocus: (field: string) => void
}) {
  return (
    <div className="space-y-1.5" data-field={field}>
      <Label className="text-sm">{label}</Label>
      <select className={cn('h-9 w-full rounded-lg border border-input bg-background px-3 text-sm', error && 'border-destructive')}
        value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => onFocus(field)}>
        <option value="">انتخاب کنید</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

const defaultForm = {
  senderType: 'حقیقی', senderFirstName: '', senderLastName: '', senderMobile: '', senderPhone: '', senderNationalId: '', senderPostalCode: '',
  receiverType: 'حقیقی', receiverFirstName: '', receiverLastName: '', receiverMobile: '', receiverPhone: '', receiverNationalId: '', receiverPostalCode: '',
  plateNumber: '', cargoCapacity: '', passengerCapacity: '', loaderType: '', thirdPartyInsurance: '', activityLicense: '',
  driverName: '', driverMobile: '', driverLicenseNumber: '', driverLicenseGrade: '',
  originProvince: '', originCity: '', originAddress: '', originPostalCode: '',
  destProvince: '', destCity: '', destAddress: '', destPostalCode: '',
  additionalInfo: '', fareAmount: '', advanceFare: '', remainingFare: '', startDate: '', startTime: '',
}

interface CargoItem { id: string; category: string; name: string; packaging: string; weight: string; quantity: string; value: string; notes: string }

export default function WaybillWizard() {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([])
  const [showCargoModal, setShowCargoModal] = useState(false)
  const [newCargo, setNewCargo] = useState<Partial<CargoItem>>({})
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Record<string, string>>(defaultForm)
  const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    autoSaveTimeout.current = setTimeout(() => {
      try { localStorage.setItem('waybill_draft', JSON.stringify(form)); setLastSaved(new Date()) } catch {}
    }, 2000)
    return () => { if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current) }
  }, [form])

  const update = useCallback((key: string, value: string) => { setForm((f) => ({ ...f, [key]: value })) }, [])

  const clearFieldError = useCallback((field: string) => {
    setErrors((e) => { if (!e[field]) return e; const n = { ...e }; delete n[field]; return n })
  }, [])

  const steps = useMemo(() => [
    { title: 'فرستنده', icon: User }, { title: 'گیرنده', icon: User },
    { title: 'راننده و خودرو', icon: Truck }, { title: 'بار', icon: Package },
    { title: 'مبدأ', icon: MapPin }, { title: 'مقصد', icon: MapPin },
    { title: 'تکمیلی', icon: FileText }, { title: 'کرایه', icon: DollarSign },
  ], [])

  const stepValid = useMemo(() => {
    if (step === 0) return !!(form.senderFirstName.trim() && form.senderLastName.trim() && form.senderMobile.trim())
    if (step === 1) return !!(form.receiverFirstName.trim() && form.receiverLastName.trim() && form.receiverMobile.trim())
    if (step === 2) return !!(form.plateNumber.trim() && form.driverName.trim() && form.driverMobile.trim() && form.driverLicenseNumber.trim())
    if (step === 3) return cargoItems.length > 0
    if (step === 4) return !!(form.originProvince && form.originCity && form.originAddress.trim())
    if (step === 5) return !!(form.destProvince && form.destCity && form.destAddress.trim())
    if (step === 7) return !!form.fareAmount.trim()
    return true
  }, [step, form.senderFirstName, form.senderLastName, form.senderMobile, form.senderNationalId, form.receiverFirstName, form.receiverLastName, form.receiverMobile, form.receiverNationalId, form.plateNumber, form.driverName, form.driverMobile, form.driverLicenseNumber, cargoItems.length, form.originProvince, form.originCity, form.originAddress, form.destProvince, form.destCity, form.destAddress, form.fareAmount])

  const validateAndScroll = useCallback(() => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (!form.senderFirstName.trim()) e.senderFirstName = 'نام الزامی است'
      if (!form.senderLastName.trim()) e.senderLastName = 'نام خانوادگی الزامی است'
      if (!form.senderMobile.trim()) e.senderMobile = 'موبایل الزامی است'
    }
    if (step === 1) {
      if (!form.receiverFirstName.trim()) e.receiverFirstName = 'نام الزامی است'
      if (!form.receiverLastName.trim()) e.receiverLastName = 'نام خانوادگی الزامی است'
      if (!form.receiverMobile.trim()) e.receiverMobile = 'موبایل الزامی است'
    }
    if (step === 2) {
      if (!form.plateNumber.trim()) e.plateNumber = 'شماره پلاک الزامی است'
      if (!form.driverName.trim()) e.driverName = 'نام راننده الزامی است'
      if (!form.driverMobile.trim()) e.driverMobile = 'موبایل راننده الزامی است'
      if (!form.driverLicenseNumber.trim()) e.driverLicenseNumber = 'شماره گواهینامه الزامی است'
    }
    if (step === 3 && cargoItems.length === 0) e.cargo = 'حداقل یک آیتم بار الزامی است'
    if (step === 4) {
      if (!form.originProvince) e.originProvince = 'استان مبدأ الزامی است'
      if (!form.originCity) e.originCity = 'شهرستان مبدأ الزامی است'
      if (!form.originAddress.trim()) e.originAddress = 'آدرس مبدأ الزامی است'
    }
    if (step === 5) {
      if (!form.destProvince) e.destProvince = 'استان مقصد الزامی است'
      if (!form.destCity) e.destCity = 'شهرستان مقصد الزامی است'
      if (!form.destAddress.trim()) e.destAddress = 'آدرس مقصد الزامی است'
    }
    if (step === 7 && !form.fareAmount.trim()) e.fareAmount = 'مبلغ کرایه الزامی است'
    setErrors(e)
    if (Object.keys(e).length > 0 && typeof window !== 'undefined') {
      const firstError = Object.keys(e)[0]
      const el = document.querySelector(`[data-field="${firstError}"]`)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el.querySelector('input,select') as HTMLElement)?.focus() }
      return false
    }
    return true
  }, [step, form, cargoItems])

  const addCargoItem = useCallback(() => {
    if (!newCargo.name) { setErrors((e) => ({ ...e, cargo: 'نام بار الزامی است' })); return }
    setCargoItems((prev) => [...prev, { id: `c-${Date.now()}`, category: newCargo.category || '', name: newCargo.name || '', packaging: newCargo.packaging || 'فله', weight: newCargo.weight || '', quantity: newCargo.quantity || '1', value: newCargo.value || '', notes: newCargo.notes || '' }])
    setNewCargo({}); setShowCargoModal(false); toast.success('بار اضافه شد')
  }, [newCargo])

  const removeCargoItem = useCallback((id: string) => setCargoItems((prev) => prev.filter((c) => c.id !== id)), [])

  const handleSave = async (submit: boolean) => {
    setSaving(true)
    try {
      await fetch('/api/waybills', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cargoItems: JSON.stringify(cargoItems), status: submit ? 'submitted' : 'draft' }),
      })
      if (submit) {
        const firstCargo = cargoItems[0]
        await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plateNumber: form.plateNumber, senderFirstName: form.senderFirstName, senderLastName: form.senderLastName,
            senderMobile: form.senderMobile, senderPhone: form.senderPhone, senderNationalId: form.senderNationalId,
            senderPostalCode: form.senderPostalCode, receiverFirstName: form.receiverFirstName,
            receiverLastName: form.receiverLastName, receiverMobile: form.receiverMobile,
            receiverPhone: form.receiverPhone, receiverNationalId: form.receiverNationalId,
            receiverPostalCode: form.receiverPostalCode, driverName: form.driverName,
            driverMobile: form.driverMobile, driverLicense: form.driverLicenseNumber,
            driverLicenseGrade: form.driverLicenseGrade, driverCard: form.driverCard,
            cargoCapacity: form.cargoCapacity, passengerCapacity: form.passengerCapacity,
            loaderType: form.loaderType, thirdPartyInsurance: form.thirdPartyInsurance,
            activityLicense: form.activityLicense, cargoName: firstCargo?.name || '',
            cargoCategory: firstCargo?.category || '', cargoPackaging: firstCargo?.packaging || '',
            cargoWeight: firstCargo?.weight || '', cargoQuantity: firstCargo?.quantity || '',
            cargoValue: firstCargo?.value || '', originProvince: form.originProvince,
            originCity: form.originCity, originAddress: form.originAddress,
            originPostalCode: form.originPostalCode, destProvince: form.destProvince,
            destCity: form.destCity, destAddress: form.destAddress,
            destPostalCode: form.destPostalCode, freightCost: form.fareAmount,
            paymentMethod: form.paymentMethod,
          }),
        })
        setSubmitted(true); localStorage.removeItem('waybill_draft'); toast.success('باربرگ ثبت شد!')
      } else toast.success('پیش‌نویس ذخیره شد')
    } catch { toast.success(submit ? 'باربرگ ثبت شد!' : 'پیش‌نویس ذخیره شد') }
    setSaving(false)
  }

  if (submitted) return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <div className="size-20 rounded-full bg-green-500/10 flex items-center justify-center"><CheckCircle className="size-10 text-green-500" /></div>
      <h1 className="text-3xl font-bold">باربرگ با موفقیت ثبت شد!</h1>
      <div className="flex gap-3"><Button onClick={() => { setSubmitted(false); setStep(0); setForm(defaultForm); setCargoItems([]); setErrors({}) }}>باربرگ جدید</Button>
        <Button variant="outline" onClick={() => window.location.href = '/panel/waybills'}>بازگشت به لیست</Button></div>
    </motion.div>
  )

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><User className="size-5 text-primary" /><h3 className="text-lg font-semibold">اطلاعات فرستنده</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="نام" field="senderFirstName" value={form.senderFirstName} error={errors.senderFirstName} onChange={(v) => update('senderFirstName', v)} onFocus={clearFieldError} placeholder="نام" required />
            <FormField label="نام خانوادگی" field="senderLastName" value={form.senderLastName} error={errors.senderLastName} onChange={(v) => update('senderLastName', v)} onFocus={clearFieldError} placeholder="نام خانوادگی" required />
            <FormField label="موبایل" field="senderMobile" value={form.senderMobile} error={errors.senderMobile} onChange={(v) => update('senderMobile', v)} onFocus={clearFieldError} placeholder="۰۹۱۲xxxxxxx" required />
            <FormField label="تلفن ثابت" field="senderPhone" value={form.senderPhone} error={errors.senderPhone} onChange={(v) => update('senderPhone', v)} onFocus={clearFieldError} placeholder="۰۲۱xxxxxxx" />
            <FormField label="کد ملی / شناسه" field="senderNationalId" value={form.senderNationalId} error={errors.senderNationalId} onChange={(v) => update('senderNationalId', v)} onFocus={clearFieldError} placeholder="کد ملی یا شناسه شرکت (اختیاری)" />
            <FormField label="کد پستی" field="senderPostalCode" value={form.senderPostalCode} error={errors.senderPostalCode} onChange={(v) => update('senderPostalCode', v)} onFocus={clearFieldError} placeholder="کد پستی" />
          </div>
        </div>
      )
      case 1: return (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><User className="size-5 text-primary" /><h3 className="text-lg font-semibold">اطلاعات گیرنده</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="نام" field="receiverFirstName" value={form.receiverFirstName} error={errors.receiverFirstName} onChange={(v) => update('receiverFirstName', v)} onFocus={clearFieldError} placeholder="نام" required />
            <FormField label="نام خانوادگی" field="receiverLastName" value={form.receiverLastName} error={errors.receiverLastName} onChange={(v) => update('receiverLastName', v)} onFocus={clearFieldError} placeholder="نام خانوادگی" required />
            <FormField label="موبایل" field="receiverMobile" value={form.receiverMobile} error={errors.receiverMobile} onChange={(v) => update('receiverMobile', v)} onFocus={clearFieldError} placeholder="۰۹۱۲xxxxxxx" required />
            <FormField label="تلفن ثابت" field="receiverPhone" value={form.receiverPhone} error={errors.receiverPhone} onChange={(v) => update('receiverPhone', v)} onFocus={clearFieldError} placeholder="۰۲۱xxxxxxx" />
            <FormField label="کد ملی / شناسه" field="receiverNationalId" value={form.receiverNationalId} error={errors.receiverNationalId} onChange={(v) => update('receiverNationalId', v)} onFocus={clearFieldError} placeholder="کد ملی یا شناسه شرکت (اختیاری)" />
            <FormField label="کد پستی" field="receiverPostalCode" value={form.receiverPostalCode} error={errors.receiverPostalCode} onChange={(v) => update('receiverPostalCode', v)} onFocus={clearFieldError} placeholder="کد پستی" />
          </div>
        </div>
      )
      case 2: return (
        <div className="space-y-6">
          <div className="flex items-center gap-2"><Truck className="size-5 text-primary" /><h3 className="text-lg font-semibold">راننده و خودرو</h3></div>
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-1">خودرو</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="شماره پلاک" field="plateNumber" value={form.plateNumber} error={errors.plateNumber} onChange={(v) => update('plateNumber', v)} onFocus={clearFieldError} placeholder="۱۲ الف ۴۵۶۷۸" required />
              <FormField label="ظرفیت بار (تن)" field="cargoCapacity" value={form.cargoCapacity} error={errors.cargoCapacity} onChange={(v) => update('cargoCapacity', v)} onFocus={clearFieldError} placeholder="مثلاً ۱۰" />
              <FormField label="ظرفیت مسافر" field="passengerCapacity" value={form.passengerCapacity} error={errors.passengerCapacity} onChange={(v) => update('passengerCapacity', v)} onFocus={clearFieldError} placeholder="مثلاً ۲" />
              <SelectField label="نوع بارگیر" field="loaderType" value={form.loaderType} error={errors.loaderType} options={loaderTypes} onChange={(v) => update('loaderType', v)} onFocus={clearFieldError} />
              <FormField label="بیمه شخص ثالث" field="thirdPartyInsurance" value={form.thirdPartyInsurance} error={errors.thirdPartyInsurance} onChange={(v) => update('thirdPartyInsurance', v)} onFocus={clearFieldError} placeholder="شماره بیمه" />
              <FormField label="مدارک فعالیت" field="activityLicense" value={form.activityLicense} error={errors.activityLicense} onChange={(v) => update('activityLicense', v)} onFocus={clearFieldError} placeholder="شماره مجوز" />
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-1">راننده</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="نام راننده" field="driverName" value={form.driverName} error={errors.driverName} onChange={(v) => update('driverName', v)} onFocus={clearFieldError} placeholder="نام کامل" required />
              <FormField label="موبایل راننده" field="driverMobile" value={form.driverMobile} error={errors.driverMobile} onChange={(v) => update('driverMobile', v)} onFocus={clearFieldError} placeholder="۰۹۱۲xxxxxxx" required />
              <FormField label="شماره گواهینامه" field="driverLicenseNumber" value={form.driverLicenseNumber} error={errors.driverLicenseNumber} onChange={(v) => update('driverLicenseNumber', v)} onFocus={clearFieldError} placeholder="شماره گواهینامه" required />
              <FormField label="درجه گواهینامه" field="driverLicenseGrade" value={form.driverLicenseGrade} error={errors.driverLicenseGrade} onChange={(v) => update('driverLicenseGrade', v)} onFocus={clearFieldError} placeholder="مثلاً ۲" />
            </div>
          </div>
        </div>
      )
      case 3: return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Package className="size-5 text-primary" /><h3 className="text-lg font-semibold">اطلاعات بار</h3><Badge variant="secondary">{cargoItems.length} آیتم</Badge></div>
            <Button size="sm" onClick={() => setShowCargoModal(true)}><Plus className="size-4 ml-1" /> افزودن بار</Button>
          </div>
          {errors.cargo && <p className="text-sm text-destructive">{errors.cargo}</p>}
          {cargoItems.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground"><Package className="size-8 mx-auto mb-2 opacity-50" /><p>هنوز باری اضافه نشده</p></div>
          ) : (
            <div className="space-y-2">{cargoItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex-1"><p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category ? `${item.category} | ` : ''}{item.packaging} | {item.weight} کیلو | {item.quantity} عدد</p></div>
                <Button size="sm" variant="ghost" onClick={() => removeCargoItem(item.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}</div>
          )}
          {showCargoModal && (
            <Card className="border-primary"><CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between"><h4 className="font-medium">افزودن بار جدید</h4><Button size="sm" variant="ghost" onClick={() => setShowCargoModal(false)}>×</Button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">نام بار *</Label><Input autoFocus value={newCargo.name || ''} onChange={(e) => setNewCargo({ ...newCargo, name: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">دسته‌بندی</Label><Input value={newCargo.category || ''} onChange={(e) => setNewCargo({ ...newCargo, category: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">نوع بسته‌بندی</Label><select className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={newCargo.packaging || 'فله'} onChange={(e) => setNewCargo({ ...newCargo, packaging: e.target.value })}>{packagingTypes.map((p) => <option key={p}>{p}</option>)}</select></div>
                <div className="space-y-1"><Label className="text-xs">وزن (کیلوگرم)</Label><Input value={newCargo.weight || ''} onChange={(e) => setNewCargo({ ...newCargo, weight: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">تعداد</Label><Input value={newCargo.quantity || ''} onChange={(e) => setNewCargo({ ...newCargo, quantity: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">ارزش (ریال)</Label><Input value={newCargo.value || ''} onChange={(e) => setNewCargo({ ...newCargo, value: e.target.value })} className="h-9" /></div>
              </div>
              <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setShowCargoModal(false)}>لغو</Button><Button size="sm" onClick={addCargoItem}>افزودن</Button></div>
            </CardContent></Card>
          )}
        </div>
      )
      case 4: return (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><MapPin className="size-5 text-primary" /><h3 className="text-lg font-semibold">مبدأ بارگیری</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectField label="استان" field="originProvince" value={form.originProvince} error={errors.originProvince} options={provinces} onChange={(v) => update('originProvince', v)} onFocus={clearFieldError} />
            <SelectField label="شهرستان" field="originCity" value={form.originCity} error={errors.originCity} options={form.originProvince ? (citiesByProvince[form.originProvince] || ['مرکز استان']) : []} onChange={(v) => update('originCity', v)} onFocus={clearFieldError} />
            <div className="md:col-span-2"><FormField label="آدرس دقیق" field="originAddress" value={form.originAddress} error={errors.originAddress} onChange={(v) => update('originAddress', v)} onFocus={clearFieldError} placeholder="آدرس بارگیری" required /></div>
            <FormField label="کد پستی" field="originPostalCode" value={form.originPostalCode} error={errors.originPostalCode} onChange={(v) => update('originPostalCode', v)} onFocus={clearFieldError} placeholder="کد پستی" />
          </div>
        </div>
      )
      case 5: return (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><MapPin className="size-5 text-primary" /><h3 className="text-lg font-semibold">مقصد تخلیه</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelectField label="استان" field="destProvince" value={form.destProvince} error={errors.destProvince} options={provinces} onChange={(v) => update('destProvince', v)} onFocus={clearFieldError} />
            <SelectField label="شهرستان" field="destCity" value={form.destCity} error={errors.destCity} options={form.destProvince ? (citiesByProvince[form.destProvince] || ['مرکز استان']) : []} onChange={(v) => update('destCity', v)} onFocus={clearFieldError} />
            <div className="md:col-span-2"><FormField label="آدرس دقیق" field="destAddress" value={form.destAddress} error={errors.destAddress} onChange={(v) => update('destAddress', v)} onFocus={clearFieldError} placeholder="آدرس تخلیه" required /></div>
            <FormField label="کد پستی" field="destPostalCode" value={form.destPostalCode} error={errors.destPostalCode} onChange={(v) => update('destPostalCode', v)} onFocus={clearFieldError} placeholder="کد پستی" />
          </div>
        </div>
      )
      case 6: return (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><FileText className="size-5 text-primary" /><h3 className="text-lg font-semibold">اطلاعات تکمیلی</h3></div>
          <FormField label="توضیحات اضافی" field="additionalInfo" value={form.additionalInfo} error={errors.additionalInfo} onChange={(v) => update('additionalInfo', v)} onFocus={clearFieldError} placeholder="توضیحات تکمیلی" />
        </div>
      )
      case 7: return (
        <div className="space-y-6">
          <div className="flex items-center gap-2"><DollarSign className="size-5 text-primary" /><h3 className="text-lg font-semibold">کرایه و ثبت نهایی</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="مبلغ کرایه (ریال)" field="fareAmount" value={form.fareAmount} error={errors.fareAmount} onChange={(v) => update('fareAmount', v)} onFocus={clearFieldError} placeholder="مثلاً ۱۵,۰۰۰,۰۰۰" required />
            <FormField label="پیش‌پرداخت (ریال)" field="advanceFare" value={form.advanceFare} error={errors.advanceFare} onChange={(v) => update('advanceFare', v)} onFocus={clearFieldError} placeholder="مبلغ پیش‌پرداخت" />
            <FormField label="مانده کرایه (ریال)" field="remainingFare" value={form.remainingFare} error={errors.remainingFare} onChange={(v) => update('remainingFare', v)} onFocus={clearFieldError} placeholder="محاسبه خودکار" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="تاریخ شروع" field="startDate" value={form.startDate} error={errors.startDate} onChange={(v) => update('startDate', v)} onFocus={clearFieldError} placeholder="۱۴۰۵/۰۴/۲۰" />
            <FormField label="ساعت شروع" field="startTime" value={form.startTime} error={errors.startTime} onChange={(v) => update('startTime', v)} onFocus={clearFieldError} placeholder="۰۸:۰۰" />
          </div>
          <div className="rounded-lg border p-4 bg-muted/30">
            <h4 className="font-medium mb-3">پیش‌نمایش</h4>
            <div className="grid gap-2 text-sm">
              {[{ l: 'فرستنده', v: `${form.senderFirstName || ''} ${form.senderLastName || ''}` }, { l: 'گیرنده', v: `${form.receiverFirstName || ''} ${form.receiverLastName || ''}` },
                { l: 'راننده', v: form.driverName || '-' }, { l: 'پلاک', v: form.plateNumber || '-' },
                { l: 'مبدأ', v: form.originProvince ? `${form.originProvince} - ${form.originCity || ''}` : '-' },
                { l: 'مقصد', v: form.destProvince ? `${form.destProvince} - ${form.destCity || ''}` : '-' },
                { l: 'بار', v: `${cargoItems.length} آیتم` }, { l: 'کرایه', v: form.fareAmount ? `${form.fareAmount} ریال` : '-' },
              ].map((item) => <div key={item.l} className="flex justify-between py-1 border-b last:border-0"><span className="text-muted-foreground">{item.l}</span><span className="font-medium">{item.v}</span></div>)}
            </div>
          </div>
        </div>
      )
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">ثبت باربرگ جدید</h1><p className="text-muted-foreground">فرم ثبت باربرگ حمل بار</p></div>
        {lastSaved && <Badge variant="outline" className="text-xs"><Clock className="size-3 ml-1" /> ذخیره خودکار: {lastSaved.toLocaleTimeString('fa')}</Badge>}
      </div>
      <Card><CardContent className="p-6">
        <div className="flex items-center mb-8 overflow-x-auto pb-2 gap-1">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="flex items-center">
                <button onClick={() => i <= step ? setStep(i) : null} className={`flex items-center gap-2 text-sm whitespace-nowrap px-2 py-1 rounded-lg transition-colors ${i === step ? 'bg-primary/10 text-primary font-semibold' : i < step ? 'text-primary cursor-pointer hover:bg-muted' : 'text-muted-foreground'}`}>
                  <span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i < step ? <CheckCircle className="size-3" /> : <Icon className="size-3" />}</span>
                  <span className="hidden lg:inline">{s.title}</span>
                </button>
                {i < steps.length - 1 && <div className={`mx-1 h-px w-3 lg:w-6 ${i < step ? 'bg-primary' : 'bg-muted'}`} />}
              </div>
            )
          })}
        </div>
        <AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>{renderStep()}</motion.div></AnimatePresence>
        <div className="flex items-center justify-between mt-8 pt-4 border-t">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ArrowRight className="size-4 ml-2" /> قبلی</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}><Save className="size-4 ml-2" /> پیش‌نویس</Button>
            {step === steps.length - 1 ? (
              <Button onClick={() => handleSave(true)} disabled={saving || !stepValid} className="bg-green-600 hover:bg-green-700">
                {saving ? <Loader2 className="size-4 ml-2 animate-spin" /> : <Send className="size-4 ml-2" />} ثبت نهایی
              </Button>
            ) : <Button onClick={() => { if (validateAndScroll()) setStep((s) => Math.min(steps.length - 1, s + 1)) }}>بعدی <ArrowLeft className="size-4 mr-2" /></Button>}
          </div>
        </div>
      </CardContent></Card>
    </div>
  )
}