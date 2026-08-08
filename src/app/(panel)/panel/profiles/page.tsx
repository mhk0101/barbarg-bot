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
  Download, RefreshCw, AlertCircle,
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

const MANUAL_LOCATION_TAG = '[manual-location]'
const MAP_JSON_START = '[map-location-json]'
const MAP_JSON_END = '[/map-location-json]'

function hasManualLocation(notes?: string | null) {
  return String(notes || '').includes(MANUAL_LOCATION_TAG)
}

function hasSavedMapLocation(notes?: string | null) {
  const t = String(notes || '')
  return t.includes(MAP_JSON_START) && t.includes(MAP_JSON_END)
}

function parseSavedMapLocations(notes?: string | null): {
  origin?: { lat?: number; lon?: number; address?: string; province?: string; county?: string }
  destination?: { lat?: number; lon?: number; address?: string; province?: string; county?: string }
} | null {
  const t = String(notes || '')
  const i = t.indexOf(MAP_JSON_START)
  const j = t.indexOf(MAP_JSON_END)
  if (i < 0 || j <= i) return null
  try {
    return JSON.parse(t.slice(i + MAP_JSON_START.length, j).trim())
  } catch {
    return null
  }
}

function stripMapLocationBlock(notes: string) {
  const t = String(notes || '')
  const i = t.indexOf(MAP_JSON_START)
  const j = t.indexOf(MAP_JSON_END)
  if (i >= 0 && j > i) return (t.slice(0, i) + t.slice(j + MAP_JSON_END.length)).trim()
  return t.trim()
}

function validLatLon(lat: unknown, lon: unknown): boolean {
  const la = Number(String(lat ?? '').trim())
  const lo = Number(String(lon ?? '').trim())
  return Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180
}

function parseCoordinatePair(v: unknown): { lat: string; lon: string } | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const nums = s
    .replace(/[؛;]/g, ',')
    .match(/[-+]?\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  const lat = nums[0]
  const lon = nums[1]
  return validLatLon(lat, lon) ? { lat, lon } : null
}

function formatCoordinatePair(lat?: unknown, lon?: unknown): string {
  if (lat === undefined || lat === null || lon === undefined || lon === null) return ''
  if (!validLatLon(lat, lon)) return ''
  return `${lat}, ${lon}`
}

function mapLocationBlockFromForm(form: Record<string, string | number>) {
  const originPair = parseCoordinatePair(form.originCoordinate) ||
    (validLatLon(form.originLat, form.originLon) ? { lat: String(form.originLat), lon: String(form.originLon) } : null)
  const destPair = parseCoordinatePair(form.destCoordinate) ||
    (validLatLon(form.destLat, form.destLon) ? { lat: String(form.destLat), lon: String(form.destLon) } : null)
  if (!originPair || !destPair) return null
  const originLat = originPair.lat
  const originLon = originPair.lon
  const destLat = destPair.lat
  const destLon = destPair.lon
  const now = new Date().toISOString()
  return {
    origin: {
      lat: Number(originLat), lon: Number(originLon),
      address: String(form.originAddress || '').trim(),
      province: String(form.originProvince || '').trim(),
      county: String(form.originCity || '').trim(),
      savedAt: now,
    },
    destination: {
      lat: Number(destLat), lon: Number(destLon),
      address: String(form.destAddress || '').trim(),
      province: String(form.destProvince || '').trim(),
      county: String(form.destCity || '').trim(),
      savedAt: now,
    },
    updatedAt: now,
    source: 'profile-coordinate-input',
  }
}

function stripManualLocationTag(notes: string) {
  return String(notes || '').replace(MANUAL_LOCATION_TAG, '').replace(/\s{2,}/g, ' ').trim()
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
  originLat: '', originLon: '', originCoordinate: '',
  destProvince: '', destCity: '', destAddress: '', destPostalCode: '',
  destLat: '', destLon: '', destCoordinate: '',
  advanceFare: '', fareType: '', freightCost: '', transportInsurance: '',
  totalAmount: '', insuranceRate: '', insuranceAmount: '', paymentMethod: '',
  captchaAnswer: '',
  registrationsPerDay: 10, intervalMinutes: 60, maxRetries: 3,
  retryIntervalSec: 30, priority: 0, notes: '',
}

// مطابق ویزارد واقعی سایت (۱۰ گام) — اینجا گام‌های داده‌محور نمایش داده می‌شوند
const STEPS = [
  { label: 'مشخصات فرستنده', icon: Send },
  { label: 'مشخصات گیرنده', icon: User },
  { label: 'راننده و خودرو', icon: Truck },
  { label: 'مشخصات کالا', icon: Package },
  { label: 'مبدا و مقصد', icon: CreditCard },
  { label: 'بازبینی', icon: Eye },
]

const SENDER_TYPES = ['حقیقی', 'حقوقی']  // مطابق سایت: 1=حقیقی (پیش‌فرض)، 2=حقوقی
const RECEIVER_TYPES = ['حقیقی', 'حقوقی']  // مطابق سایت: 1=حقیقی (پیش‌فرض)، 2=حقوقی
const INSURANCE_OPTIONS = ['دارد', 'ندارد']
const GENDER_OPTIONS = ['مرد', 'زن']
const FARE_TYPES = ['نقدی', 'اعتباری', 'ترکیبی']
const CARGO_TYPES = [
  'آهن آلات', 'پلیمری', 'سیمان', 'گندم', 'برنج', 'شکر', 'روغن',
  'مواد شیمیایی', 'کود', 'مصالح ساختمانی', 'لوازم خانگی', 'پوشاک',
  'مواد غذایی', 'دارو', 'لوازم یدکی', 'مبلمان', 'سنگ', 'چوب',
  'کاغذ', 'قهوه', 'چای', 'میوه', 'سبزیجات', 'گوشت', 'لبنیات',
  'آجر', 'شن و ماسه', 'گچ', 'کاشی و سرامیک', 'سایر',
]

// نوع بسته‌بندی — مطابق گزینه‌های سایت
// دقیقاً گزینه‌های #ddBoxType در سایت
// استان‌های سایت (باید دقیقا با گزینه‌های #ddStateSource یکی باشد)
const PROVINCE_LIST = [
  'آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر',
  'تهران', 'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی',
  'خوزستان', 'زنجان', 'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'گلستان',
  'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'کردستان', 'کرمان',
  'کرمانشاه', 'کهگیلویه و بویر احمد', 'یزد',
]

/* ═══════════ اعتبارسنجی فرم پروفایل ═══════════
   یک منبع واحد: هم برای نمایش زنده زیر هر فیلد، هم برای
   جلوگیری از ذخیره. قبلا فقط موقع ذخیره پیام داده می‌شد. */
