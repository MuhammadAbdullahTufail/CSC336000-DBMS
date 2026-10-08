'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { getApiUrl, parseApiError } from '@/lib/api';
import { fetchListing } from '@/lib/listings';

const PLATFORM_COMMISSION_RATE = 0.1;
const BOOKING_FEE_USD = 5;
const SALES_TAX_RATE = 0.08875;
const DELIVERY_USD_PER_MILE = 1;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function computeTotals(days: number, pricePerDay: number, deliveryMiles: number | null, hasDelivery: boolean) {
  const rentalSubtotal = Math.round(days * pricePerDay * 100) / 100;
  const platformCommission = Math.round(rentalSubtotal * PLATFORM_COMMISSION_RATE * 100) / 100;
  const miles = hasDelivery && deliveryMiles != null ? deliveryMiles : 0;
  const deliveryFee = hasDelivery && deliveryMiles != null ? Math.round(miles * DELIVERY_USD_PER_MILE * 100) / 100 : 0;
  const subtotalBeforeTax = Math.round((rentalSubtotal + platformCommission + BOOKING_FEE_USD + deliveryFee) * 100) / 100;
  const tax = Math.round(subtotalBeforeTax * SALES_TAX_RATE * 100) / 100;
  const total = Math.round((subtotalBeforeTax + tax) * 100) / 100;
  return { rentalSubtotal, platformCommission, bookingFee: BOOKING_FEE_USD, deliveryFee, deliveryMiles: hasDelivery ? miles : 0, subtotalBeforeTax, tax, total };
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function rangeHasUnavailable(startKey: string, endKey: string, unavailable: Set<string>) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const day = new Date(start);
  while (day <= end) {
    if (unavailable.has(dateKey(day)) || day < todayStart()) return true;
    day.setDate(day.getDate() + 1);
  }
  return false;
}

function BookingForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const listingId = searchParams.get('listing_id');
  const { user, token, isLoading: authLoading } = useAuth();

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => todayStart());
  const [unavailableDates, setUnavailableDates] = useState<string[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);

  const [hasDelivery, setHasDelivery] = useState(false);
  const [dLine1, setDLine1] = useState('');
  const [dLine2, setDLine2] = useState('');
  const [dCity, setDCity] = useState('');
  const [dState, setDState] = useState('');
  const [dPostal, setDPostal] = useState('');
  const [deliveryMiles, setDeliveryMiles] = useState<number | null>(null);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);

  const [availability, setAvailability] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ price_per_day: number; title: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'paypal'>('credit_card');

  const unavailableSet = useMemo(() => new Set(unavailableDates), [unavailableDates]);
  const days = useMemo(() => calendarDays(calendarMonth), [calendarMonth]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'renter') {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    (async () => {
      try {
        const l = await fetchListing(listingId);
        if (cancelled) return;
        setPreview({ price_per_day: Number(l.price_per_day), title: `${l.year} ${l.make} ${l.model}` });
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/listings/${listingId}/availability?month=${monthKey(calendarMonth)}`);
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as { unavailable_dates?: string[] };
        if (!cancelled) {
          setUnavailableDates(data.unavailable_dates || []);
          setCalendarError(null);
        }
      } catch (err) {
        if (!cancelled) setCalendarError(err instanceof Error ? err.message : 'Could not load calendar.');
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, calendarMonth]);

  useEffect(() => {
    if (!hasDelivery || !listingId) return;
    const ok = dLine1.trim() && dCity.trim() && dState.trim() && dPostal.trim();
    if (!ok) return;

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/bookings/delivery-quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing_id: Number(listingId),
            delivery_address: { address_line1: dLine1, address_line2: dLine2, city: dCity, state_region: dState, postal_code: dPostal, country: 'USA' },
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setDeliveryMiles(null);
          setDeliveryQuoteError(typeof data.error === 'string' ? data.error : 'Delivery estimate failed.');
          return;
        }
        setDeliveryQuoteError(null);
        setDeliveryMiles(typeof data.miles === 'number' ? data.miles : null);
      } catch {
        if (!cancelled) {
          setDeliveryMiles(null);
          setDeliveryQuoteError('Could not estimate delivery distance.');
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [hasDelivery, listingId, dLine1, dLine2, dCity, dState, dPostal]);

  const rentalDays = useMemo(() => {
    if (!start || !end) return null;
    const s = parseDateKey(start);
    const e = parseDateKey(end);
    if (e < s) return null;
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  }, [start, end]);

  const priceBreakdown = useMemo(() => {
    if (!preview || rentalDays == null) return null;
    return computeTotals(rentalDays, preview.price_per_day, deliveryMiles, hasDelivery);
  }, [preview, rentalDays, deliveryMiles, hasDelivery]);

  const selectedRangeBlocked = Boolean(start && end && rangeHasUnavailable(start, end, unavailableSet));
  const paymentDisabled = busy || !start || !end || selectedRangeBlocked || (hasDelivery && deliveryMiles == null);
  const paymentReference = useMemo(() => {
    if (!listingId || !start || !end) return 'Generated after dates are selected';
    return `GR-${listingId}-${start.replaceAll('-', '')}-${end.replaceAll('-', '')}`;
  }, [end, listingId, start]);

  const chooseDay = (day: Date) => {
    const key = dateKey(day);
    if (day < todayStart() || unavailableSet.has(key) || day.getMonth() !== calendarMonth.getMonth()) return;
    setAvailability(null);
    setError(null);

    if (!start || (start && end) || parseDateKey(key) < parseDateKey(start)) {
      setStart(key);
      setEnd('');
      return;
    }

    if (rangeHasUnavailable(start, key, unavailableSet)) {
      setError('That range includes unavailable days. Choose a shorter available range.');
      setStart(key);
      setEnd('');
      return;
    }

    setEnd(key);
    setAvailability('Available for these dates.');
  };

  const moveMonth = (delta: number) => {
    setCalendarLoading(true);
    setCalendarError(null);
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const payAndBook = async (paymentMethod: 'paypal' | 'credit_card') => {
    if (!listingId || !token || !start || !end) return;
    setError(null);
    setBusy(true);
    if (selectedRangeBlocked) {
      setError('Selected dates are no longer available.');
      setBusy(false);
      return;
    }
    if (hasDelivery && (!dLine1.trim() || !dCity.trim() || !dState.trim() || !dPostal.trim())) {
      setError('Fill in street, city, state, and postal code for delivery.');
      setBusy(false);
      return;
    }
    try {
      const body: Record<string, unknown> = {
        listing_id: Number(listingId),
        start_date: start,
        end_date: end,
        has_delivery: hasDelivery,
        payment_method: paymentMethod,
        transaction_reference: `${paymentMethod}-${Date.now()}`,
      };
      if (hasDelivery) {
        body.delivery_address = { address_line1: dLine1, address_line2: dLine2, city: dCity, state_region: dState, postal_code: dPostal, country: 'USA' };
      }
      const res = await fetch(`${getApiUrl()}/api/bookings/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await res.json();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !user) {
    return <p className="text-center text-gray-400 py-16">Loading...</p>;
  }

  if (!listingId) {
    return (
      <main className="px-8 py-16 text-center">
        <p className="text-gray-400 mb-4">Missing listing. Open a car and choose Book.</p>
        <Link href="/listings" className="text-sky-300 hover:underline">Browse listings</Link>
      </main>
    );
  }

  return (
    <main className="px-4 py-10 sm:px-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Complete booking</h1>
      {preview && <p className="text-gray-400 mb-6">{preview.title}</p>}

      <div className="space-y-5 bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Choose dates</h2>
              <p className="text-sm text-gray-400">Available days are bright. Booked days are disabled.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => moveMonth(-1)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-200 hover:bg-white/5">Prev</button>
              <button type="button" onClick={() => moveMonth(1)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-200 hover:bg-white/5">Next</button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <div className="mb-3 text-center font-semibold text-white">
              {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500">
              {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((day) => {
                const key = dateKey(day);
                const outside = day.getMonth() !== calendarMonth.getMonth();
                const unavailable = unavailableSet.has(key);
                const past = day < todayStart();
                const selected = key === start || key === end;
                const inRange = Boolean(start && end && day > parseDateKey(start) && day < parseDateKey(end));
                const highlighted = selected || inRange;
                const disabled = outside || unavailable || past;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => chooseDay(day)}
                    className={[
                      'aspect-square rounded-lg text-sm transition',
                      outside ? 'text-gray-700' : 'text-gray-200',
                      disabled && !outside ? 'cursor-not-allowed bg-red-500/10 text-red-200 line-through' : '',
                      !disabled && !highlighted ? 'bg-white/5 hover:bg-sky-400/80 hover:text-white' : '',
                      inRange ? 'bg-sky-400/35 text-white ring-1 ring-sky-300/20' : '',
                      selected ? 'bg-sky-400 text-white font-bold ring-2 ring-sky-100/70' : '',
                    ].join(' ')}
                    title={unavailable ? 'Unavailable' : past ? 'Past date' : 'Available'}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            {calendarLoading && <p className="mt-3 text-center text-sm text-gray-400">Loading availability...</p>}
            {calendarError && <p className="mt-3 text-center text-sm text-red-300">{calendarError}</p>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-white/10 px-3 py-1 text-gray-300">Start: {start || 'Select a date'}</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-gray-300">End: {end || 'Select a date'}</span>
          </div>
          {availability && <p className="mt-2 text-sm text-emerald-300">{availability}</p>}
          {selectedRangeBlocked && <p className="mt-2 text-sm text-red-300">This range includes unavailable days.</p>}
        </section>

        <label className="flex items-center gap-2 text-gray-200 cursor-pointer">
          <input
            type="checkbox"
            checked={hasDelivery}
            onChange={(e) => {
              const checked = e.target.checked;
              setHasDelivery(checked);
              if (!checked) {
                setDeliveryMiles(null);
                setDeliveryQuoteError(null);
              }
            }}
          />
          Deliver vehicle to an address (within 50 miles of listing; $1/mile)
        </label>

        {hasDelivery && (
          <div className="space-y-2 pl-1 border-l-2 border-sky-500/40">
            <input className="w-full p-2 rounded-lg" placeholder="Street address" value={dLine1} onChange={(e) => { setDLine1(e.target.value); setDeliveryMiles(null); setDeliveryQuoteError(null); }} />
            <input className="w-full p-2 rounded-lg" placeholder="Apt / suite (optional)" value={dLine2} onChange={(e) => { setDLine2(e.target.value); setDeliveryMiles(null); setDeliveryQuoteError(null); }} />
            <div className="grid grid-cols-2 gap-2">
              <input className="p-2 rounded-lg" placeholder="City" value={dCity} onChange={(e) => { setDCity(e.target.value); setDeliveryMiles(null); setDeliveryQuoteError(null); }} />
              <input className="p-2 rounded-lg" placeholder="State" value={dState} onChange={(e) => { setDState(e.target.value); setDeliveryMiles(null); setDeliveryQuoteError(null); }} />
            </div>
            <input className="w-full p-2 rounded-lg" placeholder="Postal code" value={dPostal} onChange={(e) => { setDPostal(e.target.value); setDeliveryMiles(null); setDeliveryQuoteError(null); }} />
            {deliveryQuoteError && <p className="text-amber-200 text-xs">{deliveryQuoteError}</p>}
            {hasDelivery && deliveryMiles != null && !deliveryQuoteError && <p className="text-emerald-300 text-xs">Delivery route about {deliveryMiles.toFixed(1)} mi</p>}
          </div>
        )}

        {priceBreakdown != null && (
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 text-sm space-y-2">
            <p className="text-gray-400 font-medium uppercase text-xs tracking-wide">Price summary</p>
            <div className="flex justify-between text-gray-200">
              <span>Rental ({rentalDays} day{rentalDays !== 1 ? 's' : ''} x ${preview?.price_per_day.toFixed(2)})</span>
              <span>${priceBreakdown.rentalSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-200"><span>Platform commission (10%)</span><span>${priceBreakdown.platformCommission.toFixed(2)}</span></div>
            <div className="flex justify-between text-gray-200"><span>Booking fee</span><span>${priceBreakdown.bookingFee.toFixed(2)}</span></div>
            <div className="flex justify-between text-gray-200">
              <span>Delivery {hasDelivery ? `(${priceBreakdown.deliveryMiles.toFixed(1)} mi x $1)` : ''}</span>
              <span>{hasDelivery && deliveryMiles == null ? '-' : `$${priceBreakdown.deliveryFee.toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between text-gray-300 border-t border-white/10 pt-2"><span>Subtotal (before tax)</span><span>${priceBreakdown.subtotalBeforeTax.toFixed(2)}</span></div>
            <div className="flex justify-between text-gray-300"><span>Tax (8.875%)</span><span>${priceBreakdown.tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-sky-300 font-bold text-base pt-1"><span>Total due</span><span>${priceBreakdown.total.toFixed(2)}</span></div>
          </div>
        )}

        {error && <div className="text-red-300 text-sm">{error}</div>}

        <section className="rounded-2xl border border-sky-400/20 bg-slate-950/60 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Secure checkout</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Payment authorization</h2>
            </div>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              Protected
            </span>
          </div>

          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-gray-300">
            Review your reservation total and choose a payment method to confirm the booking.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('credit_card')}
              className={`rounded-xl border p-4 text-left transition ${
                paymentMethod === 'credit_card'
                  ? 'border-sky-300 bg-sky-400/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              <span className="block text-sm font-semibold">Debit / credit card</span>
              <span className="mt-1 block text-xs text-gray-400">Card authorization</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('paypal')}
              className={`rounded-xl border p-4 text-left transition ${
                paymentMethod === 'paypal'
                  ? 'border-sky-300 bg-sky-400/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              <span className="block text-sm font-semibold">PayPal</span>
              <span className="mt-1 block text-xs text-gray-400">Wallet authorization</span>
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Account</span>
              <input
                className="w-full rounded-xl p-3"
                value={paymentMethod === 'credit_card' ? 'GoRent Cardholder' : 'customer@gorent.com'}
                readOnly
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Reference</span>
              <input className="w-full rounded-xl p-3" value={paymentReference} readOnly />
            </label>
            {paymentMethod === 'credit_card' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Card number</span>
                  <input className="w-full rounded-xl p-3" value="**** **** **** 4242" readOnly />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Expires</span>
                    <input className="w-full rounded-xl p-3" value="12 / 30" readOnly />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">CVC</span>
                    <input className="w-full rounded-xl p-3" value="***" readOnly />
                  </label>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={paymentDisabled}
            onClick={() => payAndBook(paymentMethod)}
            className="mt-5 w-full rounded-xl bg-sky-400 py-3 font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {busy ? 'Processing payment...' : `Confirm payment${priceBreakdown ? ` - $${priceBreakdown.total.toFixed(2)}` : ''}`}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            With delivery enabled, both addresses must be verified before confirming.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<p className="text-center text-gray-400 py-16">Loading...</p>}>
      <BookingForm />
    </Suspense>
  );
}
