'use client'

import { LogOut, User as UserIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  if (!user) return null

  const initials = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      toast.success('Signed out')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-2" />}
        aria-label={`Account menu for ${user.first_name} ${user.last_name}`}
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">{user.first_name}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* The label is a *group* label in Base UI, so it must live inside a
            group - otherwise it throws and the menu never opens. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon aria-hidden />
          Settings
          <span className="text-muted-foreground ml-auto text-xs">Soon</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* onClick, not onSelect: Base UI menu items use onClick, and onSelect
            is a native text-selection event that quietly never fires here. */}
        <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut aria-hidden />
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
