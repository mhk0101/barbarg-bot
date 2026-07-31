'use client'

import { useState, useCallback } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { cn } from '@/lib/utils'

export function PanelLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleSidebar = useCallback(() => setCollapsed((p) => !p), [])
  const toggleMobile = useCallback(() => setMobileOpen((p) => !p), [])

  return (
    <SessionProvider>
      <div className="min-h-screen bg-background">
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleSidebar}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            'transition-[margin] duration-300',
            collapsed ? 'lg:mr-[72px]' : 'lg:mr-[256px]'
          )}
        >
          <Header onMenuToggle={toggleMobile} />
          <main className="pt-16 min-h-screen">
            <div className="p-4 lg:p-6">{children}</div>
          </main>
        </div>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </div>
    </SessionProvider>
  )
}
