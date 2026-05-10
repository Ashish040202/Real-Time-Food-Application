'use client'

import { useMutation } from '@apollo/client/react'
import { CREATE_ORDER } from '@/lib/graphql/mutation'
import { GET_ALL_ORDERS } from '@/lib/graphql/queries'
import { CreateOrderInput } from '@/types/order'
import { useRouter } from 'next/navigation'
import OrderForm from '@/components/OrderForm'
import AuthGuard from '@/components/AuthGuard'

export default function NewOrdersPage() {
  const router = useRouter()

  const [createOrder, { loading, error }] = useMutation(CREATE_ORDER, {
    refetchQueries: [{ query: GET_ALL_ORDERS }],
  })

  const handleSubmit = async (input: CreateOrderInput) => {
    try {
      await createOrder({ variables: { input } })
      router.push('/your-orders')
    } catch {
      // error shown below
    }
  }

  return (
    <AuthGuard>
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-2xl mx-auto mb-8">
          <h1 className="text-3xl font-bold text-gray-900">New Order</h1>
          <p className="text-gray-500 mt-1">Choose from our menu and place your order</p>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error.message}
          </div>
        )}

        <OrderForm onSubmit={handleSubmit} loading={loading} />
      </div>
    </AuthGuard>
  )
}
