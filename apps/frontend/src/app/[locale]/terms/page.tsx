import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Layout } from '@/components/Layout';
import { LEGAL_UPDATED, legalContact, legalJurisdiction } from '@/lib/legal';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

type Section = { title: string; paragraphs: string[] };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Legal.terms' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/terms`,
      languages: { en: `${BASE_URL}/en/terms`, es: `${BASE_URL}/es/terms` },
    },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Legal.terms' });
  const sections = t.raw('sections') as Section[];
  const summary = t.raw('summary') as string[];
  const fill = (s: string) =>
    s
      .replace('{jurisdiction}', legalJurisdiction() ?? t('defaultJurisdiction'))
      .replace('{contact}', legalContact() ?? t('defaultContact'));
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00Z`).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  return (
    <Layout>
      <article className="mx-auto max-w-3xl px-4 py-12 text-slate-300">
        <h1 className="text-2xl font-extrabold text-white">{t('title')}</h1>
        <p className="mt-1 text-xs text-slate-500">{t('updated', { date: updated })}</p>
        <p className="mt-6 text-sm leading-relaxed">{t('intro')}</p>

        <section className="mt-6 rounded-xl border border-caution-500/30 bg-caution-500/5 p-4">
          <h2 className="text-sm font-bold text-caution-300">{t('summaryTitle')}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {summary.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </section>

        {sections.map((sec) => (
          <section key={sec.title} className="mt-8">
            <h2 className="text-base font-bold text-white">{sec.title}</h2>
            {sec.paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-slate-400">{fill(p)}</p>
            ))}
          </section>
        ))}

        <p className="mt-10">
          <Link href={`/${locale}`} className="text-sm text-accent-400 hover:underline">← {t('back')}</Link>
        </p>
      </article>
    </Layout>
  );
}
