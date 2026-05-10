'use client'

import { useSubscription, useMutation } from '@apollo/client/react'
import { ORDER_CREATED_SUBSCRIPTION, ORDER_UPDATED_SUBSCRIPTION } from '@/lib/graphql/subscription'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import AuthGuard from '@/components/AuthGuard'
import { useState, useEffect } from 'react'
import { Order, OrderStatus } from '@/types/order'

const statusStyles: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  READY_FOR_PICKUP: 'bg-teal-100 text-teal-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

interface OrderCreatedData {
  orderCreated: Order
}

interface OrderUpdatedData {
  orderUpdated: Order
}

export default function LiveOrdersPage() {
  const [liveOrders, setLiveOrders] = useState<Order[]>([])

  const { data: createdData } = useSubscription<OrderCreatedData>(ORDER_CREATED_SUBSCRIPTION)
  const { data: updatedData } = useSubscription<OrderUpdatedData>(ORDER_UPDATED_SUBSCRIPTION)
  const [updateOrderStatus] = useMutation(UPDATE_ORDER_STATUS)

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await updateOrderStatus({ variables: { id: orderId, status: newStatus } })
      // Update local state immediately — the subscription handles updates from other clients
      setLiveOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus as OrderStatus } : o))
      )
    } catch (error) {
      console.error('Error updating order status:', error)
    }
  }

  useEffect(() => {
    if (createdData?.orderCreated) {
      setLiveOrders((prev) => {
        if (prev.some((o) => o.id === createdData.orderCreated.id)) return prev
        return [createdData.orderCreated, ...prev]
      })
    }
  }, [createdData])

  useEffect(() => {
    if (updatedData?.orderUpdated) {
      setLiveOrders((prev) =>
        prev.map((o) => (o.id === updatedData.orderUpdated.id ? updatedData.orderUpdated : o))
      )
    }
  }, [updatedData])

  return (
    <AuthGuard adminOnly>
      <div className="container mx-auto px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Live Orders</h1>
            <p className="text-gray-500 mt-1">Real-time incoming orders feed</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-500">{liveOrders.length} orders received</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order ID', 'Customer', 'Product', 'Qty', 'Total', 'Status', 'Update'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {liveOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono">
                    #{order.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-800">
                    {order.customerName}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">{order.product}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{order.quantity}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-800">
                    ${(order.quantity * order.price).toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        statusStyles[order.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="ACCEPTED">Accepted</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
              {liveOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                    Waiting for incoming orders...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AuthGuard>
  )
}
