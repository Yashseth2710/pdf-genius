'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Field } from '@/components/auth/field'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'
import { registerSchema, type RegisterValues } from '@/lib/validation'

export function RegisterForm() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { first_name: '', last_name: '', email: '', password: '' },
  })

  async function onSubmit(values: RegisterValues) {
    setFormError(null)
    try {
      await signUp(values)
      toast.success('Account created')
      router.push('/dashboard')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        // Attach it to the field it belongs to rather than a banner at the top,
        // so the fix is where the person is looking.
        setError('email', { message: error.message })
        return
      }
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      )
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {formError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          autoComplete="given-name"
          error={errors.first_name?.message}
          {...register('first_name')}
        />
        <Field
          label="Last name"
          autoComplete="family-name"
          error={errors.last_name?.message}
          {...register('last_name')}
        />
      </div>

      <Field
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <p className="text-muted-foreground text-xs">
        At least 8 characters. Length matters more than symbols.
      </p>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating your account…' : 'Create account'}
      </Button>
    </form>
  )
}
