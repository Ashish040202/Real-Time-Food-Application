'use client'
import { useQuery, useMutation } from '@apollo/client/react'
import { GET_SELL_ORDERS } from '@/lib/graphql/queries'
import { UPDATE_ORDER_STATUS } from '@/lib/graphql/mutation'
import {ORDER_CREATED_SUBSCRIPTION} from '@/lib/graphql/subscription'
import OrderList from '@/components/OrderList'
import { Order, OrderStatus } from '@/types/order'
import {useEffect} from "react";
import SalesCard from '@/components/SalesCard'

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
      await updateOrderStatus({
        variables: { id, status },
      })
    } catch (err) {
      console.error('Error updating order status:', err)
    }
  }

  useEffect(()=>{
    if(data?.ordersByType){
      const unsubscribeOrderUpdated = subscribeToMore<OnOrderCreated>({
        document:  ORDER_CREATED_SUBSCRIPTION,
        updateQuery: (prev: any, { subscriptionData }) => {
          console.log('subscriptionData', subscriptionData)
          if (!subscriptionData.data) return prev
          const newOrder = subscriptionData.data.orderCreated
          if(newOrder.type !== 'SELL') return prev
          // Avoid duplicates
          const exists = prev.ordersByType.find((order:any) => order.id === newOrder.id)
          if (exists) return prev
          // Prepend the new order to the list
          return { ...prev, ordersByType: [newOrder, ...prev.ordersByType] }
        },
      })

      return () => {
        unsubscribeOrderUpdated()
      }
    }

  }, [data?.ordersByType, subscribeToMore])

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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-gray-600">Loading sell orders...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Sell Orders</h1>
      <SalesCard orders={data?.ordersByType || []} />
      <OrderList
        orders={data?.ordersByType || []}
        loading={loading}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
