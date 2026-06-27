// Build-time queries. A single loadData() fetches everything once and caches it
// in-module, so generating thousands of static pages issues only a handful of
// DB queries total (not one per page).
import { supabase, isDbConfigured } from './supabase';

export interface NutrientMeta {
  name_ko: string | null;
  name_en: string | null;
  unit: string | null;
  category: string | null;
}

export interface FoodNutrient {
  nutrient_id: string;
  amount: number;
  unit: string;
}

export interface RelatedFood {
  slug: string;
  name_ko: string | null;
  name_en: string | null;
  emoji: string | null;
  kcal: number | null;
}

export interface FoodSummary {
  id: string;
  slug: string;
  name_ko: string | null;
  name_en: string | null;
  emoji: string | null;
  kcal: number | null;
}

export interface FoodDetail {
  id: string;
  slug: string;
  name_ko: string | null;
  name_en: string | null;
  desc_ko: string | null;
  desc_en: string | null;
  emoji: string | null;
  tags: string[];
  serving_g: number;
  category_id: string | null;
  category: { slug: string; name_ko: string | null; name_en: string | null } | null;
  nutrients: FoodNutrient[];
  related: RelatedFood[];
}

export interface SiteStats {
  configured: boolean;
  foodCount: number;
}

export interface CategoryInfo {
  id: string;
  slug: string;
  name_ko: string | null;
  name_en: string | null;
  count: number;
}

interface DataIndex {
  foodsBySlug: Map<string, FoodDetail>;
  nutrients: Map<string, NutrientMeta>;
  categories: CategoryInfo[];
  foodsByCategorySlug: Map<string, FoodSummary[]>;
  searchIndex: FoodSummary[];
}

let dataPromise: Promise<DataIndex> | null = null;

