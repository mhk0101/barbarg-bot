'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const CHECK_INTERVAL_MS = 15_000

type Status = 'unknown' | 'online' | 'offline'

declare global {
  interface Window {
    __barbargNetworkOnline?: boolean
    __barbargOriginalFetch?: typeof fetch
  }
}

export function NetworkMonitor() {
  const [status, setStatus] = useState<Status>('unknown')
  const toastIdRef = useRef<string | number | null>(null)
  const lastStatusRef = useRef<Status>('unknown')

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setInterval> | null = null

    const setOffline = (message = 'اتصال اینترنت یا دسترسی به سامانه قطع است') => {
      if (!alive) return
      window.__barbargNetworkOnline = false
      setStatus('offline')
      if (!toastIdRef.current) {
        toastIdRef.current = toast.error('اینترنت قطع است', {
          description: message + '؛ عملیات‌های در حال اجرا متوقف شده و بعد از برگشت اتصال از ابتدا تلاش می‌شوند.',
          duration: Infinity,
        })
      }
      window.dispatchEvent(new CustomEvent('barbarg-network-status', { detail: { online: false } }))
    }

    const setOnline = () => {
      if (!alive) return
      window.__barbargNetworkOnline = true
      setStatus('online')
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current)
        toastIdRef.current = null
        if (lastStatusRef.current === 'offline') {
          toast.success('اتصال اینترنت برقرار شد', {
            description: 'عملیات‌های بعدی می‌توانند ادامه پیدا کنند.',
            duration: 5000,
          })
        }
      }
      window.dispatchEvent(new CustomEvent('barbarg-network-status', { detail: { online: true } }))
    }

    const originalFetch = window.__barbargOriginalFetch || window.fetch.bind(window)
    window.__barbargOriginalFetch = originalFetch

    // قبل از هر عملیات تغییردهنده (POST/PUT/PATCH/DELETE) وضعیت اینترنت را چک می‌کنیم.
    // GETهای عادی دست‌نخورده می‌مانند تا UI کند نشود.
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const isNetworkCheck = url.includes('/api/network/status')
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

      if (isMutation && !isNetworkCheck) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setOffline('مرورگر وضعیت offline گزارش کرده است')
          throw new Error('اینترنت قطع است؛ عملیات انجام نشد')
        }
        try {
          const res = await originalFetch('/api/network/status', { cache: 'no-store', credentials: 'include' })
          const data = await res.json().catch(() => null)
          if (!res.ok || !data?.online) {
            setOffline(data?.error || 'پاسخ تست اتصال ناموفق بود')
            throw new Error('اینترنت قطع است؛ عملیات انجام نشد')
          }
          setOnline()
        } catch (e) {
          if (e instanceof Error && e.message.includes('عملیات انجام نشد')) throw e
          setOffline('ارتباط با سرور/اینترنت برقرار نیست')
          throw new Error('اینترنت قطع است؛ عملیات انجام نشد')
        }
      }

      return originalFetch(input, init)
    }) as typeof fetch

    const check = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setOffline('مرورگر وضعیت offline گزارش کرده است')
        lastStatusRef.current = 'offline'
        return
      }
      try {
        const res = await originalFetch('/api/network/status', { cache: 'no-store', credentials: 'include' })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.online) {
          setOnline()
          lastStatusRef.current = 'online'
        } else {
          setOffline(data?.error || 'پاسخ تست اتصال ناموفق بود')
          lastStatusRef.current = 'offline'
        }
      } catch {
        setOffline('ارتباط با سرور/اینترنت برقرار نیست')
        lastStatusRef.current = 'offline'
      }
    }

    const onOffline = () => {
      setOffline('مرورگر وضعیت offline گزارش کرده است')
      lastStatusRef.current = 'offline'
    }
    const onOnline = () => { void check() }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    void check()
    timer = setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      alive = false
      if (timer) clearInterval(timer)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      if (toastIdRef.current) toast.dismiss(toastIdRef.current)
      if (window.__barbargOriginalFetch) window.fetch = window.__barbargOriginalFetch
    }
  }, [])

  return null
}
