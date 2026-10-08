'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { getApiUrl, parseApiError } from '@/lib/api';

interface OwnerListing {
  listing_id: number;
  vehicle_id: number;
  make: string;
  model: string;
  year: number;
  price_per_day: number;
  city: string;
  state_region: string;
  image_url: string | null;
}

interface VehicleRow {
  vehicle_id: number;
  vin: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  mileage: number | null;
  vehicle_status: string | null;
  image: string | null;
}

interface OwnerBooking {
  booking_id: number;
  start_date: string;
  end_date: string;
  total_amount: number;
  booking_status: string;
  make: string;
  model: string;
  year: number;
  vehicle_id: number;
  listing_id: number;
  renter_first_name: string;
  renter_last_name: string;
}

interface RenterBooking {
  booking_id: number;
  start_date: string;
  end_date: string;
  total_amount: number;
  booking_status: string;
  make: string;
  model: string;
  year: number;
  city: string;
  state_region: string;
}

/** Calendar date from DB/datetime string (avoids UTC-shift bugs on YYYY-MM-DD). */
function parseLocalDate(isoOrSql: string): Date {
  const s = String(isoOrSql).slice(0, 10);
  const [y, mo, d] = s.split('-').map(Number);
  if (!y || !mo || !d) return new Date(isoOrSql);
  return new Date(y, mo - 1, d);
}

function isPastBooking(endDateStr: string): boolean {
  const endDay = parseLocalDate(endDateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return endDay < todayStart;
}

function partitionBookings<T extends { end_date: string; start_date: string }>(rows: T[]) {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const b of rows) {
    if (isPastBooking(b.end_date)) past.push(b);
    else upcoming.push(b);
  }
  upcoming.sort(
    (a, b) => parseLocalDate(a.start_date).getTime() - parseLocalDate(b.start_date).getTime()
  );
  past.sort((a, b) => parseLocalDate(b.end_date).getTime() - parseLocalDate(a.end_date).getTime());
  return { upcoming, past };
}

function displayRole(role: 'owner' | 'renter') {
  return role === 'owner' ? 'Owner' : 'Renter';
}

