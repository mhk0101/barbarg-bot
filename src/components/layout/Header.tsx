'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from '@/components/layout/ThemeProvider'
import { signOut, useSession } from 'next-auth/react'
import { Sun, Moon, Bell, Menu, LogOut, Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const title =
    routeTitles[pathname] ||
    pathname
      .split('/')
      .pop()
      ?.replace(/-/g, ' ')
      .replace(/^\w/, (c: string) => c.toUpperCase()) ||
    'داشبورد'

  const initials =
    session?.user?.name
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
          <Button variant="ghost" size="icon" className="relative rounded-xl">
            <Bell className="size-5" />
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -left-0.5 flex size-4 items-center justify-center p-0 text-[10px] shadow-sm"
            >
              ۳
            </Badge>
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
                <p className="text-sm font-medium">{session?.user?.name}</p>
                <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/panel/settings')}>
                <Settings className="size-4" /> تنظیمات
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="size-4" /> خروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
