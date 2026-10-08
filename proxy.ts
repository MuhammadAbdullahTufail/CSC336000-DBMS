import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Soft session gate: paired with `gorent_session` cookie set on login in the client.
 * API calls still require a valid JWT; this only prevents casual direct URL access without a session.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/dashboard') || path.startsWith('/booking')) {
    const c = request.cookies.get('gorent_session');
    if (!c || c.value !== '1') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/booking/:path*'],
};
