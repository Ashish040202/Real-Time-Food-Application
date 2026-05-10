'use client'

import { useQuery, useLazyQuery } from '@apollo/client/react'
import { GET_ALL_ORDERS_FOR_HISTORY, GET_ORDER_HISTORY } from '@/lib/graphql/queries'
import AuthGuard from '@/components/AuthGuard'
import { Order, OrderStatus } from '@/types/order'
import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderEvent {
  id: string
  orderId: string
  eventType: 'ORDER_PLACED' | 'STATUS_CHANGED'
  oldStatus: OrderStatus | null
  newStatus: OrderStatus
  triggeredByName: string | null
  triggeredByRole: 'USER' | 'ADMIN' | null
  timestamp: string
}

interface OrderHistoryData {
  orderHistory: {
    order: Order
    events: OrderEvent[]
  }
}

interface AllOrdersData {
  allOrdersWithEvents: Order[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ACCEPTED: 'bg-blue-100 text-blue-800 border-blue-200',
  PROCESSING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  READY_FOR_PICKUP: 'bg-teal-100 text-teal-800 border-teal-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
}

const statusLabel: Record<string, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  READY_FOR_PICKUP: 'Ready for Pickup',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

function elapsed(from: string, to: string): string {
  const diffMs = new Date(to).getTime() - new Date(from).getTime()
  if (diffMs < 0) return ''
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
        statusColors[status] || 'bg-gray-100 text-gray-700 border-gray-200'
      }`}
    >
      {statusLabel[status] || status}
    </span>
  )
}

function EventIcon({ type, status }: { type: string; status: string }) {
  if (type === 'ORDER_PLACED') {
    return (
      <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shadow">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
    )
  }
  if (status === 'CANCELLED') {
    return (
      <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center shadow">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    )
  }
  if (status === 'COMPLETED') {
    return (
      <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center shadow">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center shadow">
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrderHistoryPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: ordersData, loading: ordersLoading } =
    useQuery<AllOrdersData>(GET_ALL_ORDERS_FOR_HISTORY)

  const [fetchHistory, { data: historyData, loading: historyLoading }] =
    useLazyQuery<OrderHistoryData>(GET_ORDER_HISTORY, { fetchPolicy: 'network-only' })

  const handleSelectOrder = (id: string) => {
    setSelectedOrderId(id)
    fetchHistory({ variables: { orderId: id } })
  }

  const allOrders = ordersData?.allOrdersWithEvents || []
  const filtered = allOrders.filter(
    (o) =>
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.product.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase())
  )

  const history = historyData?.orderHistory
  const events = history?.events || []

  return (
    <AuthGuard adminOnly>
      <div className="container mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Order History</h1>
          <p className="text-gray-500 mt-1">
            Full audit trail of every status change across all orders
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Left panel: order list ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search by name, product or ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {ordersLoading ? (
                <div className="p-8 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[68vh] overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="p-6 text-center text-gray-400 text-sm">No orders found</p>
                  )}
                  {filtered.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => handleSelectOrder(order.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        selectedOrderId === order.id
                          ? 'bg-black text-white'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className={`font-semibold text-sm ${
                            selectedOrderId === order.id ? 'text-white' : 'text-gray-800'
                          }`}
                        >
                          {order.product}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                            selectedOrderId === order.id
                              ? 'bg-white/20 text-white border-white/30'
                              : statusColors[order.status]
                          }`}
                        >
                          {statusLabel[order.status]}
                        </span>
                      </div>
                      <div
                        className={`flex justify-between text-xs ${
                          selectedOrderId === order.id ? 'text-gray-300' : 'text-gray-400'
                        }`}
                      >
                        <span>{order.customerName}</span>
                        <span>#{order.id.slice(0, 8)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: event timeline ── */}
          <div className="lg:col-span-3">
            {!selectedOrderId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 flex flex-col items-center justify-center text-center h-full">
                <svg
                  className="w-14 h-14 text-gray-200 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <p className="text-gray-400 text-sm">Select an order to view its event history</p>
              </div>
            )}

            {selectedOrderId && historyLoading && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 flex justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black" />
              </div>
            )}

            {history && !historyLoading && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Order summary header */}
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{history.order.product}</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {history.order.customerName} &nbsp;·&nbsp; #{history.order.id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        ${(history.order.quantity * history.order.price).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Qty {history.order.quantity} × ${history.order.price.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <StatusBadge status={history.order.status} />
                    <span className="text-xs text-gray-400">
                      Placed {new Date(history.order.createdAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {events.length} event{events.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Event timeline */}
                <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
                  {events.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">No events recorded</p>
                  )}

                  <div className="relative">
                    {events.map((event, idx) => {
                      const isLast = idx === events.length - 1
                      const nextEvent = events[idx + 1]
                      const timeToNext =
                        nextEvent ? elapsed(event.timestamp, nextEvent.timestamp) : null

                      return (
                        <div key={event.id} className="relative flex gap-4 pb-8 last:pb-0">
                          {/* Vertical connector line */}
                          {!isLast && (
                            <div className="absolute left-4 top-10 w-0.5 h-full -ml-px bg-gray-200" />
                          )}

                          {/* Icon */}
                          <div className="relative z-10 flex-shrink-0">
                            <EventIcon type={event.eventType} status={event.newStatus} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {/* Event type label */}
                              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {event.eventType === 'ORDER_PLACED' ? 'Order Placed' : 'Status Changed'}
                              </span>

                              {/* Status transition */}
                              {event.eventType === 'STATUS_CHANGED' && event.oldStatus && (
                                <div className="flex items-center gap-1.5">
                                  <StatusBadge status={event.oldStatus} />
                                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  <StatusBadge status={event.newStatus} />
                                </div>
                              )}
                              {event.eventType === 'ORDER_PLACED' && (
                                <StatusBadge status={event.newStatus} />
                              )}
                            </div>

                            {/* Who triggered it */}
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              {event.triggeredByName ? (
                                <>
                                  <span>by</span>
                                  <span className="font-medium text-gray-700">
                                    {event.triggeredByName}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                      event.triggeredByRole === 'ADMIN'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}
                                  >
                                    {event.triggeredByRole}
                                  </span>
                                </>
                              ) : (
                                <span className="italic text-gray-400">System</span>
                              )}
                              <span className="text-gray-300">·</span>
                              <span>{new Date(event.timestamp).toLocaleString()}</span>
                            </div>

                            {/* Time elapsed until next event */}
                            {timeToNext && (
                              <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {timeToNext} until next event
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
