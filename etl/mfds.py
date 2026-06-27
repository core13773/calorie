#!/usr/bin/env python3
# 식약처 식품영양성분DB (음식DB) ETL → Supabase.
# Run from project root:  python etl/mfds.py
# Reads the XLSX downloaded from 식품안전나라 (이용허락범위 제한 없음) and upserts
# Korean dish foods (source='mfds'). Idempotent.
import os, re, json, glob, sys, urllib.request, urllib.error
import openpyxl

sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def load_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()
    return env


ENV = load_env('.env')
SUPA = ENV.get('SUPABASE_URL')
KEY = ENV.get('SUPABASE_SERVICE_ROLE_KEY')
if not SUPA or not KEY:
    raise SystemExit('DB not configured — check .env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')

# canon nutrient → (column index, unit). Verified from the 음식DB header (160 cols).
COLS = {
    'energy': (17, 'kcal'), 'protein': (19, 'g'), 'fat': (20, 'g'), 'satFat': (39, 'g'),
    'carb': (22, 'g'), 'sugars': (23, 'g'), 'fiber': (24, 'g'), 'cholesterol': (38, 'mg'),
    'calcium': (25, 'mg'), 'iron': (26, 'mg'), 'magnesium': (117, 'mg'), 'phosphorus': (27, 'mg'),
    'potassium': (28, 'mg'), 'sodium': (29, 'mg'), 'zinc': (122, 'mg'),
    'vitA': (30, 'µg'), 'vitC': (36, 'mg'), 'vitE': (51, 'mg'), 'vitB6': (44, 'mg'), 'folate': (46, 'µg'),
}


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).strip()
    if s == '' or s in ('N/A', '-', 'ND', 'tr', 'Tr'):
        return None
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def slugify(s):
    s = str(s).replace('_', '-').replace(' ', '-').replace('/', '-').replace('(', '-').replace(')', '-')
    s = re.sub(r'[^\w-]', '-', s, flags=re.UNICODE)  # keep word chars (incl. Hangul) + dash
    s = re.sub(r'-+', '-', s).strip('-')
    return s[:70]


def make_tags(n):
    t = []
    if n.get('energy') is not None and n['energy'] <= 50:
        t.append('low-calorie')
    if n.get('protein') is not None and n['protein'] >= 20:
        t.append('high-protein')
    if n.get('fat') is not None and n['fat'] < 3:
        t.append('low-fat')
    if n.get('fiber') is not None and n['fiber'] >= 6:
        t.append('high-fiber')
    if n.get('sugars') is not None and n['sugars'] >= 40:
        t.append('high-sugar')
    if n.get('sodium') is not None and n['sodium'] >= 600:
        t.append('high-sodium')
    if n.get('protein') is not None and n['protein'] >= 20 and n.get('fat') is not None and n['fat'] < 5:
        t.append('lean-protein')
    return t


def upsert(table, rows):
    if not rows:
        return
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        body = json.dumps(chunk).encode('utf-8')
        req = urllib.request.Request(
            f"{SUPA}/rest/v1/{table}",
            data=body, method='POST',
            headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json',
                     'Prefer': 'resolution=merge-duplicates,return=minimal'})
        try:
            urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            raise SystemExit(f'upsert {table} failed: {e.code} {e.read().decode("utf-8", "replace")[:400]}')


def main():
    files = glob.glob('etl/data/*음식DB*.xlsx')
    if not files:
        raise SystemExit('음식DB XLSX not found in etl/data/')
    path = files[0]
    print(f'→ reading {os.path.basename(path)}')
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    next(rows)  # header

    foods, fn, cats = [], [], {}
    seen = set()
    dropped = 0
    for row in rows:
        code = row[0]
        raw_name = row[1]
        if not code or not raw_name:
            continue
        n = {}
        for key, (ci, unit) in COLS.items():
            if ci < len(row):
                v = num(row[ci])
                if v is not None:
                    n[key] = v
        energy = n.get('energy')
        if energy is None:
            dropped += 1
            continue
        name_ko = str(raw_name).replace('_', ' ')
        base = slugify(name_ko) or f'mfds-{code}'
        slug = base
        if slug in seen:
            slug = f'{base[:60]}-{code}'
        seen.add(slug)
        fid = f'mfds-{code}'
        cat_code = str(row[6]) if row[6] else '00'
        cat_name = str(row[7]) if row[7] else '기타'
        cat_id = f'mfds-cat-{cat_code}'
        cats[cat_id] = {'id': cat_id, 'slug': slugify(cat_name) or f'mfds-cat-{cat_code}',
                        'name_ko': cat_name, 'name_en': None, 'parent_id': None}
        p, f, c = n.get('protein'), n.get('fat'), n.get('carb')
        bits = [f'{name_ko}은(는) 100g당 {energy}kcal입니다.']
        macros = []
        if p is not None:
            macros.append(f'단백질 {p}g')
        if f is not None:
            macros.append(f'지방 {f}g')
        if c is not None:
            macros.append(f'탄수화물 {c}g')
        if macros:
            bits.append('100g당 ' + ', '.join(macros) + '을 함유하고 있습니다.')
        bits.append('식약처 식품영양성분DB 기반의 참고용 자료입니다.')
        desc = ' '.join(bits)
        foods.append({'id': fid, 'slug': slug, 'name_ko': name_ko, 'name_en': None,
                      'category_id': cat_id, 'food_code': str(code), 'source': 'mfds',
                      'desc_ko': desc, 'desc_en': None, 'serving_g': 100, 'emoji': None,
                      'tags': make_tags(n)})
        for k, v in n.items():
            fn.append({'food_id': fid, 'nutrient_id': k, 'amount': v, 'unit': COLS[k][1]})

    print(f'  kept {len(foods)} foods (dropped {dropped} w/o energy); {len(fn)} nutrient rows; {len(cats)} categories')

    print('→ upserting categories…')
    upsert('categories', list(cats.values()))
    print('→ upserting foods…')
    upsert('foods', foods)
    print('→ upserting food_nutrients…')
    upsert('food_nutrients', fn)
    print(f'✓ 식약처 ETL done. foods={len(foods)} nutrients={len(fn)} cats={len(cats)}')


if __name__ == '__main__':
    main()
