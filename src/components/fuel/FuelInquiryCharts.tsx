'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface DailyFuel { day: string; amount: number }
interface FuelTypeDist { name: string; value: number }

export function FuelConsumptionChart({ data }: { data: DailyFuel[] }) {
  return (
    <Card><CardHeader><CardTitle>مصرف سوخت</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="day" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="مصرف" /></AreaChart></ResponsiveContainer>
      ) : <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>}
    </CardContent></Card>
  )
}

export function FuelTypeChart({ data }: { data: FuelTypeDist[] }) {
  return (
    <Card><CardHeader><CardTitle>توزیع نوع سوخت</CardTitle></CardHeader><CardContent className="flex justify-center">
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{data.map((_, i) => <Cell key={i} fill={['#3b82f6', '#22c55e', '#f59e0b'][i % 3]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
      ) : <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>}
    </CardContent></Card>
  )
}
