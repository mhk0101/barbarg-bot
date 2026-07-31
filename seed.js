require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const bcrypt = require('bcryptjs')

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  const hashed = await bcrypt.hash('Admin123456', 10)
  await prisma.user.upsert({
    where: { email: 'admin@barbarg.local' },
    update: { password: hashed, role: 'owner', mustChangePassword: true, name: 'مالک سیستم' },
    create: { email: 'admin@barbarg.local', name: 'مالک سیستم', password: hashed, role: 'owner', mustChangePassword: true },
  })
  console.log('Admin user ready: admin@barbarg.local / Admin123456')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
