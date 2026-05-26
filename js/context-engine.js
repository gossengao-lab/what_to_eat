/**
 * 情境感知服务（重构版 - 强制IP定位，绕过缓存）
 */

import { Storage, LS_KEYS } from './storage.js';
import { RecommendationContext } from './models.js';

// 重要：将定位缓存时间设为0，强制每次重新获取
const LOCATION_TTL = 0; // 改为0，禁用缓存
const WEATHER_TTL = 30 * 60 * 1000;
// 默认位置也改为更中性的描述
const DEFAULT_LOC = { lat: 0, lon: 0, city: '正在定位', district: '请稍候', fromGeo: false };

export const ContextService = {
  async fetchLocation() {
    console.log('【定位-开始】全新定位流程启动，忽略一切缓存。');
    
    // 方案1: 首先尝试最快的IP定位（无感，无需授权）
    try {
      console.log('【定位-步骤1】尝试IP定位API...');
      const ipLocation = await this._getLocationByIP();
      console.log('【定位-步骤1】IP定位成功，结果:', ipLocation);
      
      // 立即存储结果（虽然TTL=0，但其他逻辑可能用到）
      Storage.set(LS_KEYS.LOCATION_CACHE, { 
        timestamp: Date.now(), 
        data: ipLocation 
      });
      return ipLocation;
      
    } catch (ipError) {
      console.error('【定位-步骤1】IP定位完全失败:', ipError);
    }
    
    // 方案2: IP定位失败，降级到默认值
    console.log('【定位-降级】使用默认位置。');
    Storage.set(LS_KEYS.LOCATION_CACHE, { 
      timestamp: Date.now(), 
      data: DEFAULT_LOC 
    });
    return DEFAULT_LOC;
  },

  /**
   * 核心IP定位方法（重构解析逻辑）
   */
  async _getLocationByIP() {
    const apiUrl = 'https://whois.pconline.com.cn/ipJson.jsp?json=true';
    console.log(`【IP定位】请求URL: ${apiUrl}`);
    
    try {
      const response = await fetch(apiUrl);
      const rawText = await response.text();
      console.log('【IP定位】原始响应文本:', rawText);
      
      // 清洗JSONP格式
      const jsonStr = rawText.replace(/^callback\(|\);$/g, '');
      const data = JSON.parse(jsonStr);
      console.log('【IP定位】解析后数据对象:', data);
      
      // 关键：打印出对象所有键，看看究竟有什么
      console.log('【IP定位】数据对象所有键:', Object.keys(data));
      
      // 增强型解析 - 尝试多个常见字段
      let city = '';
      const possibleCityFields = ['city', 'region', 'addr', 'pro', 'prov'];
      for (const field of possibleCityFields) {
        if (data[field] && typeof data[field] === 'string') {
          console.log(`【IP定位】检查字段 ${field}: ${data[field]}`);
          // 尝试从字符串中提取城市名（通用匹配“xx市”模式）
          const match = data[field].match(/([^省]+省)?([^市]+市)/);
          if (match && match[2]) {
            city = match[2];
            console.log(`【IP定位】从字段"${field}"中提取到城市: ${city}`);
            break;
          }
        }
      }
      
      // 如果没提取到，但有‘addr’字段，尝试更暴力的字符串分割
      if (!city && data.addr) {
        const parts = data.addr.split(' ');
        for (const part of parts) {
          if (part.includes('市')) {
            city = part;
            console.log(`【IP定位】从addr分割中获取城市: ${city}`);
            break;
          }
        }
      }
      
      // 最终兜底
      if (!city) {
        console.warn('【IP定位】无法从API响应中解析出城市名，使用默认值。');
        city = '当前城市';
      }
      
      const result = {
        lat: 0,
        lon: 0,
        city: city,
        district: '附近',
        fromGeo: false,
        source: 'IP-API'
      };
      
      console.log('【IP定位】最终返回结果:', result);
      return result;
      
    } catch (error) {
      console.error('【IP定位】请求或解析异常:', error);
      throw new Error(`IP定位失败: ${error.message}`);
    }
  },

  // 为了兼容，保留此函数但将其重定向到IP定位
  async reverseGeocode(lat, lon) {
    console.log('【reverseGeocode】被调用，但重定向到IP定位。');
    return this._getLocationByIP();
  },

  // 您原有的天气函数保持不变
  async fetchWeather(lat, lon) {
    const cacheKey = `wte_weather_cache_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cache = Storage.get(cacheKey);
    if (cache?.timestamp && Date.now() - cache.timestamp < WEATHER_TTL) {
      return cache.data;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('weather fail');
      const data = await res.json();
      const code = data.current_weather?.weathercode ?? 0;
      const weather = {
        condition: this.mapWeatherCode(code),
        temperature: data.current_weather?.temperature ?? 20
      };
      Storage.set(cacheKey, { timestamp: Date.now(), data: weather });
      return weather;
    } catch {
      if (cache?.data) return cache.data;
      return { condition: 'cloudy', temperature: 22 };
    }
  },

  mapWeatherCode(code) {
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain';
    if ([0, 1].includes(code)) return 'sunny';
    return 'cloudy';
  }
};

// --- 以下为原有的上下文管理函数，保持不变 ---
let contextPromise = null;
let isContextFetching = false;

export function getIsContextFetching() {
  return isContextFetching;
}

export function isContextReady(state) {
  return Boolean(state.context && !state.context.isDegraded);
}

export function createFallbackContext(state) {
  return new RecommendationContext({
    time: new Date(),
    weather: { condition: 'unknown', temperature: 20 },
    location: { city: '正在定位中', district: '' },
    manualOverride: state.manualOverride,
    isDegraded: true
  });
}

export function getContextForRecommend(state) {
  if (state.context && !state.context.isDegraded) {
    return { context: state.context, degraded: false };
  }
  return { context: createFallbackContext(state), degraded: true };
}

async function buildContext(state) {
  const loc = await ContextService.fetchLocation();
  const weather = await ContextService.fetchWeather(loc.lat, loc.lon);
  const context = new RecommendationContext({
    time: new Date(),
    weather,
    location: { city: loc.city, district: loc.district },
    manualOverride: state.manualOverride,
    isDegraded: false
  });
  return { context, fromGeo: loc.fromGeo };
}

export async function ensureContext(state) {
  if (state.context && !state.context.isDegraded) return state.context;
  if (!contextPromise) {
    isContextFetching = true;
    contextPromise = buildContext(state).then(({ context }) => context);
  }
  try {
    state.context = await contextPromise;
    return state.context;
  } finally {
    contextPromise = null;
    isContextFetching = false;
  }
}

export async function initContext(state, elements) {
  const { statusEl, narrativeEl, confirmBtn, inspireBtn } = elements;
  statusEl.textContent = '正在感知你的用餐情境…';
  statusEl.classList.add('context-status--loading');
  narrativeEl.textContent = '你好！正在为你准备专属问候…';

  const { context, fromGeo } = await buildContext(state);
  state.context = context;

  statusEl.classList.remove('context-status--loading');
  statusEl.textContent = fromGeo ? '情境已更新' : '正在通过IP获取您的位置';
  narrativeEl.textContent = context.generateNarrative(state.profile.nickname);
  confirmBtn.disabled = false;

  if (inspireBtn && Storage.get(LS_KEYS.ONBOARDING)) {
    inspireBtn.classList.remove('hidden');
  }

  return { fromGeo };
}

export function prefetchContext(state, hooks = {}) {
  const { onReady, onFetching } = hooks;
  if (state.context && !state.context.isDegraded) {
    onReady?.(state.context, { fromGeo: true });
    return;
  }
  if (contextPromise) {
    onFetching?.(true);
    contextPromise.then((ctx) => onReady?.(ctx, { fromGeo: true })).catch(() => {});
    return;
  }
  isContextFetching = true;
  onFetching?.(true);
  contextPromise = buildContext(state)
    .then(({ context, fromGeo }) => {
      state.context = context;
      onReady?.(context, { fromGeo });
      return context;
    })
    .catch(() => null)
    .finally(() => {
      contextPromise = null;
      isContextFetching = false;
      onFetching?.(false);
    });
}