'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createAppQueryClient } from '@/lib/queryClient';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createAppQueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
