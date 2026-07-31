'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar, LineChart, Line } from 'recharts'

const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#6366f1']

interface DailyData { date: string; total: number; successful: number; failed: number }
interface HourlyData { hour: number; total: number; successful: number; failed: number }

export function DailyChart({ data }: { data: DailyData[] }) {
  return (
    <Card><CardHeader><CardTitle className="text-base">ثبت‌نام‌های روزانه (۳۰ روز اخیر)</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Area type="monotone" dataKey="successful" name="موفق" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
            <Area type="monotone" dataKey="failed" name="ناموفق" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
            <Legend />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>
      )}
    </CardContent></Card>
  )
}

export function SuccessFailPieChart({ successful, failed }: { successful: number; failed: number }) {
  const data = [
    { name: 'موفق', value: successful },
    { name: 'ناموفق', value: failed },
  ].filter(d => d.value > 0)

  return (
    <Card><CardHeader><CardTitle className="text-base">توزیع موفقیت و شکست</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>
      )}
    </CardContent></Card>
  )
}

export function HourlyChart({ data }: { data: HourlyData[] }) {
  return (
    <Card><CardHeader><CardTitle className="text-base">ثبت‌نام بر اساس ساعت</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="hour" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Bar dataKey="successful" name="موفق" fill="#22c55e" />
            <Bar dataKey="failed" name="ناموفق" fill="#ef4444" />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>
      )}
    </CardContent></Card>
  )
}

export function TrendChart({ data }: { data: DailyData[] }) {
  return (
    <Card><CardHeader><CardTitle className="text-base">روند ۳۰ روز اخیر</CardTitle></CardHeader><CardContent>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Line type="monotone" dataKey="total" name="کل" stroke="#6366f1" strokeWidth={2} />
            <Line type="monotone" dataKey="successful" name="موفق" stroke="#22c55e" strokeWidth={2} />
            <Line type="monotone" dataKey="failed" name="ناموفق" stroke="#ef4444" strokeWidth={2} />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">داده‌ای موجود نیست</div>
      )}
    </CardContent></Card>
  )
}
