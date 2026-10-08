'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchListing, listingDisplayImage } from '@/lib/listings';
import { useAuth } from '@/lib/authContext';

type Detail = Record<string, unknown> & {
  listing_id: number;
  make: string;
  model: string;
  year: number;
  mileage: number | null;
  color: string | null;
  vin: string;
  license_plate: string;
  vehicle_status?: string | null;
  price_per_day: number;
  description: string | null;
  image_url: string | null;
  listing_image_url?: string | null;
  vehicle_image?: string | null;
  city: string;
  state_region: string;
  address_line1?: string;
  address_line2?: string | null;
  postal_code?: string;
  country?: string;
  owner_user_id?: number;
  owner_first_name: string;
  owner_last_name: string;
  owner_email?: string;
  owner_phone?: string | null;
};

function displayStatus(status: string) {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function CarDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { user } = useAuth();
  const [listing, setListing] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const row = (await fetchListing(id)) as unknown as Detail;
        if (!cancelled) setListing(row);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Not found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="px-8 py-16 text-center">
        <p className="text-red-300 mb-4">{error}</p>
        <Link href="/listings" className="text-sky-300 hover:underline">
          Back to listings
        </Link>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="px-8 py-16 text-center text-gray-400">
        <p>Loading...</p>
      </main>
    );
  }

  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const heroImage = listingDisplayImage(listing);
  const location = `${listing.city}, ${listing.state_region}`;
  const canBook = user?.role === 'renter';
  const canEdit = user?.role === 'owner' && user.user_id === listing.owner_user_id;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <Link href="/listings" className="mb-6 inline-flex text-sm font-semibold text-sky-300 hover:text-sky-200">
        Back to listings
      </Link>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
          {heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
              <img src={heroImage} alt={title} className="aspect-[16/10] w-full object-cover" />
          ) : (
              <div className="flex aspect-[16/10] items-center justify-center text-gray-500">No image available</div>
          )}
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {listing.vehicle_status && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
                  {displayStatus(listing.vehicle_status)}
                </span>
              )}
              <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-gray-300">{location}</span>
            </div>
            <h1 className="text-4xl font-bold text-white md:text-5xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-300">
              {listing.description || 'A local rental ready for your next trip.'}
            </p>
          </div>

          <section>
            <h2 className="mb-4 text-xl font-semibold text-white">Vehicle details</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mileage</p>
                <p className="mt-2 font-semibold text-white">
                  {listing.mileage != null ? `${Number(listing.mileage).toLocaleString()} mi` : 'Not listed'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Color</p>
                <p className="mt-2 font-semibold text-white">{listing.color || 'Not listed'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">VIN</p>
                <p className="mt-2 break-all font-semibold text-white">{listing.vin}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plate</p>
                <p className="mt-2 font-semibold text-white">{listing.license_plate}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-slate-950/30">
            <p className="text-sm text-gray-400">Daily rate</p>
            <p className="mt-1 text-4xl font-bold text-white">
              ${Number(listing.price_per_day).toFixed(2)}
              <span className="text-base font-medium text-gray-400"> / day</span>
            </p>

            <div className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Pickup city</span>
                <span className="font-medium text-white">{location}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Vehicle</span>
                <span className="font-medium text-white">
                  {listing.make} {listing.model}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Year</span>
                <span className="font-medium text-white">{listing.year}</span>
              </div>
            </div>

            {canBook && (
              <button
                type="button"
                onClick={() => router.push(`/booking?listing_id=${listing.listing_id}`)}
                className="mt-6 w-full rounded-xl bg-sky-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-sky-300"
              >
                Book this car
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => router.push(`/dashboard/new-listing?listing_id=${listing.listing_id}`)}
                className="mt-6 w-full rounded-xl bg-sky-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-sky-300"
              >
                Edit listing
              </button>
            )}
            {user?.role === 'owner' && !canEdit && (
              <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-400">
                Owners book vehicles with a renter account.
              </p>
            )}
            {!user && (
              <p className="mt-5 text-sm text-gray-400">
                <Link href="/login" className="font-semibold text-sky-300 hover:underline">
                  Sign in
                </Link>{' '}
                with a renter account to book this car.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Pickup location</h2>
            <p className="mt-3 font-medium text-white">{listing.address_line1 || location}</p>
            {listing.address_line2 && <p className="text-sm text-gray-400">{listing.address_line2}</p>}
            <p className="text-sm text-gray-400">
              {listing.city}, {listing.state_region} {listing.postal_code || ''}
            </p>
            {listing.country && <p className="text-sm text-gray-500">{listing.country}</p>}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Owner</h2>
            <p className="mt-3 font-medium text-white">
              {listing.owner_first_name} {listing.owner_last_name}
            </p>
            {listing.owner_email && <p className="mt-1 text-sm text-gray-400">{listing.owner_email}</p>}
            {listing.owner_phone && <p className="text-sm text-gray-400">{listing.owner_phone}</p>}
          </section>
        </aside>
      </section>
    </main>
  );
}
