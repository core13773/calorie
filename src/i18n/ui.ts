// Bilingual UI strings (mirrors fincalc/ui.ts pattern).
export type Lang = 'ko' | 'en';

export const strings = {
  ko: {
    siteName: '칼로리',
    tagline: '식품 영양성분 · 칼로리 검색',
    searchPlaceholder: '음식 검색 (예: 바나나, 계란, chicken)',
    search: '검색',
    kcal: '칼로리',
    per100g: '100g당',
    protein: '단백질',
    fat: '지방',
    carb: '탄수화물',
    dataSource: '데이터 출처',
    disclaimer: '본 서비스는 참고용이며 의료/영양 조언이 아닙니다.',
    popularFoods: '식품 둘러보기',
    byCalories: '칼로리 낮은 순',
    byProtein: '단백질 높은 순',
    // food detail
    nutritionFacts: '영양 성분표',
    servingCalc: '섭취량 계산기',
    grams: '그램(g)',
    macroRatio: '주요 영양소 비율 (에너지 기여도)',
    relatedFoods: '같은 분류의 식품',
    source: '출처',
    home: '홈',
    otherLang: 'English',
    otherLangPath: '/en',
    langCode: 'ko',
  },
  en: {
    siteName: 'calorie',
    tagline: 'Food Nutrition & Calorie Database',
    searchPlaceholder: 'Search food (e.g. banana, egg, chicken)',
    search: 'Search',
    kcal: 'Calories',
    per100g: 'per 100g',
    protein: 'Protein',
    fat: 'Fat',
    carb: 'Carbs',
    dataSource: 'Data source',
    disclaimer: 'For reference only — not medical or nutritional advice.',
    popularFoods: 'Browse foods',
    byCalories: 'Lowest calories',
    byProtein: 'Highest protein',
    nutritionFacts: 'Nutrition Facts',
    servingCalc: 'Serving calculator',
    grams: 'grams (g)',
    macroRatio: 'Macronutrient ratio (by energy contribution)',
    relatedFoods: 'Foods in the same category',
    source: 'Source',
    home: 'Home',
    otherLang: '한국어',
    otherLangPath: '/',
    langCode: 'en',
  },
} as const;

export function t(lang: Lang) {
  return strings[lang];
}
