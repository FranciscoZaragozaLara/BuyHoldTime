import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { isAuthorizedRevalidate, requestedTags } from '@/lib/revalidation';

// POST /api/revalidate — lo llama el backend al terminar una sincronización de mercado.
// Header x-revalidate-secret = REVALIDATE_SECRET (mismo valor en backend y frontend). Body opcional {"tags": [...]}.
// { expire: 0 }: la siguiente visita trae el dato nuevo (no sirve el anterior mientras regenera).
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return Response.json({ revalidated: false, message: 'REVALIDATE_SECRET no configurado' }, { status: 503 });
  if (!isAuthorizedRevalidate(request.headers.get('x-revalidate-secret'), secret)) {
    return Response.json({ revalidated: false, message: 'no autorizado' }, { status: 401 });
  }
  const tags = requestedTags(await request.json().catch(() => null));
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags.length > 0, tags, now: Date.now() });
}
