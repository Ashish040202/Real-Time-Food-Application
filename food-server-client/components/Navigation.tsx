'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, isAdmin, logout } = useAuth()

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const navItems = [
    { href: '/', label: 'Home', show: isAuthenticated },
    { href: '/new-orders', label: 'New Order', show: isAuthenticated && !isAdmin },
    { href: '/your-orders', label: 'Your Orders', show: isAuthenticated },
    { href: '/view-orders', label: 'View Orders', show: isAuthenticated },
    { href: '/live-orders', label: 'Live Orders', show: isAdmin },
    { href: '/sell-orders', label: 'Sell Orders', show: isAdmin },
  ]

  return (
    <nav className="bg-black text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-xl font-bold tracking-tight">
              Food Orders
            </Link>
            <div className="hidden md:flex space-x-1">
              {navItems
                .filter((item) => item.show)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href ? 'bg-gray-700' : 'hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {user?.role === 'ADMIN' ? 'Administrator' : 'User'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-1.5 text-sm border border-gray-600 hover:border-gray-400 rounded-md transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/login"
                  className="px-4 py-1.5 text-sm hover:bg-gray-800 rounded-md transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-1.5 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
