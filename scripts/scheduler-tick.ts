const API_URL = process.env.API_URL || 'http://localhost:3000'
const TICK_INTERVAL = 60_000

async function tick() {
  try {
    const res = await fetch(`${API_URL}/api/scheduler/tick`)
    const data = await res.json()
    const now = new Date().toLocaleString('fa')
    if (data.created > 0) {
      console.log(`[${now}] ${data.created} وظیفه ایجاد شد`)
      for (const job of data.jobs) {
        console.log(`  - ${job.profileName} → ${job.jobId}`)
      }
    } else {
      console.log(`[${now}] وظیفه‌ای ایجاد نشد`)
    }
  } catch (e) {
    console.error(`[tick error]`, e instanceof Error ? e.message : e)
  }
}

console.log(`برنامه‌ریز زمانبندی شروع شد (هر ${TICK_INTERVAL / 1000} ثانیه)`)
tick()
setInterval(tick, TICK_INTERVAL)
