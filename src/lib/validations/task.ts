import { z } from 'zod'

export const createTaskSchema = z.object({
  type: z.enum(['REGISTER_WAYBILL', 'CHECK_STATUS', 'LOGIN']),
  accountId: z.string().min(1, 'Account is required'),
  plateId: z.string().optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
