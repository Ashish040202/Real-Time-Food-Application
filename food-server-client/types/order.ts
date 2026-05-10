export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
}

export interface AuthPayload {
  token: string
  user: AuthUser
}

export interface Order {
  id: string
  userId?: string
  customerName: string
  product: string
  quantity: number
  price: number
  status: OrderStatus
  type: OrderType
  createdAt: string
}

export interface OrderItem {
  id: string
  name: string
  description: string
  rate: number
  category: string
  available: boolean
}

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PROCESSING = 'PROCESSING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OrderType {
  SELL = 'SELL',
  NEW = 'NEW',
}

export interface CreateOrderInput {
  product: string
  quantity: number
  price: number
  type: OrderType
}
