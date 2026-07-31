'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface DailyData { day: string; success: number; failed: number }
interface WeeklyData { week: string; success: number; failed: number }

export function DailyChart({ data }: { data: DailyData[] }) {
  return (
    <Card><CardHeader><CardTitle>باربرگ‌های روزانه</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="day" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Area type="monotone" dataKey="success" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} name="موفق" /><Area type="monotone" dataKey="failed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="ناموفق" /></AreaChart></ResponsiveContainer>
      ) : <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>}
    </CardContent></Card>
  )
}

export function WeeklyChart({ data }: { data: WeeklyData[] }) {
  return (
    <Card><CardHeader><CardTitle>باربرگ‌های هفتگی</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="week" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Area type="monotone" dataKey="success" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} name="موفق" /><Area type="monotone" dataKey="failed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="ناموفق" /></AreaChart></ResponsiveContainer>
      ) : <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>}
    </CardContent></Card>
  )
}
