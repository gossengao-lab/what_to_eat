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
   * 美团外卖搜索。
   * iOS 使用 imeituan（美团主 App，与 App Store 包一致）；Android 使用美团外卖独立协议。
   */
  meituan(dishName) {
    const q = encodeURIComponent(dishName || '');
    if (IS_IOS) {
      return `imeituan://www.meituan.com/search?q=${q}`;
    }
    return `meituanwaimai://waimai.meituan.com/search?query=${q}`;
  },
  /** 淘宝闪购（原饿了么）搜索 */
  eleme(dishName) {
    return `eleme://search?keyword=${encodeURIComponent(dishName)}`;
  },
  storeMeituan() {
    return IS_IOS
      ? 'https://apps.apple.com/cn/app/id423084029'
      : 'https://www.meituan.com/mobile/download/';
  },
  storeEleme() {
    return IS_IOS
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

    launchScheme(schemeUrl);
  }
};
