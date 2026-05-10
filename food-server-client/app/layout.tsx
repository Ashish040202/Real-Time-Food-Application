import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'
import React from 'react'
import Navigation from '@/components/Navigation'
import ApolloProvider from '@/lib/apollo-provider'
import { AuthProvider } from '@/lib/auth-context'

const inter = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Patiala House',
  description: 'Real-time food ordering at Patiala House',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ApolloProvider>
          <AuthProvider>
            <Navigation />
            <main className="min-h-screen bg-gray-50">{children}</main>
          </AuthProvider>
        </ApolloProvider>
      </body>
    </html>
  )
}
