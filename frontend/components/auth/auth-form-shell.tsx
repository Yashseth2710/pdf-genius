import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthFormShellProps {
  title: string
  description: string
  footerPrompt: string
  footerLinkLabel: string
  footerHref: string
  children: React.ReactNode
}

/** The card both auth pages sit in, so they cannot drift apart. */
export function AuthFormShell({
  title,
  description,
  footerPrompt,
  footerLinkLabel,
  footerHref,
  children,
}: AuthFormShellProps) {
  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <p className="text-muted-foreground text-center text-sm">
          {footerPrompt}{' '}
          <Link
            href={footerHref}
            className="text-foreground rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {footerLinkLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
