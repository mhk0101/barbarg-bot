import { type WaybillData, type RegistrationResult } from './ErrorService'

export type { WaybillData, RegistrationResult }

class RegistrationService {
  async submit(data: WaybillData): Promise<RegistrationResult> {
    const start = Date.now()
    try {
      const res = await fetch('/api/waybills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, status: 'submitted' }) })
      const result = await res.json()
      await this.log('submit', { plateNumber: data.plateNumber, duration: Date.now() - start })
      return { success: true, waybillNumber: result.waybillNumber || `WB-${Date.now()}`, duration: Date.now() - start, timestamp: new Date().toISOString() }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'خطای ناشناخته'
      await this.log('submit_failed', { plateNumber: data.plateNumber, error: msg })
      return { success: false, error: msg, errorCode: 'NETWORK_ERROR', duration: Date.now() - start, timestamp: new Date().toISOString() }
    }
  }

  async saveTemplate(data: WaybillData): Promise<void> {
    try { await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, plateNumber: data.plateNumber }) }) } catch {}
  }

  async getTemplate(plateNumber: string): Promise<WaybillData | null> {
    try { const res = await fetch(`/api/templates?plate=${encodeURIComponent(plateNumber)}`); const d = await res.json(); return d.data?.[0] || null } catch { return null }
  }

  async getHistory(plateNumber: string) {
    try { const res = await fetch(`/api/history?plate=${encodeURIComponent(plateNumber)}`); const d = await res.json(); return d.data || [] } catch { return [] }
  }

  async saveHistory(data: { plateNumber: string; status: string; waybillNumber?: string; error?: string; duration?: number }) {
    try { await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) } catch {}
  }

  private async log(action: string, details: Record<string, unknown>) {
    try { await fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, resource: 'registration', details }) }) } catch {}
  }
}

export const registrationService = new RegistrationService()
