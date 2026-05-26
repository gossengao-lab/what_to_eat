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

export const DeepLink = {
  /** 美团外卖搜索（meituanwaimai 为外卖独立 App 协议） */
  meituan(dishName) {
    const q = encodeURIComponent(dishName);
    return `meituanwaimai://waimai.meituan.com/search?query=${q}`;
  },
  /** 淘宝闪购（原饿了么）搜索 */
  eleme(dishName) {
    return `eleme://search?keyword=${encodeURIComponent(dishName)}`;
  },
  storeMeituan() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'https://apps.apple.com/cn/app/id423084029'
      : 'https://www.meituan.com/mobile/download/';
  },
  storeEleme() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'https://apps.apple.com/cn/app/id507161324'
      : 'https://h5.ele.me/download/';
  },
  /**
   * 尝试唤起 App；仅在未成功唤起时跳转应用商店。
   * 通过 Page Visibility API 检测页面是否被置为隐藏以判断唤起成功。
   */
  open(schemeUrl, fallbackUrl, { fallbackDelay = FALLBACK_DELAY_MS } = {}) {
    let launched = false;
    let timer = null;

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
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

    timer = setTimeout(() => {
      cleanup();
      if (!launched && !document.hidden) {
        window.location.href = fallbackUrl;
      }
    }, fallbackDelay);

    window.location.href = schemeUrl;
  }
};
