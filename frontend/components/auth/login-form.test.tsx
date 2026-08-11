import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginForm } from '@/components/auth/login-form'
import { ApiError } from '@/lib/api'

const signIn = vi.fn()
const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ signIn }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginForm', () => {
  it('will not submit an empty form, and says why', async () => {
    render(<LoginForm />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('rejects a malformed email before calling the API', async () => {
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Password'), 'a-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('That does not look like an email address')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('signs in and moves to the dashboard', async () => {
    signIn.mockResolvedValueOnce(undefined)
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'a-good-long-password',
      }),
    )
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('shows the message the server sent when credentials are refused', async () => {
    signIn.mockRejectedValueOnce(
      new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password.', 401),
    )
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to a plain message when the failure is not from the API', async () => {
    signIn.mockRejectedValueOnce(new Error('socket hang up'))
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    // The raw error must not reach the user.
    expect(alert).not.toHaveTextContent('socket hang up')
  })

  it('disables the button while the request is in flight', async () => {
    let release: () => void = () => {}
    signIn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    render(<LoginForm />)

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
    release()
  })
})
