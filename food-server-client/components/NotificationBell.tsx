'use client'

import { useQuery, useMutation, useSubscription } from '@apollo/client/react'
import { MY_NOTIFICATIONS } from '@/lib/graphql/queries'
import { MARK_NOTIFICATION_READ, MARK_ALL_NOTIFICATIONS_READ } from '@/lib/graphql/mutation'
import { NOTIFICATION_SUBSCRIPTION } from '@/lib/graphql/subscription'
import { useAuth } from '@/lib/auth-context'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppNotification {
  id: string
  type: 'NEW_ORDER' | 'ORDER_CANCELLED' | 'ORDER_COMPLETED'
  title: string
  message: string
  orderId: string | null
  read: boolean
  createdAt: string
}

interface MyNotificationsData {
  myNotifications: AppNotification[]
}

interface NotificationSubData {
  notificationReceived: AppNotification
}

// ─── Suppress rules ───────────────────────────────────────────────────────────
// When the user is already looking at the relevant page there's no need to show
// a notification badge/toast — they can see the information directly.

const SUPPRESS_FOR_ROLE: Record<string, string> = {
  ADMIN: '/live-orders',   // admin on live-orders already sees new/cancelled orders
  USER: '/your-orders',    // user on your-orders already sees order updates
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  NEW_ORDER: '🛒',
  ORDER_CANCELLED: '❌',
  ORDER_COMPLETED: '✅',
}

const TYPE_COLOR: Record<string, string> = {
  NEW_ORDER: 'bg-blue-50 border-l-4 border-blue-400',
  ORDER_CANCELLED: 'bg-red-50 border-l-4 border-red-400',
  ORDER_COMPLETED: 'bg-green-50 border-l-4 border-green-400',
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const { isAuthenticated, user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const bellRef = useRef<HTMLDivElement>(null)

  // Decide whether to suppress badge/popup for this role+path combination
  const suppressPath = user ? SUPPRESS_FOR_ROLE[user.role] : undefined
  const suppressed = !!suppressPath && pathname === suppressPath

  // ── Initial load ──
  const { data: initialData } = useQuery<MyNotificationsData>(MY_NOTIFICATIONS, {
    skip: !isAuthenticated,
    fetchPolicy: 'network-only',
  })

  useEffect(() => {
    if (initialData?.myNotifications) {
      setNotifications(initialData.myNotifications)
    }
  }, [initialData])

  // ── Real-time push ──
  const { data: subData } = useSubscription<NotificationSubData>(NOTIFICATION_SUBSCRIPTION, {
    skip: !isAuthenticated,
  })

  useEffect(() => {
    if (!subData?.notificationReceived) return
    const incoming = subData.notificationReceived
    // Don't surface in the bell if user is on the suppressed page
    if (suppressed) return
    setNotifications((prev) => {
      if (prev.some((n) => n.id === incoming.id)) return prev
      return [incoming, ...prev]
    })
  }, [subData, suppressed])

  // ── Mutations ──
  const [markRead] = useMutation(MARK_NOTIFICATION_READ)
  const [markAllRead] = useMutation(MARK_ALL_NOTIFICATIONS_READ)

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    await markRead({ variables: { id } })
  }

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    await markAllRead()
  }

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!isAuthenticated) return null

  const unread = suppressed ? 0 : notifications.filter((n) => !n.read).length

  return (
    <div ref={bellRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="w-5 h-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-[340px] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
              {unread > 0 && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-gray-400 text-sm">No notifications yet</p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleMarkRead(n.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 ${
                  !n.read ? TYPE_COLOR[n.type] || 'bg-gray-50' : ''
                }`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] || '🔔'}</span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-semibold leading-tight ${
                        !n.read ? 'text-gray-900' : 'text-gray-500'
                      }`}
                    >
                      {n.title}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                </div>

                {!n.read && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
