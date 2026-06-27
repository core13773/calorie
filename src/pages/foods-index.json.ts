import type { APIRoute } from 'astro';
import { getSearchIndex } from '../lib/db';

// Compact client-side search index. Built once at SSG time.
export const GET: APIRoute = async () => {
  const foods = await getSearchIndex();
  const body = JSON.stringify(foods.map((f) => ({ slug: f.slug, ko: f.name_ko, en: f.name_en, k: f.kcal })));
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
};
