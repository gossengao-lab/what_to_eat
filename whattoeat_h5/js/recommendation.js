/**
 * 推荐引擎（索引优化 + 懒加载菜品库）
 */

import { RecommendationResult } from './models.js';

let _foodModule = null;
let _dishIndex = null;
let _engine = null;

async function loadFoodModule() {
  if (!_foodModule) {
    _foodModule = await import('./food-db.js');
  }
  return _foodModule;
}

/** 构建菜品索引，避免每次全量遍历 */
function buildDishIndex(dishes) {
  const byPrimary = new Map();
  const byPrimarySub = new Map();
  const all = dishes;

  dishes.forEach((d) => {
    if (!byPrimary.has(d.primary)) byPrimary.set(d.primary, []);
    byPrimary.get(d.primary).push(d);

    const key = `${d.primary}\0${d.sub}`;
    if (!byPrimarySub.has(key)) byPrimarySub.set(key, []);
    byPrimarySub.get(key).push(d);
  });

  return { byPrimary, byPrimarySub, all };
}

function getCandidatePool(profile, foodDB, index, sessionSkippedCategories) {
  let pool = [];

  if (profile.hasAnyCategorySelected()) {
    const seen = new Set();
    Object.entries(profile.selectedCategories).forEach(([primary, subs]) => {
      if (!Array.isArray(subs) || subs.length === 0) return;
      subs.forEach((sub) => {
        const key = `${primary}\0${sub}`;
        const list = index.byPrimarySub.get(key);
        if (list) {
          list.forEach((d) => {
            if (!seen.has(d.name)) {
              seen.add(d.name);
              pool.push(d);
            }
          });
        }
      });
    });
  } else {
    pool = index.all.slice();
  }

  pool = pool.filter((d) => !profile.hasConflict(d.tags));
  pool = pool.filter((d) => !sessionSkippedCategories.includes(d.sub));

  if (pool.length === 0) {
    pool = index.all.filter(
      (d) => !profile.hasConflict(d.tags) && !sessionSkippedCategories.includes(d.sub)
    );
  }

  return pool;
}

class RecommendationEngine {
  constructor(foodDB, index) {
    this.foodDB = foodDB;
    this.index = index;
  }

  recommend(profile, context, sessionSkippedCategories = [], recentDishNames = []) {
    const pool = getCandidatePool(profile, this.foodDB, this.index, sessionSkippedCategories);
    const meal = context.mealPeriod;
    const weather = context.getEffectiveWeatherCondition();

    const scored = pool.map((dish) => {
      let score = Math.random() * 10;
      if (dish.mealPeriods.includes(meal)) score += 8;
      if (dish.weatherBoost[weather]) score += dish.weatherBoost[weather] * 4;
      if (context.manualTags.some((t) => dish.weatherBoost[t])) score += 6;
      if (context.dayOfWeek === 5 && ['dinner', 'night_snack'].includes(meal)) {
        if (['火锅烧烤', '夜宵烧烤', '聚会大餐', '西式简餐', '特色小吃'].includes(dish.primary)) {
          score += 3;
        }
      }
      if (recentDishNames.includes(dish.name)) score -= 15;
      return { dish, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);
    const pick = top[Math.floor(Math.random() * top.length)] || scored[0];

    if (!pick) {
      const fallback = this.index.all[0];
      return new RecommendationResult({
        dishName: fallback.name,
        reason: '为你精选了一道经典美味。',
        estimatedShops: this._estimateShops(),
        sourceCategory: fallback.sub
      });
    }

    const { dish } = pick;
    const reason =
      dish.reasonTemplates[weather] ||
      dish.reasonTemplates[context.weather.condition] ||
      dish.reasonTemplates.default ||
      '根据你的情境，这道菜此刻最合适。';

    return new RecommendationResult({
      dishName: dish.name,
      reason,
      estimatedShops: this._estimateShops(),
      sourceCategory: dish.sub
    });
  }

  _estimateShops() {
    return Math.floor(Math.random() * 25) + 8;
  }
}

export async function getRecommendationEngine() {
  if (_engine) return _engine;
  const { FOOD_DATABASE } = await loadFoodModule();
  if (!_dishIndex) {
    _dishIndex = buildDishIndex(FOOD_DATABASE.dishes);
  }
  _engine = new RecommendationEngine(FOOD_DATABASE, _dishIndex);
  return _engine;
}

export async function runRecommend(state, session, history) {
  const engine = await getRecommendationEngine();
  const recentNames = history.slice(0, 5).map((h) => h.dishName);
  return engine.recommend(
    state.profile,
    state.context,
    session.skippedCategories,
    recentNames
  );
}

/** 偏好页需要同步访问分类树 */
export async function getFoodCategories() {
  const { FOOD_DATABASE } = await loadFoodModule();
  return FOOD_DATABASE.categories;
}

export async function getPreferenceTemplates() {
  const { PREFERENCE_TEMPLATES } = await loadFoodModule();
  return PREFERENCE_TEMPLATES;
}
