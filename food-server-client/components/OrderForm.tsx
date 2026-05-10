'use client'

import React, { useState, useEffect } from 'react'
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
    product: '',
    quantity: 1,
    price: 0,
    type: OrderType.NEW,
  })

  useEffect(() => {
    if (data?.listOrderItems) {
      setOrderItems(data.listOrderItems.filter((item) => item.available))
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
      [name]: name === 'quantity' ? Number(value) : value,
    }))
  }

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedItem = orderItems.find((item) => item.id === e.target.value)
    if (selectedItem) {
      setFormData((prev) => ({
        ...prev,
        product: selectedItem.name,
        price: selectedItem.rate,
      }))
    }
  }

  const total = (formData.quantity * formData.price).toFixed(2)

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-md p-8 max-w-2xl mx-auto"
    >
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Select item
          </label>
          <select
            value={orderItems.find((item) => item.name === formData.product)?.id || ''}
            onChange={handleProductChange}
            required
            disabled={itemsLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm disabled:opacity-50"
          >
            <option value="">
              {itemsLoading ? 'Loading menu...' : 'Choose a menu item'}
            </option>
            {orderItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — ${item.rate.toFixed(2)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Quantity
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="1"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Unit price
            </label>
            <input
              type="number"
              value={formData.price}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Order type
          </label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
          >
            <option value={OrderType.NEW}>New Order</option>
            <option value={OrderType.SELL}>Sell Order</option>
          </select>
        </div>

        {formData.price > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {formData.quantity} × ${formData.price.toFixed(2)}
            </span>
            <span className="text-lg font-bold text-gray-900">Total: ${total}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !formData.product}
          className="w-full bg-black text-white py-2.5 px-4 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
        >
          {loading ? 'Placing order...' : 'Place order'}
        </button>
      </div>
    </form>
  )
}
