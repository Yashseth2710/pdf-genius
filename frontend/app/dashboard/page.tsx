'use client'

import { FileText } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'

/**
 * A placeholder home for signed-in users. The quick tools, recent documents
 * and activity feed arrive in scope 9, once there are documents to show.
 */
export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{user ? `, ${user.first_name}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">Here is where your documents will live.</p>
      </div>

      {/* Empty state - a signed-in account with nothing in it yet. */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <span className="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
          <FileText className="text-muted-foreground size-6" aria-hidden />
        </span>
        <h2 className="font-medium">No documents yet</h2>
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm text-pretty">
          Uploading, merging, splitting and the rest of the tools are on the way. Your account is
          ready and waiting for them.
        </p>
      </div>
    </div>
  )
}
