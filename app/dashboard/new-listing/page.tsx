'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { getApiUrl, parseApiError } from '@/lib/api';
import { fetchListing } from '@/lib/listings';

type EditableListing = {
  listing_id: number;
  owner_user_id: number;
  vin: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  mileage: number | null;
  price_per_day: number;
  description: string | null;
  image_url: string | null;
  listing_image_url?: string | null;
  vehicle_image?: string | null;
  address_line1?: string;
  address_line2?: string | null;
  city: string;
  state_region: string;
  postal_code?: string;
  country?: string;
};

function NewListingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingVehicleId = searchParams.get('vehicle_id');
  const editListingId = searchParams.get('listing_id');
  const isEditing = Boolean(editListingId);
  const { user, token, isLoading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingListing, setLoadingListing] = useState(isEditing);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [vin, setVin] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [mileage, setMileage] = useState('');
  const [vehicleImage, setVehicleImage] = useState('');

  const [pricePerDay, setPricePerDay] = useState('');
  const [description, setDescription] = useState('');
  const [listingImageUrl, setListingImageUrl] = useState('');

  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('USA');

  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'owner') {
      router.replace('/dashboard');
    }
  }, [authLoading, user, token, router]);

  useEffect(() => {
    if (!isEditing || !editListingId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const listing = (await fetchListing(editListingId)) as unknown as EditableListing;
        if (cancelled) return;
        if (listing.owner_user_id !== user.user_id) {
          setError('You can only edit listings that you own.');
          return;
        }
        setVin(listing.vin || '');
        setLicensePlate(listing.license_plate || '');
        setMake(listing.make || '');
        setModel(listing.model || '');
        setYear(String(listing.year || ''));
        setColor(listing.color || '');
        setMileage(listing.mileage == null ? '' : String(listing.mileage));
        setPricePerDay(String(listing.price_per_day || ''));
        setDescription(listing.description || '');
        setVehicleImage(listing.vehicle_image || listing.image_url || '');
        setListingImageUrl(listing.listing_image_url || listing.image_url || '');
        setAddressLine1(listing.address_line1 || '');
        setAddressLine2(listing.address_line2 || '');
        setCity(listing.city || '');
        setStateRegion(listing.state_region || '');
        setPostalCode(listing.postal_code || '');
        setCountry(listing.country || 'USA');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load listing.');
      } finally {
        if (!cancelled) setLoadingListing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editListingId, isEditing, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        price_per_day: Number(pricePerDay),
        description,
        image_url: listingImageUrl,
        vehicle_image: vehicleImage || listingImageUrl,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state_region: stateRegion,
        postal_code: postalCode,
        country,
      };

      if (isEditing) {
        Object.assign(body, {
          vin,
          license_plate: licensePlate,
          make,
          model,
          year: Number(year),
          color,
          mileage: mileage === '' ? null : Number(mileage),
        });
      } else if (existingVehicleId) {
        body.vehicle_id = Number(existingVehicleId);
      } else {
        Object.assign(body, {
          vin,
          license_plate: licensePlate,
          make,
          model,
          year: Number(year),
          color,
          mileage: mileage === '' ? null : Number(mileage),
        });
      }

      const res = await fetch(`${getApiUrl()}/api/listings${isEditing ? `/${editListingId}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditing ? 'Could not update listing.' : 'Could not create listing.');
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File | null) => {
    if (!file || !token) return;
    setError(null);
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${getApiUrl()}/api/uploads/vehicle-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = (await res.json()) as { image_url?: string };
      if (!data.image_url) throw new Error('Upload succeeded but no image URL was returned.');
      setVehicleImage(data.image_url);
      setListingImageUrl(data.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  if (authLoading || !user || user.role !== 'owner') {
    return (
      <main className="px-8 py-24 text-center text-gray-400">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="px-8 py-12 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">
        {isEditing ? 'Edit listing' : existingVehicleId ? 'Add listing for your vehicle' : 'Add vehicle & listing'}
      </h1>
      <p className="text-gray-400 mb-8">
        {isEditing
          ? 'Update the vehicle details, pricing, photo, and pickup location shown to renters.'
          : existingVehicleId
          ? 'Pickup location and pricing for an existing vehicle on your account.'
          : 'Creates a vehicle, pickup location, and public listing in one step.'}
      </p>

      <form onSubmit={submit} className="space-y-6 bg-white/5 border border-white/10 rounded-2xl p-6">
        {loadingListing && <p className="text-sm text-gray-400">Loading listing...</p>}

        {(!existingVehicleId || isEditing) && (
          <>
            <h2 className="text-lg font-semibold text-white">Vehicle</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">VIN</label>
                <input className="w-full p-3 rounded-xl" value={vin} onChange={(e) => setVin(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">License plate</label>
                <input
                  className="w-full p-3 rounded-xl"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Make</label>
                <input className="w-full p-3 rounded-xl" value={make} onChange={(e) => setMake(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Model</label>
                <input className="w-full p-3 rounded-xl" value={model} onChange={(e) => setModel(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Year</label>
                <input
                  type="number"
                  className="w-full p-3 rounded-xl"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  required
                  min={1990}
                  max={2030}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Color</label>
                <input className="w-full p-3 rounded-xl" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-300 mb-1">Mileage (optional)</label>
                <input
                  type="number"
                  className="w-full p-3 rounded-xl"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  min={0}
                />
              </div>
            </div>
          </>
        )}

        <h2 className="text-lg font-semibold text-white pt-2">Listing</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Price per day ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full p-3 rounded-xl"
              value={pricePerDay}
              onChange={(e) => setPricePerDay(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">Description</label>
            <textarea
              className="w-full p-3 rounded-xl min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">Photo</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mb-3 w-full rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950 hover:border-sky-400/50"
              disabled={uploadingImage}
              onChange={(e) => {
                void uploadImage(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            {uploadingImage && <p className="mb-3 text-sm text-sky-300">Uploading image...</p>}
            <input
              className="w-full p-3 rounded-xl"
              value={vehicleImage || listingImageUrl}
              onChange={(e) => {
                setVehicleImage(e.target.value);
                setListingImageUrl(e.target.value);
              }}
              placeholder="Or paste an image URL"
            />
            {(vehicleImage || listingImageUrl) && (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={vehicleImage || listingImageUrl} alt="Vehicle preview" className="h-44 w-full object-cover" />
              </div>
            )}
          </div>
        </div>

        <h2 className="text-lg font-semibold text-white pt-2">Pickup location</h2>
        <div className="space-y-3">
          <input
            className="w-full p-3 rounded-xl"
            placeholder="Street address"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            required
          />
          <input
            className="w-full p-3 rounded-xl"
            placeholder="Apt / suite (optional)"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="w-full p-3 rounded-xl" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} required />
            <input
              className="w-full p-3 rounded-xl"
              placeholder="State"
              value={stateRegion}
              onChange={(e) => setStateRegion(e.target.value)}
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              className="w-full p-3 rounded-xl"
              placeholder="Postal code"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              required
            />
            <input className="w-full p-3 rounded-xl" placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </div>

        {error && <div className="text-red-300 text-sm">{error}</div>}

        <div className="flex flex-wrap gap-4 pt-4">
          <button
            type="submit"
            disabled={busy || uploadingImage || loadingListing}
            className="bg-sky-400 text-slate-950 font-bold px-6 py-3 rounded-xl hover:bg-sky-300 disabled:opacity-50"
          >
            {busy ? 'Saving...' : isEditing ? 'Save changes' : 'Publish listing'}
          </button>
          <Link href="/dashboard" className="text-sky-300 hover:underline py-3">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function NewListingPage() {
  return (
    <Suspense fallback={<p className="text-center text-gray-400 py-24">Loading...</p>}>
      <NewListingForm />
    </Suspense>
  );
}
