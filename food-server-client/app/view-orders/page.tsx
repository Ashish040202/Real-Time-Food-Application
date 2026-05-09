'use client'

import { useQuery, useMutation } from '@apollo/client/react'
import { GET_ALL_ORDERS } from '@/lib/graphql/queries'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import OrderList from '@/components/OrderList'
import { Order, OrderStatus, OrderType } from '@/types/order'
import { useState, useEffect } from 'react'
interface GetAllOrdersData {
  orders: Order[]
}

export default function ViewOrdersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterType, setFilterType] = useState<string>('ALL')

  // Update document title
  useEffect(() => {
    document.title = 'Food Order - View Orders'
  }, [])

  const { data, loading, error } = useQuery<GetAllOrdersData>(GET_ALL_ORDERS)

  console.log('Fetched orders:', data?.orders)
  const [updateOrderStatus] = useMutation(UPDATE_ORDER_STATUS, {
    refetchQueries: [{ query: GET_ALL_ORDERS }],
  })

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    try {
      await updateOrderStatus({
        variables: { id, status },
      })
    } catch (err) {
      console.error('Error updating order status:', err)
    }
  }

  const filteredOrders = (data?.orders || []).filter((order: Order) => {
    const statusMatch = filterStatus === 'ALL' || order.status === filterStatus
    const typeMatch = filterType === 'ALL' || order.type === filterType
    return statusMatch && typeMatch
  })

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>Error loading orders. Please check your GraphQL endpoint.</p>
          <p className="text-sm mt-2">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">All Orders</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md: grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ALL">All Statuses</option>
              <option value={OrderStatus.PENDING}>Pending</option>
              <option value={OrderStatus.ACCEPTED}>Accepted</option>
              <option value={OrderStatus.PROCESSING}>Processing</option>
              <option value={OrderStatus.READY_FOR_PICKUP}>Ready for Pickup</option>
              <option value={OrderStatus.COMPLETED}>Completed</option>
              <option value={OrderStatus.CANCELLED}>Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ALL">All Types</option>
              <option value={OrderType.NEW}>New Orders</option>
              <option value={OrderType.SELL}>Sell Orders</option>
            </select>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredOrders.length} of {data?.orders?.length || 0} orders
        </div>
      </div>

      <OrderList orders={filteredOrders} loading={loading} onStatusChange={handleStatusChange} />
    </div>
  )
}
