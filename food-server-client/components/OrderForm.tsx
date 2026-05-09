'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { useQuery } from '@apollo/client/react'
import { CreateOrderInput, OrderType, OrderItem } from '@/types/order'
import { LIST_ORDER_ITEMS } from '@/lib/graphql/queries'

interface OrderFormProps {
  onSubmit: (input: CreateOrderInput) => void
  loading?: boolean
}

export default function OrderForm({ onSubmit, loading }: OrderFormProps) {
  const { data, loading: itemsLoading } = useQuery<{ listOrderItems: OrderItem[] }>(
    LIST_ORDER_ITEMS
  )
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])

  const [formData, setFormData] = useState<CreateOrderInput>({
    customerName: '',
    product: '',
    quantity: 1,
    price: 0,
    type: OrderType.NEW,
  })

  useEffect(() => {
    if (data?.listOrderItems) {
      const availableItems = data.listOrderItems.filter((item) => item.available)
      setOrderItems(availableItems)
    }
  }, [data])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'quantity' || name === 'price' ? Number(value) : value,
    }))
  }

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedItemId = e.target.value
    const selectedItem = orderItems.find((item) => item.id === selectedItemId)

    if (selectedItem) {
      setFormData((prev) => ({
        ...prev,
        product: selectedItem.name,
        price: selectedItem.rate,
      }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Create New Order</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">
            Customer Name
          </label>
          <input
            type="text"
            id="customerName"
            name="customerName"
            value={formData.customerName}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="product" className="block text-sm font-medium text-gray-700 mb-1">
            Product
          </label>
          <select
            id="product"
            name="product"
            value={orderItems.find((item) => item.name === formData.product)?.id || ''}
            onChange={handleProductChange}
            required
            disabled={itemsLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{itemsLoading ? 'Loading products...' : 'Select a product'}</option>
            {orderItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} - ${item.rate.toFixed(2)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              id="quantity"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="1"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              Price ($)
            </label>
            <input
              type="number"
              id="price"
              name="price"
              value={formData.price}
              onChange={handleChange}
              min="0"
              step="0.01"
              required
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
            Order Type
          </label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={OrderType.NEW}>New Order</option>
            <option value={OrderType.SELL}>Sell Order</option>
          </select>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Placing Order.. .' : 'Place Order'}
          </button>
        </div>
      </div>
    </form>
  )
}
