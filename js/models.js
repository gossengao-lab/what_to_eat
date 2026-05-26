/**
 * 核心数据模型
 */

export class UserProfile {
  constructor() {
    this.nickname = '';
    this.selectedCategories = {};
    this.dietaryRestrictions = [];
    this.favoriteTemplates = [];
  }

  addRestriction(tag) {
    const t = tag.trim();
    if (t && !this.dietaryRestrictions.includes(t)) {
      this.dietaryRestrictions.push(t);
    }
  }

  removeRestriction(tag) {
    this.dietaryRestrictions = this.dietaryRestrictions.filter((r) => r !== tag);
  }

  hasConflict(dishTags = []) {
    return dishTags.some((tag) => this.dietaryRestrictions.includes(tag));
  }

  hasAnyCategorySelected() {
    return Object.keys(this.selectedCategories).some(
      (k) => Array.isArray(this.selectedCategories[k]) && this.selectedCategories[k].length > 0
    );
  }

  toJSON() {
    return {
      nickname: this.nickname,
      selectedCategories: this.selectedCategories,
      dietaryRestrictions: this.dietaryRestrictions,
      favoriteTemplates: this.favoriteTemplates
    };
  }

  static fromJSON(json) {
    const profile = new UserProfile();
    if (json && typeof json === 'object') {
      Object.assign(profile, json);
    }
    return profile;
  }
}

export class RecommendationContext {
  constructor({ time, weather, location, manualOverride = {}, isDegraded = false } = {}) {
    this.timestamp = time instanceof Date ? time : new Date(time || Date.now());
    this.manualOverride = manualOverride;
    this.isDegraded = Boolean(isDegraded);
    if (manualOverride.mealPeriod) {
      this.mealPeriod = manualOverride.mealPeriod;
    } else {
      this.mealPeriod = this.inferMealPeriod(this.timestamp);
    }
    this.dayOfWeek = this.timestamp.getDay();
    this.weather = weather || { condition: 'unknown', temperature: 20 };
    this.location = location || { district: '未知区域', city: '未知城市' };
    this.manualTags = manualOverride.tags || [];
  }

  inferMealPeriod(date) {
    const hour = date.getHours();
    if (hour >= 6 && hour < 10) return 'breakfast';
    if (hour >= 10 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 17) return 'afternoon_tea';
    if (hour >= 17 && hour < 21) return 'dinner';
    return 'night_snack';
  }

  getEffectiveWeatherCondition() {
    const moodTag = this.manualTags.find((t) => ['rain', 'sunny', 'cloudy'].includes(t));
    if (moodTag) return moodTag;
    return this.weather.condition || 'unknown';
  }

  generateNarrative(nickname) {
    const periodText = {
      breakfast: '早上好',
      lunch: '中午好',
      dinner: '晚上好',
      afternoon_tea: '下午好',
      night_snack: '夜深了'
    };
    const greeting = periodText[this.mealPeriod] || '你好';
    const nameStr = nickname ? `，${nickname}` : '';
    const { city, district } = this.location;
    const locStr = district ? `${city}·${district}` : city;
    const timeStr = `周${['日', '一', '二', '三', '四', '五', '六'][this.dayOfWeek]} ${this.timestamp.getHours()}:${String(this.timestamp.getMinutes()).padStart(2, '0')}`;
    const cond = this.getEffectiveWeatherCondition();
    let weatherDesc = '天气不错';
    if (cond === 'rain') weatherDesc = '窗外正下着小雨🌧️';
    else if (cond === 'sunny') weatherDesc = '阳光正好☀️';
    else if (cond === 'cloudy') weatherDesc = '云层有点厚，适合来点暖的';

    let tail = '推荐来点暖和的治愈一下吧？';
    if (cond === 'sunny' && ['lunch', 'afternoon_tea'].includes(this.mealPeriod)) {
      tail = '推荐来点清爽又开胃的吧？';
    }
    if (this.mealPeriod === 'night_snack') {
      tail = '夜宵时间到，来点罪恶但快乐的？';
    }
    if (this.dayOfWeek === 5 && ['dinner', 'night_snack'].includes(this.mealPeriod)) {
      tail = '周五的夜晚，值得吃点好的犒劳自己！';
    }

    return `${greeting}${nameStr}！你在${locStr}，现在是${timeStr}，${weatherDesc}。${tail}`;
  }
}

export class RecommendationResult {
  constructor({ dishName, reason, estimatedShops, sourceCategory }) {
    this.dishName = dishName;
    this.reason = reason;
    this.estimatedShops = estimatedShops;
    this.sourceCategory = sourceCategory;
    this.imageUrl = '';
  }
}

export class HistoryItem {
  constructor(result, action, skipReason = '') {
    this.timestamp = Date.now();
    this.dishName = result.dishName;
    this.action = action;
    this.skipReason = skipReason;
  }
}
