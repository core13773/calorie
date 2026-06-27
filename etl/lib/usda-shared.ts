// Canonical nutrient definitions + helpers for the USDA ETL.
// FDC nutrient IDs are unified across Foundation & SR Legacy (verified from nutrient.csv).

export type CanonKey =
  | 'energy' | 'protein' | 'fat' | 'carb' | 'fiber' | 'sugars'
  | 'calcium' | 'iron' | 'magnesium' | 'phosphorus' | 'potassium' | 'sodium' | 'zinc'
  | 'cholesterol' | 'satFat'
  | 'vitA' | 'vitC' | 'vitE' | 'vitB6' | 'folate';

// FDC nutrient_id → canon key (all verified from FoodData Central nutrient.csv).
export const NUTRIENT_ID: Record<CanonKey, number> = {
  energy: 1008, protein: 1003, fat: 1004, carb: 1005, fiber: 1079, sugars: 1063,
  calcium: 1087, iron: 1089, magnesium: 1090, phosphorus: 1091, potassium: 1092,
  sodium: 1093, zinc: 1095, cholesterol: 1253, satFat: 1258,
  vitA: 1106, vitC: 1162, vitE: 1109, vitB6: 1175, folate: 1177,
};

export const ID_TO_CANON: Record<number, CanonKey> = Object.fromEntries(
  Object.entries(NUTRIENT_ID).map(([k, v]) => [v, k as CanonKey]),
) as Record<number, CanonKey>;

// Seed rows for the `nutrients` table (id = canon key, stable).
export const NUTRIENT_SEED = {
  energy:      { name_en: 'Energy',          name_ko: '에너지(칼로리)', unit: 'kcal', category: 'macronutrient' },
  protein:     { name_en: 'Protein',         name_ko: '단백질',        unit: 'g',    category: 'macronutrient' },
  fat:         { name_en: 'Total fat',       name_ko: '지방',          unit: 'g',    category: 'macronutrient' },
  carb:        { name_en: 'Carbohydrate',    name_ko: '탄수화물',       unit: 'g',    category: 'macronutrient' },
  fiber:       { name_en: 'Fiber',           name_ko: '식이섬유',       unit: 'g',    category: 'macronutrient' },
  sugars:      { name_en: 'Sugars',          name_ko: '당류',          unit: 'g',    category: 'macronutrient' },
  calcium:     { name_en: 'Calcium',         name_ko: '칼슘',          unit: 'mg',   category: 'mineral' },
  iron:        { name_en: 'Iron',            name_ko: '철',            unit: 'mg',   category: 'mineral' },
  magnesium:   { name_en: 'Magnesium',       name_ko: '마그네슘',       unit: 'mg',   category: 'mineral' },
  phosphorus:  { name_en: 'Phosphorus',      name_ko: '인',            unit: 'mg',   category: 'mineral' },
  potassium:   { name_en: 'Potassium',       name_ko: '칼륨',          unit: 'mg',   category: 'mineral' },
  sodium:      { name_en: 'Sodium',          name_ko: '나트륨',         unit: 'mg',   category: 'mineral' },
  zinc:        { name_en: 'Zinc',            name_ko: '아연',          unit: 'mg',   category: 'mineral' },
  cholesterol: { name_en: 'Cholesterol',     name_ko: '콜레스테롤',     unit: 'mg',   category: 'other' },
  satFat:      { name_en: 'Saturated fat',   name_ko: '포화지방',       unit: 'g',    category: 'fat' },
  vitA:        { name_en: 'Vitamin A',       name_ko: '비타민 A',       unit: 'µg',   category: 'vitamin' },
  vitC:        { name_en: 'Vitamin C',       name_ko: '비타민 C',       unit: 'mg',   category: 'vitamin' },
  vitE:        { name_en: 'Vitamin E',       name_ko: '비타민 E',       unit: 'mg',   category: 'vitamin' },
  vitB6:       { name_en: 'Vitamin B6',      name_ko: '비타민 B6',      unit: 'mg',   category: 'vitamin' },
  folate:      { name_en: 'Folate',          name_ko: '엽산',          unit: 'µg',   category: 'vitamin' },
} satisfies Record<CanonKey, { name_en: string; name_ko: string; unit: string; category: string }>;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function makeTags(n: Partial<Record<CanonKey, number>>): string[] {
  const t: string[] = [];
  if (n.energy != null && n.energy <= 50) t.push('low-calorie');
  if (n.protein != null && n.protein >= 20) t.push('high-protein');
  if (n.fat != null && n.fat < 3) t.push('low-fat');
  if (n.fiber != null && n.fiber >= 6) t.push('high-fiber');
  if (n.sugars != null && n.sugars >= 40) t.push('high-sugar');
  if (n.sodium != null && n.sodium >= 600) t.push('high-sodium');
  if (n.protein != null && n.protein >= 20 && n.fat != null && n.fat < 5) t.push('lean-protein');
  return t;
}

export function descEn(name: string, n: Partial<Record<CanonKey, number>>): string {
  const bits = [`${name} provides ${n.energy ?? '—'} calories per 100 grams.`];
  const macros: string[] = [];
  if (n.protein != null) macros.push(`${n.protein}g protein`);
  if (n.fat != null) macros.push(`${n.fat}g fat`);
  if (n.carb != null) macros.push(`${n.carb}g carbohydrates`);
  if (macros.length) bits.push(`Per 100g it contains ${macros.join(', ')}.`);
  bits.push('Nutrition data: USDA FoodData Central. Values are per 100g of edible portion and provided for general reference only.');
  return bits.join(' ');
}
