'use client';

import { useEffect, useState } from 'react';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { fetchListings, type ListingRow } from '@/lib/listings';

export default function ListingsPage() {
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
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">All listings</h1>
          <p className="mt-2 text-gray-400">Choose a car, check dates, and book from the detail page.</p>
        </div>
        {!loading && !error && (
          <p className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-gray-300">
            {listings.length} {listings.length === 1 ? 'car' : 'cars'} available
          </p>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-4 text-red-200">{error}</div>}

      {!loading && !error && listings.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <p className="font-medium text-white">No cars are listed yet.</p>
          <p className="mt-1 text-sm text-gray-400">Owner accounts can add vehicles from the dashboard.</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }, (_, index) => <ListingCardSkeleton key={index} />)
          : listings.map((listing) => <ListingCard key={listing.listing_id} listing={listing} />)}
      </div>
    </main>
  );
}
