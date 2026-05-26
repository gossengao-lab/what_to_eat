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
    // 1. 有效缓存检查
    if (cache?.timestamp && Date.now() - cache.timestamp < LOCATION_TTL && cache.data) {
      console.log('【定位流程】命中有效缓存，直接使用。', cache.data);
      const normalized = normalizePlaceDisplay(cache.data.city, cache.data.district);
      return { ...cache.data, ...normalized };
    }
    console.log('【定位流程】无有效缓存，开始新定位流程。');

    // 2. 方案A: 尝试高精度浏览器定位 (GPS/WiFi)
    let finalLocation = null;
    try {
      console.log('【定位流程】开始尝试方案A: 浏览器高精度定位');
      const geoPos = await this._getHighAccuracyGeoLocation();
      const place = await this.reverseGeocode(geoPos.latitude, geoPos.longitude);
      finalLocation = {
        lat: geoPos.latitude,
        lon: geoPos.longitude,
        city: place.city,
        district: place.district,
        fromGeo: true,
        source: 'GPS/WiFi'
      };
      console.log('【定位流程】方案A成功:', finalLocation);
    } catch (geoError) {
      console.warn('【定位流程】方案A失败，降级到方案B。错误:', geoError.message || geoError);
      
      // 3. 方案B: 主IP定位API (whois.pconline.com.cn)
      try {
        console.log('【定位流程】开始尝试方案B: 主IP定位API');
        const ipLocation = await this._getLocationByIP();
        finalLocation = {
          ...ipLocation,
          fromGeo: false,
          source: 'IP-Primary'
        };
        console.log('【定位流程】方案B成功:', finalLocation);
      } catch (ipPrimaryError) {
        console.warn('【定位流程】方案B失败，降级到方案C。错误:', ipPrimaryError.message);
        
        // 4. 方案C: 备用IP定位API (ipapi.co)
        try {
          console.log('【定位流程】开始尝试方案C: 备用IP定位API');
          const ipLocationBackup = await this._getLocationByIPBackup();
          finalLocation = {
            ...ipLocationBackup,
            fromGeo: false,
            source: 'IP-Backup'
          };
          console.log('【定位流程】方案C成功:', finalLocation);
        } catch (ipBackupError) {
          console.error('【定位流程】方案C也失败，使用默认位置。错误:', ipBackupError.message);
          // 5. 所有方案失败，使用默认值
          finalLocation = { ...DEFAULT_LOC, source: 'Default' };
        }
      }
    }

    // 6. 数据后处理与存储
    // 确保城市名不为空，如果仍为“当前城市”，尝试从更细字段提取
    if (finalLocation.city === '当前城市' || !finalLocation.city) {
      console.warn('【定位流程】最终城市名仍为默认值，尝试从district等信息推断。', finalLocation);
      // 这里可以添加更复杂的推断逻辑，例如从district中提取城市名
      if (finalLocation.district && finalLocation.district !== '附近') {
        // 简单示例：如果district包含“市”或“区”，尝试用作city
        if (finalLocation.district.includes('市')) {
          finalLocation.city = finalLocation.district;
        }
      }
    }

    // 规范化显示并缓存
    const normalized = normalizePlaceDisplay(finalLocation.city, finalLocation.district);
    const resultToCache = { ...finalLocation, ...normalized };
    
    console.log('【定位流程】最终定位结果（缓存前）:', resultToCache);
    Storage.set(LS_KEYS.LOCATION_CACHE, { timestamp: Date.now(), data: resultToCache });
    
    return resultToCache;
  },

  // --- 以下是内部辅助方法，供上方主流程调用 ---
  _getHighAccuracyGeoLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('浏览器不支持地理位置API'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => reject(err),
        { 
          timeout: 8000, 
          maximumAge: 0, // 不读缓存
          enableHighAccuracy: true 
        }
      );
    });
  },

  async _getLocationByIP() {
    try {
      const res = await fetch('https://whois.pconline.com.cn/ipJson.jsp?json=true');
      if (!res.ok) throw new Error(`API响应异常: ${res.status}`);
      const text = await res.text();
      const jsonStr = text.replace(/^callback\(|\);$/g, '');
      const data = JSON.parse(jsonStr);
      
      console.log('【IP定位-主API】原始数据:', data);
      
      // 增强解析逻辑，适配多种可能字段
      const province = data.pro || data.prov || '';
      // 优先级：city > region > (pro如果为直辖市) > addr中的城市部分
      let city = data.city || data.region || '';
      
      // 如果city仍为空，但province是直辖市，则用province
      if (!city && ['北京','天津','上海','重庆'].includes(province)) {
        city = province;
      }
      // 最后尝试从addr字段中截取
      if (!city && data.addr) {
        const addr = data.addr;
        // 简单匹配“省+市”模式，例如“广东省深圳市”
        const cityMatch = addr.match(/([^省]+省)?([^市]+市)/);
        if (cityMatch && cityMatch[2]) {
          city = cityMatch[2];
        }
      }
      
      const finalCity = city || '当前城市';
      return { 
        lat: 0, // IP定位无精确坐标
        lon: 0,
        city: finalCity, 
        district: '附近'
      };
    } catch (error) {
      console.error('【IP定位-主API】失败:', error);
      throw error; // 抛出错误，让上层处理降级
    }
  },

  async _getLocationByIPBackup() {
    try {
      // 备用API：ipapi.co (无需密钥，但有速率限制，适合备用)
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error(`备用API响应异常: ${res.status}`);
      const data = await res.json();
      
      console.log('【IP定位-备用API】原始数据:', data);
      
      const city = data.city || '';
      const region = data.region || '';
      // 如果city为空，但region是中文且可能包含城市名，则使用region
      const finalCity = city || (region.includes('市') ? region : '当前城市');
      
      return {
        lat: data.latitude || 0,
        lon: data.longitude || 0,
        city: finalCity,
        district: data.region || '附近'
      };
    } catch (error) {
      console.error('【IP定位-备用API】失败:', error);
      throw error;
    }
  },

  async reverseGeocode(lat, lon) {
    // 注意：此函数现在主要被GPS定位成功后的流程调用。
    // 为保持兼容性，保留此函数，但其内部可以调用上述IP定位作为降级。
    console.log('【逆地理编码】被调用，参数 lat:', lat, 'lon:', lon);
    if (lat === 0 && lon === 0) {
      // 如果传入的是IP定位的模拟坐标，则直接走IP定位逻辑
      return this._getLocationByIP();
    }
    // 如果有真实坐标，这里可以集成高德/腾讯等需要密钥的精确逆地理编码服务
    // 由于您不希望依赖密钥，此处降级到IP定位
    console.log('【逆地理编码】有真实坐标，但未配置精确逆地理编码服务，降级到IP定位。');
    return this._getLocationByIP();
  },

  // 确保您原有的 fetchWeather, mapWeatherCode 等其他方法保留在这里
  async fetchWeather(lat, lon) {
    // ... 您原有的fetchWeather方法代码保持不变
  },

  mapWeatherCode(code) {
    // ... 您原有的mapWeatherCode方法代码保持不变
  }
};

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
