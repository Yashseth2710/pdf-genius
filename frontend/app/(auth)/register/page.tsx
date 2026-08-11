import type { Metadata } from 'next'

import { AuthFormShell } from '@/components/auth/auth-form-shell'
import { RegisterForm } from '@/components/auth/register-form'

export const metadata: Metadata = {
  title: 'Create an account',
}

export default function RegisterPage() {
  return (
    <AuthFormShell
      title="Create your account"
      description="Free to start. No card, no adverts."
      footerPrompt="Already have an account?"
      footerLinkLabel="Sign in"
      footerHref="/login"
    >
      <RegisterForm />
    </AuthFormShell>
  )
}