async function loadData(): Promise<DataIndex> {
  if (!supabase) return { foodsBySlug: new Map(), nutrients: new Map() };

  const { data: nmeta, error: ne } = await supabase.from('nutrients').select('id, name_ko, name_en, category');
  if (ne) throw ne;
  const nutrients = new Map<string, NutrientMeta>((nmeta ?? []).map((n: any) => [n.id, n]));

  const { data: cats } = await supabase.from('categories').select('id, slug, name_ko, name_en');
  const catMap = new Map<string, any>((cats ?? []).map((c: any) => [c.id, c]));

  const foods: FoodDetail[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('foods')
      .select('id, slug, name_ko, name_en, desc_ko, desc_en, emoji, tags, serving_g, category_id, food_nutrients(nutrient_id, amount, unit)')
      .order('slug')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const f of data as any[]) {
      foods.push({
        id: f.id,
        slug: f.slug,
        name_ko: f.name_ko,
        name_en: f.name_en,
        desc_ko: f.desc_ko,
        desc_en: f.desc_en,
        emoji: f.emoji,
        tags: f.tags ?? [],
        serving_g: f.serving_g,
        category_id: f.category_id,
        category: f.category_id ? catMap.get(f.category_id) ?? null : null,
        nutrients: (f.food_nutrients ?? []).map((n: any) => ({ nutrient_id: n.nutrient_id, amount: n.amount, unit: n.unit })),
        related: [],
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // related: up to 8 siblings in the same category
  const byCat = new Map<string, FoodDetail[]>();
  for (const f of foods) {
    const k = f.category_id ?? '_none';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(f);
  }
  for (const f of foods) {
    const sibs = (byCat.get(f.category_id ?? '_none') ?? []).filter((x) => x.id !== f.id);
    f.related = sibs.slice(0, 8).map((x) => ({
      slug: x.slug,
      name_ko: x.name_ko,
      name_en: x.name_en,
      emoji: x.emoji,
      kcal: x.nutrients.find((n) => n.nutrient_id === 'energy')?.amount ?? null,
    }));
  }

  const sumOf = (f: FoodDetail): FoodSummary => ({
    id: f.id, slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, emoji: f.emoji,
    kcal: f.nutrients.find((n) => n.nutrient_id === 'energy')?.amount ?? null,
  });

  // category list (only those with foods) + foods grouped by category slug
  const categories: CategoryInfo[] = [];
  const foodsByCategorySlug = new Map<string, FoodSummary[]>();
  for (const [cid, group] of byCat) {
    const c = cid === '_none' ? null : catMap.get(cid) ?? null;
    const slug = c?.slug ?? 'uncategorized';
    categories.push({ id: cid, slug, name_ko: c?.name_ko ?? null, name_en: c?.name_en ?? null, count: group.length });
    foodsByCategorySlug.set(slug, group.map(sumOf));
  }
  categories.sort((a, b) => b.count - a.count);

  return {
    foodsBySlug: new Map(foods.map((f) => [f.slug, f])),
    nutrients,
    categories,
    foodsByCategorySlug,
    searchIndex: foods.map(sumOf),
  };
}

export async function getData(): Promise<DataIndex> {
  if (!isDbConfigured) {
    throw new Error(
      '\n\n❌ BUILD FAILED: Supabase environment variables are missing.\n' +
      'Set these as build environment variables (Cloudflare Pages → Settings → Environment variables → PRODUCTION scope):\n' +
      '  • SUPABASE_URL\n  • SUPABASE_SERVICE_ROLE_KEY\n' +
      'Then retry the deployment.\n',
    );
  }
  if (!dataPromise) dataPromise = loadData();
  return dataPromise;
}

export async function getFoodSlugs(lang: 'ko' | 'en' = 'ko'): Promise<string[]> {
  const { foodsBySlug } = await getData();
  // Complete language separation: Korean pages only for Korean-named foods (식약처),
  // English pages only for English-named foods (USDA).
  const want = lang === 'en' ? 'name_en' : 'name_ko';
  return [...foodsBySlug.values()].filter((f) => f[want]).map((f) => f.slug);
}

export async function getFoodDetail(slug: string): Promise<FoodDetail | null> {
  const { foodsBySlug } = await getData();
  return foodsBySlug.get(slug) ?? null;
}

export async function getNutrientMeta(): Promise<Map<string, NutrientMeta>> {
  const { nutrients } = await getData();
  return nutrients;
}

export async function getCategories(lang: 'ko' | 'en' = 'ko'): Promise<CategoryInfo[]> {
  const { categories } = await getData();
  // Complete separation: Korean categories (name_ko) on Korean site, English (name_en) on English.
  return categories.filter((c) => (lang === 'en' ? c.name_en : c.name_ko));
}

export async function getCategoryBySlug(slug: string, lang: 'ko' | 'en' = 'ko'): Promise<{ category: CategoryInfo; foods: FoodSummary[] } | null> {
  const { categories, foodsByCategorySlug } = await getData();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;
  if (lang === 'en' ? !category.name_en : !category.name_ko) return null;
  const want = lang === 'en' ? 'name_en' : 'name_ko';
  const foods = (foodsByCategorySlug.get(slug) ?? []).filter((f) => f[want]);
  return { category, foods };
}

export async function getSearchIndex(): Promise<FoodSummary[]> {
  const { searchIndex } = await getData();
  return searchIndex;
}

export async function getFoodsByTag(tag: string, limit = 50): Promise<FoodSummary[]> {
  const { foodsBySlug } = await getData();
  const out: FoodSummary[] = [];
  for (const f of foodsBySlug.values()) {
    if (f.tags.includes(tag)) {
      out.push({ id: f.id, slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, emoji: f.emoji, kcal: f.nutrients.find((n) => n.nutrient_id === 'energy')?.amount ?? null });
    }
    if (out.length >= limit) break;
  }
  return out;
}

export interface RankingFood extends FoodSummary {
  metric: number | null;
}

export async function getRankingFoods(tag: string, limit = 100, lang: 'ko' | 'en' = 'ko'): Promise<RankingFood[]> {
  const metricId: Record<string, string> = {
    'high-protein': 'protein', 'lean-protein': 'protein',
    'low-calorie': 'energy', 'low-fat': 'fat',
    'high-fiber': 'fiber', 'high-sugar': 'sugars', 'high-sodium': 'sodium',
  };
  const mid = metricId[tag] ?? 'energy';
  const asc = tag === 'low-calorie' || tag === 'low-fat';
  const { foodsBySlug } = await getData();
  const out: RankingFood[] = [];
  for (const f of foodsBySlug.values()) {
    if (!f.tags.includes(tag)) continue;
    if (lang === 'en' && !f.name_en) continue;
    if (lang === 'ko' && !f.name_ko) continue;
    out.push({
      id: f.id, slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, emoji: f.emoji,
      kcal: f.nutrients.find((n) => n.nutrient_id === 'energy')?.amount ?? null,
      metric: f.nutrients.find((n) => n.nutrient_id === mid)?.amount ?? null,
    });
  }
  out.sort((a, b) => {
    const av = a.metric ?? (asc ? Infinity : -Infinity);
    const bv = b.metric ?? (asc ? Infinity : -Infinity);
    return asc ? av - bv : bv - av;
  });
  return out.slice(0, limit);
}

// Curated popular foods for comparison pages, per language.
const POPULAR_KEYWORDS_EN = [
  'Bananas, raw', 'Egg, whole, raw', 'Rice, white', 'Chicken, breast, meat only, raw',
  'Milk, whole', 'Bread, wheat', 'Apples, raw, with skin', 'Potatoes, raw',
  'Fish, salmon', 'Beef, grass-fed', 'Pork, fresh, loin', 'Fish, tuna, fresh',
  'Yogurt, plain, whole milk', 'Cereals, oats', 'Broccoli, raw', 'Carrots, raw',
  'Tomatoes, raw', 'Oranges, raw', 'Avocados, raw', 'Nuts, almonds',
  'Peanut butter', 'Cheese, cheddar', 'Spinach, raw', 'Sweet potato, raw',
  'Tofu, raw', 'Crustaceans, shrimp',
];
const POPULAR_KEYWORDS_KO = [
  '김치찌개', '된장찌개', '불고기', '비빔밥', '삼겹살', '김밥', '떡볶이', '라면',
  '삼계탕', '갈비탕', '잡채', '김치', '쌀밥', '계란찜', '돈까스', '제육볶음',
  '치킨', '피자', '햄버거', '샐러드', '두부', '고구마', '감자', '계란',
];

export async function getPopularFoods(lang: 'ko' | 'en' = 'en'): Promise<FoodDetail[]> {
  const { foodsBySlug } = await getData();
  const all = [...foodsBySlug.values()];
  const field: 'name_ko' | 'name_en' = lang === 'ko' ? 'name_ko' : 'name_en';
  const kws = lang === 'ko' ? POPULAR_KEYWORDS_KO : POPULAR_KEYWORDS_EN;
  const out: FoodDetail[] = [];
  for (const kw of kws) {
    const kwl = kw.toLowerCase();
    let best: FoodDetail | null = null;
    for (const f of all) {
      const name = f[field];
      if (name && name.toLowerCase().includes(kwl)) {
        if (!best || name.length < (best[field] as string)!.length) best = f;
      }
    }
    if (best && !out.find((x) => x.id === best!.id)) out.push(best);
  }
  return out;
}

export async function getComparePair(slugA: string, slugB: string): Promise<{ a: FoodDetail; b: FoodDetail } | null> {
  const { foodsBySlug } = await getData();
  const a = foodsBySlug.get(slugA);
  const b = foodsBySlug.get(slugB);
  if (!a || !b) return null;
  return { a, b };
}

// ---- homepage helpers (lightweight) ----

export async function getStats(): Promise<SiteStats> {
  if (!isDbConfigured || !supabase) return { configured: false, foodCount: 0 };
  const { count } = await supabase.from('foods').select('*', { count: 'exact', head: true });
  return { configured: true, foodCount: count ?? 0 };
}

export async function getSampleFoods(limit = 12, lang: 'ko' | 'en' = 'ko'): Promise<FoodSummary[]> {
  if (!supabase) return [];
  let query = supabase
    .from('foods')
    .select('id, slug, name_ko, name_en, emoji, food_nutrients(nutrient_id, amount)')
    .order('slug')
    .limit(limit);
  if (lang === 'en') query = query.not('name_en', 'is', null);
  else query = query.not('name_ko', 'is', null); // Korean homepage: only Korean-named foods
  const { data, error } = await query;
  if (error) throw error;
  return (data as any[]).map((f) => ({
    id: f.id,
    slug: f.slug,
    name_ko: f.name_ko,
    name_en: f.name_en,
    emoji: f.emoji,
    kcal: f.food_nutrients?.find((n: any) => n.nutrient_id === 'energy')?.amount ?? null,
  }));
}
