import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.50.107:3002', '192.168.50.107', 'localhost:3002'],

  // ── SEO & Security headers ─────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Block search engine indexing of admin panel
        source: '/:locale/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // Apply security headers site-wide (helps with Google's security signals)
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
