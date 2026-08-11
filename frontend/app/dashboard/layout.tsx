import { RequireAuth } from '@/components/auth/require-auth'
import { SiteHeader } from '@/components/shared/site-header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </RequireAuth>
  )
}
