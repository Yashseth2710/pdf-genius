import type { Metadata } from 'next'

import { AuthFormShell } from '@/components/auth/auth-form-shell'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Sign in',
}

export default function LoginPage() {
  return (
    <AuthFormShell
      title="Welcome back"
      description="Sign in to get back to your documents."
      footerPrompt="New here?"
      footerLinkLabel="Create an account"
      footerHref="/register"
    >
      <LoginForm />
    </AuthFormShell>
  )
}
