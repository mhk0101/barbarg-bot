'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Download, Search, Loader2 } from 'lucide-react'

const FuelConsumptionChart = dynamic(
  () => import('./FuelInquiryCharts').then((m) => ({ default: m.FuelConsumptionChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

const FuelTypeChart = dynamic(
  () => import('./FuelInquiryCharts').then((m) => ({ default: m.FuelTypeChart })),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-muted" /> }
)

interface FuelCardItem { id: string; cardNumber: string; fuelType: string; plate: string; status: string; allocated: number; consumed: number; remaining: number }
interface FuelLogItem { id: string; cardNumber: string; date: string; amount: number; station: string }
interface FuelStats { totalCards: number; totalAllocated: number; totalConsumed: number; totalRemaining: number }

export default function FuelInquiry() {
  const [search, setSearch] = useState('')
  const [cards, setCards] = useState<FuelCardItem[]>([])
  const [logs, setLogs] = useState<FuelLogItem[]>([])
  const [stats, setStats] = useState<FuelStats>({ totalCards: 0, totalAllocated: 0, totalConsumed: 0, totalRemaining: 0 })
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/fuel?search=${encodeURIComponent(search)}`)
      const data = await res.json()
      setCards(Array.isArray(data.cards) ? data.cards : [])
      setLogs(Array.isArray(data.logs) ? data.logs : [])
      setStats(data.stats || { totalCards: 0, totalAllocated: 0, totalConsumed: 0, totalRemaining: 0 })
    } catch { setCards([]); setLogs([]) }
    setLoading(false)
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredCards = cards.filter((c) => !search || c.cardNumber.includes(search) || c.plate.includes(search))

  const handleExport = () => {
    const csv = ['شماره کارت,نوع سوخت,پلاک,وضعیت,سهمیه,مصرف,باقیمانده']
    cards.forEach((c) => csv.push(`${c.cardNumber},${c.fuelType},${c.plate},${c.status},${c.allocated},${c.consumed},${c.remaining}`))
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'fuel-cards.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('خروجی اکسل')
  }

  const dailyFuel = logs.reduce((acc, log) => {
    const day = log.date
    const existing = acc.find((a) => a.day === day)
    if (existing) existing.amount += log.amount
    else acc.push({ day, amount: log.amount })
    return acc
  }, [] as { day: string; amount: number }[]).slice(-7)

  const fuelTypeDist = cards.reduce((acc, c) => {
    const existing = acc.find((a) => a.name === c.fuelType)
    if (existing) existing.value++
    else acc.push({ name: c.fuelType, value: 1 })
    return acc
  }, [] as { name: string; value: number }[])

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">استعلام سوخت</h1><p className="text-muted-foreground">مدیریت و استعلام کارت‌های سوخت</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}><Download className="size-4 ml-2" /> اکسل</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">کل کارت‌ها</p><p className="text-2xl font-bold">{stats.totalCards}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">سهمیه کل</p><p className="text-2xl font-bold">{stats.totalAllocated.toLocaleString('fa')} لیتر</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">مصرف شده</p><p className="text-2xl font-bold text-red-500">{stats.totalConsumed.toLocaleString('fa')} لیتر</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">باقیمانده</p><p className="text-2xl font-bold text-green-500">{stats.totalRemaining.toLocaleString('fa')} لیتر</p></CardContent></Card>
      </div>

      <Tabs defaultValue="cards">
        <TabsList><TabsTrigger value="cards">کارت سوخت</TabsTrigger><TabsTrigger value="history">تاریخچه سوخت</TabsTrigger><TabsTrigger value="charts">نمودارها</TabsTrigger></TabsList>
        <TabsContent value="cards" className="pt-4 space-y-4">
          <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="جستجوی شماره کارت یا پلاک..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Card><CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-right text-muted-foreground"><th className="pb-3 font-medium">شماره کارت</th><th className="pb-3 font-medium">نوع سوخت</th><th className="pb-3 font-medium">پلاک</th><th className="pb-3 font-medium">وضعیت</th><th className="pb-3 font-medium">سهمیه</th><th className="pb-3 font-medium">مصرف</th><th className="pb-3 font-medium">باقیمانده</th></tr></thead>
                  <tbody>{filteredCards.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
                  ) : filteredCards.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3 font-mono">{c.cardNumber}</td>
                      <td className="py-3"><Badge variant="outline">{c.fuelType}</Badge></td>
                      <td className="py-3 font-mono">{c.plate}</td>
                      <td className="py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>{c.status === 'active' ? 'فعال' : 'غیرفعال'}</span></td>
                      <td className="py-3">{c.allocated.toLocaleString('fa')} لیتر</td>
                      <td className="py-3 text-red-500">{c.consumed.toLocaleString('fa')} لیتر</td>
                      <td className="py-3 text-green-500">{c.remaining.toLocaleString('fa')} لیتر</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <Card><CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-right text-muted-foreground"><th className="pb-3 font-medium">شماره کارت</th><th className="pb-3 font-medium">تاریخ</th><th className="pb-3 font-medium">مقدار (لیتر)</th><th className="pb-3 font-medium">جایگاه</th></tr></thead>
                <tbody>{logs.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">داده‌ای یافت نشد</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-3 font-mono">{l.cardNumber}</td>
                    <td className="py-3">{l.date}</td>
                    <td className="py-3 font-medium">{l.amount}</td>
                    <td className="py-3">{l.station}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="charts" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <FuelConsumptionChart data={dailyFuel} />
            <FuelTypeChart data={fuelTypeDist} />
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
