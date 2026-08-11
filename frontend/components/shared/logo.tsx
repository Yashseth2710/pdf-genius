import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The document mark: a page with a folded corner, in PDF red.
 *
 * Drawn as SVG rather than shipped as a PNG so it stays sharp at every size,
 * needs no network request, and can be recoloured. Deliberately does not copy
 * Adobe's swirl, which is their trademark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="PDF Genius" className={cn('size-8', className)}>
      {/* Page, with the top-right corner cut away for the fold */}
      <path
        d="M6 4a2 2 0 0 1 2-2h12l6 6v20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4Z"
        className="fill-[#F3F4F6] dark:fill-[#E5E7EB]"
      />
      {/* The folded corner itself */}
      <path d="M20 2l6 6h-6V2Z" className="fill-[#DC2626]" />
      {/* Badge across the lower half, echoing the PDF label */}
      <rect x="3" y="17" width="20" height="9" rx="2" className="fill-[#DC2626]" />
      <text
        x="13"
        y="23.6"
        textAnchor="middle"
        className="fill-white"
        style={{ font: '700 6.5px system-ui, sans-serif', letterSpacing: '0.03em' }}
      >
        PDF
      </text>
    </svg>
  )
}

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-2.5 rounded-md font-semibold tracking-tight',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className,
      )}
    >
      <LogoMark className="size-8 transition-transform group-hover:scale-105" />
      <span className="text-base">PDF Genius</span>
    </Link>
  )
}
