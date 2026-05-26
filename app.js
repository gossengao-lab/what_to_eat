/**
 * 今天吃什么灵感助手 — 主入口（ES Module）
 * 性能优化：模块拆分、懒加载菜品库、情境缓存、空闲预取
 */

import { Storage, LS_KEYS } from './js/storage.js';
import {
  UserProfile,
  RecommendationContext,
  HistoryItem
} from './js/models.js';
import {
  DIETARY_PRESETS,
  SKIP_REASONS,
  MEAL_OVERRIDE_OPTIONS,
  WEATHER_MOOD_OPTIONS
} from './js/constants.js';
import { Clipboard, DeepLink } from './js/utils.js';
import {
  prefetchContext,
  getContextForRecommend,
  getIsContextFetching
} from './js/context-engine.js';
import {
  runRecommend as engineRunRecommend,
  getFoodCategories,
  getPreferenceTemplates
} from './js/recommendation.js';

/** 分类与模板（打开偏好页时懒加载） */
let foodMeta = { categories: null, templates: null };

async function loadFoodMeta() {
  if (!foodMeta.categories) {
    const [categories, templates] = await Promise.all([
      getFoodCategories(),
      getPreferenceTemplates()
    ]);
    foodMeta = { categories, templates };
  }
  return foodMeta;
}
/* ========== UI 控制器 ========== */

const state = {
  view: 'context',
  profile: Storage.getProfile(),
  context: null,
  currentResult: null,
  manualOverride: { tags: [] },
  selectedSkipReason: 'category_dislike',
  pendingPrefs: null,
  activeTemplateName: null,
  lastRecommendDegraded: false
};

const $ = (id) => document.getElementById(id);

const views = {
  context: $('view-context'),
  preferences: $('view-preferences'),
  recommendation: $('view-recommendation'),
  action: $('view-action')
};

function showView(name) {
  state.view = name;
  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    const active = key === name;
    el.classList.toggle('view--active', active);
    el.hidden = !active;
  });
  $('btn-inspire-again').classList.toggle('hidden', name !== 'context' || !Storage.get(LS_KEYS.ONBOARDING));
}

