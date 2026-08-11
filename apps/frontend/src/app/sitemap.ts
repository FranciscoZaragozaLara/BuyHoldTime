import { MetadataRoute } from 'next';
import { getTickers } from '@/services/api';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';
const LOCALES = ['en', 'es'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];

  // ─── Static routes ────────────────────────────────────────────────────────
  const staticRoutes = ['', '/prices', '/indicators'];

  for (const locale of LOCALES) {
    for (const route of staticRoutes) {
      urls.push({
        url: `${BASE_URL}/${locale}${route}`,
        lastModified: new Date(),
        changeFrequency: route === '' ? 'daily' : 'weekly',
        priority: route === '' ? 1.0 : 0.8,
      });
    }
  }

  // ─── Dynamic symbol routes ─────────────────────────────────────────────────
  // Fetch all tickers from the backend to generate one URL per symbol
  let symbols: string[] = [];
  try {
    const tickers = await getTickers();
    symbols = tickers.map((t) => t.symbol);
  } catch {
    // If backend is down at build time, include known major symbols as fallback
    symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY', 'QQQ'];
  }

  for (const locale of LOCALES) {
    for (const symbol of symbols) {
      urls.push({
        url: `${BASE_URL}/${locale}/prices/${symbol}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.9, // High priority — core content pages
      });
    }
  }

  return urls;
}
