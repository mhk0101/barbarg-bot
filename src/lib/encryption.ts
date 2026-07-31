import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'

function getKey(): Buffer {
  return crypto.createHash('sha256').update(SECRET).digest()
}

export function encryptPassword(plain: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export function decryptPassword(encrypted: string): string {
  const [ivHex, data] = encrypted.split(':')
  if (!ivHex || !data) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function passwordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { score, label: 'ضعیف', color: 'bg-red-500' }
  if (score <= 4) return { score, label: 'متوسط', color: 'bg-yellow-500' }
  return { score, label: 'قوی', color: 'bg-green-500' }
}
