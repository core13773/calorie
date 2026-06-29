// scripts/fix-sitemap.mjs
//
// @astrojs/sitemap 는 항상 `sitemap-index.xml` (인덱스) 와 하나 이상의
// `sitemap-N.xml` 청크로 결과물을 생성한다. 우리 사이트는 모두 표준
// `/sitemap.xml` 경로에서 사이트맵을 노출해야 Google Search Console 이
// 동일하게 가져갈 수 있다.
//
// 이 스크립트는 `astro build` 이후에 실행되어 단일 청크(`sitemap-0.xml`)
// 를 `sitemap.xml` 로 평탄화하고 더 이상 유효하지 않은 인덱스를 제거한다.
// URL 이 45,000 개(기본 entryLimit)를 넘어 청크가 여러 개라면 진짜 인덱스가
// 필요한 것이므로 건드리지 않고 경고만 남긴다.

import { readdirSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(fileURLToPath(new URL('../dist/', import.meta.url)));

const chunks = readdirSync(dist).filter((f) => /^sitemap-\d+\.xml$/.test(f));
const indexFile = join(dist, 'sitemap-index.xml');
const target = join(dist, 'sitemap.xml');

if (chunks.length === 0) {
  if (existsSync(target)) {
    console.log('[sitemap] sitemap.xml already present, nothing to do.');
  } else {
    console.warn('[sitemap] no sitemap-N.xml chunk found in dist/ — was the build run?');
  }
  process.exit(0);
}

if (chunks.length > 1) {
  console.warn(
    `[sitemap] found ${chunks.length} chunks (${chunks.join(', ')}). ` +
      'Keeping sitemap-index.xml — submit that to Google Search Console, or raise entryLimit / split fewer URLs.'
  );
  process.exit(0);
}

// 단일 청크 → /sitemap.xml 로 평탄화
if (existsSync(target)) unlinkSync(target);
renameSync(join(dist, chunks[0]), target);
if (existsSync(indexFile)) unlinkSync(indexFile);
console.log(`[sitemap] flattened ${chunks[0]} → sitemap.xml (removed sitemap-index.xml)`);
