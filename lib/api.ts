export function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000';
  return base.replace(/\/$/, '');
}

export async function parseApiError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    /* ignore */
  }
  return response.statusText || 'Request failed';
}
