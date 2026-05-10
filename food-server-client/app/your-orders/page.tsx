'use client'

import { useQuery, useSubscription, useLazyQuery, useMutation } from '@apollo/client/react'
import { GET_ALL_ORDERS, GET_ORDERS_BY_ORDER_ID } from '@/lib/graphql/queries'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import { ORDER_CREATED_SUBSCRIPTION, ORDER_UPDATED_SUBSCRIPTION } from '@/lib/graphql/subscription'
import OrderTimeline from '@/components/OrderTimeline'
import AuthGuard from '@/components/AuthGuard'
import { Order, OrderStatus } from '@/types/order'
import { useState, useEffect } from 'react'

const statusStyles: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-indigo-100 text-indigo-800',
  READY_FOR_PICKUP: 'bg-teal-100 text-teal-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

interface GetAllOrdersData {
  orders: Order[]
}

interface GetOrdersByOrderIdData {
  ordersByOrderId: Order
}

interface OrderUpdatedData {
  orderUpdated: Order
}

interface OrderCreatedData {
  orderCreated: Order
}

export default function YourOrdersPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null)

  const { data, loading, error, subscribeToMore } = useQuery<GetAllOrdersData>(GET_ALL_ORDERS)
  const [updateOrderStatus] = useMutation(UPDATE_ORDER_STATUS)

  const [getOrderDetails, { data: orderDetailsData, loading: orderDetailsLoading }] =
    useLazyQuery<GetOrdersByOrderIdData>(GET_ORDERS_BY_ORDER_ID)

  const { data: subscriptionData } = useSubscription<OrderUpdatedData>(
    ORDER_UPDATED_SUBSCRIPTION
  )

  useEffect(() => {
    if (data?.orders) setOrders(data.orders)
  }, [data])

  useEffect(() => {
    if (!subscribeToMore) return
    const unsub = subscribeToMore<OrderCreatedData>({
      document: ORDER_CREATED_SUBSCRIPTION,
      updateQuery: (prev, { subscriptionData }): GetAllOrdersData => {
        if (!subscriptionData.data) return prev as GetAllOrdersData
        const newOrder = subscriptionData.data.orderCreated
        const prevOrders = (prev as GetAllOrdersData).orders || []
        if (prevOrders.some((o) => o?.id === newOrder.id)) return prev as GetAllOrdersData
        return { orders: [newOrder, ...prevOrders.filter((o): o is Order => !!o)] }
      },
    })
    return () => unsub()
  }, [subscribeToMore])

  useEffect(() => {
    if (selectedOrderId) getOrderDetails({ variables: { orderId: selectedOrderId } })
  }, [selectedOrderId, getOrderDetails])

  useEffect(() => {
    if (orderDetailsData?.ordersByOrderId) {
      setSelectedOrderDetails(orderDetailsData.ordersByOrderId)
    }
  }, [orderDetailsData])

  useEffect(() => {
    if (!subscriptionData?.orderUpdated) return
    const updated = subscriptionData.orderUpdated
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === updated.id)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = updated
      return next
    })
    setSelectedOrderDetails((prev) => (prev?.id === updated.id ? updated : prev))
  }, [subscriptionData])

  const handleCancel = async (id: string) => {
    try {
      await updateOrderStatus({ variables: { id, status: 'CANCELLED' } })
    } catch (err) {
      console.error('Error cancelling order:', err)
    }
  }

  const displayOrder =
    selectedOrderDetails ||
    (selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : orders[0])

  if (loading) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8 flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black" />
        </div>
      </AuthGuard>
    )
  }

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
          <h1 className="text-3xl font-bold text-gray-900">Your Orders</h1>
          <p className="text-gray-500 mt-1">Track the status of your orders in real-time</p>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
            <svg
              className="w-16 h-16 mx-auto text-gray-200 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-600 mb-1">No orders yet</h2>
            <p className="text-gray-400 text-sm">
              Your order history will appear here once you place your first order.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Order History
                </h2>
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div key={order.id} className="space-y-1">
                      <button
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          displayOrder?.id === order.id
                            ? 'border-black bg-gray-50'
                            : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-semibold text-gray-800 text-sm">{order.product}</p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              statusStyles[order.status] || 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>#{order.id.slice(0, 8)}</span>
                          <span className="font-medium text-gray-600">
                            ${(order.quantity * order.price).toFixed(2)}
                          </span>
                        </div>
                      </button>
                      {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          className="w-full text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              {orderDetailsLoading && selectedOrderId ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 flex justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black" />
                </div>
              ) : displayOrder ? (
                <OrderTimeline order={displayOrder} />
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
                  <p className="text-gray-400 text-sm">Select an order to view its timeline</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
