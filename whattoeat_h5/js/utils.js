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

export const DeepLink = {
  meituan(dishName) {
    return `imeituan://www.meituan.com/takeout/search?keyword=${encodeURIComponent(dishName)}`;
  },
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
  open(schemeUrl, fallbackUrl) {
    const start = Date.now();
    window.location.href = schemeUrl;
    setTimeout(() => {
      if (Date.now() - start < 2500) window.location.href = fallbackUrl;
    }, 1500);
  }
};