let toastTimer = null;
function showToast(msg, duration = 2000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

function showModal(id) {
  $(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideModal(id) {
  $(id).classList.add('hidden');
  document.body.style.overflow = '';
}

/* --- 情境页 --- */

/** 首屏轻量占位，不阻塞 FCP；确认按钮立即可点 */
function showContextShell() {
  const statusEl = $('context-status');
  statusEl.textContent = getIsContextFetching() ? '正在准备中…' : ' ';
  statusEl.classList.toggle('context-status--loading', getIsContextFetching());
  $('context-narrative').textContent = '你好！准备好获取今日美食灵感了吗？';
  $('btn-confirm-context').disabled = false;
  if (Storage.get(LS_KEYS.ONBOARDING)) {
    $('btn-inspire-again').classList.remove('hidden');
  }
}

function setContextPreloadUI(fetching) {
  const statusEl = $('context-status');
  if (state.view !== 'context') return;
  statusEl.classList.toggle('context-status--loading', fetching);
  if (fetching) {
    statusEl.textContent = '正在准备中…';
  } else if (state.context && !state.context.isDegraded) {
    statusEl.textContent = '情境已就绪';
    $('context-narrative').textContent = state.context.generateNarrative(state.profile.nickname);
  } else {
    statusEl.textContent = ' ';
  }
}

function onContextPrefetched(context, meta = {}) {
  if (!context || context.isDegraded) return;
  if (state.view === 'context') {
    const statusEl = $('context-status');
    statusEl.classList.remove('context-status--loading');
    statusEl.textContent = meta.fromGeo ? '情境已就绪' : '未授权定位，已使用默认城市演示';
    $('context-narrative').textContent = context.generateNarrative(state.profile.nickname);
  }
  if (state.lastRecommendDegraded && state.view === 'recommendation' && state.currentResult) {
    $('rec-reason').textContent = state.currentResult.reason;
    state.lastRecommendDegraded = false;
  }
}

function startContextPrefetch() {
  prefetchContext(state, {
    onFetching: setContextPreloadUI,
    onReady: onContextPrefetched
  });
}

function applyContextOverride() {
  if (!state.context) return;
  state.context = new RecommendationContext({
    time: state.context.timestamp,
    weather: state.context.weather,
    location: state.context.location,
    manualOverride: state.manualOverride,
    isDegraded: state.context.isDegraded
  });
  $('context-narrative').textContent = state.context.generateNarrative(state.profile.nickname);
}

/* --- 推荐流 --- */

async function runRecommend() {
  const { context, degraded } = getContextForRecommend(state);
  state.lastRecommendDegraded = degraded;

  const session = Storage.getSession();
  const history = Storage.getHistory();

  const result = await engineRunRecommend({ ...state, context }, session, history);

  state.currentResult = result;
  session.lastRecommendedDish = result.dishName;
  Storage.saveSession(session);

  let reasonText = result.reason;
  if (degraded) {
    reasonText += '（基于您的时间和偏好推荐，地理位置信息加载稍慢）';
  }

  $('rec-dish-name').textContent = result.dishName;
  $('rec-reason').textContent = reasonText;
  $('rec-shops').textContent = `约 ${result.estimatedShops} 家店可送`;
  $('rec-category').textContent = result.sourceCategory;

  showView('recommendation');
}

function acceptRecommendation() {
  if (!state.currentResult) return;
  Storage.appendHistory(new HistoryItem(state.currentResult, 'accepted'));
  const session = Storage.getSession();
  session.consecutiveSkips = 0;
  session.skippedCategories = [];
  Storage.saveSession(session);

  $('action-dish-name').textContent = state.currentResult.dishName;
  Clipboard.copy(state.currentResult.dishName);
  showView('action');
}

async function handleSkipConfirm() {
  if (!state.currentResult) return;
  const reasonId = state.selectedSkipReason;
  const reasonLabel = SKIP_REASONS.find((r) => r.id === reasonId)?.label || '';

  Storage.appendHistory(
    new HistoryItem(state.currentResult, 'skipped', reasonLabel)
  );

  const session = Storage.getSession();
  session.consecutiveSkips += 1;

  if (reasonId === 'category_dislike' && state.currentResult.sourceCategory) {
    if (!session.skippedCategories.includes(state.currentResult.sourceCategory)) {
      session.skippedCategories.push(state.currentResult.sourceCategory);
    }
  }

  Storage.saveSession(session);
  hideModal('modal-skip');

  if (reasonId === 'no_takeout') {
    showToast('好的，下次再来～');
    showView('context');
    return;
  }

    showToast('已调整推荐策略');
    await runRecommend();
  }

/* --- 偏好页 UI 构建 --- */

function cloneCategories() {
  return JSON.parse(JSON.stringify(state.profile.selectedCategories || {}));
}

/** 确保 pendingPrefs 已初始化 */
function ensurePendingPrefs() {
  if (!state.pendingPrefs) {
    state.pendingPrefs = cloneCategories();
  }
  return state.pendingPrefs;
}

/** 一级大类是否已选中（存在键即可，不要求二级已选） */
function isPrimarySelected(cats, primary) {
  return Object.prototype.hasOwnProperty.call(cats, primary);
}

/** 二级菜系是否已选中 */
function isSecondarySelected(cats, primary, sub) {
  const subs = cats[primary];
  return Array.isArray(subs) && subs.includes(sub);
}

/** 同步芯片 DOM 的 tag-chip--active 与 aria-checked */
function setChipActive(chip, active) {
  if (active) {
    chip.classList.add('tag-chip--active');
  } else {
    chip.classList.remove('tag-chip--active');
  }
  chip.setAttribute('aria-checked', String(active));
}

/** 手动修改分类时清除模板选中（避免模板高亮与内容不一致） */
function clearActiveTemplate() {
  state.activeTemplateName = null;
}

/** 全选所有美食大类及二级菜系 */
function buildAllCategories(categoriesTree) {
  const result = {};
  Object.entries(categoriesTree).forEach(([primary, subs]) => {
    result[primary] = [...subs];
  });
  return result;
}

/** 比较两份分类偏好是否一致 */
function categoriesEqual(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k, i) => {
    if (keysB[i] !== k) return false;
    const sa = [...(a[k] || [])].sort();
    const sb = [...(b[k] || [])].sort();
    return sa.length === sb.length && sa.every((v, j) => v === sb[j]);
  });
}

/** 根据已选分类推断当前热门模板（用于恢复高亮） */
function resolveActiveTemplateName(cats) {
  if (!foodMeta.templates || !foodMeta.categories) return null;
  for (const tpl of foodMeta.templates) {
    if (tpl.selectAll) {
      if (categoriesEqual(cats, buildAllCategories(foodMeta.categories))) return tpl.name;
    } else if (categoriesEqual(cats, tpl.categories)) {
      return tpl.name;
    }
  }
  return null;
}

/** 根据 pendingPrefs 刷新一级、二级、模板芯片的橙色选中态 */
function syncAllPreferenceChipStates() {
  const cats = ensurePendingPrefs();

  document.querySelectorAll('#template-chips .tag-chip').forEach((chip) => {
    const name = chip.dataset.templateName || chip.textContent.trim();
    setChipActive(chip, state.activeTemplateName === name);
  });

  document.querySelectorAll('#primary-chips .tag-chip').forEach((chip) => {
    const primary = chip.dataset.primary || chip.textContent.trim();
    setChipActive(chip, isPrimarySelected(cats, primary));
  });

  document.querySelectorAll('#secondary-chips .tag-chip').forEach((chip) => {
    const primary = chip.dataset.primary;
    const sub = chip.dataset.sub;
    if (primary && sub) {
      setChipActive(chip, isSecondarySelected(cats, primary, sub));
    }
  });
}

/** 创建带选中态的美食标签芯片；偏好页使用事件委托时设 bindClick: false */
function createCategoryChip(label, active, onToggle, options = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tag-chip';
  chip.textContent = label;
  chip.setAttribute('role', 'checkbox');
  setChipActive(chip, active);
  if (options.bindClick !== false) {
    chip.addEventListener('click', () => {
      const nextActive = onToggle();
      setChipActive(chip, nextActive);
    });
  }
  return chip;
}

/** 更新用户偏好：二级分类多选 */
function updateUserPreferences(primaryCategory, sub, isChecked) {
  const cats = ensurePendingPrefs();
  if (!cats[primaryCategory]) {
    cats[primaryCategory] = [];
  }
  const arr = cats[primaryCategory];
  const idx = arr.indexOf(sub);
  if (isChecked && idx < 0) {
    arr.push(sub);
  } else if (!isChecked && idx >= 0) {
    arr.splice(idx, 1);
  }
  // 二级全部取消时仍保留一级选中（空数组），大类芯片保持高亮
}

/** 渲染二级分类芯片（支持多个一级大类同时展开） */
function updateSecondaryChips() {
  const secondaryChips = $('secondary-chips');
  const cats = ensurePendingPrefs();
  secondaryChips.innerHTML = '';

  const selectedPrimaries = Object.keys(cats).filter((p) =>
    isPrimarySelected(cats, p)
  );

  if (selectedPrimaries.length === 0) {
    secondaryChips.innerHTML = '<p class="chip-placeholder">请先选择上方大类</p>';
    return;
  }

  selectedPrimaries.forEach((primaryCategory) => {
    const subCategories = foodMeta.categories[primaryCategory] || [];
    if (subCategories.length === 0) return;

    const groupLabel = document.createElement('p');
    groupLabel.className = 'chip-group-label caption';
    groupLabel.textContent = primaryCategory;
    secondaryChips.appendChild(groupLabel);

    subCategories.forEach((sub) => {
      const active = isSecondarySelected(cats, primaryCategory, sub);
        const chip = createCategoryChip(sub, active, () => !isSecondarySelected(ensurePendingPrefs(), primaryCategory, sub), { bindClick: false });
      chip.dataset.primary = primaryCategory;
      chip.dataset.sub = sub;
      secondaryChips.appendChild(chip);
    });
  });
}

/** 初始化一级分类芯片（支持多选） */
async function initCategoryChips() {
  await loadFoodMeta();
  const primaryChips = $('primary-chips');
  primaryChips.innerHTML = '';
  const cats = ensurePendingPrefs();

  Object.keys(foodMeta.categories).forEach((category) => {
    const active = isPrimarySelected(cats, category);
    const chip = createCategoryChip(category, active, () => !isPrimarySelected(ensurePendingPrefs(), category), { bindClick: false });
    chip.dataset.primary = category;
    primaryChips.appendChild(chip);
  });

  updateSecondaryChips();
  syncAllPreferenceChipStates();
}

/** 渲染热门推荐模板芯片 */
async function renderTemplateChips() {
  await loadFoodMeta();
  const tplContainer = $('template-chips');
  tplContainer.innerHTML = '';

  foodMeta.templates.forEach((tpl) => {
    const active = state.activeTemplateName === tpl.name;
    const chip = createCategoryChip(tpl.name, active, () => true, { bindClick: false });
    chip.dataset.templateName = tpl.name;
    chip.setAttribute('role', 'button');
    tplContainer.appendChild(chip);
  });
}

async function renderPreferenceUI() {
  await loadFoodMeta();
  if (!state.pendingPrefs) {
    state.pendingPrefs = cloneCategories();
  }
  if (state.activeTemplateName === null) {
    state.activeTemplateName = resolveActiveTemplateName(state.pendingPrefs);
  }

  await renderTemplateChips();
  await initCategoryChips();

  const presetContainer = $('dietary-preset-chips');
  presetContainer.innerHTML = '';
  DIETARY_PRESETS.forEach((tag) => {
    const active = state.profile.dietaryRestrictions.includes(tag);
    const btn = createCategoryChip(tag, active, () => {
      const isOn = state.profile.dietaryRestrictions.includes(tag);
      if (isOn) state.profile.removeRestriction(tag);
      else state.profile.addRestriction(tag);
      return !isOn;
    });
    presetContainer.appendChild(btn);
  });

  const customList = $('dietary-custom-list');
  customList.innerHTML = '';
  state.profile.dietaryRestrictions
    .filter((t) => !DIETARY_PRESETS.includes(t))
    .forEach((tag) => {
      const span = document.createElement('span');
      span.className = 'tag-chip tag-chip--dietary';
      span.innerHTML = `${tag}<span class="close-icon" data-tag="${tag}" aria-label="移除">×</span>`;
      span.querySelector('.close-icon').addEventListener('click', async () => {
        state.profile.removeRestriction(tag);
        await renderPreferenceUI();
      });
      customList.appendChild(span);
    });
}

function savePreferences() {
  if (state.pendingPrefs) {
    state.profile.selectedCategories = state.pendingPrefs;
  }
  Storage.saveProfile(state.profile);
  Storage.set(LS_KEYS.ONBOARDING, true);
  state.pendingPrefs = null;
  showToast('偏好已保存');
  showView('context');
  showContextShell();
  applyContextOverride();
  if (state.context && !state.context.isDegraded) {
    onContextPrefetched(state.context, { fromGeo: true });
  }
}

function renderContextModalChips() {
  const mealBox = $('override-meal-chips');
  mealBox.innerHTML = '';
  MEAL_OVERRIDE_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'tag-chip' +
      (state.manualOverride.mealPeriod === opt.id ? ' tag-chip--active' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      state.manualOverride.mealPeriod =
        state.manualOverride.mealPeriod === opt.id ? null : opt.id;
      renderContextModalChips();
    });
    mealBox.appendChild(btn);
  });

  const weatherBox = $('override-weather-chips');
  weatherBox.innerHTML = '';
  WEATHER_MOOD_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = (state.manualOverride.tags || []).includes(opt.id);
    btn.className = 'tag-chip' + (active ? ' tag-chip--active' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      if (!state.manualOverride.tags) state.manualOverride.tags = [];
      const tags = state.manualOverride.tags;
      const i = tags.indexOf(opt.id);
      if (i >= 0) tags.splice(i, 1);
      else {
        tags.filter((t) => ['rain', 'sunny', 'cloudy'].includes(t)).forEach((t) => {
          const idx = tags.indexOf(t);
          if (idx >= 0) tags.splice(idx, 1);
        });
        tags.push(opt.id);
      }
      renderContextModalChips();
    });
    weatherBox.appendChild(btn);
  });
}

