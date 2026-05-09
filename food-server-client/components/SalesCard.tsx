import { Order } from '@/types/order'

interface SalesCardProps {
  orders: Order[]
}

export default function SalesCard({ orders }: SalesCardProps) {
  // Filter completed orders and calculate total sales
  const completedOrders = orders.filter(order => order.status === 'COMPLETED')
  const totalSales = completedOrders.reduce((sum, order) => sum + order.price, 0)
  const completedOrdersCount = completedOrders.length

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Total Sales</h2>
          <div className="flex flex-col space-y-1">
            <span className="text-3xl font-bold text-green-600">
              ${totalSales.toFixed(2)}
            </span>
            <span className="text-sm text-gray-600">
              {completedOrdersCount} completed order{completedOrdersCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="bg-green-100 p-3 rounded-full">
          <svg 
            className="w-8 h-8 text-green-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" 
            />
          </svg>
        </div>
      </div>
    </div>
  )
}