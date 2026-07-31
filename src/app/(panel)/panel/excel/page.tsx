'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, Loader2 } from 'lucide-react'

type ExportType = 'waybills' | 'accounts' | 'plates' | 'drivers' | 'reports' | 'errors'

const exportTypes: { key: ExportType; label: string }[] = [
  { key: 'waybills', label: 'باربرگ‌ها' },
  { key: 'accounts', label: 'حساب‌ها' },
  { key: 'plates', label: 'پلاک‌ها' },
  { key: 'drivers', label: 'رانندگان' },
  { key: 'reports', label: 'گزارش' },
  { key: 'errors', label: 'خطاها' },
]

export default function ExcelPage() {
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = async (type: ExportType, format: 'xlsx' | 'csv') => {
    const key = `${type}-${format}`
    setExporting(key)
    try {
      const res = await fetch(`/api/export?type=${type}&format=${format}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}-export.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`خروجی ${type} تولید شد`)
    } catch {
      toast.error('خطا در تولید خروجی')
    }
    setExporting(null)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">خروجی اکسل</h1><p className="text-muted-foreground">صدور و دریافت گزارش‌ها</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Download className="size-4" /> خروجی</CardTitle></CardHeader><CardContent className="space-y-3">
          {exportTypes.map(({ key, label }) => (
            <div key={key} className="flex gap-2">
              <Button className="flex-1" onClick={() => handleExport(key, 'xlsx')} disabled={exporting !== null}>
                {exporting === `${key}-xlsx` ? <Loader2 className="size-4 ml-2 animate-spin" /> : <Download className="size-4 ml-2" />}
                {label} (xlsx)
              </Button>
              <Button variant="outline" onClick={() => handleExport(key, 'csv')} disabled={exporting !== null}>
                {exporting === `${key}-csv` ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                csv
              </Button>
            </div>
          ))}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="size-4" /> ورودی</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <FileSpreadsheet className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">فایل اکسل را اینجا رها کنید</p>
            <p className="text-xs mt-2">پشتیبانی از فرمت .xlsx و .csv</p>
          </div>
        </CardContent></Card>
      </div>
    </motion.div>
  )
}
