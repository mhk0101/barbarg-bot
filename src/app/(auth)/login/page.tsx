'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Mail, Lock, Eye, EyeOff, Loader2, Bot } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const net = await fetch('/api/network/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      if (!net?.online) {
        setError('اینترنت یا دسترسی شبکه قطع است؛ ورود انجام نشد')
        toast.error('اینترنت قطع است', { description: 'قبل از ورود، اتصال اینترنت را بررسی کنید.' })
        setIsLoading(false)
        return
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'خطا در ورود'); setIsLoading(false); return }
      if (data.user?.mustChangePassword) { toast.success('ورود موفق! لطفاً رمز عبور خود را تغییر دهید') }
      else { toast.success('خوش آمدید!') }
      router.push('/panel')
    } catch { setError('خطا در اتصال به سرور'); setIsLoading(false) }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -top-40 -right-40 size-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border/50 bg-card/80 p-8 shadow-2xl shadow-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-2 mb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30"><Bot className="h-8 w-8 text-primary-foreground" /></div>
            <h1 className="bg-gradient-to-l from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">باربگ بات</h1>
            <p className="text-sm text-muted-foreground">سیستم اتوماسیون باربرگ</p>
          </div>

          {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">ایمیل</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@barbarg.com"
                  className="h-10 w-full rounded-xl border border-input bg-background pr-10 pl-4 text-sm placeholder:text-muted-foreground transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">رمز عبور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="h-10 w-full rounded-xl border border-input bg-background pr-10 pl-10 text-sm placeholder:text-muted-foreground transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" required />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                <Label htmlFor="remember" className="text-sm cursor-pointer">مرا به خاطر بسپار</Label>
              </div>
              <button type="button" className="text-sm text-primary hover:underline">فراموشی رمز عبور</button>
            </div>

            <button type="submit" disabled={isLoading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-primary to-primary/85 px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30 disabled:pointer-events-none disabled:opacity-50">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ورود'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
