/**
 * Next.js Middleware
 * Protects API routes and ensures authentication
 */

import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Routes that don't need authentication
  const publicRoutes = [
    '/api/health',
    '/api/auth',
    '/',
    '/pricing',
  ];

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For all other API routes, check authentication
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token && pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized - Please sign in' },
      { status: 401 }
    );
  }

  // If trying to access protected pages without auth
  if (!token && !pathname.startsWith('/api/auth')) {
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Attach user info to headers for use in API routes
  const requestHeaders = new Headers(request.headers);
  if (token) {
    requestHeaders.set('x-user-id', token.supabaseUserId || token.id);
    requestHeaders.set('x-user-plan', token.plan || 'free');
    requestHeaders.set('x-user-email', token.email);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

// Configure which routes to protect
export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
    '/account/:path*',
    '/report/:path*',
  ],
};
