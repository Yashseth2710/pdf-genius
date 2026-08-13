import type { Metadata } from 'next'
import { IBM_Plex_Mono, Public_Sans, Source_Serif_4 } from 'next/font/google'

import { Providers } from '@/app/providers'

import './globals.css'

/**
 * Public Sans runs the interface. It was drawn for the US design system, which
 * means it was drawn for forms, tables and long official documents — very
 * nearly what this app is. It is sturdy and slightly plain, and it has not
 * been used on every startup landing page of the last two years.
 */
const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  display: 'swap',
})

/**
 * Source Serif carries the headings, always roman.
 *
 * A serif is the obvious face for a product about documents, and it does the
 * work a second family is meant to do: you can tell a heading from body text
 * without either of them changing size. Set roman rather than italic — the
 * oversized italic serif hero is its own cliché now.
 */
const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  display: 'swap',
})

/** For filenames, byte counts and page numbers, where digits should align. */
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'PDF Genius',
    template: '%s · PDF Genius',
  },
  description:
    'Merge, split, reorder, compress and convert PDFs. Free, no adverts, and your files stay private to your account.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // The font variables go on <html>, not <body>. The base layer sets
    // `font-sans` on <html>, and a var() defined one level below it resolves to
    // nothing there — which silently drops the whole page back to Times.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${publicSans.variable} ${sourceSerif.variable} ${plexMono.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
