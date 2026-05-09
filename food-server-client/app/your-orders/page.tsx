'use client'

import { useQuery, useSubscription, useLazyQuery } from '@apollo/client/react'
import { GET_ALL_ORDERS, GET_ORDERS_BY_ORDER_ID } from '@/lib/graphql/queries'
import { ORDER_CREATED_SUBSCRIPTION, ORDER_UPDATED_SUBSCRIPTION } from '@/lib/graphql/subscription'
import OrderTimeline from '@/components/OrderTimeline'
import { Order } from '@/types/order'
import { useState, useEffect } from 'react'

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

  // Update document title
  useEffect(() => {
    document.title = 'Food Order - Your Orders'
  }, [])

  const { data, loading, error, subscribeToMore } = useQuery<GetAllOrdersData>(GET_ALL_ORDERS)

  // Lazy query to fetch order details by orderId when an order is clicked
  const [getOrderDetails, { data: orderDetailsData, loading: orderDetailsLoading }] =
    useLazyQuery<GetOrdersByOrderIdData>(GET_ORDERS_BY_ORDER_ID)

  // Subscribe to order updates for the selected order
  const { data: subscriptionData } = useSubscription<OrderUpdatedData>(ORDER_UPDATED_SUBSCRIPTION, {
    variables: { orderId: selectedOrderId },
    skip: !selectedOrderId, // Only subscribe when an order is selected
  })

  // Initialize orders from query
  useEffect(() => {
    if (data?.orders) {
      setOrders(data.orders)
    }
  }, [data])

  // Subscribe to newly created orders
  useEffect(() => {
    if (subscribeToMore) {
      const unsubscribe = subscribeToMore<OrderCreatedData>({
        document: ORDER_CREATED_SUBSCRIPTION,
        updateQuery: (prev, { subscriptionData }): GetAllOrdersData => {
          if (!subscriptionData.data) return prev as GetAllOrdersData

          const newOrder = subscriptionData.data.orderCreated
          console.log('Received new order via subscription:', newOrder)

          // Check if order already exists in the list
          const prevOrders = prev.orders || []
          const orderExists = prevOrders.some((order) => order?.id === newOrder.id)

          if (orderExists) {
            return prev as GetAllOrdersData
          }

          // Add new order to the beginning of the list
          return {
            orders: [newOrder, ...prevOrders.filter((o): o is Order => o !== undefined)],
          }
        },
      })

      // Cleanup subscription on unmount
      return () => {
        if (unsubscribe) {
          unsubscribe()
        }
      }
    }
  }, [subscribeToMore])

  // Fetch order details when an order is selected
  useEffect(() => {
    if (selectedOrderId) {
      getOrderDetails({ variables: { orderId: selectedOrderId } })
    }
  }, [selectedOrderId, getOrderDetails])

  // Update selected order details when query returns
  useEffect(() => {
    if (orderDetailsData?.ordersByOrderId) {
      setSelectedOrderDetails(orderDetailsData.ordersByOrderId)
    }
  }, [orderDetailsData])

  // Update order details in real-time when subscription receives new data
  useEffect(() => {
    if (subscriptionData?.orderUpdated) {
      const updatedOrder = subscriptionData.orderUpdated
      console.log('Received order update via subscription:', updatedOrder)

      // Update the selected order details
      if (selectedOrderDetails && updatedOrder.id === selectedOrderDetails.id) {
        setSelectedOrderDetails(updatedOrder)
      }

      // Update the order in the list
      setOrders((prevOrders) => {
        const index = prevOrders.findIndex((order) => order.id === updatedOrder.id)
        if (index !== -1) {
          // Update existing order
          const newOrders = [...prevOrders]
          newOrders[index] = updatedOrder
          return newOrders
        }
        // If order doesn't exist, add it (in case it was just created)
        return [...prevOrders, updatedOrder]
      })
    }
  }, [subscriptionData, selectedOrderDetails])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    )
  }

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

  const displayOrder =
    selectedOrderDetails ||
    (selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : orders[0])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Your Orders</h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg
              className="w-24 h-24 mx-auto"
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
          </div>
          <h2 className="text-2xl font-semibold text-gray-600 mb-2">No Orders Yet</h2>
          <p className="text-gray-500">
            Your order history will appear here once you place your first order.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders List Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Order History</h2>
              <div className="space-y-3">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      displayOrder?.id === order.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-800">{order.product}</p>
                        <p className="text-xs text-gray-500">Order #{order.id.slice(0, 8)}</p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          order.status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : order.status === 'PROCESSING'
                            ? 'bg-indigo-100 text-indigo-800'
                            : order.status === 'ACCEPTED'
                            ? 'bg-blue-100 text-blue-800'
                            : order.status === 'READY_FOR_PICKUP'
                            ? 'bg-blue-100 text-blue-800'
                            : order.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{order.customerName}</span>
                      <span className="font-semibold text-gray-800">
                        ${(order.quantity * order.price).toFixed(2)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline Details */}
          <div className="lg:col-span-2">
            {orderDetailsLoading && selectedOrderId ? (
              <div className="bg-white rounded-lg shadow-md p-12">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              </div>
            ) : displayOrder ? (
              <OrderTimeline order={displayOrder} />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <p className="text-gray-500">Select an order to view its timeline</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
