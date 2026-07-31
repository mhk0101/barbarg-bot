'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { RefreshCw, Zap, Eye, Clock, CheckCircle, AlertTriangle, Hash } from 'lucide-react'

interface CaptchaEntry { id: string; type: string; answer: string; solved: boolean; time: string }

export default function CaptchaEngine() {
  const [mode, setMode] = useState<'math' | 'image' | 'ocr' | 'manual'>('math')
  const [mathA, setMathA] = useState(12)
  const [mathB, setMathB] = useState(7)
  const [answer, setAnswer] = useState('')
  const [history, setHistory] = useState<CaptchaEntry[]>([])

  const refreshMath = () => { setMathA(Math.floor(Math.random() * 50)); setMathB(Math.floor(Math.random() * 50)); setAnswer('') }

  const solve = () => {
    if (!answer) { toast.error('پاسخ را وارد کنید'); return }
    const correct = mode === 'math' ? Number(answer) === mathA + mathB : true
    setHistory((prev) => [{ id: `c${Date.now()}`, type: mode === 'math' ? 'ریاضی' : mode === 'image' ? 'تصویری' : mode === 'ocr' ? 'OCR' : 'دستی', answer: correct ? answer : 'خطا', solved: correct, time: new Date().toLocaleTimeString('fa-IR') }, ...prev])
    toast.success(correct ? 'کپچا حل شد!' : 'پاسخ اشتباه!')
    if (mode === 'math') refreshMath()
    setAnswer('')
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">موتور کپچا</h1><p className="text-muted-foreground">سرویس حل کپچای سامانه باربرگ</p></div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { mode: 'math' as const, label: 'ریاضی', icon: Hash, desc: 'حل کپچای ریاضی ساده' },
          { mode: 'image' as const, label: 'تصویری', icon: Eye, desc: 'OCR تصویری' },
          { mode: 'ocr' as const, label: 'OCR', icon: Zap, desc: 'سرویس OCR خودکار' },
          { mode: 'manual' as const, label: 'دستی', icon: AlertTriangle, desc: 'حل دستی توسط اپراتور' },
        ].map((m) => (
          <Card key={m.mode} className={`cursor-pointer transition-all ${mode === m.mode ? 'border-primary ring-1 ring-primary' : 'hover:border-muted-foreground/30'}`} onClick={() => setMode(m.mode)}>
            <CardContent className="p-4 text-center">
              <m.icon className={`size-8 mx-auto mb-2 ${mode === m.mode ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>حل کپچا</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {mode === 'math' && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <span className="text-2xl font-mono font-bold">{mathA} + {mathB} =</span>
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="پاسخ" className="w-24 text-center text-lg" onKeyDown={(e) => e.key === 'Enter' && solve()} />
              <Button size="sm" variant="outline" onClick={refreshMath}><RefreshCw className="size-4" /></Button>
            </div>
          )}
          {mode === 'image' && <div className="rounded-lg bg-muted/50 p-8 text-center"><Eye className="size-12 mx-auto mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">تصویر کپچا در اینجا نمایش داده می‌شود</p></div>}
          {mode === 'ocr' && <div className="rounded-lg bg-muted/50 p-8 text-center"><Zap className="size-12 mx-auto mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">سرویس OCR خودکار کپچا را حل می‌کند</p></div>}
          {mode === 'manual' && <div className="space-y-2"><Label>پاسخ کپچا</Label><Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="کد کپچا را وارد کنید" /></div>}
          <Button onClick={solve} className="w-full">حل کپچا</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>تاریخچه کپچا</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Badge variant={h.solved ? 'default' : 'destructive'}>{h.solved ? 'حل شد' : 'خطا'}</Badge>
                  <span className="text-sm font-mono">{h.answer}</span>
                  <Badge variant="outline">{h.type}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{h.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
