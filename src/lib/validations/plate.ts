import { z } from 'zod'

export const createPlateSchema = z.object({
  plateNumber: z.string().min(8, 'Plate number is required'),
  province: z.string().min(1, 'Province is required'),
  vehicleType: z.string().min(1, 'Vehicle type is required'),
  owner: z.string().min(1, 'Owner is required'),
  accountId: z.string().min(1, 'Account is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: z.string().optional(),
})

export const updatePlateSchema = z.object({
  plateNumber: z.string().min(8).optional(),
  province: z.string().min(1).optional(),
  vehicleType: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().optional(),
})

export type CreatePlateInput = z.infer<typeof createPlateSchema>
export type UpdatePlateInput = z.infer<typeof updatePlateSchema>
