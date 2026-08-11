'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/hooks/use-auth'

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state so each browser session gets one client, and it is not
  // shared between requests during server rendering.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Refetching whenever a window regains focus is noisy for a tool
            // people leave open while working on a document.
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    // attribute="class" matches the `.dark` variant in globals.css.
    // defaultTheme="system" means we follow the operating system until
    // someone chooses otherwise; disableTransitionOnChange stops every
    // colour on the page animating at once when the theme flips.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
