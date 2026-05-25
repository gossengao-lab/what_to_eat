/**
 * 情境感知服务（含本地缓存）
 */

import { Storage, LS_KEYS } from './storage.js';
import { RecommendationContext } from './models.js';

const LOCATION_TTL = 5 * 60 * 1000;
const WEATHER_TTL = 30 * 60 * 1000;
const DEFAULT_LOC = { lat: 39.9, lon: 116.4, city: '北京', district: '海淀区', fromGeo: false };

export const ContextService = {
  async fetchLocation() {
    const cache = Storage.get(LS_KEYS.LOCATION_CACHE);
    if (cache?.timestamp && Date.now() - cache.timestamp < LOCATION_TTL) {
      return cache.data;
    }

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(DEFAULT_LOC);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const place = await this.reverseGeocode(latitude, longitude);
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
        () => {
          if (cache?.data) resolve(cache.data);
          else resolve(DEFAULT_LOC);
        },
        { timeout: 5000, maximumAge: 300000, enableHighAccuracy: false }
      );
    });
  },

  async reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=zh`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'zh-CN' } });
      if (!res.ok) throw new Error('geocode fail');
      const data = await res.json();
      const addr = data.address || {};
      return {
        city: addr.city || addr.town || addr.county || addr.state || '当前城市',
        district: addr.suburb || addr.district || addr.neighbourhood || '附近'
      };
    } catch {
      return { city: '当前城市', district: '附近' };
    }
  },

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

/** 构建或复用情境（去重并发请求） */
export async function ensureContext(state) {
  if (state.context) return state.context;
  if (!contextPromise) {
    contextPromise = (async () => {
      const loc = await ContextService.fetchLocation();
      const weather = await ContextService.fetchWeather(loc.lat, loc.lon);
      return new RecommendationContext({
        time: new Date(),
        weather,
        location: { city: loc.city, district: loc.district },
        manualOverride: state.manualOverride
      });
    })();
  }
  try {
    state.context = await contextPromise;
    return state.context;
  } finally {
    contextPromise = null;
  }
}

/** 初始化情境页 UI */
export async function initContext(state, elements) {
  const { statusEl, narrativeEl, confirmBtn, inspireBtn } = elements;
  statusEl.textContent = '正在感知你的用餐情境…';
  confirmBtn.disabled = true;
  narrativeEl.textContent = '你好！正在为你准备专属问候…';

  const loc = await ContextService.fetchLocation();
  const weather = await ContextService.fetchWeather(loc.lat, loc.lon);

  state.context = new RecommendationContext({
    time: new Date(),
    weather,
    location: { city: loc.city, district: loc.district },
    manualOverride: state.manualOverride
  });

  statusEl.textContent = loc.fromGeo ? '情境已更新' : '未授权定位，已使用默认城市演示';
  narrativeEl.textContent = state.context.generateNarrative(state.profile.nickname);
  confirmBtn.disabled = false;

  if (inspireBtn && Storage.get(LS_KEYS.ONBOARDING)) {
    inspireBtn.classList.remove('hidden');
  }

  return { fromGeo: loc.fromGeo };
}

/** 空闲时预取情境，不阻塞首屏 */
export function prefetchContext(state) {
  const run = () => ensureContext(state).catch(() => {});
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 800);
  }
}
