/** UI 常量配置 */

export const DIETARY_PRESETS = ['不要香菜', '少油少盐', '不吃猪肉', '不吃海鲜', '不吃辣'];

export const SKIP_REASONS = [
  { id: 'category_dislike', label: '今天不想吃这个品类' },
  { id: 'no_takeout', label: '不想吃外卖了，下次再说' },
  { id: 'other', label: '就是不太想吃这个' }
];

export const MEAL_OVERRIDE_OPTIONS = [
  { id: 'breakfast', label: '早餐' },
  { id: 'lunch', label: '午餐' },
  { id: 'dinner', label: '晚餐' },
  { id: 'night_snack', label: '夜宵' }
];

export const WEATHER_MOOD_OPTIONS = [
  { id: 'rain', label: '雨天想吃暖的' },
  { id: 'sunny', label: '晴天想吃爽口的' },
  { id: 'cloudy', label: '阴天随便来点' }
];
