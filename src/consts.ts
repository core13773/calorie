// Public, build-time site constants (safe to reference from client code).
export const SITE_URL = 'https://calorie.monster';
export const SITE_NAME = 'calorie.monster';
export const SITE_TITLE_KO = '칼로리 · 식품 영양성분 검색';
export const SITE_TITLE_EN = 'calorie.monster — Food Nutrition & Calorie Database';

// Data attribution (license requirement for both sources).
export const SOURCES = {
  usda: { name: 'USDA FoodData Central (U.S. public domain)', url: 'https://fdc.nal.usda.gov/' },
  mfds: { name: '식약처 식품영양성분DB (공공데이터, 제한 없음)', url: 'https://www.data.go.kr/data/15127578/openapi.do' },
} as const;