function displayStatus(status: string | null | undefined) {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const primaryActionClass =
  'inline-flex items-center justify-center rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50';
const secondaryActionClass =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:border-sky-300/60 hover:bg-sky-400/10 hover:text-sky-100';
const dangerActionClass =
  'inline-flex items-center justify-center rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-50';
const warningActionClass =
  'inline-flex items-center justify-center rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-50';
const successActionClass =
  'inline-flex items-center justify-center rounded-lg border border-emerald-500/50 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-50';

export default function DashboardPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerPayload, setOwnerPayload] = useState<{
    total_listings: number;
    listings: OwnerListing[];
    vehicles: VehicleRow[];
    bookings: OwnerBooking[];
  } | null>(null);
  const [renterPayload, setRenterPayload] = useState<{
    bookings: RenterBooking[];
  } | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }
    const data = await res.json();
    if (data.role === 'owner') {
      setOwnerPayload({
        total_listings: data.total_listings,
        listings: data.listings || [],
        vehicles: data.vehicles || [],
        bookings: data.bookings || [],
      });
    } else {
      setRenterPayload({ bookings: data.bookings || [] });
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !token) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await loadDashboard();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, token, router, loadDashboard]);

  const setVehicleStatus = async (vehicleId: number, next: 'available' | 'unavailable') => {
    if (!token) return;
    setTogglingId(vehicleId);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/vehicles/${vehicleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vehicle_status: next }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update car.');
    } finally {
      setTogglingId(null);
    }
  };

  const deleteListing = async (listingId: number, title: string) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Delete ${title}? This permanently removes the listing, car record, and any associated bookings.`
    );
    if (!confirmed) return;
    setDeletingListingId(listingId);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/listings/${listingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete listing.');
    } finally {
      setDeletingListingId(null);
    }
  };

  if (authLoading) {
    return (
      <main className="px-8 py-24 text-center text-gray-400">
        <p>Checking your session...</p>
      </main>
    );
  }

  if (!user || !token) {
    return (
      <main className="px-8 py-24 text-center text-gray-400">
        <p>Redirecting to sign in...</p>
      </main>
    );
  }

  const ownerBookingsSplit =
    user.role === 'owner' && ownerPayload
      ? partitionBookings(ownerPayload.bookings)
      : null;
  const listingByVehicleId =
    user.role === 'owner' && ownerPayload
      ? new Map(ownerPayload.listings.map((listing) => [listing.vehicle_id, listing]))
      : new Map<number, OwnerListing>();
  const renterBookingsSplit =
    user.role === 'renter' && renterPayload ? partitionBookings(renterPayload.bookings) : null;

  return (
    <main className="px-8 py-12 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <p className="text-gray-400">
          Signed in as{' '}
          <span className="font-medium text-white">
            {user.first_name} {user.last_name}
          </span>
        </p>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sm font-semibold text-sky-200">
          Role: {displayRole(user.role)}
        </span>
      </div>

      {loading && <p className="text-gray-400">Loading your data...</p>}
      {error && <div className="bg-red-500/15 border border-red-500/40 text-red-200 rounded-xl p-4 mb-6">{error}</div>}

      {user.role === 'owner' && ownerPayload && (
        <>
          <div className="flex flex-wrap gap-4 mb-10">
            <Link
              href="/dashboard/new-listing"
              className={primaryActionClass}
            >
              Add listing
            </Link>
          </div>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">Your listings</h2>
            {ownerPayload.vehicles.length === 0 ? (
              <p className="text-gray-400">No listings yet. Add one with the button above.</p>
            ) : (
              <ul className="space-y-3">
                {ownerPayload.vehicles.map((v) => {
                  const canRent = (v.vehicle_status || '').toLowerCase() === 'available';
                  const existingListing = listingByVehicleId.get(v.vehicle_id);
                  const published = Boolean(existingListing);
                  const title = `${v.year} ${v.make} ${v.model}`;
                  return (
                    <li
                      key={v.vehicle_id}
                      className="flex flex-wrap items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl p-4"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {title}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {v.vin} - {v.license_plate}
                        </p>
                        <p className="text-gray-400 text-sm mt-1">
                          {published && existingListing
                            ? `${existingListing.city}, ${existingListing.state_region} - $${Number(existingListing.price_per_day).toFixed(2)}/day`
                            : 'Not published yet'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            published
                              ? canRent
                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                                : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                              : 'border-white/10 bg-white/[0.04] text-gray-300'
                          }`}
                        >
                          {published ? displayStatus(v.vehicle_status) : `Unpublished - ${displayStatus(v.vehicle_status)}`}
                        </span>
                        {published && existingListing ? (
                          <>
                            <Link href={`/car/${existingListing.listing_id}`} className={secondaryActionClass}>
                              View
                            </Link>
                            <Link
                              href={`/dashboard/new-listing?listing_id=${existingListing.listing_id}`}
                              className={secondaryActionClass}
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              disabled={deletingListingId === existingListing.listing_id}
                              onClick={() => deleteListing(existingListing.listing_id, title)}
                              className={dangerActionClass}
                            >
                              {deletingListingId === existingListing.listing_id ? 'Deleting...' : 'Delete'}
                            </button>
                          </>
                        ) : (
                          <Link
                            href={`/dashboard/new-listing?vehicle_id=${v.vehicle_id}`}
                            className={secondaryActionClass}
                          >
                            Publish
                          </Link>
                        )}
                        <button
                          type="button"
                          disabled={togglingId === v.vehicle_id}
                          onClick={() =>
                            setVehicleStatus(v.vehicle_id, canRent ? 'unavailable' : 'available')
                          }
                          className={canRent ? warningActionClass : successActionClass}
                        >
                          {togglingId === v.vehicle_id
                            ? 'Updating...'
                            : canRent
                              ? 'Mark unavailable'
                              : 'Mark available'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-gray-500 text-xs mt-3">
              Published listings are visible to renters. Marking a listing unavailable removes it from the public catalog and cancels associated records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Bookings for your listings</h2>
            <p className="text-gray-500 text-sm mb-4">Upcoming and past rentals.</p>
            {ownerPayload.bookings.length === 0 ? (
              <p className="text-gray-400">No renter bookings yet.</p>
            ) : (
              <div className="space-y-8">
                {ownerBookingsSplit && ownerBookingsSplit.upcoming.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-400 mb-3">Upcoming</h3>
                    <ul className="space-y-3">
                      {ownerBookingsSplit.upcoming.map((b) => {
                        const start = parseLocalDate(b.start_date);
                        const end = parseLocalDate(b.end_date);
                        return (
                          <li
                            key={b.booking_id}
                            className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap justify-between gap-2"
                          >
                            <div>
                              <p className="font-semibold text-white">
                                {b.year} {b.make} {b.model}
                              </p>
                              <p className="text-gray-400 text-sm">
                                {b.renter_first_name} {b.renter_last_name}
                              </p>
                              <p className="text-gray-500 text-sm mt-1">
                                {start.toLocaleDateString()} - {end.toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sky-300 font-semibold">${Number(b.total_amount).toFixed(2)}</p>
                              <p className="text-xs font-medium text-gray-500">{displayStatus(b.booking_status)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {ownerBookingsSplit && ownerBookingsSplit.past.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Past</h3>
                    <ul className="space-y-3">
                      {ownerBookingsSplit.past.map((b) => {
                        const start = parseLocalDate(b.start_date);
                        const end = parseLocalDate(b.end_date);
                        return (
                          <li
                            key={b.booking_id}
                            className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap justify-between gap-2 opacity-95"
                          >
                            <div>
                              <p className="font-semibold text-white">
                                {b.year} {b.make} {b.model}
                              </p>
                              <p className="text-gray-400 text-sm">
                                {b.renter_first_name} {b.renter_last_name}
                              </p>
                              <p className="text-gray-500 text-sm mt-1">
                                {start.toLocaleDateString()} - {end.toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-300 font-semibold">${Number(b.total_amount).toFixed(2)}</p>
                              <p className="text-xs font-medium text-gray-500">{displayStatus(b.booking_status)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {user.role === 'renter' && renterPayload && (
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Your bookings</h2>
          <p className="text-gray-500 text-sm mb-4">Trips that haven&apos;t ended yet and your rental history.</p>
          {renterPayload.bookings.length === 0 ? (
            <p className="text-gray-400">No bookings yet. Browse listings to reserve a car.</p>
          ) : (
            <div className="space-y-8">
              {renterBookingsSplit && renterBookingsSplit.upcoming.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-400 mb-3">Upcoming</h3>
                  <ul className="space-y-3">
                    {renterBookingsSplit.upcoming.map((b) => {
                      const start = parseLocalDate(b.start_date);
                      const end = parseLocalDate(b.end_date);
                      return (
                        <li
                          key={b.booking_id}
                          className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap justify-between gap-2"
                        >
                          <div>
                            <p className="font-semibold text-white">
                              {b.year} {b.make} {b.model}
                            </p>
                            <p className="text-gray-400 text-sm">
                              {b.city}, {b.state_region}
                            </p>
                            <p className="text-gray-500 text-sm mt-1">
                              {start.toLocaleDateString()} - {end.toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sky-300 font-semibold">${Number(b.total_amount).toFixed(2)}</p>
                            <p className="text-xs font-medium text-gray-500">{displayStatus(b.booking_status)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {renterBookingsSplit && renterBookingsSplit.past.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Past</h3>
                  <ul className="space-y-3">
                    {renterBookingsSplit.past.map((b) => {
                      const start = parseLocalDate(b.start_date);
                      const end = parseLocalDate(b.end_date);
                      return (
                        <li
                          key={b.booking_id}
                          className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap justify-between gap-2"
                        >
                          <div>
                            <p className="font-semibold text-white">
                              {b.year} {b.make} {b.model}
                            </p>
                            <p className="text-gray-400 text-sm">
                              {b.city}, {b.state_region}
                            </p>
                            <p className="text-gray-500 text-sm mt-1">
                              {start.toLocaleDateString()} - {end.toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-300 font-semibold">${Number(b.total_amount).toFixed(2)}</p>
                            <p className="text-xs font-medium text-gray-500">{displayStatus(b.booking_status)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
