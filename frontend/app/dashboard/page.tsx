'use client'

import { useQueryClient } from '@tanstack/react-query'

import { DocumentList } from '@/components/documents/document-list'
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
          Upload a document to get started. The tools arrive next.
        </p>
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
