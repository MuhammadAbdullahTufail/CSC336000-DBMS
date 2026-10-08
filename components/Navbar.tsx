'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';

export default function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const linkClass = (href: string) =>
    `rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-sky-300 ${
      pathname === href ? 'bg-white/10 text-white' : 'text-gray-200'
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-md sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-2xl font-bold tracking-wide">
          Go<span className="text-sky-400">Rent</span>
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <Link href="/" className={linkClass('/')}>
            Home
          </Link>
          <Link href="/listings" className={linkClass('/listings')}>
            Listings
          </Link>
          {!isLoading && user && (
            <>
              <Link href="/dashboard" className={linkClass('/dashboard')}>
                Dashboard
              </Link>
              <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-gray-300 sm:inline">
                {user.first_name} {user.last_name}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-red-400/40 px-3 py-2 font-medium text-red-200 transition hover:bg-red-500/15"
              >
                Sign out
              </button>
            </>
          )}
          {!isLoading && !user && (
            <>
              <Link href="/login" className={linkClass('/login')}>
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
