import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Imagen Docker mínima (.next/standalone). La raíz del trazado es el monorepo.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),

  allowedDevOrigins: ['192.168.50.107:3002', '192.168.50.107', 'localhost:3002'],

  // ── Proxy al backend NestJS ────────────────────────────────────────────────
  // El navegador llama a /backend/* (mismo origen) y Next lo reenvía al backend.
  // En producción conviene que Traefik enrute /backend/* directo al contenedor.
  async rewrites() {
    const target = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [{ source: '/backend/:path*', destination: `${target}/:path*` }];
  },

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
