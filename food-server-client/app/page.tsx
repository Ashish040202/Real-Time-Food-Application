'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

export default function Home() {
  const { isAuthenticated, isAdmin, user } = useAuth()

  const userRoutes = [
    {
      title: 'New Order',
      description: 'Browse the menu and place a new order',
      href: '/new-orders',
      color: 'bg-green-600 hover:bg-green-700',
    },
    {
      title: 'Your Orders',
      description: 'Track your order history and status in real-time',
      href: '/your-orders',
      color: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      title: 'View Orders',
      description: 'Browse and filter your orders',
      href: '/view-orders',
      color: 'bg-purple-600 hover:bg-purple-700',
    },
  ]

  const adminRoutes = [
    {
      title: 'Live Orders',
      description: 'Monitor all incoming orders in real-time',
      href: '/live-orders',
      color: 'bg-orange-600 hover:bg-orange-700',
    },
    {
      title: 'Sell Orders',
      description: 'Manage and update sell order statuses',
      href: '/sell-orders',
      color: 'bg-red-600 hover:bg-red-700',
    },
  ]

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Food Orders</h1>
          <p className="text-lg text-gray-500 mb-10">
            A real-time food ordering platform powered by GraphQL subscriptions.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-1">
          Hello, {user?.name}
        </h1>
        <p className="text-gray-500">
          {isAdmin ? 'Administrator dashboard' : 'What would you like to do today?'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
        {!isAdmin && userRoutes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={`${route.color} text-white rounded-xl p-7 transform transition-all hover:scale-105 hover:shadow-lg`}
          >
            <h2 className="text-xl font-bold mb-2">{route.title}</h2>
            <p className="text-white/80 text-sm">{route.description}</p>
          </Link>
        ))}

        {isAdmin &&
          adminRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={`${route.color} text-white rounded-xl p-7 transform transition-all hover:scale-105 hover:shadow-lg`}
            >
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-bold">{route.title}</h2>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Admin</span>
              </div>
              <p className="text-white/80 text-sm">{route.description}</p>
            </Link>
          ))}
      </div>
    </div>
  )
}
