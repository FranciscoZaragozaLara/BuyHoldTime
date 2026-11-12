// Next 16: la convención `middleware` pasó a llamarse `proxy` (mismo comportamiento).
// next-intl sigue exponiendo su función como `next-intl/middleware`.
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'es'],
  defaultLocale: 'en'
});

export const config = {
  // Skip internal paths and static files
  matcher: ['/', '/(en|es)/:path*']
};
