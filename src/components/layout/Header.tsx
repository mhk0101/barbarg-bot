'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from '@/components/layout/ThemeProvider'
import { Sun, Moon, Bell, Menu, LogOut, Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const routeTitles: Record<string, string> = {
  '/panel': 'داشبورد',
  '/panel/quick-waybill': 'ثبت سریع باربرگ',
  '/panel/waybills': 'باربرگ‌ها',
  '/panel/waybills/new': 'ثبت باربرگ جدید',
  '/panel/drivers': 'رانندگان',
  '/panel/vehicles': 'خودروها',
  '/panel/plates': 'پلاک‌ها',
  '/panel/senders': 'فرستندگان',
  '/panel/receivers': 'گیرندگان',
  '/panel/cargo': 'بار',
  '/panel/companies': 'شرکت‌ها',
  '/panel/barbarg-accounts': 'حساب‌های باربگ',
  '/panel/plate-inquiry': 'استعلام پلاک',
  '/panel/fuel': 'استعلام سوخت',
  '/panel/automation': 'مرکز کنترل',
  '/panel/live-status': 'وضعیت بلادرنگ',
  '/panel/automation/queue': 'صف وظایف',
  '/panel/automation/workers': 'ورکرها',
  '/panel/automation/browsers': 'نشست مرورگر',
  '/panel/captcha': 'کپچا',
  '/panel/mapping': 'نقشه‌برداری',
  '/panel/scheduler': 'زمان‌بندی',
  '/panel/errors': 'خطاها',
  '/panel/reports': 'گزارش‌ها',
  '/panel/logs': 'لاگ‌ها',
  '/panel/notifications': 'اعلان‌ها',
  '/panel/users': 'کاربران',
  '/panel/roles': 'نقش‌ها',
  '/panel/settings': 'تنظیمات',
}

export function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null)
  const [unread, setUnread] = useState(0)
  useEffect(() => setMounted(true), [])

  /* نام و ایمیل را از سیستم احراز هویت واقعی (access_token) می‌گیریم.
     قبلا از useSession ی نکست‌اوث خوانده می‌شد که هیچ‌وقت مقداری نداشت
     (ورود از /api/auth/login انجام می‌شود نه نکست‌اوث) — برای همین
     نام و ایمیل در منو خالی بود و signOut هم خطای ClientFetchError می‌داد. */
  useEffect(() => {
    let alive = true
    fetch('/api/auth/profile', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.user) setUser({ name: d.user.name, email: d.user.email }) })
      .catch(() => { /* مهم نیست — فقط نمایش است */ })
    return () => { alive = false }
  }, [])

  /* شمارش اعلان‌های خوانده‌نشده برای نشان روی زنگوله.
     قبلا عدد «۳» هاردکد بود و دکمه هیچ onClick نداشت. */
  useEffect(() => {
    let alive = true

    const load = () => {
      if (document.hidden) return
      fetch('/api/notifications?unread=true', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setUnread(Array.isArray(d?.data) ? d.data.length : 0) })
        .catch(() => { /* بی‌صدا — نشان صرفا تزئینی است */ })
    }

    load()
    const id = setInterval(load, 30000)
    document.addEventListener('visibilitychange', load)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', load)
    }
  }, [pathname])   // با هر جابه‌جایی صفحه هم تازه شود

  /**
   * خروج از حساب.
   *
   * نگهبان واقعی پنل، کوکی access_token است که /api/auth/login
   * می‌گذارد و (panel)/layout.tsx آن را چک می‌کند.
   * چون httpOnly است، جاوااسکریپت نمی‌تواند پاکش کند —
   * حتما باید سرور با DELETE پاکش کند.
   *
   * به کاربر فقط پیام فارسی نشان داده می‌شود، نه خطای فنی.
   */
  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)

    const toastId = toast.loading('در حال خروج از حساب…')
    let cleared = false

    // ۱) کوکی اصلی (access_token + refresh_token) را سرور پاک کند
    try {
      const res = await fetch('/api/auth/login', { method: 'DELETE', credentials: 'include' })
      cleared = res.ok
    } catch {
      cleared = false
    }

    if (cleared) {
      toast.success('با موفقیت خارج شدید', { id: toastId })
    } else {
      toast.error('خروج کامل انجام نشد — به صفحه ورود منتقل می‌شوید', { id: toastId })
    }

    // ۳) ناوبری کامل (نه router.push) تا کش سمت سرور هم تازه شود
    setTimeout(() => { window.location.href = '/login' }, 600)
  }

  const title =
    routeTitles[pathname] ||
    pathname
      .split('/')
      .pop()
      ?.replace(/-/g, ' ')
      .replace(/^\w/, (c: string) => c.toUpperCase()) ||
    'داشبورد'

  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'ا'

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center border-b border-border bg-background/75 shadow-sm shadow-black/[0.02] backdrop-blur-md">
      <div className="flex w-full items-center gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl lg:hidden" onClick={onMenuToggle}>
            <Menu className="size-5" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="mr-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {mounted && (theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />)}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-xl"
            title={unread > 0 ? `${unread} اعلان خوانده‌نشده` : 'اعلان‌ها'}
            onClick={() => router.push('/panel/notifications')}
          >
            <Bell className="size-5" />
            {unread > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-0.5 -left-0.5 flex size-4 items-center justify-center p-0 text-[10px] shadow-sm"
              >
                {unread > 99 ? '۹۹+' : unread.toLocaleString('fa-IR')}
              </Badge>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-accent" />}
            >
              <Avatar size="sm" className="ring-2 ring-primary/15">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.name || 'کاربر'}</p>
                <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
              </div>
              <DropdownMenuSeparator />
              {/* Base UI از onClick استفاده می‌کند نه onSelect (آن مال Radix است) */}
              <DropdownMenuItem onClick={() => router.push('/panel/settings')}>
                <Settings className="size-4" /> تنظیمات
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={signingOut}
                onClick={handleSignOut}
              >
                <LogOut className="size-4" /> {signingOut ? 'در حال خروج…' : 'خروج'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
