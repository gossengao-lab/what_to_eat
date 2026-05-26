/**
 * 情境感知服务（含本地缓存、预加载与降级推荐）
 */

import { Storage, LS_KEYS } from './storage.js';
import { RecommendationContext } from './models.js';

const LOCATION_TTL = 5 * 60 * 1000;
const WEATHER_TTL = 30 * 60 * 1000;
const DEFAULT_LOC = { lat: 39.9, lon: 116.4, city: '定位获取中', district: '请授权或刷新', fromGeo: false };

/** 从 OSM address 提取市/区展示名（与缓存读取共用） */
export function parseAddress(addr = {}) {
  // 优先从常用字段中提取城市名
  const city = 
    addr.city || 
    addr.town || 
    addr.county || 
    addr.municipality || 
    addr.state_district || 
    addr.state || 
    '当前城市';

  // 尝试从多个可能的字段中提取区级名称
  let district = 
    addr.district || 
    addr.city_district || 
    addr.borough || 
    addr.suburb || 
    addr.township || 
    addr.village || 
    addr.neighbourhood || 
    addr.hamlet || 
    ''; // 先留空，后面判断

  // 如果解析出的 district 和 city 完全相同，则尝试用更细粒度的字段，否则 district 无意义
  if (district === city) {
    district = addr.neighbourhood || addr.hamlet || addr.road || '';
  }

  // 如果经过上述步骤，district 仍然为空，则显示为“附近”
  if (!district) {
    district = '附近';
  }

  // 返回前，确保不会出现“北京·北京”这种情况
  if (district === city) {
    district = '附近';
  }

  return { city, district };
}

/** 规范化已存储的 city/district，避免「北京·北京」等重复展示 */
export function normalizePlaceDisplay(city, district) {
  let c = (city || '当前城市').trim();
  let d = (district || '').trim();
  if (d && (d === c || c.includes(d))) {
    d = d === '附近' ? d : '';
  }
  if (!d) d = '附近';
  return { city: c, district: d };
}

export const ContextService = {
  async fetchLocation() {
    const cache = Storage.get(LS_KEYS.LOCATION_CACHE);
    if (cache?.timestamp && Date.now() - cache.timestamp < LOCATION_TTL && cache.data) {
      const normalized = normalizePlaceDisplay(cache.data.city, cache.data.district);
      return { ...cache.data, ...normalized };
    }

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(DEFAULT_LOC);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          console.log('【定位调试】成功获取到经纬度：', latitude, longitude); // 新增日志
          const place = await this.reverseGeocode(latitude, longitude);
          console.log('【定位调试】逆地理编码得到地址：', place); // 新增日志
          const result = {
            lat: latitude,
            lon: longitude,
            city: place.city,
            district: place.district,
            fromGeo: true
          };
          Storage.set(LS_KEYS.LOCATION_CACHE, { timestamp: Date.now(), data: result });
          resolve(result);
        },
        (error) => { // 这是修改后的错误处理函数
          // 1. 打印详细错误到控制台
          console.error('【定位调试】获取地理位置失败！错误信息：', {
            错误代码: error.code,
            错误信息: error.message,
            解释: error.code === 1 ? '用户拒绝了权限' : 
                  error.code === 2 ? '位置服务不可用（请检查手机GPS和网络）' : 
                  error.code === 3 ? '定位超时（网络慢或信号弱）' : '未知错误'
          });

          // 2. 原有的回退逻辑保持不变
          if (cache?.data) {
            console.log('【定位调试】正在使用缓存的位置数据。');
            const normalized = normalizePlaceDisplay(cache.data.city, cache.data.district);
            resolve({ ...cache.data, ...normalized });
          } else {
            console.log('【定位调试】无缓存，使用默认位置。');
            resolve(DEFAULT_LOC);
          }
        },
        { timeout: 10000, maximumAge: 300000, enableHighAccuracy: true } // 调整了参数
      );
    });
  },

  async reverseGeocode(lat, lon) {
    try {
      // 使用免费的IP定位API（国内稳定，无需Key）
      const res = await fetch('https://whois.pconline.com.cn/ipJson.jsp?json=true');
      const text = await res.text();
      // 该API返回的是JSONP格式，需要处理一下
      const jsonStr = text.replace(/^callback\(|\);$/g, '');
      const data = JSON.parse(jsonStr);
      
      // +++ 新增：打印原始数据，查看究竟返回了什么 +++
    console.log('【IP定位调试】API 原始返回数据:', data);

      // 解析出省份和城市
      const province = data.pro || data.prov || '';
      const city = data.city || '';
      // 如果城市为空，但省份是直辖市，则用省份作为城市
      const finalCity = city || (['北京','天津','上海','重庆'].includes(province) ? province : '当前城市');
      
      return { 
        city: finalCity, 
        district: '附近' // IP定位无法获取区县，统一显示“附近”
      };
    } catch {
      return { city: '当前城市', district: '附近' };
    }
  }

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

let contextPromise = null;
let isContextFetching = false;

export function getIsContextFetching() {
  return isContextFetching;
}

export function isContextReady(state) {
  return Boolean(state.context && !state.context.isDegraded);
}

/** 降级情境：不等待网络，立即可用于推荐 */
export function createFallbackContext(state) {
  return new RecommendationContext({
    time: new Date(),
    weather: { condition: 'unknown', temperature: 20 },
    location: { city: '正在定位中', district: '' },
    manualOverride: state.manualOverride,
    isDegraded: true
  });
}

/** 推荐用情境：就绪则用真实数据，否则降级且不阻塞 */
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

/** 构建或复用情境（去重并发请求） */
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

/** 初始化情境页 UI（显式刷新，非推荐阻塞路径） */
export async function initContext(state, elements) {
  const { statusEl, narrativeEl, confirmBtn, inspireBtn } = elements;
  statusEl.textContent = '正在感知你的用餐情境…';
  statusEl.classList.add('context-status--loading');
  narrativeEl.textContent = '你好！正在为你准备专属问候…';

  const { context, fromGeo } = await buildContext(state);
  state.context = context;

  statusEl.classList.remove('context-status--loading');
  statusEl.textContent = fromGeo ? '情境已更新' : '未授权定位，已使用默认城市演示';
  narrativeEl.textContent = context.generateNarrative(state.profile.nickname);
  confirmBtn.disabled = false;

  if (inspireBtn && Storage.get(LS_KEYS.ONBOARDING)) {
    inspireBtn.classList.remove('hidden');
  }

  return { fromGeo };
}

/**
 * 页面加载后立即预取情境（不等待 idle）
 * @param {{ onReady?: (ctx: RecommendationContext, meta: { fromGeo: boolean }) => void, onFetching?: (boolean) => void }} hooks
 */
export function prefetchContext(state, hooks = {}) {
  const { onReady, onFetching } = hooks;

  if (state.context && !state.context.isDegraded) {
    onReady?.(state.context, { fromGeo: true });
    return;
  }

  if (contextPromise) {
    onFetching?.(true);
    contextPromise
      .then((ctx) => onReady?.(ctx, { fromGeo: true }))
      .catch(() => {});
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
