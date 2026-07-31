'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, ArrowRight, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface MappingEntry { id: string; wizardField: string; internalId: string; fieldType: string; required: boolean; playwritTarget: string }

const mappings: MappingEntry[] = [
  { id: 'm1', wizardField: 'نام فرستنده', internalId: 'sender.firstName', fieldType: 'text', required: true, playwritTarget: 'input[name="sender_first_name"]' },
  { id: 'm2', wizardField: 'نام خانوادگی فرستنده', internalId: 'sender.lastName', fieldType: 'text', required: true, playwritTarget: 'input[name="sender_last_name"]' },
  { id: 'm3', wizardField: 'موبایل فرستنده', internalId: 'sender.mobile', fieldType: 'text', required: true, playwritTarget: 'input[name="sender_mobile"]' },
  { id: 'm4', wizardField: 'کد ملی فرستنده', internalId: 'sender.nationalId', fieldType: 'text', required: true, playwritTarget: 'input[name="sender_national_id"]' },
  { id: 'm5', wizardField: 'نام گیرنده', internalId: 'receiver.firstName', fieldType: 'text', required: true, playwritTarget: 'input[name="receiver_first_name"]' },
  { id: 'm6', wizardField: 'نام خانوادگی گیرنده', internalId: 'receiver.lastName', fieldType: 'text', required: true, playwritTarget: 'input[name="receiver_last_name"]' },
  { id: 'm7', wizardField: 'موبایل گیرنده', internalId: 'receiver.mobile', fieldType: 'text', required: true, playwritTarget: 'input[name="receiver_mobile"]' },
  { id: 'm8', wizardField: 'کد ملی گیرنده', internalId: 'receiver.nationalId', fieldType: 'text', required: true, playwritTarget: 'input[name="receiver_national_id"]' },
  { id: 'm9', wizardField: 'شماره پلاک', internalId: 'vehicle.plate', fieldType: 'text', required: true, playwritTarget: 'input[name="plate_number"]' },
  { id: 'm10', wizardField: 'ظرفیت بار', internalId: 'vehicle.cargoCapacity', fieldType: 'text', required: false, playwritTarget: 'input[name="cargo_capacity"]' },
  { id: 'm11', wizardField: 'بیمه شخص ثالث', internalId: 'vehicle.thirdPartyInsurance', fieldType: 'text', required: false, playwritTarget: 'input[name="third_party_insurance"]' },
  { id: 'm12', wizardField: 'مدارک فعالیت', internalId: 'vehicle.activityLicense', fieldType: 'text', required: false, playwritTarget: 'input[name="activity_license"]' },
  { id: 'm13', wizardField: 'نام راننده', internalId: 'driver.name', fieldType: 'text', required: true, playwritTarget: 'input[name="driver_name"]' },
  { id: 'm14', wizardField: 'موبایل راننده', internalId: 'driver.mobile', fieldType: 'text', required: true, playwritTarget: 'input[name="driver_mobile"]' },
  { id: 'm15', wizardField: 'شماره گواهینامه', internalId: 'driver.license', fieldType: 'text', required: true, playwritTarget: 'input[name="driver_license"]' },
  { id: 'm16', wizardField: 'نام بار', internalId: 'cargo.name', fieldType: 'text', required: true, playwritTarget: 'input[name="cargo_name"]' },
  { id: 'm17', wizardField: 'نوع بسته‌بندی', internalId: 'cargo.packaging', fieldType: 'select', required: false, playwritTarget: 'select[name="packaging_type"]' },
  { id: 'm18', wizardField: 'وزن بار', internalId: 'cargo.weight', fieldType: 'text', required: false, playwritTarget: 'input[name="cargo_weight"]' },
  { id: 'm19', wizardField: 'استان مبدأ', internalId: 'origin.province', fieldType: 'select', required: true, playwritTarget: 'select[name="origin_province"]' },
  { id: 'm20', wizardField: 'شهرستان مبدأ', internalId: 'origin.city', fieldType: 'select', required: true, playwritTarget: 'select[name="origin_city"]' },
  { id: 'm21', wizardField: 'آدرس مبدأ', internalId: 'origin.address', fieldType: 'text', required: true, playwritTarget: 'input[name="origin_address"]' },
  { id: 'm22', wizardField: 'استان مقصد', internalId: 'dest.province', fieldType: 'select', required: true, playwritTarget: 'select[name="dest_province"]' },
  { id: 'm23', wizardField: 'شهرستان مقصد', internalId: 'dest.city', fieldType: 'select', required: true, playwritTarget: 'select[name="dest_city"]' },
  { id: 'm24', wizardField: 'آدرس مقصد', internalId: 'dest.address', fieldType: 'text', required: true, playwritTarget: 'input[name="dest_address"]' },
  { id: 'm25', wizardField: 'مبلغ کرایه', internalId: 'fare.amount', fieldType: 'text', required: true, playwritTarget: 'input[name="fare_amount"]' },
  { id: 'm26', wizardField: 'پیش‌پرداخت', internalId: 'fare.advance', fieldType: 'text', required: false, playwritTarget: 'input[name="advance_fare"]' },
  { id: 'm27', wizardField: 'کپچا', internalId: 'captcha.answer', fieldType: 'text', required: true, playwritTarget: 'input[name="captcha"]' },
]

export default function AutomationMapping() {
  const [search, setSearch] = useState('')
  const filtered = mappings.filter((m) => m.wizardField.includes(search) || m.internalId.includes(search) || m.playwritTarget.includes(search))

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div><h1 className="text-3xl font-bold">نقشه‌برداری اتوماسیون</h1><p className="text-muted-foreground">نگاشت فیلدهای فرم به فیلدهای سایت باربگ</p></div>
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی فیلد..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </CardContent></Card>
      <Card><CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-right text-muted-foreground">
              <th className="pb-3 font-medium">فیلد فرم</th><th className="pb-3 font-medium">شناسه داخلی</th><th className="pb-3 font-medium">نوع</th><th className="pb-3 font-medium">الزامی</th><th className="pb-3 font-medium">هدف Playwright</th><th className="pb-3 font-medium text-left">عملیات</th>
            </tr></thead>
            <tbody>{filtered.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-3 font-medium">{m.wizardField}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{m.internalId}</td>
                <td className="py-3"><Badge variant="outline">{m.fieldType}</Badge></td>
                <td className="py-3">{m.required ? <Badge variant="default" className="text-[10px]">بله</Badge> : <Badge variant="secondary" className="text-[10px]">خیر</Badge>}</td>
                <td className="py-3 font-mono text-xs">{m.playwritTarget}</td>
                <td className="py-3"><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.internalId); toast.success('کپی شد') }}><Copy className="size-4" /></Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </CardContent></Card>
    </motion.div>
  )
}
