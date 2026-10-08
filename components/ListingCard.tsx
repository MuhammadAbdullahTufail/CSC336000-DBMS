'use client';

import Link from 'next/link';
import { listingDisplayImage, type ListingRow } from '@/lib/listings';

function listingTitle(listing: ListingRow) {
  return `${listing.year} ${listing.make} ${listing.model}`;
}

export function ListingCard({ listing }: { listing: ListingRow }) {
  const thumb = listingDisplayImage(listing);
  const title = listingTitle(listing);

  return (
    <Link
      href={`/car/${listing.listing_id}`}
      className="group block overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
    >
      <div className="relative h-44 overflow-hidden bg-slate-900">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">No photo yet</div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-sky-200 ring-1 ring-white/10">
          ${Number(listing.price_per_day).toFixed(0)}/day
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h2 className="line-clamp-1 text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-gray-400">
            {listing.city}, {listing.state_region}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <p className="text-sm text-gray-400">
            {listing.mileage != null ? `${Number(listing.mileage).toLocaleString()} mi` : 'Mileage not listed'}
          </p>
          <span className="text-sm font-semibold text-sky-300 transition group-hover:text-sky-200">View details</span>
        </div>
      </div>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      <div className="h-44 animate-pulse bg-white/10" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
        <div className="border-t border-white/10 pt-3">
          <div className="h-4 w-full animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}
