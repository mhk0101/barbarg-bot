import { Worker, Job } from 'bullmq'
import { REDIS_CONFIG } from '../src/lib/redis'
import { processWaybillJob } from './processor'
import type { AutomationJobData } from './queue'

let worker: Worker | null = null

export function startWorker() {
  if (worker) return

  worker = new Worker('barbarg-automation', async (job: Job<AutomationJobData>) => {
    console.log(`[Worker] Processing job ${job.id} - Task: ${job.data.taskId} - Plate: ${job.data.plateNumber}`)
    await processWaybillJob(job.data.taskId)
  }, { connection: REDIS_CONFIG, concurrency: 1, limiter: { max: 1, duration: 120000 } })

  worker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completed`))
  worker.on('failed', (job, error) => console.log(`[Worker] Job ${job?.id} failed: ${error.message}`))

  console.log('[Worker] Started - concurrency: 1, queue: barbarg-automation')
}

export function stopWorker() {
  if (worker) { worker.close(); worker = null; console.log('[Worker] Stopped') }
}

export function isWorkerRunning(): boolean { return worker !== null }
