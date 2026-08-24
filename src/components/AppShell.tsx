import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { FileSignature, LogOut, Menu, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { useAuth } from '../auth';
import { cn } from '../lib/cn';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  label: string;
  icon: typeof FileSignature;
  adminOnly?: boolean;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Generate', icon: FileSignature, end: true },
  { to: '/profiles', label: 'Profiles', icon: Users, adminOnly: true },
  { to: '/admin', label: 'Admin', icon: Settings, adminOnly: true },
];

function navLinkClass(isActive: boolean): string {
  return cn(
    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg'
  );
}

function Avatar({ user }: { user: { name?: string; email: string; picture?: string } }) {
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  if (user.picture) {
    return (
      <img
        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-fg"
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/**
 * The frame every signed-in screen sits in.
 *
 * The header is sticky: the admin tables are long, and the only way back to another
 * screen used to be scrolling to the top of a thousand-row log.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg shadow-xs">
              <FileSignature className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-fg">Resume Updater</span>
            {isAdmin && (
              <Badge tone="brand" className="hidden sm:inline-flex">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </Badge>
            )}
          </div>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClass(isActive)}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />

            {user && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-2"
                  >
                    <Avatar user={user} />
                    <span className="hidden max-w-[10rem] truncate text-sm text-fg lg:inline">
                      {user.name || user.email}
                    </span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className={cn(
                      'z-50 w-60 rounded-xl border border-border bg-overlay p-1.5 shadow-pop',
                      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
                    )}
                  >
                    <div className="px-2 py-2">
                      <p className="truncate text-sm font-medium text-fg">{user.name || 'Signed in'}</p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                    </div>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 sm:hidden">
                      <span className="text-xs text-muted">Theme</span>
                      <ThemeToggle />
                    </div>
                    <DropdownMenu.Item
                      onSelect={logout}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg outline-none data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger-fg"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-border px-4 py-2 md:hidden" aria-label="Main">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => cn(navLinkClass(isActive), 'my-0.5')}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

/** The title block at the top of a screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-3xl break-words text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
