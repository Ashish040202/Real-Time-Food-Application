'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@apollo/client/react'
import { REGISTER } from '@/lib/graphql/mutation'
import { useAuth } from '@/lib/auth-context'
import type { AuthPayload } from '@/types/order'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER',
  })
  const { login, isAuthenticated, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (initialized && isAuthenticated) router.replace('/')
  }, [initialized, isAuthenticated, router])

  const [register, { loading, error }] = useMutation<{ register: AuthPayload }>(REGISTER)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { data } = await register({ variables: { input: form } })
      if (data?.register) {
        login(data.register.token, data.register.user)
        router.push('/')
      }
    } catch {
      // error shown via Apollo error state
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Create account</h1>
        <p className="text-gray-500 mb-8">Join the food ordering platform</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Full name
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              placeholder="Min. 6 characters"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Account type
            </label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
            >
              <option value="USER">User — place and track orders</option>
              <option value="ADMIN">Admin — manage all orders</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2.5 px-4 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-black hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
