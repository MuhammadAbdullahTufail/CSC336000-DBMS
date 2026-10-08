import { getApiUrl, parseApiError } from '@/lib/api';

export interface ListingRow {
  listing_id: number;
  vehicle_id: number;
  location_id: number;
  price_per_day: number;
  description: string | null;
  /** Merged display URL (API: Vehicle.image preferred over Listing.image_url). */
  image_url: string | null;
  listing_image_url?: string | null;
  vehicle_image?: string | null;
  make: string;
  model: string;
  year: number;
  mileage: number | null;
  color: string | null;
  city: string;
  state_region: string;
  address_line1?: string;
  owner_first_name?: string;
  owner_last_name?: string;
}

/**
 * Image shown in the UI: prefer `Vehicle.image` (`vehicle_image`),
 * then merged `image_url`, then `listing_image_url`.
 */
export function listingDisplayImage(row: {
  image_url?: string | null;
  vehicle_image?: string | null;
  listing_image_url?: string | null;
}): string | null {
  const vehicle = row.vehicle_image?.trim();
  if (vehicle) return vehicle;
  const merged = row.image_url?.trim();
  if (merged) return merged;
  const listingOnly = row.listing_image_url?.trim();
  return listingOnly || null;
}

export async function fetchListings(): Promise<ListingRow[]> {
  const res = await fetch(`${getApiUrl()}/api/listings`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchListing(id: string | number): Promise<ListingRow & Record<string, unknown>> {
  const res = await fetch(`${getApiUrl()}/api/listings/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json();
}
