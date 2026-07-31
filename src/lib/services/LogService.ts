export interface LogEntry {
  id: string; action: string; resource: string; message: string
  level: 'info' | 'success' | 'warning' | 'error'; details?: Record<string, unknown>; timestamp: string
}

class LogService {
  private logs: LogEntry[] = []
  private listeners: Array<(logs: LogEntry[]) => void> = []

  log(action: string, resource: string, message: string, level: LogEntry['level'] = 'info', details?: Record<string, unknown>) {
    const entry: LogEntry = { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, action, resource, message, level, details, timestamp: new Date().toISOString() }
    this.logs.unshift(entry)
    if (this.logs.length > 500) this.logs = this.logs.slice(0, 500)
    this.listeners.forEach((l) => l([...this.logs]))
    fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {})
  }

  getLogs(filter?: { level?: string; resource?: string; search?: string }) {
    let result = [...this.logs]
    if (filter?.level && filter.level !== 'all') result = result.filter((l) => l.level === filter.level)
    if (filter?.resource && filter.resource !== 'all') result = result.filter((l) => l.resource === filter.resource)
    if (filter?.search) result = result.filter((l) => l.message.includes(filter.search!) || l.action.includes(filter.search!))
    return result
  }

  subscribe(listener: (logs: LogEntry[]) => void) { this.listeners.push(listener); return () => { this.listeners = this.listeners.filter((l) => l !== listener) } }
  clear() { this.logs = []; this.listeners.forEach((l) => l([])) }
  exportCSV(): string {
    const h = ['زمان', 'عملیت', 'منبع', 'سطح', 'پیام']
    const r = this.logs.map((l) => [new Date(l.timestamp).toLocaleString('fa'), l.action, l.resource, l.level, l.message])
    return [h.join(','), ...r.map((row) => row.join(','))].join('\n')
  }
}

export const logService = new LogService()
