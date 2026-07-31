'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#6366f1']

interface WeeklyActivityData { day: string; count: number }
interface StatusDistributionData { name: string; value: number }

export function WeeklyActivityChart({ data }: { data: WeeklyActivityData[] }) {
  return (
    <Card><CardHeader><CardTitle className="text-base">فعالیت هفتگی</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="day" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Area type="monotone" dataKey="count" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} /></AreaChart></ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>
      )}
    </CardContent></Card>
  )
}

export function StatusDistributionChart({ data }: { data: StatusDistributionData[] }) {
  const filtered = data.filter((s) => s.value > 0)
  return (
    <Card><CardHeader><CardTitle className="text-base">توزیع وضعیت</CardTitle></CardHeader><CardContent>
      {filtered.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={filtered} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">{filtered.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Legend /><Tooltip /></PieChart></ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>
      )}
    </CardContent></Card>
  )
}
