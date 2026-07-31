export interface User {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'USER'
  createdAt: string
  updatedAt: string
}

export interface Account {
  id: string
  username: string
  nationalId: string
  description: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  dailyLimit: number
  lastActivity: string | null
  createdAt: string
  updatedAt: string
  _count?: { plates: number; tasks: number }
}

export interface LicensePlate {
  id: string
  plateNumber: string
  province: string
  vehicleType: string
  owner: string
  status: 'ACTIVE' | 'INACTIVE'
  accountId: string
  account?: Account
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  type: 'REGISTER_WAYBILL' | 'CHECK_STATUS' | 'LOGIN'
  accountId: string
  account?: Account
  plateId: string | null
  plate?: LicensePlate
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  result: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  logs?: TaskLog[]
}

export interface TaskLog {
  id: string
  taskId: string
  level: string
  message: string
  details: Record<string, unknown> | null
  createdAt: string
}

export interface WorkerStatus {
  id: string
  name: string
  status: string
  lastHeartbeat: string | null
  tasksCompleted: number
  tasksFailed: number
}

export interface ActivityLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  details: Record<string, unknown> | null
  userId: string | null
  createdAt: string
}

export interface Notification {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  createdAt: string
}

export interface AccountForm {
  username: string
  password: string
  nationalId: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  dailyLimit: number
}

export interface LicensePlateForm {
  plateNumber: string
  province: string
  vehicleType: string
  owner: string
  accountId: string
  status: 'ACTIVE' | 'INACTIVE'
  notes?: string
}

export interface TaskForm {
  type: 'REGISTER_WAYBILL' | 'CHECK_STATUS' | 'LOGIN'
  accountId: string
  plateId?: string
}

export interface DashboardStats {
  totalAccounts: number
  activeAccounts: number
  totalPlates: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  pendingTasks: number
  processingTasks: number
  activeWorkers: number
}