function renderSkipModal() {
  const container = $('skip-reason-options');
  container.innerHTML = '';
  SKIP_REASONS.forEach((r) => {
    const label = document.createElement('label');
    label.className =
      'skip-option' +
      (state.selectedSkipReason === r.id ? ' skip-option--selected' : '');
    label.innerHTML = `<input type="radio" name="skip-reason" value="${r.id}" ${state.selectedSkipReason === r.id ? 'checked' : ''}> ${r.label}`;
    label.addEventListener('click', () => {
      state.selectedSkipReason = r.id;
      renderSkipModal();
    });
    container.appendChild(label);
  });
}

/* ========== 事件绑定 ========== */

/** 偏好页事件委托，减少动态芯片监听器 */
function bindPreferenceDelegation() {
  const prefsView = $('view-preferences');
  if (!prefsView || prefsView.dataset.delegationBound) return;
  prefsView.dataset.delegationBound = '1';

  prefsView.addEventListener('click', async (event) => {
    const chip = event.target.closest('.tag-chip');
    if (!chip || chip.closest('#dietary-preset-chips, #dietary-custom-list')) return;

    await loadFoodMeta();

    const templateName = chip.dataset.templateName;
    const primary = chip.dataset.primary;
    const sub = chip.dataset.sub;

    if (templateName) {
      const tpl = foodMeta.templates.find((t) => t.name === templateName);
      if (tpl) {
        state.activeTemplateName = tpl.name;
        state.pendingPrefs = tpl.selectAll
          ? buildAllCategories(foodMeta.categories)
          : JSON.parse(JSON.stringify(tpl.categories));
        await initCategoryChips();
        await renderTemplateChips();
        syncAllPreferenceChipStates();
        showToast(`已应用「${tpl.name}」`);
      }
      return;
    }

    if (primary && sub) {
      clearActiveTemplate();
      const nowActive = !isSecondarySelected(ensurePendingPrefs(), primary, sub);
      updateUserPreferences(primary, sub, nowActive);
      syncAllPreferenceChipStates();
      return;
    }

    if (primary) {
      clearActiveTemplate();
      const prefs = ensurePendingPrefs();
      const wasSelected = isPrimarySelected(prefs, primary);
      if (wasSelected) delete prefs[primary];
      else prefs[primary] = [];
      updateSecondaryChips();
      syncAllPreferenceChipStates();
    }
  });
}

