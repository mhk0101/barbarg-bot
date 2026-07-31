import { Queue } from 'bullmq'
import { REDIS_CONFIG } from '../src/lib/redis'

export const automationQueue = new Queue('barbarg-automation', {
  connection: REDIS_CONFIG,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 15000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export interface AutomationJobData {
  taskId: string
  plateNumber: string
  accountId: string
  jobIndex: number
  totalJobs: number
}

export async function enqueueJobs(jobs: AutomationJobData[]) {
  for (const job of jobs) {
    const delay = Math.floor(Math.random() * 75000 + 45000) * job.jobIndex
    await automationQueue.add('process-waybill', job, { delay, priority: 0 })
  }
  return jobs.length
}

export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    automationQueue.getWaitingCount(),
    automationQueue.getActiveCount(),
    automationQueue.getCompletedCount(),
    automationQueue.getFailedCount(),
  ])
  return { waiting, active, completed, failed }
}
