import 'dotenv/config'
import { startWorker, stopWorker } from './worker'

console.log('[Worker] Starting BarBarg Automation Worker...')
startWorker()

const shutdown = async () => {
  console.log('[Worker] Shutting down gracefully...')
  stopWorker()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
