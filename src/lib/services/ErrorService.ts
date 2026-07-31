export interface WaybillData {
  plateNumber: string; driverName: string; driverMobile: string; driverLicenseNumber: string
  senderFirstName: string; senderLastName: string; senderMobile: string; senderNationalId: string
  receiverFirstName: string; receiverLastName: string; receiverMobile: string; receiverNationalId: string
  originProvince: string; originCity: string; originAddress?: string
  destProvince: string; destCity: string; destAddress?: string
  freightCost?: string; cargoName: string; cargoWeight?: string
}

export interface RegistrationResult {
  success: boolean; waybillNumber?: string; error?: string; errorCode?: string
  duration?: number; timestamp: string
}

export interface ErrorInfo {
  code: string; title: string; description: string; solution: string; retryable: boolean
}

const RETRYABLE_ERRORS = ['TIMEOUT', 'CONNECTION_LOST', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504', 'WEBSITE_UNAVAILABLE', 'SESSION_EXPIRED']

export function classifyError(message: string): ErrorInfo {
  const m = message.toLowerCase()
  if (m.includes('password') || m.includes('رمز')) return { code: 'PASSWORD_CHANGED', title: 'رمز عبور تغییر کرده', description: 'رمز عبور حساب کاربری تغییر یافته', solution: 'رمز عبور جدید را در بخش حساب‌ها بروزرسانی کنید', retryable: false }
  if (m.includes('license') || m.includes('مدارک')) return { code: 'LICENSE_EXPIRED', title: 'مدارک منقضی شده', description: 'مدارک فعالیت منقضی شده', solution: 'مدارک جدید بارگذاری کنید', retryable: false }
  if (m.includes('insurance') || m.includes('بیمه')) return { code: 'INSURANCE_EXPIRED', title: 'بیمه منقضی شده', solution: 'بیمه جدید تهیه کنید', retryable: false, description: 'بیمه شخص ثالث منقضی شده' }
  if (m.includes('captcha') || m.includes('کپچا')) return { code: 'CAPTCHA_FAILED', title: 'کپچا حل نشد', description: 'کپچا به درستی حل نشده', solution: 'سرویس کپچا را بررسی کنید', retryable: true }
  if (m.includes('timeout') || m.includes('تایم‌اوت')) return { code: 'TIMEOUT', title: 'تایم‌اوت', description: 'درخواست منقضی شده', solution: 'تلاش مجدد', retryable: true }
  if (m.includes('session') || m.includes('نشست')) return { code: 'SESSION_EXPIRED', title: 'نشست منقضی شده', description: 'جلسه مرورگر منقضی شده', solution: 'ورود مجدد', retryable: true }
  if (m.includes('unavailable') || m.includes('غیرقابل دسترس')) return { code: 'WEBSITE_UNAVAILABLE', title: 'سایت در دسترس نیست', description: 'سرور پاسخ نمی‌دهد', solution: 'صبر کنید و مجدداً تلاش کنید', retryable: true }
  return { code: 'UNKNOWN', title: 'خطای ناشناخته', description: message, solution: 'با پشتیبانی تماس بگیرید', retryable: false }
}

export function isRetryable(errorCode: string): boolean {
  return RETRYABLE_ERRORS.includes(errorCode)
}

export function calculateRetryDelay(attempt: number): number {
  return Math.min(15000 * Math.pow(2, attempt - 1), 300000)
}
