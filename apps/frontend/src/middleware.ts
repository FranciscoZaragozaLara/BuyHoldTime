import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'es'],
  defaultLocale: 'en'
});

export const config = {
  // Skip internal paths and static files
  matcher: ['/', '/(en|es)/:path*']
};