const FIELD_RULES: Array<{
  key: string
  label: string
  step: number
  check?: (v: string) => string | null
}> = [
  { key: 'name', label: 'نام پروفایل', step: 1 },
  { key: 'senderFirstName', label: 'نام فرستنده', step: 1 },
  { key: 'senderLastName', label: 'نام خانوادگی فرستنده', step: 1 },
  {
    key: 'senderMobile', label: 'موبایل فرستنده', step: 1,
    check: (v) => (/^09\d{9}$/.test(v.replace(/\D/g, '')) ? null : 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود'),
  },
  {
    key: 'senderNationalId', label: 'کد ملی فرستنده', step: 1,
    check: (v) => (v.replace(/\D/g, '').length === 10 || v.replace(/\D/g, '').length === 11 ? null : 'کد ملی باید ۱۰ رقم باشد'),
  },
  { key: 'receiverFirstName', label: 'نام گیرنده', step: 2 },
  { key: 'receiverLastName', label: 'نام خانوادگی گیرنده', step: 2 },
  {
    key: 'receiverMobile', label: 'موبایل گیرنده', step: 2,
    check: (v) => (/^09\d{9}$/.test(v.replace(/\D/g, '')) ? null : 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود'),
  },
  {
    key: 'receiverNationalId', label: 'کد ملی گیرنده', step: 2,
    check: (v) => (v.replace(/\D/g, '').length === 10 || v.replace(/\D/g, '').length === 11 ? null : 'کد ملی باید ۱۰ رقم باشد'),
  },
  {
    key: 'plateNumber', label: 'شماره پلاک', step: 3,
    check: (v) => {
      const t = v.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      const nums = t.match(/\d+/g) || []
      const letter = t.match(/[\u0600-\u06FF]/)
      if (nums.length < 3 || !letter) return 'پلاک کامل نیست — مثال: ۴۵ ع ۹۲۳ ۱۷'
      return null
    },
  },
  { key: 'driverName', label: 'نام راننده', step: 3 },
  {
    key: 'driverNationalId', label: 'کد ملی راننده', step: 3,
    check: (v) => (v.replace(/\D/g, '').length === 10 ? null : 'کد ملی راننده باید ۱۰ رقم باشد'),
  },
  { key: 'cargoName', label: 'نام کالا', step: 4 },
  {
    key: 'cargoWeight', label: 'وزن کالا', step: 4,
    check: (v) => (Number(v.replace(/[^\d.]/g, '')) > 0 ? null : 'وزن باید عددی بزرگ‌تر از صفر باشد'),
  },
  {
    key: 'cargoValue', label: 'ارزش کالا', step: 4,
    check: (v) => (Number(v.replace(/\D/g, '')) > 0 ? null : 'ارزش کالا باید عددی بزرگ‌تر از صفر باشد'),
  },
  { key: 'originProvince', label: 'استان مبدا', step: 5 },
  { key: 'originCity', label: 'شهر مبدا', step: 5 },
  { key: 'destProvince', label: 'استان مقصد', step: 5 },
  { key: 'destCity', label: 'شهر مقصد', step: 5 },
  /* «آدرس مبدا/مقصد» عمدا از قوانین اجباری حذف شدند —
     ربات در گام ۵/۶ فقط دو ورودی شهرستان و محله را پر می‌کند و
     نقشه‌ی خود سایت آدرس متنی را بعد از انتخاب پر می‌کند. */
  {
    key: 'freightCost', label: 'مبلغ کرایه', step: 5,
    check: (v) => (Number(v.replace(/\D/g, '')) > 0 ? null : 'مبلغ کرایه باید عددی بزرگ‌تر از صفر باشد'),
  },
]

/** خطای هر فیلد را برمی‌گرداند (خالی بودن یا نامعتبر بودن) */
function validateForm(form: Record<string, unknown>, autoProvince = false, manualLocation = false): Record<string, string> {
  const errs: Record<string, string> = {}
  for (const r of FIELD_RULES) {
    /* در حالت نقشه‌ای، فیلدهای دستی مبدا/مقصد اجباری و فعال نیستند */
    if (!manualLocation && ['originProvince', 'originCity', 'destProvince', 'destCity'].includes(r.key)) continue
    /* اگر استان از پلاک تشخیص داده می‌شود، پر کردنش اجباری نیست */
    if (autoProvince && (r.key === 'originProvince' || r.key === 'destProvince')) continue
    const v = String(form[r.key] ?? '').trim()
    if (!v) { errs[r.key] = 'این فیلد الزامی است'; continue }
    if (r.check) {
      const m = r.check(v)
      if (m) errs[r.key] = m
    }
  }
  return errs
}

/* نگاشت کد ایران پلاک به استان — باید با step1-engine.js یکی باشد */
const IRAN_CODE_TO_PROVINCE: Record<string, string> = {
  // مبنا: تشخیص استان از عدد اول پلاک در قالب پنل/پروفایل.
  '10': 'تهران', '11': 'تهران', '12': 'خراسان رضوی', '13': 'اصفهان',
  '14': 'خوزستان', '15': 'آذربایجان شرقی', '16': 'قم', '17': 'آذربایجان غربی',
  '18': 'همدان', '19': 'کرمانشاه', '20': 'تهران', '21': 'البرز',
  '22': 'تهران', '23': 'اصفهان', '24': 'خوزستان', '25': 'آذربایجان شرقی',
  '26': 'خراسان شمالی', '27': 'آذربایجان غربی', '28': 'همدان', '29': 'کرمانشاه',
  '30': 'البرز', '31': 'لرستان', '32': 'خراسان رضوی', '33': 'تهران',
  '34': 'خوزستان', '35': 'آذربایجان شرقی', '36': 'خراسان رضوی', '37': 'آذربایجان غربی',
  '38': 'البرز', '39': 'کرمان', '40': 'تهران', '41': 'لرستان',
  '42': 'خراسان رضوی', '43': 'اصفهان', '44': 'تهران', '45': 'کرمان',
  '46': 'گیلان', '47': 'مرکزی', '48': 'بوشهر', '49': 'کهگیلویه و بویر احمد',
  '51': 'کردستان', '52': 'خراسان جنوبی', '53': 'اصفهان', '54': 'یزد',
  '55': 'تهران', '56': 'گیلان', '57': 'مرکزی', '58': 'بوشهر',
  '59': 'گلستان', '61': 'کردستان', '62': 'مازندران', '63': 'فارس',
  '64': 'یزد', '65': 'کرمان', '66': 'تهران', '67': 'اصفهان',
  '68': 'البرز', '69': 'گلستان', '71': 'چهارمحال و بختیاری', '72': 'مازندران',
  '73': 'فارس', '74': 'خراسان رضوی', '75': 'کرمان', '76': 'گیلان',
  '77': 'تهران', '78': 'تهران', '79': 'قزوین', '81': 'چهارمحال و بختیاری',
  '82': 'مازندران', '83': 'فارس', '84': 'هرمزگان', '85': 'سیستان و بلوچستان',
  '86': 'سمنان', '87': 'زنجان', '88': 'تهران', '89': 'قزوین',
  '91': 'اردبیل', '92': 'مازندران', '93': 'فارس', '94': 'هرمزگان',
  '95': 'سیستان و بلوچستان', '96': 'سمنان', '97': 'زنجان', '98': 'ایلام',
  '99': 'تهران',
}
/** استان را از عدد اول پلاک تشخیص می‌دهد؛ مثال: 36 ع 193 29 ⇒ 36 ⇒ خراسان رضوی */
function provinceFromPlateUI(plate: string): string | null {
  const p = parsePlateParts(plate)
  const code = p.two || p.iran
  return IRAN_CODE_TO_PROVINCE[code] || null
}

const PACKAGING_TYPES = [
  'کارتن', 'جعبه', 'کیسه', 'گونی', 'جامبو', 'بشکه', 'رول', 'فله', 'عدل', 'شاخه', 'سایر',
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
  const [importing, setImporting] = useState(false)
  const [importedFrom, setImportedFrom] = useState<string | null>(null)
  const [autoImport, setAutoImport] = useState(true)   // پیش‌فرض: خودکار
  const [capturingMapId, setCapturingMapId] = useState<string | null>(null)

  /* اعتبارسنجی زنده.
     touched = فیلدهایی که کاربر دست زده یا تلاش کرده ذخیره کند.
     بدون این، فرم خالی از همان اول قرمز می‌شد و آزاردهنده بود. */
  /* تشخیص خودکار استان از پلاک — پیش‌فرض روشن */
  const [autoProvince, setAutoProvince] = useState(true)
  const [useManualLocation, setUseManualLocation] = useState(false)
  const [useCoordinateInputs, setUseCoordinateInputs] = useState(true)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showAllErrors, setShowAllErrors] = useState(false)

  const errors = validateForm(form as Record<string, unknown>, autoProvince, useManualLocation)
  const errorCount = Object.keys(errors).length

  /** خطای یک فیلد — فقط اگر کاربر دست زده یا دکمه‌ی ذخیره را زده */
  const errOf = (key: string) =>
    (touched[key] || showAllErrors) ? errors[key] : undefined

  /** تعداد خطای هر مرحله — برای نشان قرمز روی تب */
  const stepErrorCount = (stepIndex: number) =>
    FIELD_RULES.filter((r) => r.step - 1 === stepIndex && errors[r.key]).length
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

  /**
   * خواندن مشخصات از آخرین بارنامه‌ی ثبت‌شدهی حساب و پر کردن فرم.
   *
   * فقط فیلدهایی که سایت می‌دهد پر می‌شوند؛ بقیه دست‌نخورده
   * می‌مانند تا کاربر خودش پر کند. هر فیلدی قابل ویرایش است.
   */
  const importFromSite = useCallback(async (accountId: string, silent = false) => {
    if (!accountId) {
      if (!silent) toast.error('اول یک حساب کاربری انتخاب کنید')
      return
    }
    if (importing) return
    setImporting(true)
    const tid = toast.loading('در حال خواندن آخرین بارنامه از سامانه…', {
      description: 'عمدا آرام انجام می‌شود تا سایت IP را بلاک نکند — ۲ تا ۳ دقیقه',
    })
    try {
      const res = await fetch('/api/barbarg-accounts/import-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, createProfile: false }),
      })
      const d = await res.json()

      if (!res.ok || d.error) {
        toast.error(d.error || 'خواندن اطلاعات ناموفق بود', {
          id: tid, duration: 8000,
          description: 'می‌توانید فیلدها را دستی پر کنید',
        })
        return
      }

      const x = d.data || {}
      // فقط مقادیر غیرخالی را بریز روی فرم
      setForm((prev) => {
        const next: Record<string, unknown> = { ...prev }
        const put = (k: string, v: unknown) => {
          if (v !== undefined && v !== null && String(v).trim() !== '') next[k] = v
        }
        put('senderFirstName', x.senderFirstName)
        put('senderLastName', x.senderLastName)
        put('receiverFirstName', x.receiverFirstName)
        put('receiverLastName', x.receiverLastName)
        put('driverName', x.driverName)
        put('driverNationalId', x.driverNationalId)
        put('senderNationalId', x.senderNationalId)
        put('receiverNationalId', x.receiverNationalId)
        put('plateNumber', x.plateNumber)
        put('cargoName', x.cargoName)
        put('cargoPackaging', x.cargoPackaging)
        put('cargoQuantity', x.cargoQuantity)
        put('cargoWeight', x.cargoWeight)
        put('cargoValue', x.cargoValue)
        put('insuranceAmount', x.insuranceAmount)
        put('originProvince', x.originProvince)
        put('originCity', x.originCity)
        put('originAddress', x.originAddress)
        put('destProvince', x.destProvince)
        put('destCity', x.destCity)
        put('destAddress', x.destAddress)
        /* نام پروفایل = نام راننده (اگر نبود، پلاک). قابل ویرایش است. */
        if (!String(prev.name || '').trim()) {
          if (x.driverName) next.name = x.driverName
          else if (x.plateNumber) next.name = `پروفایل ${x.plateNumber}`
        }
        /* کد ملی فرستنده/گیرنده: اگر سایت نداد، از کد ملی حساب باربگ */
        {
          const acc2 = accounts.find((a) => a.id === prev.accountId)
          const nid2 = String(acc2?.username || '').replace(/\D/g, '')
          if (nid2) {
            if (!String(next.driverNationalId || '').trim()) next.driverNationalId = nid2
            if (!String(next.senderNationalId || '').trim()) next.senderNationalId = nid2
            if (!String(next.receiverNationalId || '').trim()) next.receiverNationalId = nid2
          }
        }
        return next as typeof prev
      })

      setImportedFrom(x.trackingCode || null)
      toast.success('اطلاعات از سامانه خوانده شد', {
        id: tid, duration: 9000,
        description:
          `پلاک ${x.plateNumber || '—'} | راننده ${x.driverName || '—'} | ` +
          `${x.originCity || '—'} ← ${x.destCity || '—'}، ` +
          'موبایل و کد ملی فرستنده/گیرنده و کرایه را خودتان پر کنید.',
      })
    } catch {
      toast.error('خطا در ارتباط با سرور', { id: tid })
    } finally {
      setImporting(false)
    }
  }, [importing])

  const openCreate = () => {
    setEditProfile(null)
    setForm({ ...emptyForm })
    setStep(0)
    setImportedFrom(null)
    setAutoImport(true)      // پیش‌فرض همیشه خودکار
    setAutoProvince(true)
    setUseManualLocation(false)
    setUseCoordinateInputs(true)
    setTouched({})
    setShowAllErrors(false)
    setDialogOpen(true)
  }

  const openEdit = (p: Profile) => {
    setEditProfile(p)
    const savedMap = parseSavedMapLocations(p.notes)
    setAutoProvince(String((p as { notes?: string }).notes || '').includes('[auto-province]'))
    setUseManualLocation(hasManualLocation(p.notes))
    setUseCoordinateInputs(true)
    setTouched({})
    setShowAllErrors(false)
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
      originLat: savedMap?.origin?.lat ?? '', originLon: savedMap?.origin?.lon ?? '',
      originCoordinate: formatCoordinatePair(savedMap?.origin?.lat, savedMap?.origin?.lon),
      destProvince: p.destProvince, destCity: p.destCity,
      destAddress: p.destAddress || '', destPostalCode: p.destPostalCode || '',
      destLat: savedMap?.destination?.lat ?? '', destLon: savedMap?.destination?.lon ?? '',
      destCoordinate: formatCoordinatePair(savedMap?.destination?.lat, savedMap?.destination?.lon),
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
    /* اعتبارسنجی کامل — همه‌ی خطاها روی فیلدها نمایان می‌شوند */
    setShowAllErrors(true)
    const errs = validateForm(form as Record<string, unknown>, autoProvince, useManualLocation)
    const keys = Object.keys(errs)
    if (keys.length > 0) {
      const first = FIELD_RULES.find((r) => errs[r.key])
      if (first) setStep(first.step - 1)
      toast.error(
        keys.length === 1
          ? `«${first?.label}» مشکل دارد: ${errs[first!.key]}`
          : `${keys.length} فیلد مشکل دارند — فیلدهای قرمز را ببینید`,
        { description: first ? `اولی: «${first.label}» در مرحله ${first.step}` : undefined },
      )
      return
    }

    const required: Array<[string, string, number]> = [
      ['name', 'نام پروفایل', 1],
      ['senderFirstName', 'نام فرستنده', 1],
      ['senderLastName', 'نام خانوادگی فرستنده', 1],
      ['senderMobile', 'موبایل فرستنده', 1],
      ['receiverFirstName', 'نام گیرنده', 2],
      ['receiverLastName', 'نام خانوادگی گیرنده', 2],
      ['receiverMobile', 'موبایل گیرنده', 2],
      ['plateNumber', 'شماره پلاک', 3],
      ['driverName', 'نام راننده', 3],
      ['driverNationalId', 'کد ملی راننده', 3],
      ['cargoName', 'نام کالا', 4],
      ...(useManualLocation ? [
        ['originCity', 'شهر مبدا', 5] as [string, string, number],
        ['destCity', 'شهر مقصد', 5] as [string, string, number],
      ] : []),
      /* «استان» و «آدرس» عمدا از لیست الزامی حذف شدند:
         استان در حالت خودکار از پلاک تشخیص داده می‌شود و
         آدرس را نقشه‌ی خود سایت بعد از انتخاب محله پر می‌کند. */
    ]
    const missing = required.filter(([k]) => !String((form as Record<string, unknown>)[k] ?? '').trim())
    if (missing.length > 0) {
      const [, label, stepNo] = missing[0]
      toast.error(
        missing.length === 1
          ? `«${label}» را پر کنید (مرحله ${stepNo})`
          : `${missing.length} فیلد الزامی خالی است — اولی: «${label}» در مرحله ${stepNo}`,
      )
      setStep(missing[0][2] - 1)
      return
    }

    const originCoordText = String((form as Record<string, unknown>).originCoordinate ?? '').trim()
    const destCoordText = String((form as Record<string, unknown>).destCoordinate ?? '').trim()
    const hasAnyCoordinate = !!(originCoordText || destCoordText)
    const hasAllCoordinates = !!(originCoordText && destCoordText)
    if (!useManualLocation && useCoordinateInputs && hasAnyCoordinate && (!hasAllCoordinates || !parseCoordinatePair(originCoordText) || !parseCoordinatePair(destCoordText))) {
      toast.error('مختصات مبدا و مقصد را کامل و معتبر وارد کنید', {
        description: 'هر ورودی را به صورت «latitude, longitude» وارد کنید؛ مثال: 30.286924, 57.039170',
      })
      setStep(4)
      return
    }

    setSaving(true)
    try {
      /* انتخاب «تشخیص خودکار استان» در notes ذخیره می‌شود
         تا نیاز به تغییر دیتابیس (migration) نباشد. */
      const TAG = '[auto-province]'
      let cleanNotes = String(form.notes || '').replace(TAG, '').trim()
      cleanNotes = stripManualLocationTag(cleanNotes)
      const coordinateMapBlock = !useManualLocation && useCoordinateInputs
        ? mapLocationBlockFromForm(form as Record<string, string | number>)
        : null
      if (coordinateMapBlock) cleanNotes = stripMapLocationBlock(cleanNotes)
      /* در حالت خودکار، استانِ تشخیص‌داده‌شده از پلاک همین‌جا در
         پروفایل ذخیره می‌شود — هم API فیلد الزامی را می‌پذیرد، هم
         موتور (گام ۵/۶) استان را از خود پنل برمی‌دارد. */
      const detectedProv = autoProvince
        ? provinceFromPlateUI(String(form.plateNumber || '')) || ''
        : ''
      const noteTags = [autoProvince ? TAG : '', useManualLocation ? MANUAL_LOCATION_TAG : '']
        .filter(Boolean)
        .join(' ')
      const mapBlockText = coordinateMapBlock
        ? `${MAP_JSON_START}${JSON.stringify(coordinateMapBlock)}${MAP_JSON_END}`
        : ''
      const finalNotes = `${noteTags}${noteTags && cleanNotes ? ' ' : ''}${cleanNotes}${(noteTags || cleanNotes) && mapBlockText ? '\n' : ''}${mapBlockText}`.trim()
      const body = {
        ...form,
        // در حالت نقشه‌ای این فیلدها در فرم نمایش داده نمی‌شوند، اما چون اسکیما nullable نیست
        // مقدار موقت می‌گذاریم؛ بعد از دکمه «نقشه» با آدرس واقعی سامانه جایگزین می‌شوند.
        originProvince: useManualLocation
          ? (autoProvince ? (detectedProv || String(form.originProvince || '')) : form.originProvince)
          : (detectedProv || String(form.originProvince || '') || 'از نقشه'),
        originCity: useManualLocation ? form.originCity : (String(form.originCity || '') || 'از نقشه'),
        destProvince: useManualLocation
          ? (autoProvince ? (detectedProv || String(form.destProvince || '')) : form.destProvince)
          : (detectedProv || String(form.destProvince || '') || 'از نقشه'),
        destCity: useManualLocation ? form.destCity : (String(form.destCity || '') || 'از نقشه'),
        accountId: form.accountId || null,
        notes: finalNotes,
      }
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

  const handleCaptureMap = async (profile: Profile) => {
    if (capturingMapId) return
    const ok = window.confirm(
      'مرورگر اتوماسیون باز می‌شود، از ابتدا وارد سامانه باربرگ می‌شود و تا گام ۵ و ۶ جلو می‌رود.\n' +
      'در گام ۵ مبدا و در گام ۶ مقصد را روی نقشه واقعی سامانه انتخاب کنید.\n' +
      'بعد از ذخیره هر دو نقطه، مرورگر بسته می‌شود. ادامه می‌دهید؟',
    )
    if (!ok) return

    setCapturingMapId(profile.id)
    const tid = toast.loading('شروع انتخاب مبدا و مقصد از نقشه سامانه...', {
      description: 'مرورگر باز می‌شود؛ لطفاً در مرورگر بازشده نقاط مبدا و مقصد را انتخاب کنید.',
      duration: Infinity,
    })
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25 * 60 * 1000)
    try {
      const res = await fetch(`/api/registration-profiles/${profile.id}/capture-map`, { method: 'POST', signal: controller.signal })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'انتخاب نقشه ناموفق بود')
      }
      toast.dismiss(tid)
      toast.success('مبدا و مقصد از نقشه سامانه ذخیره شد', {
        description: `${json.mapLocations?.origin?.address || 'مبدا'} ← ${json.mapLocations?.destination?.address || 'مقصد'}`,
        duration: 8000,
      })
      if (editProfile?.id === profile.id && json.profile) {
        const up = json.profile as Profile
        setEditProfile(up)
        setForm((prev) => ({
          ...prev,
          originProvince: up.originProvince || '',
          originCity: up.originCity || '',
          originAddress: up.originAddress || '',
          originLat: json.mapLocations?.origin?.lat ?? prev.originLat ?? '',
          originLon: json.mapLocations?.origin?.lon ?? prev.originLon ?? '',
          originCoordinate: formatCoordinatePair(json.mapLocations?.origin?.lat, json.mapLocations?.origin?.lon) || String(prev.originCoordinate || ''),
          destProvince: up.destProvince || '',
          destCity: up.destCity || '',
          destAddress: up.destAddress || '',
          destLat: json.mapLocations?.destination?.lat ?? prev.destLat ?? '',
          destLon: json.mapLocations?.destination?.lon ?? prev.destLon ?? '',
          destCoordinate: formatCoordinatePair(json.mapLocations?.destination?.lat, json.mapLocations?.destination?.lon) || String(prev.destCoordinate || ''),
          notes: up.notes || '',
        }))
        setUseManualLocation(hasManualLocation(up.notes))
      }
      fetchProfiles(); fetchStats()
    } catch (e) {
      const message = e instanceof Error && e.name === 'AbortError'
        ? 'مهلت عملیات انتخاب نقشه تمام شد یا ارتباط با سرور قطع شد'
        : (e instanceof Error ? e.message : 'عملیات ناموفق بود')
      toast.dismiss(tid)
      toast.error('خطا در انتخاب نقشه', {
        description: message,
        duration: 10000,
      })
    } finally {
      clearTimeout(timeoutId)
      setCapturingMapId(null)
      // کمربند ایمنی: اگر به هر دلیل toast لودینگ در Sonner باقی مانده بود، حذفش کن.
      toast.dismiss(tid)
    }
  }

  const updateField = (key: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // به محض دست زدن، خطای همین فیلد قابل نمایش می‌شود
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
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
                        <Button
                          size="sm"
                          variant={hasSavedMapLocation(p.notes) && !hasManualLocation(p.notes) ? 'default' : 'outline'}
                          onClick={() => handleCaptureMap(p)}
                          disabled={!!capturingMapId}
                          title="ثبت / بروزرسانی مبدا و مقصد از نقشه واقعی سامانه"
                        >
                          {capturingMapId === p.id ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                          <span className="text-xs">نقشه</span>
                        </Button>
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

          {/* ── نوار واردات خودکار ──
              پیش‌فرض روشن است: به محض انتخاب حساب، فرم از سایت پر می‌شود.
              کاربر می‌تواند خاموشش کند و همه‌چیز را دستی بنویسد،
              یا هر فیلدی را بعد از واردات تغییر دهد. */}
          {!editProfile && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Download className="size-4 text-emerald-500" />
                  <span className="font-medium">خواندن خودکار از سامانه</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-emerald-500"
                      checked={autoImport}
                      onChange={(e) => setAutoImport(e.target.checked)}
                    />
                    <span>{autoImport ? 'حالت خودکار' : 'حالت دستی'}</span>
                  </label>

                  <Button
                    size="sm" variant="outline" className="h-7 text-xs"
                    disabled={importing || !form.accountId}
                    onClick={() => importFromSite(form.accountId as string)}
                  >
                    {importing
                      ? <><Loader2 className="size-3 ml-1 animate-spin" />در حال خواندن…</>
                      : <><RefreshCw className="size-3 ml-1" />خواندن از سایت</>}
                  </Button>
                </div>
              </div>

              <p className="text-[11px] leading-5 text-muted-foreground">
                {importedFrom
                  ? `✔ اطلاعات از بارنامه‌ی ${importedFrom} خوانده شد. هر فیلدی را می‌توانید دستی تغییر دهید.`
                  : autoImport
                    ? 'در گام ۳ که حساب کاربری را انتخاب کنید، مشخصات از آخرین بارنامه‌ی همان حساب خودکار پر می‌شود.'
                    : 'حالت دستی: هیچ چیزی خودکار پر نمی‌شود. هر وقت خواستید دکمه‌ی «خواندن از سایت» را بزنید.'}
              </p>
            </div>
          )}

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
                {/* نشان تعداد خطای هر مرحله — تا کاربر بداند کجا را درست کند */}
                {(showAllErrors || Object.keys(touched).length > 0) && stepErrorCount(i) > 0 && (
                  <span className={`ml-0.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    step === i ? 'bg-primary-foreground text-primary' : 'bg-destructive text-white'
                  }`}>
                    {stepErrorCount(i)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="py-4 min-h-[400px]">
            {step === 0 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۱: مشخصات فرستنده" />
                <div className="grid grid-cols-1 gap-4">
                  <Field label="نام پروفایل *" value={form.name as string} onChange={(v) => updateField('name', v)} placeholder="مثلا: پلاک 45ع923 - سیرجان" error={errOf('name')} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FieldSelect label="نوع فرستنده *" value={form.senderType as string} onChange={(v) => updateField('senderType', v)} options={SENDER_TYPES} placeholder="انتخاب کنید" />
                  <Field label="کدملی *" value={form.senderNationalId as string} onChange={(v) => updateField('senderNationalId', v)} placeholder="کدملی" error={errOf('senderNationalId')} />
                  <Field label="شماره موبایل *" value={form.senderMobile as string} onChange={(v) => updateField('senderMobile', v)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" error={errOf('senderMobile')} />
                  <Field label="نام *" value={form.senderFirstName as string} onChange={(v) => updateField('senderFirstName', v)} placeholder="نام" error={errOf('senderFirstName')} />
                  <Field label="نام خانوادگی *" value={form.senderLastName as string} onChange={(v) => updateField('senderLastName', v)} placeholder="نام خانوادگی" error={errOf('senderLastName')} />
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
                  <Field label="کدملی *" value={form.receiverNationalId as string} onChange={(v) => updateField('receiverNationalId', v)} placeholder="کدملی" error={errOf('receiverNationalId')} />
                  <Field label="شماره موبایل *" value={form.receiverMobile as string} onChange={(v) => updateField('receiverMobile', v)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" error={errOf('receiverMobile')} />
                  <Field label="نام *" value={form.receiverFirstName as string} onChange={(v) => updateField('receiverFirstName', v)} placeholder="نام" error={errOf('receiverFirstName')} />
                  <Field label="نام خانوادگی *" value={form.receiverLastName as string} onChange={(v) => updateField('receiverLastName', v)} placeholder="نام خانوادگی" error={errOf('receiverLastName')} />
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
                      <Select
                        value={(form.accountId as string) || 'none'}
                        onValueChange={(v) => {
                          const id = (v ?? '') === 'none' ? '' : (v ?? '')
                          updateField('accountId', id)

                          /* نام کاربری حساب باربگ همان کد ملی صاحب حساب است —
                             همان را در کد ملی راننده/فرستنده/گیرنده می‌گذاریم.
                             فقط فیلدهای خالی پر می‌شوند و هر کدام قابل ویرایش است. */
                          const acc = accounts.find((a) => a.id === id)
                          const nid = String(acc?.username || '').replace(/\D/g, '')
                          if (nid) {
                            setForm((prev) => {
                              const next = { ...prev }
                              if (!String(prev.driverNationalId || '').trim()) next.driverNationalId = nid
                              if (!String(prev.senderNationalId || '').trim()) next.senderNationalId = nid
                              if (!String(prev.receiverNationalId || '').trim()) next.receiverNationalId = nid
                              return next
                            })
                          }
                          /* حالت خودکار (پیش‌فرض): به محض انتخاب حساب،
                             اطلاعات از سایت خوانده می‌شود. فقط برای پروفایل جدید. */
                          if (id && autoImport && !editProfile) {
                            void importFromSite(id, true)
                          }
                        }}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب اکانت" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون اکانت</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.accountName} ({a.username})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <PlateField value={form.plateNumber as string} onChange={(v) => updateField('plateNumber', v)} error={errOf('plateNumber')} />
                    <Field label="شماره مسلسل" value={form.vehicleSerialNumber as string} onChange={(v) => updateField('vehicleSerialNumber', v)} />
                    <Field label="شماره موتور" value={form.vehicleMotorNumber as string} onChange={(v) => updateField('vehicleMotorNumber', v)} />
                    <FieldSelect label="برگه بیمه" value={form.vehicleInsurancePage as string} onChange={(v) => updateField('vehicleInsurancePage', v)} options={INSURANCE_OPTIONS} placeholder="انتخاب کنید" />
                    <FieldSelect label="پلاک یدکی" value={form.vehicleSparePlate as string} onChange={(v) => updateField('vehicleSparePlate', v)} options={INSURANCE_OPTIONS} placeholder="انتخاب کنید" />
                  </div>
                </div>

                <div className="space-y-4">
                  <SectionTitle title="مشخصات راننده" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="راننده *" value={form.driverName as string} onChange={(v) => updateField('driverName', v)} placeholder="نام و نام خانوادگی" error={errOf('driverName')} />
                    <Field label="تلفن همراه" value={form.driverMobile as string} onChange={(v) => updateField('driverMobile', v)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" />
                    <Field label="شماره گواهینامه" value={form.driverLicense as string} onChange={(v) => updateField('driverLicense', v)} />
                    <Field label="شماره کارت" value={form.driverCard as string} onChange={(v) => updateField('driverCard', v)} />
                    <Field label="شماره شناسنامه" value={form.driverIdNumber as string} onChange={(v) => updateField('driverIdNumber', v)} />
                    <Field label="کد ملی راننده *" value={form.driverNationalId as string} onChange={(v) => updateField('driverNationalId', v)} placeholder="۱۰ رقمی" error={errOf('driverNationalId')} />
                    <FieldSelect label="جنسیت" value={form.driverGender as string} onChange={(v) => updateField('driverGender', v)} options={GENDER_OPTIONS} placeholder="انتخاب کنید" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۴: مشخصات بار" />
                <div className="grid grid-cols-2 gap-4">
                  <FieldSelect label="کالای قابل بارگیری *" value={form.cargoName as string} onChange={(v) => updateField('cargoName', v)} options={CARGO_TYPES} placeholder="انتخاب کنید" error={errOf('cargoName')} />
                  <FieldSelect label="نوع بسته‌بندی" value={form.cargoPackaging as string} onChange={(v) => updateField('cargoPackaging', v)} options={PACKAGING_TYPES} placeholder="انتخاب کنید" />
                  <Field label="وزن بار (تن)" value={form.cargoWeight as string} onChange={(v) => updateField('cargoWeight', v)} placeholder="مثلا 19" error={errOf('cargoWeight')} />
                  <Field label="تعداد بسته" value={form.cargoQuantity as string} onChange={(v) => updateField('cargoQuantity', v)} placeholder="مثلا 19" />
                  <Field label="ارزش تقریبی بار (ریال) *" value={form.cargoValue as string} onChange={(v) => updateField('cargoValue', v)} placeholder="مثلا 10000000" error={errOf('cargoValue')} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <SectionTitle title="مرحله ۵: مبدا، مقصد و کرایه" />

                {/* ── انتخاب روش مبدا/مقصد ── */}
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="mt-0.5 size-4 text-emerald-500" />
                      <div>
                        <b>روش پیش‌فرض: استفاده از مبدا و مقصد ذخیره‌شده از نقشه سامانه</b>
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          برای ثبت/بروزرسانی نقشه، از دکمه 📍 در لیست پروفایل‌ها استفاده کنید؛ اتوماسیون از ابتدا لاگین می‌کند، تا گام ۵ و ۶ می‌رود و آخرین کلیک شما را ذخیره می‌کند.
                        </p>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-amber-500"
                        checked={useManualLocation}
                        onChange={(e) => setUseManualLocation(e.target.checked)}
                      />
                      <span>استفاده از روش دستی استان/شهر به جای نقشه ذخیره‌شده</span>
                    </label>
                  </div>
                </div>

                {useManualLocation ? (
                  <>
                    {/* ── انتخاب روش تعیین استان ── */}
                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-blue-500"
                          checked={autoProvince}
                          onChange={(e) => setAutoProvince(e.target.checked)}
                        />
                        <span className="text-sm">
                          <b>تشخیص خودکار استان از روی پلاک</b>
                          <span className="block text-[11px] leading-5 text-muted-foreground">
                            {autoProvince
                              ? (() => {
                                  const g = provinceFromPlateUI(form.plateNumber as string)
                                  return g
                                    ? `از پلاک «${form.plateNumber}» استان «${g}» تشخیص داده شد. فقط شهر/محله را پر کنید.`
                                    : 'پلاک را در مرحله ۳ کامل کنید تا استان تشخیص داده شود.'
                                })()
                              : 'خاموش است — استان را خودتان انتخاب کنید.'}
                          </span>
                        </span>
                      </label>
                    </div>

                    <p className="text-sm font-semibold text-muted-foreground">مبدا بارگیری (ورود دستی)</p>
                    <div className="grid grid-cols-2 gap-4">
                      {autoProvince ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">استان مبدا (خودکار)</Label>
                          <div className="flex h-9 items-center rounded-md border border-dashed border-blue-500/40 bg-blue-500/5 px-3 text-sm">
                            {provinceFromPlateUI(form.plateNumber as string) || <span className="text-muted-foreground">از پلاک تشخیص داده می‌شود</span>}
                          </div>
                        </div>
                      ) : (
                        <FieldSelect label="استان مبدا *" value={form.originProvince as string} onChange={(v) => updateField('originProvince', v)} options={PROVINCE_LIST} placeholder="انتخاب کنید" error={errOf('originProvince')} />
                      )}
                      <Field label="شهر مبدا *" value={form.originCity as string} onChange={(v) => updateField('originCity', v)} placeholder="شهر، محله یا روستا — مثلا سیرجان، ریشهر" error={errOf('originCity')} />
                      <Field label="آدرس مبدا" value={form.originAddress as string} onChange={(v) => updateField('originAddress', v)} placeholder="خیابان، کوچه، پلاک" error={errOf('originAddress')} />
                      <Field label="کدپستی مبدا" value={form.originPostalCode as string} onChange={(v) => updateField('originPostalCode', v)} placeholder="اختیاری" />
                    </div>

                    <p className="text-sm font-semibold text-muted-foreground pt-2">مقصد تخلیه (ورود دستی)</p>
                    <div className="grid grid-cols-2 gap-4">
                      {autoProvince ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">استان مقصد (خودکار)</Label>
                          <div className="flex h-9 items-center rounded-md border border-dashed border-blue-500/40 bg-blue-500/5 px-3 text-sm">
                            {provinceFromPlateUI(form.plateNumber as string) || <span className="text-muted-foreground">از پلاک تشخیص داده می‌شود</span>}
                          </div>
                        </div>
                      ) : (
                        <FieldSelect label="استان مقصد *" value={form.destProvince as string} onChange={(v) => updateField('destProvince', v)} options={PROVINCE_LIST} placeholder="انتخاب کنید" error={errOf('destProvince')} />
                      )}
                      <Field label="شهر مقصد *" value={form.destCity as string} onChange={(v) => updateField('destCity', v)} placeholder="شهر، محله یا روستا — مثلا سیرجان، ریشهر" error={errOf('destCity')} />
                      <Field label="آدرس مقصد" value={form.destAddress as string} onChange={(v) => updateField('destAddress', v)} placeholder="خیابان، کوچه، پلاک" error={errOf('destAddress')} />
                      <Field label="کدپستی مقصد" value={form.destPostalCode as string} onChange={(v) => updateField('destPostalCode', v)} placeholder="اختیاری" />
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-emerald-500/35 bg-emerald-500/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">مبدا و مقصد از نقشه سامانه</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          اولویت با مختصات واردشده در همین بخش است. اگر مختصات را وارد کنید، ربات همان‌ها را در نقشه سایت اعمال می‌کند و برای دفعات بعد ذخیره می‌شود.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => editProfile && handleCaptureMap(editProfile)}
                        disabled={!editProfile || !!capturingMapId}
                      >
                        {capturingMapId === editProfile?.id ? <Loader2 className="size-4 ml-2 animate-spin" /> : <MapPin className="size-4 ml-2" />}
                        ثبت از روی نقشه / بروزرسانی
                      </Button>
                    </div>
                    {!editProfile && (
                      <p className="text-xs text-amber-600">
                        برای انتخاب نقشه، ابتدا پروفایل را ذخیره کنید؛ سپس در ویرایش همین مرحله دکمه «ثبت از روی نقشه / بروزرسانی» فعال می‌شود.
                      </p>
                    )}

                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background/60 p-3 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-emerald-500"
                        checked={useCoordinateInputs}
                        onChange={(e) => setUseCoordinateInputs(e.target.checked)}
                      />
                      <span>
                        ورود مستقیم مختصات latitude / longitude برای مبدا و مقصد
                        <span className="block text-muted-foreground mt-0.5">پیش‌فرض فعال است و نسبت به انتخاب مرورگر سامانه اولویت دارد.</span>
                      </span>
                    </label>

                    {useCoordinateInputs && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border bg-background/60 p-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">مختصات مبدا</p>
                          <Field
                            label="مختصات کامل مبدا"
                            value={form.originCoordinate as string}
                            onChange={(v) => updateField('originCoordinate', v)}
                            placeholder="latitude, longitude  مثلا: 30.286924, 57.039170"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">مختصات مقصد</p>
                          <Field
                            label="مختصات کامل مقصد"
                            value={form.destCoordinate as string}
                            onChange={(v) => updateField('destCoordinate', v)}
                            placeholder="latitude, longitude  مثلا: 30.280931, 57.063900"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border bg-background/60 p-3">
                        <p className="font-medium text-muted-foreground mb-1">مبدا ذخیره‌شده</p>
                        <p>{String(form.originAddress || '').trim() || 'هنوز از نقشه ثبت نشده'}</p>
                        <p className="mt-1 text-muted-foreground">{String(form.originProvince || '—')} / {String(form.originCity || '—')}</p>
                      </div>
                      <div className="rounded-lg border bg-background/60 p-3">
                        <p className="font-medium text-muted-foreground mb-1">مقصد ذخیره‌شده</p>
                        <p>{String(form.destAddress || '').trim() || 'هنوز از نقشه ثبت نشده'}</p>
                        <p className="mt-1 text-muted-foreground">{String(form.destProvince || '—')} / {String(form.destCity || '—')}</p>
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-sm font-semibold text-muted-foreground pt-2">کرایه (گام ۸ سایت)</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="مبلغ کرایه (ریال) *" value={form.freightCost as string} onChange={(v) => updateField('freightCost', v)} placeholder="مثلا 5000000" error={errOf('freightCost')} />
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

                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  کپچای سایت را ربات هنگام ثبت به‌صورت خودکار می‌خواند و حل می‌کند؛
                  نیازی به وارد کردن آن در اینجا نیست.
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

            {/* خلاصه‌ی خطاها — کاربر قبل از زدن دکمه می‌داند چه مانده */}
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{errorCount} فیلد ناقص است</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>لغو</Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)}>
                  مرحله بعد<ChevronLeft className="size-4 mr-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  variant={errorCount > 0 ? 'outline' : 'default'}
                  title={errorCount > 0 ? `${errorCount} فیلد ناقص است` : undefined}
                >
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

/**
 * ورودی پلاک با چهار بخش مجزا — دقیقا مثل خود پلاک خودرو.
 * ترتیب چیدمان مثل پلاک واقعی است (از راست: کد ایران).
 * خروجی همیشه به قالب استاندارد «45 ع 923 17» ذخیره می‌شود
 * تا تطبیق با سایت هیچ‌وقت به‌هم نریزد.
 */
const PLATE_LETTERS_FA = [
  'الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ',
  'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 'م',
  'ن', 'و', 'ه', 'ی',
]

/** ارقام فارسی/عربی → لاتین */
function toLatinDigits(v: string): string {
  return String(v ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/**
 * پلاک را به اجزا تبدیل می‌کند.
 * قالب‌های رایج را پشتیبانی می‌کند:
 *   45 ع 923 17
 *   45-ع-17-923
 *   45 ع 923 ایران 17
 *   ایران 17 45 ع 923
 */
function parsePlateParts(v: string): { two: string; letter: string; three: string; iran: string } {
  const raw = toLatinDigits(v).trim()
  const beforeIran = raw.match(/(?:^|\D)(\d{1,2})\s*(?:ایران|ايران)(?:\D|$)/i)?.[1] || ''
  const afterIran = raw.match(/(?:ایران|ايران)\s*(\d{1,2})(?:\D|$)/i)?.[1] || ''
  const explicitIran = beforeIran || afterIran

  const s = raw.replace(/(?:ایران|ايران)/g, ' ').replace(/[-_|]/g, ' ').trim()
  const letter = (s.match(/[\u0600-\u06FF]+/) || [''])[0].trim()
  let nums = s.match(/\d+/g) || []

  if (explicitIran) {
    const idx = nums.findIndex((n) => n === explicitIran)
    if (idx >= 0) nums = nums.filter((_, i) => i !== idx)
  }

  let two = ''
  let three = ''
  let iran = explicitIran

  const threeIdx = nums.findIndex((n) => n.length === 3)
  if (threeIdx >= 0) {
    three = nums[threeIdx]
    const others = nums.filter((_, i) => i !== threeIdx)
    two = others.find((n) => n.length <= 2) || others[0] || ''
    if (!iran) iran = others.find((n) => n !== two && n.length <= 2) || ''
  } else {
    two = nums.find((n) => n.length <= 2) || nums[0] || ''
    if (!iran) iran = nums.find((n) => n !== two && n.length <= 2) || ''
  }

  // اگر ترتیب سایت «45 17 923» بود، بالا iran را درست می‌گیرد؛ اگر فقط دو عدد داشتیم،
  // برای تشخیص استان عدد غیر از دو رقم اول را ایران می‌گیریم.
  if (!iran && nums.length >= 2) iran = nums[1]

  return { two, letter, three, iran }
}

function PlateField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const p = parsePlateParts(value || '')

  const emit = (two: string, letter: string, three: string, iran: string) => {
    onChange(`${two} ${letter} ${three} ${iran}`.replace(/\s+/g, ' ').trim())
  }

  const digitsOnly = (v: string, max: number) => toLatinDigits(v).replace(/\D/g, '').slice(0, max)

  return (
    <div className="space-y-1.5 col-span-2">
      <Label className={`text-xs ${error ? 'text-destructive' : ''}`}>شماره پلاک *</Label>

      <div className="flex items-end gap-2" dir="ltr">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground mb-0.5">دو رقم</span>
          <Input
            className="h-10 w-16 text-center text-base font-bold"
            inputMode="numeric" maxLength={2} placeholder="45"
            value={p.two}
            onChange={(e) => emit(digitsOnly(e.target.value, 2), p.letter, p.three, p.iran)}
          />
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground mb-0.5">حرف</span>
          <select
            className="h-10 w-20 rounded-md border border-input bg-background px-2 text-center text-base font-bold"
            value={p.letter}
            onChange={(e) => emit(p.two, e.target.value, p.three, p.iran)}
          >
            <option value="">—</option>
            {PLATE_LETTERS_FA.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground mb-0.5">سه رقم</span>
          <Input
            className="h-10 w-20 text-center text-base font-bold"
            inputMode="numeric" maxLength={3} placeholder="923"
            value={p.three}
            onChange={(e) => emit(p.two, p.letter, digitsOnly(e.target.value, 3), p.iran)}
          />
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground mb-0.5">ایران</span>
          <Input
            className="h-10 w-16 text-center text-base font-bold"
            inputMode="numeric" maxLength={2} placeholder="17"
            value={p.iran}
            onChange={(e) => emit(p.two, p.letter, p.three, digitsOnly(e.target.value, 2))}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        همان‌طور که روی پلاک نوشته شده وارد کنید. ذخیره‌شده:{' '}
        <span className="font-mono font-bold">{value || '—'}</span>
      </p>
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, error }: {
  label: string; value: string | number; onChange: (v: string) => void
  placeholder?: string; error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-xs ${error ? 'text-destructive' : ''}`}>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={`h-9 ${error ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
      />
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

function FieldSelect({ label, value, onChange, options, placeholder, error }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
  placeholder?: string; error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-xs ${error ? 'text-destructive' : ''}`}>{label}</Label>
      <Select value={value || 'none'} onValueChange={(v) => onChange((v ?? '') === 'none' ? '' : (v ?? ''))}>
        <SelectTrigger className={`h-9 ${error ? 'border-destructive' : ''}`}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">انتخاب کنید</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
