import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

// /admin recibe todas las traducciones, incluido el namespace `Admin` que el layout general no manda al navegador
// (src/lib/publicMessages.ts).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
