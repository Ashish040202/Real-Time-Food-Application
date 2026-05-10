'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

interface AuthGuardProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function AuthGuard({ children, adminOnly = false }: AuthGuardProps) {
  const { isAuthenticated, isAdmin, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!initialized) return
    if (!isAuthenticated) {
      router.replace('/login')
    } else if (adminOnly && !isAdmin) {
      router.replace('/')
    }
  }, [initialized, isAuthenticated, isAdmin, adminOnly, router])

  if (!initialized) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    )
  }

  if (!isAuthenticated) return null
  if (adminOnly && !isAdmin) return null

  return <>{children}</>
}
