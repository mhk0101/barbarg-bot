/**
 * test-step1.js — تستر ثبت بارنامه
 * ═══════════════════════════════════════════════════════════════════
 *  ⚠ منطق اصلی از این فایل به src/automation/engine/step1-engine.js
 *    منتقل شد تا پنل (تب اتوماسیون) و این تستر «دقیقا یک کد» باشند.
 *    این فایل حالا فقط یک پوسته‌ی نازک است.
 *
 *  اجرا:
 *      node test-step1.js               → داده‌ی ثابت نمونه، بدون ثبت نهایی
 *      node test-step1.js --submit      → ثبت واقعی
 *      node test-step1.js --profile     → داده از اولین پروفایل فعال دیتابیس
 *      node test-step1.js --profile="نام پروفایل"
 * ═══════════════════════════════════════════════════════════════════
 */
require('dotenv').config()

const engine = require('./src/automation/engine/step1-engine.js')

const DO_SUBMIT  = process.argv.includes('--submit')
const profileArg = process.argv.find(a => a.startsWith('--profile'))
const USE_PROFILE = !!profileArg
const PROFILE_NAME = profileArg && profileArg.includes('=')
  ? profileArg.split('=').slice(1).join('=').replace(/^["']|["']$/g, '')
  : null

/* ── داده‌ی ثابت نمونه — مطابق بارنامه‌ی واقعی (کد رهگیری 1306262568) ── */
const WAYBILL = {
  sender: {
    type: 'حقیقی', firstName: 'شرکت', lastName: 'شرکت',
    mobile: '09131784512', nationalId: '3070427898', phone: '', postalCode: '',
  },
  receiver: {
    type: 'حقیقی', firstName: 'شرکت', lastName: 'شرکت',
    mobile: '09131784512', nationalId: '3070427898', phone: '', postalCode: '',
  },
  driver: {
    name: 'علي پرون', firstName: 'علي', lastName: 'پرون', nationalId: '3070427898',
    plate: { twoDigit: '45', letter: 'ع', threeDigit: '923', iran: '17' },
    plateText: '45 ع 923 17',
  },
  cargo: {
    name: 'آجر', packaging: 'سایر', count: '19', weightTon: '19',
    value: '10000000', insurance: '0',
  },
  origin:      { province: 'کرمان', city: 'سیرجان', address: 'خیابان ابن سینا، خیابان بدر جنوبی', postalCode: '' },
  destination: { province: 'کرمان', city: 'سیرجان', address: 'میدان قدس، خیابان شهید شفیعی', postalCode: '' },
  fare:        { amount: '5000000', prepaid: '', time: '23:07' },
}

async function loadFromDb() {
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const crypto = require('crypto')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

  const account = await prisma.barBargAccount.findFirst({ where: { status: 'active' } })
  const profile = USE_PROFILE
    ? await prisma.registrationProfile.findFirst({
        where: PROFILE_NAME ? { name: PROFILE_NAME } : { status: 'active' },
        include: { barbargAccount: true },
      })
    : null
  await prisma.$disconnect()

  if (!account) return null
  const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'
  const key = crypto.createHash('sha256').update(SECRET).digest()
  const [iv, dt] = account.passwordEncrypted.split(':')
  const dec = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'))
  let pw = dec.update(dt, 'hex', 'utf8'); pw += dec.final('utf8')

  return { username: account.username, password: pw, accountName: account.accountName, profile }
}

async function main() {
  const db = await loadFromDb().catch(e => { console.log('   (دیتابیس: ' + e.message + ')'); return null })
  if (!db) { console.error('❌ حساب فعالی یافت نشد'); process.exit(1) }
  console.log(`حساب: ${db.accountName} (${db.username})`)

  let data = WAYBILL
  if (USE_PROFILE) {
    if (!db.profile) { console.error('❌ پروفایلی یافت نشد'); process.exit(1) }
    console.log(`پروفایل: ${db.profile.name}`)
    data = engine.profileToData(db.profile)
    const missing = engine.validateData(data)
    if (missing.length) { console.error('❌ فیلدهای خالی: ' + missing.join('، ')); process.exit(1) }
  } else {
    console.log('📋 داده‌ی ثابت نمونه (برای داده‌ی پروفایل: --profile)')
  }

  console.log(`   راننده : ${data.driver.name} | پلاک ${data.driver.plateText}`)
  console.log(`   کالا   : ${data.cargo.name} | ${data.cargo.packaging} | ${data.cargo.count} بسته | ${data.cargo.weightTon} تن`)
  console.log(`   مسیر   : ${data.origin.city} ← ${data.destination.city}`)
  console.log(`   حالت   : ${DO_SUBMIT ? 'ثبت واقعی' : 'آزمایشی (برای ثبت: --submit)'}`)

  const res = await engine.runWaybill({
    credentials: { username: db.username, password: db.password },
    data,
    submit: DO_SUBMIT,
    headless: false,
    keepOpenMs: 180000,
  })

  if (res.trackingCode) console.log(`\n🎉 کد رهگیری: ${res.trackingCode}`)
  else if (!res.success) console.log(`\n✖ ناموفق: ${res.error}`)
  process.exit(res.success ? 0 : 1)
}

main().catch(e => { console.error('خطا:', e.message); process.exit(1) })
