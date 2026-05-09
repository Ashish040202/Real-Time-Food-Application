import { Order, OrderStatus } from '@/types/order'
import { CheckCircle, Circle, Clock } from 'lucide-react'

interface OrderTimelineProps {
  order: Order
}

interface TimelineStep {
  label: string
  status: OrderStatus | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'DELIVERED'
  description: string
}

const timelineSteps: TimelineStep[] = [
  {
    label: 'Order Placed',
    status: 'PLACED',
    description: 'Your order has been placed',
  },
  {
    label: 'Order Accepted',
    status: 'ACCEPTED',
    description: 'Restaurant accepted your order',
  },
  {
    label: 'Food is Preparing',
    status: 'PREPARING',
    description: 'Your food is being prepared',
  },
  {
    label: 'Ready for Pickup',
    status: 'READY',
    description: 'Your order is ready',
  },
  {
    label: 'Delivered',
    status: 'DELIVERED',
    description: 'Order completed',
  },
]

export default function OrderTimeline({ order }: OrderTimelineProps) {
  // Map order status to timeline step
  const getActiveStep = (status: OrderStatus): number => {
    switch (status) {
      case OrderStatus.PENDING:
        return 0 // Order Placed
      case OrderStatus.ACCEPTED:
        return 1 // Order Accepted
      case OrderStatus.PROCESSING:
        return 2 // Food is Preparing
      case OrderStatus.READY_FOR_PICKUP:
        return 3 // Ready for Pickup
      case OrderStatus.COMPLETED:
        return 4 // Delivered
      case OrderStatus.CANCELLED:
        return -1 // Cancelled
      default:
        return 0
    }
  }

  const activeStepIndex = getActiveStep(order.status)
  const isCancelled = order.status === OrderStatus.CANCELLED

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Order Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{order.customerName}'s Order</h2>
            <p className="text-sm text-gray-500">Order #{order.id}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-800">{order.product}</p>
            <p className="text-sm text-gray-600">
              Qty: {order.quantity} × ${order.price.toFixed(2)}
            </p>
            <p className="text-xl font-bold text-blue-600 mt-1">
              ${(order.quantity * order.price).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Cancelled Status */}
      {isCancelled && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-white text-xl">×</span>
            </div>
            <div>
              <p className="text-red-800 font-semibold">Order Cancelled</p>
              <p className="text-red-600 text-sm">This order has been cancelled</p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {!isCancelled && (
        <div className="relative">
          {timelineSteps.map((step, index) => {
            const isCompleted = index < activeStepIndex
            const isActive = index === activeStepIndex
            const isPending = index > activeStepIndex

            return (
              <div key={step.label} className="relative flex gap-4 pb-8 last:pb-0">
                {/* Vertical Line */}
                {index < timelineSteps.length - 1 && (
                  <div
                    className={`absolute left-4 top-10 w-0.5 h-full -ml-px ${
                      isCompleted || isActive ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                  />
                )}

                {/* Icon */}
                <div className="relative z-10 flex-shrink-0">
                  {isCompleted ? (
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                  ) : isActive ? (
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <Circle className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <h3
                    className={`font-semibold text-lg ${
                      isCompleted || isActive ? 'text-gray-800' : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </h3>
                  <p
                    className={`text-sm ${
                      isCompleted || isActive ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {step.description}
                  </p>
                  {isActive && (
                    <div className="mt-2 inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                      In Progress
                    </div>
                  )}
                  {isCompleted && <p className="text-xs text-gray-500 mt-1">✓ Completed</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Order Details */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>Order placed on</span>
          <span className="font-medium">{new Date(order.createdAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
