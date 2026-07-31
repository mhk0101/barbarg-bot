'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, User, Car, FileText, Truck, Package, Shield, Bot, BarChart3, Users } from 'lucide-react'
import Link from 'next/link'

interface SearchResults {
  profiles: Array<{ id: string; name: string; plateNumber: string; driverName: string; status: string }>
  accounts: Array<{ id: string; accountName: string; username: string; status: string }>
  plates: Array<{ id: string; plateNumber: string; province: string; status: string }>
  drivers: Array<{ id: string; name: string; nationalId: string; phone: string; status: string }>
  vehicles: Array<{ id: string; vehicleType: string; status: string }>
  senders: Array<{ id: string; name: string; nationalId: string; phone: string }>
  receivers: Array<{ id: string; name: string; nationalId: string; phone: string }>
  cargo: Array<{ id: string; name: string; code: string | null; type: string }>
  companies: Array<{ id: string; name: string; nationalId: string; phone: string | null }>
  jobs: Array<{ id: string; type: string; status: string; createdAt: string }>
  automationResults: Array<{ id: string; plate: string | null; driver: string | null; status: string; resultMessage: string | null }>
}

const emptyResults: SearchResults = {
  profiles: [], accounts: [], plates: [], drivers: [],
  vehicles: [], senders: [], receivers: [], cargo: [],
  companies: [], jobs: [], automationResults: [],
}

interface GroupConfig {
  key: keyof SearchResults
  label: string
  icon: React.ElementType
  href: (item: Record<string, string>) => string
  render: (item: Record<string, string>) => string
}

const groups: GroupConfig[] = [
  { key: 'profiles', label: 'پروفایل ثبت‌نام', icon: FileText, href: () => '/panel/profiles', render: (i) => `${i.name} — ${i.plateNumber}` },
  { key: 'accounts', label: 'اکانت باربگ', icon: Shield, href: () => '/panel/barbarg-accounts', render: (i) => `${i.accountName} (${i.username})` },
  { key: 'plates', label: 'پلاک', icon: Car, href: () => '/panel/plates', render: (i) => `${i.plateNumber} — ${i.province}` },
  { key: 'drivers', label: 'راننده', icon: User, href: () => '/panel/drivers', render: (i) => `${i.name} — ${i.nationalId}` },
  { key: 'vehicles', label: 'خودرو', icon: Truck, href: () => '/panel/vehicles', render: (i) => i.vehicleType },
  { key: 'senders', label: 'فرستنده', icon: Users, href: () => '/panel/senders', render: (i) => `${i.name} — ${i.nationalId}` },
  { key: 'receivers', label: 'گیرنده', icon: Users, href: () => '/panel/receivers', render: (i) => `${i.name} — ${i.nationalId}` },
  { key: 'cargo', label: 'بار', icon: Package, href: () => '/panel/cargo', render: (i) => i.code ? `${i.name} (${i.code})` : i.name },
  { key: 'companies', label: 'شرکت', icon: Shield, href: () => '/panel/companies', render: (i) => i.name },
  { key: 'jobs', label: 'وظیفه', icon: Bot, href: () => '/panel/automation/queue', render: (i) => `${i.type} — ${i.status}` },
  { key: 'automationResults', label: 'نتیجه عملیات', icon: BarChart3, href: () => '/panel/automation/results', render: (i) => `${i.plate || ''} — ${i.resultMessage || i.status}` },
]

const statusColor = (s: string) => {
  if (s === 'active') return 'bg-green-500/10 text-green-500'
  if (s === 'pending') return 'bg-yellow-500/10 text-yellow-500'
  if (s === 'success') return 'bg-green-500/10 text-green-500'
  if (s === 'failed' || s === 'error') return 'bg-red-500/10 text-red-500'
  return 'bg-gray-500/10 text-gray-500'
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    active: 'فعال', inactive: 'غیرفعال', disabled: 'غیرفعال',
    pending: 'در انتظار', success: 'موفق', failed: 'ناموفق',
    completed: 'تکمیل شده', running: 'در حال اجرا', error: 'خطا',
  }
  return map[s] || s
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(emptyResults)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(emptyResults); setSearched(false); return }
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=50`)
      const data = await res.json()
      setResults(data)
    } catch {
      setResults(emptyResults)
    }
    setLoading(false)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(query)
  }

  const totalResults = Object.values(results).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">جستجوی سراسری</h1>
        <p className="text-muted-foreground">جستجو در تمام اطلاعات سیستم</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <Input
              placeholder="جستجو کنید... (نام، پلاک، کد ملی، شماره حساب، نوع بار و...)"
              className="pr-11 h-12 text-base"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && searched && totalResults === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            نتیجه‌ای یافت نشد
          </CardContent>
        </Card>
      )}

      {!loading && searched && totalResults > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{totalResults} نتیجه یافت شد</p>
          <div className="space-y-4">
            {groups.map((g) => {
              const items = results[g.key]
              if (!items || items.length === 0) return null
              const Icon = g.icon
              return (
                <Card key={g.key}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="size-4" />
                      {g.label}
                      <Badge variant="secondary" className="mr-auto">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1">
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          href={g.href(item as Record<string, string>)}
                          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <span>{g.render(item as Record<string, string>)}</span>
                          {'status' in item && (
                            <Badge className={`${statusColor((item as Record<string, string>).status)} text-xs`}>
                              {statusLabel((item as Record<string, string>).status)}
                            </Badge>
                          )}
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
  )
}
