import { RequireAuth } from '@/components/auth/require-auth'
import { SiteHeader } from '@/components/shared/site-header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-12 sm:px-8">
        {children}
      </main>
    </RequireAuth>
  )
}
