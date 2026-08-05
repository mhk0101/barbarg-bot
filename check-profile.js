/**
 * check-profile.js — بررسی اینکه چرا پروفایل پیدا نمی‌شود
 * اجرا:  node check-profile.js
 */
require('dotenv').config()

function norm(s) {
  return String(s ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, '')
    .trim()
}

async function main() {
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

  const profiles = await prisma.registrationProfile.findMany({
    include: { barbargAccount: { select: { id: true, accountName: true, username: true } } },
  })

  console.log('\n═══════════ پروفایل‌های موجود ═══════════')
  if (profiles.length === 0) {
    console.log('❌ هیچ پروفایلی در دیتابیس نیست!')
    console.log('   یعنی ذخیره‌ی پروفایل موفق نبوده است.')
    await prisma.$disconnect()
    return
  }

  for (const p of profiles) {
    console.log(`\n▸ «${p.name}»`)
    console.log(`   id          : ${p.id}`)
    console.log(`   وضعیت       : ${p.status}${p.status !== 'active' ? '   ⚠ فعال نیست!' : '  ✔'}`)
    console.log(`   پلاک (خام)  : "${p.plateNumber}"`)
    console.log(`   پلاک (نرمال): "${norm(p.plateNumber)}"`)
    console.log(`   accountId   : ${p.accountId ?? 'null   ⚠ حساب وصل نیست'}`)
    if (p.barbargAccount) {
      console.log(`   حساب        : ${p.barbargAccount.accountName} (${p.barbargAccount.username})  ✔`)
    }
    console.log(`   راننده/کالا : ${p.driverName} / ${p.cargoName}`)
    console.log(`   مبدا→مقصد   : ${p.originProvince}،${p.originCity} → ${p.destProvince}،${p.destCity}`)
  }

  const accounts = await prisma.barBargAccount.findMany({
    select: { id: true, accountName: true, username: true, status: true },
  })
  console.log('\n═══════════ حساب‌های باربرگ ═══════════')
  for (const a of accounts) {
    console.log(`   ${a.accountName} (${a.username})  id=${a.id}  وضعیت=${a.status}`)
  }

  // شبیه‌سازی دقیق منطق trigger
  const testPlate = process.argv[2] || '45 ع 923 17'
  const target = norm(testPlate)
  console.log(`\n═══════════ شبیه‌سازی جستجو ═══════════`)
  console.log(`   ورودی مرکز کنترل: "${testPlate}"  →  نرمال: "${target}"`)

  const active = profiles.filter((p) => p.status === 'active')
  console.log(`   پروفایل‌های فعال: ${active.length} از ${profiles.length}`)

  const exact = active.filter((p) => norm(p.plateNumber) === target)
  const loose = exact.length ? exact : active.filter((p) => norm(p.plateNumber).includes(target))

  if (exact.length) console.log(`   ✔ تطبیق دقیق: ${exact.length} پروفایل`)
  else if (loose.length) console.log(`   ~ تطبیق نسبی: ${loose.length} پروفایل`)
  else {
    console.log('   ✖ هیچ تطبیقی نشد')
    console.log('\n   مقایسه‌ی کاراکتری:')
    for (const p of active) {
      const pn = norm(p.plateNumber)
      console.log(`      پروفایل: "${pn}" (${pn.length} کاراکتر)`)
      console.log(`      ورودی  : "${target}" (${target.length} کاراکتر)`)
      const max = Math.max(pn.length, target.length)
      for (let i = 0; i < max; i++) {
        if (pn[i] !== target[i]) {
          console.log(`      ✖ اختلاف در موقعیت ${i}: پروفایل="${pn[i] ?? '—'}" (U+${(pn.charCodeAt(i) || 0).toString(16)})  ورودی="${target[i] ?? '—'}" (U+${(target.charCodeAt(i) || 0).toString(16)})`)
          break
        }
      }
    }
  }

  if (loose.length) {
    console.log(`\n   ⇒ پروفایل انتخابی: «${loose[0].name}»`)
    console.log(`      accountId = ${loose[0].accountId ?? 'null'}`)
    console.log(loose[0].accountId
      ? '      ✔ حساب وصل است — trigger باید کار کند'
      : '      ⚠ حساب وصل نیست — با پچ جدید خودکار وصل می‌شود')
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error('خطا:', e.message); process.exit(1) })
