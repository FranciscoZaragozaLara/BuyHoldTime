import React from 'react';
import { Layout } from '@/components/Layout';
import LabClient from '@/components/lab/LabClient';

// Laboratorio Canary & Phoenix (experimental): fuera de buscadores mientras dure la fase experimental.
export const metadata = { title: 'Laboratorio Canary & Phoenix', robots: { index: false, follow: false } };

export default async function LabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Layout>
      <LabClient locale={locale} />
    </Layout>
  );
}
