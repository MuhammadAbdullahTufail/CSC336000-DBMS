'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { fetchListings, type ListingRow } from '@/lib/listings';
import { useAuth } from '@/lib/authContext';

export default function HomePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchListings();
        if (!cancelled) setListings(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load listings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <section className="relative isolate min-h-[520px] overflow-hidden border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1800&q=80"
          alt="A sports car driving on a mountain road"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative mx-auto flex min-h-[520px] max-w-6xl flex-col justify-center px-4 py-16 sm:px-8">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-sky-300">Peer-to-peer car rentals</p>
          <h1 className="max-w-3xl text-5xl font-bold tracking-normal text-white sm:text-6xl">GoRent</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-200">
            Book local cars from real owners, choose available dates at a glance, and manage every trip from one simple dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/listings"
              className="rounded-xl bg-sky-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              Browse cars
            </Link>
            {!authLoading && !user && (
              <Link href="/register" className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
                Create account
              </Link>
            )}
            {!authLoading && user && (
              <Link href="/dashboard" className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
                Open dashboard
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-slate-900/60">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:px-8 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-semibold text-sky-300">For renters</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Find a car that fits the plan.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-400">Compare local listings, view vehicle details, and pick dates with clear availability.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-semibold text-sky-300">For owners</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Turn parked vehicles into bookings.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-400">Add a vehicle, publish one listing per car, and track upcoming renter reservations.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-semibold text-sky-300">Built for trips</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Everything stays easy to manage.</h2>
            <p className="mt-3 text-sm leading-6 text-gray-400">Bookings, vehicles, listings, and account details stay organized in one place.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <div className="mb-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-sky-300">How it works</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Reserve a car in a few clear steps.</h2>
          </div>
          <Link href="/listings" className="w-fit rounded-xl border border-white/20 px-5 py-2.5 font-semibold text-white transition hover:bg-white/5">
            See available cars
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['1', 'Browse listings', 'Review cars, prices, mileage, pickup city, and owner details.'],
            ['2', 'Choose dates', 'Use the booking calendar to see available and unavailable days before reserving.'],
            ['3', 'Manage the trip', 'Track bookings from the dashboard and keep the rental details easy to find.'],
          ].map(([step, title, text]) => (
            <div key={step} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-400 font-bold text-slate-950">{step}</span>
              <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Featured listings</h2>
            <p className="text-sm text-gray-400">Fresh cars available from local owners.</p>
          </div>
          <Link href="/listings" className="text-sm font-semibold text-sky-300 hover:text-sky-200">
            Browse all
          </Link>
        </div>

        {error && (
          <div className="mx-auto max-w-xl rounded-xl border border-red-500/40 bg-red-500/15 p-4 text-center text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && listings.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="font-medium text-white">No listings available yet.</p>
            <p className="mt-1 text-sm text-gray-400">Create an owner account to publish the first car.</p>
          </div>
        )}

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }, (_, index) => <ListingCardSkeleton key={index} />)
            : listings.slice(0, 6).map((listing) => <ListingCard key={listing.listing_id} listing={listing} />)}
        </div>
      </section>
    </main>
  );
}
