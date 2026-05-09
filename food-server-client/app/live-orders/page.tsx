'use client'

import { useSubscription, useMutation } from '@apollo/client/react'
import { ORDER_CREATED_SUBSCRIPTION } from '@/lib/graphql/subscription'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import { useState, useEffect } from 'react'
import { Order } from '@/types/order'

interface OrderCreatedSubscriptionData {
  orderCreated: Order
}

export default function LiveOrdersPage() {
  const [liveOrders, setLiveOrders] = useState<Order[]>([])

  // Subscribe to the orderCreated event
  const { data } = useSubscription<OrderCreatedSubscriptionData>(ORDER_CREATED_SUBSCRIPTION)

  // Mutation to update order status
  const [updateOrderStatus] = useMutation(UPDATE_ORDER_STATUS)

  // Handle status change
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await updateOrderStatus({
        variables: {
          id: orderId,
          status: newStatus,
        },
      })

      // Update local state to reflect the change
      setLiveOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: newStatus as Order['status'] } : order
        )
      )
    } catch (error) {
      console.error('Error updating order status:', error)
    }
  }

  // Update document title
      useEffect(() => {
        document.title = 'Food Order - Live Orders'
      }, [])

  useEffect(() => {
    if (data?.orderCreated) {
      console.log('New order received:', data.orderCreated)

      // Add the new order to the beginning of the list
      setLiveOrders((prevOrders) => {
        // Check if order already exists to avoid duplicates
        const orderExists = prevOrders.some((order) => order.id === data.orderCreated.id)
        if (!orderExists) {
          return [data.orderCreated, ...prevOrders]
        }
        return prevOrders
      })
    }
  }, [data])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Live Orders</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead>
            <tr>
              <th className="px-4 py-2 border">ID</th>
              <th className="px-4 py-2 border">Customer Name</th>
              <th className="px-4 py-2 border">Product</th>
              <th className="px-4 py-2 border">Quantity</th>
              <th className="px-4 py-2 border">Price</th>
              <th className="px-4 py-2 border">Status</th>
              <th className="px-4 py-2 border">Update the status</th>
            </tr>
          </thead>
          <tbody>
            {liveOrders.map((order: Order) => (
              <tr key={order.id}>
                <td className="px-4 py-2 border">{order.id}</td>
                <td className="px-4 py-2 border">{order.customerName}</td>
                <td className="px-4 py-2 border">{order.product}</td>
                <td className="px-4 py-2 border">{order.quantity}</td>
                <td className="px-4 py-2 border">${order.price.toFixed(2)}</td>
                <td className="px-4 py-2 border">
                  <span className={`px-2 py-1 rounded text-sm bg-yellow-200 text-yellow-800`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-2 border">
                  <span className={`px-2 py-1 rounded text-sm bg-gray-200 text-gray-800`}>
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className="bg-transparent border-0 focus:ring-0 cursor-pointer"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="ACCEPTED">Accepted</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </span>
                </td>
              </tr>
            ))}
            {liveOrders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-2 border text-center text-gray-500">
                  No live orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
