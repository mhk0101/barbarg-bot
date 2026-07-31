'use client'

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
      { label: 'جستجو', href: '/panel/search', icon: Search },
      { label: 'پروفایل‌ها', href: '/panel/profiles', icon: FileText },
      { label: 'ثبت سریع', href: '/panel/quick-waybill', icon: Zap },
      { label: 'ثبت باربرگ', href: '/panel/waybills/new', icon: Hammer },
      { label: 'باربرگ‌ها', href: '/panel/waybills', icon: FileText },
    ],
  },
  {
    label: 'اطلاعات پایه',
    items: [
      { label: 'رانندگان', href: '/panel/drivers', icon: UserCheck },
      { label: 'خودروها', href: '/panel/vehicles', icon: Truck },
      { label: 'پلاک‌ها', href: '/panel/plates', icon: Car },
      { label: 'فرستندگان', href: '/panel/senders', icon: Users },
      { label: 'گیرندگان', href: '/panel/receivers', icon: Users },
      { label: 'بار', href: '/panel/cargo', icon: FileText },
      { label: 'شرکت‌ها', href: '/panel/companies', icon: Shield },
    ],
  },
  {
    label: 'اتوماسیون',
    items: [
      { label: 'مرکز کنترل', href: '/panel/automation', icon: Bot },
      { label: 'وضعیت بلادرنگ', href: '/panel/live-status', icon: Eye },
      { label: 'صف وظایف', href: '/panel/automation/queue', icon: ListOrdered },
      { label: 'ورکرها', href: '/panel/automation/workers', icon: Cpu },
      { label: 'نشست مرورگر', href: '/panel/automation/browsers', icon: Globe },
      { label: 'کپچا', href: '/panel/captcha', icon: Hash },
      { label: 'فوروارد پیامک', href: '/panel/sms', icon: MessageSquare },
      { label: 'نقشه‌برداری', href: '/panel/mapping', icon: Map },
      { label: 'زمان‌بندی', href: '/panel/scheduler', icon: Clock },
      { label: 'نتایج عملیات', href: '/panel/automation/results', icon: BarChart3 },
      { label: 'خطاها', href: '/panel/errors', icon: AlertTriangle },
    ],
  },
  {
    label: 'استعلام',
    items: [
      { label: 'استعلام پلاک', href: '/panel/plate-inquiry', icon: Search },
      { label: 'استعلام سوخت', href: '/panel/fuel', icon: Fuel },
    ],
  },
  {
    label: 'ابزارها',
    items: [
      { label: 'گزارش‌ها', href: '/panel/reports', icon: BarChart3 },
      { label: 'تحلیل پلاک‌ها', href: '/panel/plate-analytics', icon: PieChart },
      { label: 'خروجی اکسل', href: '/panel/excel', icon: BarChart3 },
      { label: 'تاریخچه ثبت', href: '/panel/history', icon: ScrollText },
      { label: 'لاگ‌ها', href: '/panel/logs', icon: ScrollText },
      { label: 'اعلان‌ها', href: '/panel/notifications', icon: AlertTriangle },
    ],
  },
  {
    label: 'مدیریت',
    items: [
      { label: 'حساب‌های باربگ', href: '/panel/barbarg-accounts', icon: UserCheck },
      { label: 'کاربران', href: '/panel/users', icon: UserCog },
      { label: 'نقش‌ها', href: '/panel/roles', icon: Shield },
      { label: 'تنظیمات', href: '/panel/settings', icon: Settings },
      { label: 'سلامت سیستم', href: '/panel/system-health', icon: Cpu },
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
        {sections.map((section) => (
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
