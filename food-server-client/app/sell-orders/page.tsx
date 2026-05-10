'use client'

import { useQuery, useMutation } from '@apollo/client/react'
import { GET_SELL_ORDERS } from '@/lib/graphql/queries'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import { ORDER_CREATED_SUBSCRIPTION } from '@/lib/graphql/subscription'
import OrderList from '@/components/OrderList'
import SalesCard from '@/components/SalesCard'
import AuthGuard from '@/components/AuthGuard'
import { Order, OrderStatus } from '@/types/order'
import { useEffect } from 'react'

interface SellOrders {
  ordersByType: Order[]
}

interface OnOrderCreated {
  orderCreated: Order
}

export default function SellOrdersPage() {
  const { data, loading, error, subscribeToMore } = useQuery<SellOrders>(GET_SELL_ORDERS, {
    variables: { type: 'NEW' },
  })

  const [updateOrderStatus] = useMutation(UPDATE_ORDER_STATUS, {
    refetchQueries: [{ query: GET_SELL_ORDERS, variables: { type: 'NEW' } }],
  })

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    try {
      await updateOrderStatus({ variables: { id, status } })
    } catch (err) {
      console.error('Error updating order status:', err)
    }
  }

  useEffect(() => {
    if (!data?.ordersByType) return
    const unsubscribe = subscribeToMore<OnOrderCreated>({
      document: ORDER_CREATED_SUBSCRIPTION,
      updateQuery: (prev: SellOrders, { subscriptionData }) => {
        if (!subscriptionData.data) return prev
        const newOrder = subscriptionData.data.orderCreated
        if (newOrder.type !== 'SELL') return prev
        const exists = prev.ordersByType.find((o) => o.id === newOrder.id)
        if (exists) return prev
        return { ...prev, ordersByType: [newOrder, ...prev.ordersByType] }
      },
    })
    return () => unsubscribe()
  }, [data?.ordersByType, subscribeToMore])

  if (error) {
    return (
      <AuthGuard adminOnly>
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error.message}
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard adminOnly>
      <div className="container mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sell Orders</h1>
          <p className="text-gray-500 mt-1">Manage and update sell order statuses</p>
        </div>

        <SalesCard orders={data?.ordersByType || []} />
        <OrderList
          orders={data?.ordersByType || []}
          loading={loading}
          onStatusChange={handleStatusChange}
        />
      </div>
    </AuthGuard>
  )
}
