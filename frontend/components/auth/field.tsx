import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FieldProps extends React.ComponentProps<'input'> {
  label: string
  name: string
  error?: string
}

/**
 * A labelled input that announces its own error.
 *
 * aria-invalid and aria-describedby are what make the message reach a screen
 * reader; colour alone would leave it invisible to anyone not looking at it.
 */
export function Field({ label, name, error, className, ...props }: FieldProps) {
  const errorId = `${name}-error`

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(error && 'border-destructive focus-visible:ring-destructive/30', className)}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}
