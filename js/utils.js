/** 剪贴板与深度链接 */

export const Clipboard = {
  async copy(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) { /* fallback */ }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
};

const FALLBACK_DELAY_MS = 2000;
const SCHEME_RETRY_INTERVAL_MS = 400;
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** 通过隐藏 <a> 触发 Scheme，避免 Safari 将主窗口导航到自定义协议而报「网址无效」 */
function launchScheme(schemeUrl) {
  const link = document.createElement('a');
  link.href = schemeUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const DeepLink = {
  /**
   * 美团外卖搜索（主协议，方案一）。
   * @see meituanSchemes 含备用协议列表
   */
  meituan(dishName) {
    const keyword = encodeURIComponent(dishName || '');
    return `meituan://search?keyword=${keyword}`;
  },

  /**
   * 美团/美团外卖搜索协议列表（按优先级）。
   * 1. meituan://search
   */
  meituanSchemes(dishName) {
    // 对菜品名进行编码，防止特殊字符导致链接出错
    const keyword = encodeURIComponent(dishName || '');
    
    // 美团主app打开搜索页面
    return [
      `imeituan://www.meituan.com/search?q=${keyword}`,      // 方案1：美团主App（最新）
    ];
  },

  /** 淘宝闪购（原饿了么）搜索 */
  eleme(dishName) {
    return `eleme://search?keyword=${encodeURIComponent(dishName || '')}`;
  },
  storeMeituan() {
    return IS_IOS
      ? 'https://apps.apple.com/cn/app/id423084029'
      : 'http://i.meituan.com/mobile/down/';
  },
  storeEleme() {
    return IS_IOS
      ? 'https://apps.apple.com/cn/app/id507161324'
      : 'https://h5.ele.me/download/';
  },
  /**
   * 尝试唤起 App；仅在未成功唤起时跳转应用商店。
   * schemeUrl 可为单个链接或按优先级排列的协议数组。
   * 通过 Page Visibility API 检测页面隐藏，成功唤起则取消应用商店回退。
   */
  open(schemeUrl, fallbackUrl, {
    fallbackDelay = FALLBACK_DELAY_MS,
    schemeInterval = SCHEME_RETRY_INTERVAL_MS,
  } = {}) {
    const schemes = (Array.isArray(schemeUrl) ? schemeUrl : [schemeUrl]).filter(Boolean);
    if (schemes.length === 0) return;

    let launched = false;
    let fallbackTimer = null;
    const retryTimers = [];

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      retryTimers.forEach((id) => clearTimeout(id));
      retryTimers.length = 0;
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const markLaunched = () => {
      if (launched) return;
      launched = true;
      cleanup();
    };

    const onVisibilityChange = () => {
      if (document.hidden) markLaunched();
    };

    const onPageHide = () => {
      markLaunched();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    const scheduleFallback = () => {
      if (fallbackTimer !== null) return;
      fallbackTimer = setTimeout(() => {
        cleanup();
        if (!launched && !document.hidden) {
          window.location.href = fallbackUrl;
        }
      }, fallbackDelay);
    };

    launchScheme(schemes[0]);

    for (let i = 1; i < schemes.length; i += 1) {
      const id = setTimeout(() => {
        if (!launched) launchScheme(schemes[i]);
      }, schemeInterval * i);
      retryTimers.push(id);
    }

    scheduleFallback();
  },
};
