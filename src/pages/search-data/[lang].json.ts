import type { APIRoute, GetStaticPaths } from 'astro';
import { getSearchIndex } from '../../lib/db';

// Compact, per-language client-side search index.
// Built once per language at SSG time → /search-data/ko.json, /search-data/en.json.
// Splitting by language halves the payload per visitor, and the tuple form
// `[slug, name, kcal]` drops the per-row key names that bloated the old index
// (3.2MB single file → ~half + far fewer bytes per row).
export const getStaticPaths: GetStaticPaths = async () => [
  { params: { lang: 'ko' } },
  { params: { lang: 'en' } },
];

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as 'ko' | 'en';
  const foods = await getSearchIndex();
  const body = JSON.stringify(
    foods
      .filter((f) => (lang === 'ko' ? f.name_ko : f.name_en))
      .map((f) => [f.slug, lang === 'ko' ? f.name_ko : f.name_en, f.kcal]),
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
