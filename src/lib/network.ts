const DEFAULT_CHECK_URLS = [
  'https://www.gstatic.com/generate_204',
  'https://www.cloudflare.com/cdn-cgi/trace',
  'https://www.msftconnecttest.com/connecttest.txt',
]

export function networkCheckUrls(): string[] {
  const custom = (process.env.NETWORK_CHECK_URLS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return custom.length ? custom : DEFAULT_CHECK_URLS
}

export async function checkInternetOnline(timeoutMs = 5000): Promise<{
  online: boolean
  target?: string
  status?: number
  latencyMs: number
  error?: string
  targets: Array<{ url: string; ok: boolean; status: number; latencyMs: number; error?: string }>
}> {
  const startedAt = Date.now()
  const urls = networkCheckUrls()

  async function checkOne(url: string) {
    const t0 = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'User-Agent': 'barbarg-bot-network-check' },
      })
      clearTimeout(timer)
      return { url, ok: res.status > 0 && res.status < 500, status: res.status, latencyMs: Date.now() - t0 }
    } catch (e) {
      clearTimeout(timer)
      return { url, ok: false, status: 0, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : 'network error' }
    }
  }

  const targets = await Promise.all(urls.map(checkOne))
  const firstOk = targets.find((r) => r.ok)

  return {
    online: !!firstOk,
    target: firstOk?.url,
    status: firstOk?.status,
    latencyMs: Date.now() - startedAt,
    error: firstOk ? undefined : (targets.find((x) => x.error)?.error || 'internet is unavailable'),
    targets,
  }
}
