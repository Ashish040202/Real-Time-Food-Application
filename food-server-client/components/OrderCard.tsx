import { Order, OrderStatus } from '@/types/order'

interface OrderCardProps {
  order: Order
  onStatusChange?: (id: string, status: OrderStatus) => void
  onCancel?: (id: string) => void
}

const statusStyles: Record<OrderStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  READY_FOR_PICKUP: 'bg-teal-100 text-teal-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  READY_FOR_PICKUP: 'Ready for Pickup',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const cancellable = (status: OrderStatus) =>
  status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED

export default function OrderCard({ order, onStatusChange, onCancel }: OrderCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">{order.customerName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">#{order.id.slice(0, 8)}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[order.status]}`}>
          {statusLabels[order.status]}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Product</span>
          <span className="font-medium text-gray-800">{order.product}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Quantity</span>
          <span className="font-medium">{order.quantity}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Price</span>
          <span className="font-medium">${order.price.toFixed(2)}</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-gray-100">
          <span className="text-gray-500">Total</span>
          <span className="font-bold text-gray-900">
            ${(order.quantity * order.price).toFixed(2)}
          </span>
        </div>
      </div>

      {(onStatusChange || onCancel) && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          {onStatusChange && cancellable(order.status) && (
            <select
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
              onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)}
              defaultValue={order.status}
            >
              <option value={OrderStatus.PENDING}>Pending</option>
              <option value={OrderStatus.ACCEPTED}>Accepted</option>
              <option value={OrderStatus.PROCESSING}>Processing</option>
              <option value={OrderStatus.READY_FOR_PICKUP}>Ready for Pickup</option>
              <option value={OrderStatus.COMPLETED}>Completed</option>
              <option value={OrderStatus.CANCELLED}>Cancelled</option>
            </select>
          )}
          {onCancel && cancellable(order.status) && (
            <button
              onClick={() => onCancel(order.id)}
              className="w-full px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
            >
              Cancel Order
            </button>
          )}
        </div>
      )}
    </div>
  )
}
