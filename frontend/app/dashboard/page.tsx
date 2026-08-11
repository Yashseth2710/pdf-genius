'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Combine, Scissors } from 'lucide-react'
import Link from 'next/link'

import { DocumentList } from '@/components/documents/document-list'
import { buttonVariants } from '@/components/ui/button'
import { UploadZone } from '@/components/upload/upload-zone'
import { useAuth } from '@/hooks/use-auth'

export default function DashboardPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{user ? `, ${user.first_name}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload a document, then put one of the tools to work on it.
        </p>
      </div>

      {/* Two shortcuts rather than the full quick-tools panel: that belongs
          with the dashboard proper in scope 9, once there is more to show. */}
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/tools/merge" className={buttonVariants({ variant: 'outline' })}>
          <Combine aria-hidden />
          Merge PDFs
        </Link>
        <Link href="/dashboard/tools/split" className={buttonVariants({ variant: 'outline' })}>
          <Scissors aria-hidden />
          Split a PDF
        </Link>
      </div>

      <UploadZone
        // Refetch rather than pushing into the cache by hand: the list is
        // paginated and sorted by the server, so it decides where a new
        // document belongs.
        onUploaded={() => void queryClient.invalidateQueries({ queryKey: ['documents'] })}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">Your documents</h2>
        <DocumentList />
      </section>
    </div>
  )
}
