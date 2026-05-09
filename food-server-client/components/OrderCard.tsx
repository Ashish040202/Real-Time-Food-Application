import { Order, OrderStatus } from '@/types/order';

interface OrderCardProps {
    order: Order;
    onStatusChange?:  (id: string, status: OrderStatus) => void;
}

export default function OrderCard({ order, onStatusChange }: OrderCardProps) {
    const statusColors = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        PROCESSING: 'bg-blue-100 text-blue-800',
        COMPLETED: 'bg-green-100 text-green-800',
        CANCELLED:  'bg-red-100 text-red-800',
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                        {order.customerName}
                    </h3>
                    <p className="text-sm text-gray-500">Order #{order.id}</p>
                </div>
                <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        statusColors[order.status]
                    }`}
                >
          {order.status}
        </span>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between">
                    <span className="text-gray-600">Product:</span>
                    <span className="font-medium">{order.product}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Quantity:</span>
                    <span className="font-medium">{order.quantity}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Price: </span>
                    <span className="font-medium">${order.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-bold text-lg">
            ${(order.quantity * order.price).toFixed(2)}
          </span>
                </div>
            </div>

            {onStatusChange && order.status !== OrderStatus.COMPLETED && (
                <div className="mt-4 pt-4 border-t">
                    <select
                        className="w-full px-3 py-2 border rounded-md"
                        onChange={(e) =>
                            onStatusChange(order. id, e.target.value as OrderStatus)
                        }
                        defaultValue={order.status}
                    >
                        <option value={OrderStatus.PENDING}>Pending</option>
                        <option value={OrderStatus.PROCESSING}>Processing</option>
                        <option value={OrderStatus.COMPLETED}>Completed</option>
                        <option value={OrderStatus.CANCELLED}>Cancelled</option>
                    </select>
                </div>
            )}
        </div>
    );
}