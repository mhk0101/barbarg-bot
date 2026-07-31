require('dotenv').config()
const { Queue } = require('bullmq')

async function testQueue() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380'
  const parsed = new URL(redisUrl)
  const connection = { host: parsed.hostname, port: parseInt(parsed.port || '6380') }

  console.log('Testing BullMQ at', redisUrl)

  const queue = new Queue('test-barbarg', { connection })
  const job = await queue.add('test-job', { message: 'Hello from test' })
  console.log('Job created:', job.id)

  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed')
  console.log('Queue counts:', counts)

  await queue.close()
  console.log('BullMQ + Redis 8: OK')
}

testQueue().catch(e => { console.error('Queue Error:', e.message); process.exit(1) })
