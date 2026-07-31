import { z } from 'zod'

export const createAccountSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  nationalId: z.string().min(10, 'National ID must be at least 10 characters'),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).default('ACTIVE'),
  dailyLimit: z.number().min(1).max(500).default(50),
})

export const updateAccountSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  nationalId: z.string().min(10).optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  dailyLimit: z.number().min(1).max(500).optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