function bindEvents() {
  $('btn-confirm-context').addEventListener('click', async () => {
    const btn = $('btn-confirm-context');
    btn.disabled = true;
    try {
      Storage.set(LS_KEYS.ONBOARDING, true);
      $('btn-inspire-again').classList.remove('hidden');
      await runRecommend();
    } finally {
      btn.disabled = false;
    }
  });

  $('btn-swap-context').addEventListener('click', () => {
    renderContextModalChips();
    showModal('modal-context');
  });

  $('btn-apply-context').addEventListener('click', () => {
    hideModal('modal-context');
    applyContextOverride();
    showToast('情境已更新');
  });

  $('btn-close-context-modal').addEventListener('click', () => hideModal('modal-context'));
  $('modal-context').addEventListener('click', (e) => {
    if (e.target === $('modal-context')) hideModal('modal-context');
  });

  $('btn-inspire-again').addEventListener('click', async () => {
    $('btn-inspire-again').disabled = true;
    try {
      await runRecommend();
    } finally {
      $('btn-inspire-again').disabled = false;
    }
  });

  $('btn-accept').addEventListener('click', acceptRecommendation);

  $('btn-skip').addEventListener('click', () => {
    renderSkipModal();
    showModal('modal-skip');
  });

  $('btn-confirm-skip').addEventListener('click', handleSkipConfirm);
  $('btn-close-skip-modal').addEventListener('click', () => hideModal('modal-skip'));
  $('modal-skip').addEventListener('click', (e) => {
    if (e.target === $('modal-skip')) hideModal('modal-skip');
  });

  $('btn-copy').addEventListener('click', async () => {
    const name = state.currentResult?.dishName || '';
    const ok = await Clipboard.copy(name);
    showToast(ok ? '复制成功' : '复制失败，请手动复制');
  });

  $('btn-meituan').addEventListener('click', async () => {
    const name = state.currentResult?.dishName || '';
    await Clipboard.copy(name);
    DeepLink.open(DeepLink.meituan(name), DeepLink.storeMeituan());
  });

  $('btn-eleme').addEventListener('click', async () => {
    const name = state.currentResult?.dishName || '';
    await Clipboard.copy(name);
    DeepLink.open(DeepLink.eleme(name), DeepLink.storeEleme());
  });

  $('btn-back-home').addEventListener('click', () => {
    showView('context');
    if (state.context && !state.context.isDegraded) {
      $('context-narrative').textContent = state.context.generateNarrative(state.profile.nickname);
      $('context-status').textContent = '情境已就绪';
    } else {
      showContextShell();
    }
    startContextPrefetch();
  });

  $('btn-open-preferences').addEventListener('click', async () => {
    if (state.view === 'preferences') {
      state.pendingPrefs = null;
      state.activeTemplateName = null;
      showView('context');
      return;
    }
    state.pendingPrefs = cloneCategories();
    state.activeTemplateName = null;
    await renderPreferenceUI();
    showView('preferences');
  });

  $('btn-save-preferences').addEventListener('click', savePreferences);

  $('btn-skip-preferences').addEventListener('click', () => {
    Storage.set(LS_KEYS.ONBOARDING, true);
    showView('context');
    showContextShell();
    if (state.context && !state.context.isDegraded) {
      onContextPrefetched(state.context, { fromGeo: true });
    }
  });

  $('btn-add-dietary').addEventListener('click', async () => {
    const input = $('dietary-input');
    state.profile.addRestriction(input.value);
    input.value = '';
    await renderPreferenceUI();
  });

  $('dietary-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      state.profile.addRestriction(e.target.value);
      e.target.value = '';
      await renderPreferenceUI();
    }
  });
}

/* ========== 启动 ========== */

async function init() {
  Storage.recordVisit();
  Storage.cleanupOldSession();
  bindEvents();
  bindPreferenceDelegation();
  renderSkipModal();

  const isFirst = !Storage.get(LS_KEYS.ONBOARDING) && !state.profile.hasAnyCategorySelected();
  if (isFirst) {
    state.pendingPrefs = {};
    await renderPreferenceUI();
    showView('preferences');
  } else {
    showView('context');
    showContextShell();
  }

  startContextPrefetch();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
