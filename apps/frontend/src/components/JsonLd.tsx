/**
 * JsonLd — Server Component
 *
 * Renders a <script type="application/ld+json"> tag with structured data
 * for Google Rich Results and LLM indexing. Must stay a server component
 * (no 'use client') so it is always included in the initial HTML.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const schema = Array.isArray(data) ? data : [data];

  return (
    <>
      {schema.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Use dangerouslySetInnerHTML — safe here because data comes from
          // our own backend, not from user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
