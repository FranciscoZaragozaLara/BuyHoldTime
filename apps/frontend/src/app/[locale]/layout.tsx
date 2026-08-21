import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { QueryProvider } from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    template: '%s | BuyHoldTime',
    default: 'BuyHoldTime — Best Time to Invest in Stocks',
  },
  description:
    'BuyHoldTime combines macroeconomic indicators, Shiller PE (CAPE), P/E ratios, and EPS analysis to help you find the optimal long-term stock buying window.',
  keywords: [
    'best time to invest', 'stock market timing', 'buy hold index', 'P/E ratio',
    'Shiller PE CAPE', 'EPS history', 'stock valuation', 'when to buy stocks',
    'stock market indicators', 'AAPL PE ratio', 'NVDA EPS forecast',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    siteName: 'BuyHoldTime',
    title: 'BuyHoldTime — Best Time to Invest in Stocks',
    description:
      'Macroeconomic indicators, historical P/E ratios, and EPS analysis in one dashboard. Find the best time to buy or hold any stock.',
    url: BASE_URL,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BuyHoldTime — Stock Market Timing Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@buyholdtime',
    title: 'BuyHoldTime — Best Time to Invest in Stocks',
    description: 'Macroeconomic indicators, P/E ratios, and EPS analysis to find your optimal investing window.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: BASE_URL,
    languages: {
      'en': `${BASE_URL}/en`,
      'es': `${BASE_URL}/es`,
    },
  },
};


type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  
  if (!['en', 'es'].includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-slate-900">
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
