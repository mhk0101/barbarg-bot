'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface ChartData { name: string; value: number; color: string }

export function PlateStatusChart({ data }: { data: ChartData[] }) {
  return (
    <Card><CardHeader><CardTitle>توزیع وضعیت</CardTitle></CardHeader><CardContent className="flex justify-center">
      <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{data.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
    </CardContent></Card>
  )
}
