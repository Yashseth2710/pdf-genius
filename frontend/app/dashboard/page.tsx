'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Combine, FileOutput, LayoutGrid, Minimize2, Scissors } from 'lucide-react'
import Link from '@/components/shared/link'

import { DocumentList } from '@/components/documents/document-list'
import { RecentActivity } from '@/components/history/recent-activity'
import { buttonVariants } from '@/components/ui/button'
import { UploadZone } from '@/components/upload/upload-zone'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

/**
 * Every tool, one click from the dashboard.
 *
 * The full set rather than a chosen few: there are only five, they fit on one
 * line, and picking two for the reader is a decision that has to be right —
 * whereas showing all of them cannot be wrong.
 */
const QUICK_TOOLS = [
  { href: '/dashboard/tools/merge', icon: Combine, label: 'Merge PDFs' },
  { href: '/dashboard/tools/split', icon: Scissors, label: 'Split a PDF' },
  { href: '/dashboard/tools/organise', icon: LayoutGrid, label: 'Organise pages' },
  { href: '/dashboard/tools/compress', icon: Minimize2, label: 'Compress' },
  { href: '/dashboard/tools/images-to-pdf', icon: FileOutput, label: 'Images to PDF' },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl">Welcome{user ? `, ${user.first_name}` : ''}</h1>
        <p className="text-muted-foreground mt-2">
          Upload a document, then put one of the tools to work on it.
        </p>
      </div>

      {/* Wrapped in cn() rather than passed raw: the button's base sets
          border-transparent and the outline variant sets border-border, and
          only tailwind-merge picks the winner. Without it both survive, the
          transparent one wins, and an outline button has no visible edge. */}
      <div className="flex flex-wrap gap-2">
        {QUICK_TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            <tool.icon aria-hidden />
            {tool.label}
          </Link>
        ))}
      </div>

      <UploadZone
        // Refetch rather than pushing into the cache by hand: the list is
        // paginated and sorted by the server, so it decides where a new
        // document belongs.
        onUploaded={() => void queryClient.invalidateQueries({ queryKey: ['documents'] })}
      />

      <section className="space-y-4">
        <h2 className="text-xl">Your documents</h2>
        <DocumentList />
      </section>

      {/* Below the documents, not above: this page is for uploading and
          finding files, and what you did last week does not outrank that. */}
      <RecentActivity />
    </div>
  )
}
