// USDA ETL: FoodData Central (Foundation + SR Legacy) → Supabase.
// Run: npm run etl:usda   (from project root)
// Both zips share schema + unified nutrient IDs, so they're processed uniformly.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import Papa from 'papaparse';
import { supabase, isDbConfigured } from '../src/lib/supabase';
import {
  NUTRIENT_ID, ID_TO_CANON, NUTRIENT_SEED, slugify, round2, makeTags, descEn,
  type CanonKey,
} from './lib/usda-shared';

const F_DIR = 'etl/data/foundation/FoodData_Central_foundation_food_csv_2026-04-30';
const S_DIR = 'etl/data/srlegacy/FoodData_Central_sr_legacy_food_csv_2018-04';
const CANON_IDS = new Set(Object.values(NUTRIENT_ID));

// USDA bulk downloads (version-pinned; update the date suffix when USDA releases new versions).
const DATA_ZIPS = {
  foundation: { url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip', dir: 'etl/data/foundation' },
  srlegacy: { url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip', dir: 'etl/data/srlegacy' },
};

// Download + extract the USDA zips if the extracted CSVs aren't present (e.g. fresh CI checkout).
async function ensureData() {
  if (existsSync(`${F_DIR}/food.csv`) && existsSync(`${S_DIR}/food.csv`)) return;
  await mkdir('etl/data', { recursive: true });
  for (const [name, z] of Object.entries(DATA_ZIPS)) {
    console.log(`→ downloading ${name} zip…`);
    const res = await fetch(z.url);
    if (!res.ok) throw new Error(`download failed (${z.url}): ${res.status}`);
    const zipPath = `${z.dir}.zip`;
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    try {
      execSync(`unzip -oq "${zipPath}" -d "${z.dir}"`);
    } catch {
      execSync(`python -m zipfile -e "${zipPath}" "${z.dir}/"`);
    }
  }
}

type Nutrients = Partial<Record<CanonKey, number>>;

async function readCsv(path: string): Promise<any[]> {
  const raw = await readFile(path, 'utf8');
  return Papa.parse(raw, { header: true, skipEmptyLines: true }).data as any[];
}

// Stream the (large) food_nutrient.csv line by line, keeping only canonical nutrients.
async function readCanonicalNutrients(path: string): Promise<Map<number, Nutrients>> {
  const byFdc = new Map<number, Nutrients>();
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    // rows look like: "id","fdc_id","nutrient_id","amount",...  — all numeric fields, no embedded commas
    const m = line.match(/^"\d+","(\d+)","(\d+)","([0-9.]+)"/);
    if (!m) continue;
    const nutId = Number(m[2]);
    if (!CANON_IDS.has(nutId)) continue;
    const fdc = Number(m[1]);
    const canon = ID_TO_CANON[nutId];
    if (!byFdc.has(fdc)) byFdc.set(fdc, {});
    byFdc.get(fdc)![canon] = round2(Number(m[3]));
  }
  return byFdc;
}

function batch<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertBatched(table: string, rows: any[], conflict: string, size = 1000) {
  for (const b of batch(rows, size)) {
    const { error } = await supabase!.from(table).upsert(b, { onConflict: conflict });
    if (error) throw new Error(`upsert ${table} failed: ${error.message}`);
  }
}

async function main() {
  if (!isDbConfigured || !supabase) throw new Error('DB not configured — check .env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');

  await ensureData();

  // 1. nutrients seed (table cols: id, name_en, name_ko, category — unit lives on food_nutrients)
  console.log('→ nutrients seed (20 canonical)');
  const nutrientRows = (Object.keys(NUTRIENT_SEED) as CanonKey[]).map((k) => {
    const s = NUTRIENT_SEED[k];
    return { id: k, name_en: s.name_en, name_ko: s.name_ko, category: s.category };
  });
  const { error: nErr } = await supabase.from('nutrients').upsert(nutrientRows, { onConflict: 'id' });
  if (nErr) throw new Error(`nutrients upsert failed: ${nErr.message}`);

  // 2. foods: SR Legacy (all) + Foundation (foundation_food type only)
  console.log('→ foods (SR Legacy + Foundation)');
  const srFoods = await readCsv(`${S_DIR}/food.csv`);
  const fFoods = (await readCsv(`${F_DIR}/food.csv`)).filter((f) => f.data_type === 'foundation_food');
  const foods = [
    ...srFoods.map((f) => ({ fdc_id: Number(f.fdc_id), description: f.description, category_id: f.food_category_id || null })),
    ...fFoods.map((f) => ({ fdc_id: Number(f.fdc_id), description: f.description, category_id: f.food_category_id || null })),
  ];
  console.log(`  SR Legacy ${srFoods.length} + Foundation ${fFoods.length} = ${foods.length} candidate foods`);

  // 3. categories: union both zips + placeholder for any referenced-but-missing id (FK safety)
  console.log('→ categories');
  const cats = [...(await readCsv(`${F_DIR}/food_category.csv`)), ...(await readCsv(`${S_DIR}/food_category.csv`))];
  const catRows = new Map<string, any>();
  for (const c of cats) {
    const id = String(c.id);
    catRows.set(id, { id, slug: slugify(c.description) || `cat-${id}`, name_en: c.description || c.code || `Category ${id}`, name_ko: null, parent_id: null });
  }
  for (const f of foods) {
    if (!f.category_id) continue;
    const id = String(f.category_id);
    if (!catRows.has(id)) catRows.set(id, { id, slug: `cat-${id}`, name_en: `Category ${id}`, name_ko: null, parent_id: null });
  }
  const { error: cErr } = await supabase.from('categories').upsert([...catRows.values()], { onConflict: 'id' });
  if (cErr) throw new Error(`categories upsert failed: ${cErr.message}`);

  // 4. nutrients (streaming, canonical only)
  console.log('→ food_nutrient (streaming, canonical only)');
  const [srN, fN] = await Promise.all([
    readCanonicalNutrients(`${S_DIR}/food_nutrient.csv`),
    readCanonicalNutrients(`${F_DIR}/food_nutrient.csv`),
  ]);
  const byFdc = srN;
  for (const [k, v] of fN) byFdc.set(k, v);

  // 5. build rows (keep only foods with calorie data)
  console.log('→ building records');
  const usedSlugs = new Set<string>();
  const foodRows: any[] = [];
  const fnRows: any[] = [];
  let droppedNoEnergy = 0;
  for (const f of foods) {
    const n = byFdc.get(f.fdc_id);
    if (!n || n.energy == null) { droppedNoEnergy++; continue; }
    const base = slugify(f.description) || `food-${f.fdc_id}`;
    let slug = base;
    if (usedSlugs.has(slug)) slug = `${base.slice(0, 60)}-${f.fdc_id}`; // fdc_id guarantees uniqueness and is never truncated
    usedSlugs.add(slug);
    const id = `usda-${f.fdc_id}`;
    foodRows.push({
      id, slug,
      name_ko: null,
      name_en: f.description,
      category_id: f.category_id ? String(f.category_id) : null,
      food_code: String(f.fdc_id),
      source: 'usda',
      desc_ko: null,
      desc_en: descEn(f.description, n),
      serving_g: 100,
      emoji: null,
      tags: makeTags(n),
    });
    for (const key of Object.keys(n) as CanonKey[]) {
      fnRows.push({ food_id: id, nutrient_id: key, amount: n[key], unit: NUTRIENT_SEED[key].unit });
    }
  }
  console.log(`  kept ${foodRows.length} foods (dropped ${droppedNoEnergy} w/o energy); ${fnRows.length} nutrient rows`);

  // 6. upsert (foods first for FK, then nutrients)
  console.log('→ upserting foods…');
  await upsertBatched('foods', foodRows, 'id', 500);
  console.log('→ upserting food_nutrients…');
  await upsertBatched('food_nutrients', fnRows, 'food_id,nutrient_id', 1000);

  console.log(`✓ USDA ETL done. foods=${foodRows.length}  nutrients=${fnRows.length}  categories=${catRows.length}`);
}

main().catch((e) => {
  console.error('ETL FAILED:', e);
  process.exit(1);
});
