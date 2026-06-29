# calorie.monster 🥗

Bilingual (KO/EN) food nutrition & calorie database with programmatic SEO. HilltopAds-monetized content site — the database-driven sibling of fincalc/webtool.

## Data sources (license-verified)

| Source | License | Use |
|---|---|---|
| 🇺🇸 USDA FoodData Central | U.S. public domain | Global / English foods (bulk CSV, no key) |
| 🇰🇷 식약처 식품영양성분DB (15127578) | 이용허락범위 **제한 없음** | Korean foods (OpenAPI) |
| ~~🇰🇷 RDA 국가표준식품성분 (15143598)~~ | 상업적이용금지 + 변경금지 | ❌ NOT usable — commercial/modification prohibited |

All pages attribute the source (license requirement).

## Stack

Astro 5 (SSG) + Supabase (Postgres) + GitHub Pages. DB is read at **build time** only → static output, zero runtime cost. ETL is Node/TypeScript + Python (shares the Supabase client & types with the site).

## Commands

```bash
npm install
npm run dev          # local dev
npm run etl:usda     # populate DB from USDA bulk CSV
npm run etl:mfds     # populate DB from 식약처 API (needs MFDS_API_KEY)
npm run build        # generate static pages from DB
```

## Structure

```
calorie/
├── astro.config.mjs        # SITE_URL, static, sitemap+i18n (mirrors fincalc)
├── etl/                    # data pipelines (Node/TS)
│   ├── lib/                # normalize, slug, descriptions, tags
│   ├── usda.ts             # USDA CSV → Supabase (Node/TS)
│   └── mfds.py             # 식약처 XLSX → Supabase (Python)
├── src/
│   ├── lib/{supabase,db}.ts
│   ├── i18n/ui.ts          # KO/EN strings
│   ├── layouts/BaseLayout.astro
│   └── pages/              # /, /food/[slug], /en/*, /category, /ranking, /compare ...
└── .env                    # gitignored secrets
```

## DB schema (already applied in Supabase project nsfzkxzditrmydmglsqw)

`foods`, `food_nutrients`, `nutrients`, `categories`, `food_aliases`, `food_stats`.
All nutrient amounts stored per-100g for cross-food comparison.
