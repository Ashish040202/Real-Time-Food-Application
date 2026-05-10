'use client'

import { useQuery, useMutation } from '@apollo/client/react'
import { GET_ALL_ORDERS } from '@/lib/graphql/queries'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import OrderList from '@/components/OrderList'
import AuthGuard from '@/components/AuthGuard'
import { Order, OrderStatus, OrderType } from '@/types/order'
import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'

interface GetAllOrdersData {
  orders: Order[]
}

export default function ViewOrdersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterType, setFilterType] = useState<string>('ALL')
  const { isAdmin } = useAuth()

  const { data, loading, error } = useQuery<GetAllOrdersData>(GET_ALL_ORDERS)

  const [updateOrderStatus] = useMutation(UPDATE_ORDER_STATUS, {
    refetchQueries: [{ query: GET_ALL_ORDERS }],
  })

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    try {
      await updateOrderStatus({ variables: { id, status } })
    } catch (err) {
      console.error('Error updating order status:', err)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await updateOrderStatus({ variables: { id, status: OrderStatus.CANCELLED } })
    } catch (err) {
      console.error('Error cancelling order:', err)
    }
  }

  const filteredOrders = (data?.orders || []).filter((order: Order) => {
    const statusMatch = filterStatus === 'ALL' || order.status === filterStatus
    const typeMatch = filterType === 'ALL' || order.type === filterType
    return statusMatch && typeMatch
  })

  if (error) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error.message}
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="container mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {isAdmin ? 'All Orders' : 'My Orders'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isAdmin ? 'Viewing orders from all users' : 'Viewing your personal orders'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
            Filters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="ALL">All statuses</option>
                <option value={OrderStatus.PENDING}>Pending</option>
                <option value={OrderStatus.ACCEPTED}>Accepted</option>
                <option value={OrderStatus.PROCESSING}>Processing</option>
                <option value={OrderStatus.READY_FOR_PICKUP}>Ready for Pickup</option>
                <option value={OrderStatus.COMPLETED}>Completed</option>
                <option value={OrderStatus.CANCELLED}>Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="ALL">All types</option>
                <option value={OrderType.NEW}>New Orders</option>
                <option value={OrderType.SELL}>Sell Orders</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Showing {filteredOrders.length} of {data?.orders?.length || 0} orders
          </p>
        </div>

        <OrderList
          orders={filteredOrders}
          loading={loading}
          onStatusChange={isAdmin ? handleStatusChange : undefined}
          onCancel={!isAdmin ? handleCancel : undefined}
        />
      </div>
    </AuthGuard>
  )
}
