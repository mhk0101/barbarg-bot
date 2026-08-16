import { Worker, Job } from 'bullmq'
import { REDIS_CONFIG } from '../src/lib/redis'
import { processWaybillJob } from './processor'
import type { AutomationJobData } from './queue'

let worker: Worker | null = null

/** حداکثر چند اکانت همزمان عملیات انجام دهند (پیش‌فرض: ۳) */
const CONCURRENCY = Math.max(1, Number(process.env.BARBARG_CONCURRENCY || 3))

export function startWorker() {
  if (worker) return

  worker = new Worker('barbarg-automation', async (job: Job<AutomationJobData>) => {
    console.log(`[Worker] Processing job ${job.id} - Task: ${job.data.taskId} - Plate: ${job.data.plateNumber}`)
    await processWaybillJob(job.data.taskId)
  }, {
    connection: REDIS_CONFIG,
    concurrency: CONCURRENCY,
    /* حداکثر CONCURRENCY شروعِ جدید در هر ۲ دقیقه — تا سه مرورگر دقیقا
       با هم بالا نیایند ولی سه عملیات همزمان ممکن باشد */
    limiter: { max: CONCURRENCY, duration: 120000 },
  })

  worker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completed`))
  worker.on('failed', (job, error) => console.log(`[Worker] Job ${job?.id} failed: ${error.message}`))

  console.log(`[Worker] Started - concurrency: ${CONCURRENCY}, queue: barbarg-automation`)
}

export function stopWorker() {
  if (worker) { worker.close(); worker = null; console.log('[Worker] Stopped') }
}

export function isWorkerRunning(): boolean { return worker !== null }
