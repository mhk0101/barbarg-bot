/**
 * requeue-stuck.js — نجات جاب‌های یتیم
 *
 * جاب‌هایی که در دیتابیس status='pending' دارند ولی در صف Redis
 * نیستند، هرگز اجرا نمی‌شوند. این اسکریپت پیدایشان می‌کند و
 * دوباره به صف می‌فرستد.
 *
 *   node requeue-stuck.js          → فقط گزارش بده (امن)
 *   node requeue-stuck.js --fix    → واقعا به صف اضافه کن
 *   node requeue-stuck.js --cancel → به‌جای اجرا، لغوشان کن
 */
require('dotenv').config()

const DO_FIX = process.argv.includes('--fix')
const DO_CANCEL = process.argv.includes('--cancel')

async function main() {
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

  const pending = await prisma.job.findMany({
    where: { status: 'pending' },
    include: { profile: { select: { name: true, plateNumber: true, accountId: true } } },
    orderBy: { createdAt: 'asc' },
  })

  if (pending.length === 0) {
    console.log('✅ هیچ جاب در انتظاری وجود ندارد')
    await prisma.$disconnect()
    return
  }

  console.log(`\n${pending.length} جاب در حالت «در انتظار»:\n`)

  // چه جاب‌هایی واقعا در صف Redis هستند؟
  let inQueue = new Set()
  try {
    const { automationQueue } = require('./worker/queue')
    const jobs = await automationQueue.getJobs(['waiting', 'delayed', 'active', 'paused'])
    for (const j of jobs) if (j?.data?.taskId) inQueue.add(j.data.taskId)
    console.log(`   (${inQueue.size} جاب در صف Redis پیدا شد)\n`)
  } catch (e) {
    console.log(`   ⚠ اتصال به Redis برقرار نشد: ${e.message}`)
    console.log('   همه‌ی جاب‌های pending یتیم فرض می‌شوند\n')
  }

  const orphans = pending.filter((j) => !inQueue.has(j.id))

  for (const j of pending) {
    const orphan = !inQueue.has(j.id)
    const age = Math.round((Date.now() - new Date(j.createdAt).getTime()) / 60000)
    console.log(
      `  ${orphan ? '🔴 یتیم ' : '🟢 در صف'}  ${j.id}` +
      `  | ${j.profile?.name || '(بدون پروفایل)'}` +
      `  | پلاک ${j.profile?.plateNumber || '—'}` +
      `  | تلاش ${j.attempts}/${j.maxRetries}` +
      `  | ${age} دقیقه پیش`,
    )
  }

  console.log(`\n🔴 ${orphans.length} جاب یتیم (در دیتابیس هست، در صف نیست)`)

  if (orphans.length === 0) { await prisma.$disconnect(); return }

  if (DO_CANCEL) {
    for (const j of orphans) {
      await prisma.job.update({
        where: { id: j.id },
        data: { status: 'failed', error: 'دستی لغو شد (جاب یتیم)', completedAt: new Date() },
      })
    }
    console.log(`\n✅ ${orphans.length} جاب یتیم لغو شدند`)
    await prisma.$disconnect()
    return
  }

  if (!DO_FIX) {
    console.log('\nبرای فرستادن به صف :  node requeue-stuck.js --fix')
    console.log('برای لغو کردنشان   :  node requeue-stuck.js --cancel')
    await prisma.$disconnect()
    return
  }

  const { automationQueue } = require('./worker/queue')
  let ok = 0
  for (let i = 0; i < orphans.length; i++) {
    const j = orphans[i]
    try {
      await automationQueue.add(
        'process-waybill',
        {
          taskId: j.id,
          plateNumber: j.profile?.plateNumber || '',
          accountId: j.profile?.accountId || '',
          jobIndex: 0,
          totalJobs: 1,
        },
        { delay: i * 30000, priority: j.priority },   // ۳۰ ثانیه فاصله بین هرکدام
      )
      ok++
      console.log(`  ✔ ${j.id} → صف (شروع بعد از ${i * 30} ثانیه)`)
    } catch (e) {
      console.log(`  ✖ ${j.id} → ${e.message}`)
    }
  }
  console.log(`\n✅ ${ok} جاب به صف اضافه شد — پنجره‌ی Worker باید بازشان کند`)
  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => { console.error('خطا:', e.message); process.exit(1) })
