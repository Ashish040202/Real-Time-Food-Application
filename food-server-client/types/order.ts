export interface Order {
  id: string
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
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OrderType {
  SELL = 'SELL',
  NEW = 'NEW',
}

export interface CreateOrderInput {
  customerName: string
  product: string
  quantity: number
  price: number
  type: OrderType
}
