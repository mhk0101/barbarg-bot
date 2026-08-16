'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Users, Car, FileText, Bot, Settings, ScrollText, BarChart3,
  ChevronLeft, ChevronRight, Hammer, ListOrdered, Cpu, Globe, Clock,
  AlertTriangle, Search, Fuel, Eye, Hash, Map, Shield, UserCheck, Truck, Zap, UserCog, PieChart, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onMobileClose: () => void }

const sections = [
  {
    label: 'عملیات',
    items: [
      { label: 'داشبورد', href: '/panel', icon: LayoutDashboard },
      { label: 'جستجو', href: '/panel/search', icon: Search, perm: 'view_waybill' },
      { label: 'پروفایل‌ها', href: '/panel/profiles', icon: FileText, perm: 'view_waybill' },
      { label: 'ثبت سریع', href: '/panel/quick-waybill', icon: Zap, perm: 'create_waybill' },
      { label: 'ثبت باربرگ', href: '/panel/waybills/new', icon: Hammer, perm: 'create_waybill' },
      { label: 'باربرگ‌ها', href: '/panel/waybills', icon: FileText, perm: 'view_waybill' },
    ],
  },
  {
    label: 'اطلاعات پایه',
    items: [
      { label: 'رانندگان', href: '/panel/drivers', icon: UserCheck, perm: 'view_drivers' },
      { label: 'خودروها', href: '/panel/vehicles', icon: Truck, perm: 'view_vehicles' },
      { label: 'پلاک‌ها', href: '/panel/plates', icon: Car, perm: 'view_plates' },
      { label: 'فرستندگان', href: '/panel/senders', icon: Users, perm: 'view_waybill' },
      { label: 'گیرندگان', href: '/panel/receivers', icon: Users, perm: 'view_waybill' },
      { label: 'بار', href: '/panel/cargo', icon: FileText, perm: 'view_waybill' },
      { label: 'شرکت‌ها', href: '/panel/companies', icon: Shield, perm: 'view_waybill' },
    ],
  },
  {
    label: 'اتوماسیون',
    items: [
      { label: 'مرکز کنترل', href: '/panel/automation', icon: Bot, perm: 'control_bot' },
      { label: 'وضعیت بلادرنگ', href: '/panel/live-status', icon: Eye, perm: 'view_queue' },
      { label: 'صف وظایف', href: '/panel/automation/queue', icon: ListOrdered, perm: 'view_queue' },
      { label: 'ورکرها', href: '/panel/automation/workers', icon: Cpu, perm: 'manage_workers' },
      { label: 'نشست مرورگر', href: '/panel/automation/browsers', icon: Globe, perm: 'manage_workers' },
      { label: 'کپچا', href: '/panel/captcha', icon: Hash, perm: 'control_bot' },
      { label: 'فوروارد پیامک', href: '/panel/sms', icon: MessageSquare, perm: 'manage_settings' },
      { label: 'نقشه‌برداری', href: '/panel/mapping', icon: Map, perm: 'control_bot' },
      { label: 'زمان‌بندی', href: '/panel/scheduler', icon: Clock, perm: 'manage_settings' },
      { label: 'نتایج عملیات', href: '/panel/automation/results', icon: BarChart3, perm: 'view_queue' },
      { label: 'خطاها', href: '/panel/errors', icon: AlertTriangle, perm: 'view_logs' },
    ],
  },
  {
    label: 'استعلام',
    items: [
      { label: 'استعلام پلاک', href: '/panel/plate-inquiry', icon: Search, perm: 'view_plates' },
      { label: 'استعلام سوخت', href: '/panel/fuel', icon: Fuel, perm: 'view_waybill' },
    ],
  },
  {
    label: 'ابزارها',
    items: [
      { label: 'گزارش‌ها', href: '/panel/reports', icon: BarChart3, perm: 'view_reports' },
      { label: 'خروجی PDF و اکسل', href: '/panel/reports/export', icon: FileText, perm: 'export_pdf' },
      { label: 'تحلیل پلاک‌ها', href: '/panel/plate-analytics', icon: PieChart, perm: 'view_reports' },
      { label: 'خروجی اکسل', href: '/panel/excel', icon: BarChart3, perm: 'export_excel' },
      { label: 'تاریخچه ثبت', href: '/panel/history', icon: ScrollText, perm: 'view_waybill' },
      { label: 'لاگ‌ها', href: '/panel/logs', icon: ScrollText, perm: 'view_logs' },
      { label: 'اعلان‌ها', href: '/panel/notifications', icon: AlertTriangle, perm: 'view_notifications' },
    ],
  },
  {
    label: 'مدیریت',
    items: [
      { label: 'حساب‌های باربگ', href: '/panel/barbarg-accounts', icon: UserCheck, perm: 'manage_settings' },
      { label: 'کاربران', href: '/panel/users', icon: UserCog, perm: 'manage_users' },
      { label: 'نقش‌ها', href: '/panel/roles', icon: Shield, perm: 'manage_users' },
      { label: 'تنظیمات', href: '/panel/settings', icon: Settings, perm: 'manage_settings' },
      { label: 'سلامت سیستم', href: '/panel/system-health', icon: Cpu, perm: 'manage_settings' },
    ],
  },
]

function SidebarItem({ item, isActive, collapsed }: { item: { label: string; href: string; icon: React.ElementType }; isActive: boolean; collapsed: boolean }) {
  const Icon = item.icon
  const cls = cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    collapsed && 'justify-center px-0',
    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  )
  return (
    <Link href={item.href} className={cls} title={collapsed ? item.label : undefined}>
      <Icon className="size-5 shrink-0" />
      {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
    </Link>
  )
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: Props) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/panel' ? pathname === '/panel' : pathname.startsWith(href)

  /* دسترسی‌های کاربر را از سرور می‌گیریم (همان چیزی که در
     صفحه‌ی «نقش‌ها» تعریف شده). محافظت واقعی سمت سرور است؛
     این فقط برای تمیزی رابط کاربری است. */
  const [perms, setPerms] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/auth/my-permissions', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setPerms(Array.isArray(d?.permissions) ? d.permissions : []) })
      .catch(() => { if (alive) setPerms([]) })
    return () => { alive = false }
  }, [])

  const can = (perm?: string) => {
    if (!perm) return true                 // منوی عمومی
    if (perms === null) return false       // تا نیامده، منوی حساس نشان نده
    return perms.includes('*') || perms.includes(perm)
  }

  const visibleSections = sections
    .map((sec) => ({ ...sec, items: sec.items.filter((it) => can((it as { perm?: string }).perm)) }))
    .filter((sec) => sec.items.length > 0)

  const sidebarContent = (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed inset-y-0 right-0 z-50 flex flex-col border-l border-sidebar-border bg-sidebar/80 backdrop-blur-md"
    >
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <Bot className="size-6 shrink-0 text-primary" />
        {!collapsed && <span className="text-lg font-bold">باربگ بات</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && <span className="mb-1 block px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>}
            {collapsed && <div className="my-2 border-t border-sidebar-border" />}
            <nav className="flex flex-col gap-1">
              {section.items.map((item) => (
                <SidebarItem key={item.href} item={item} isActive={isActive(item.href)} collapsed={collapsed} />
              ))}
            </nav>
          </div>
        ))}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <button onClick={onToggle} className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
          {collapsed ? <ChevronLeft className="size-5" /> : <><ChevronRight className="size-5" /><span>جمع کردن</span></>}
        </button>
      </div>
    </motion.aside>
  )

  return (
    <>
      {sidebarContent}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onMobileClose}>
          <div className="absolute inset-y-0 right-0 w-[256px]" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
