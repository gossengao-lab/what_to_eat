/**
 * LocalStorage / SessionStorage 封装
 */

import { UserProfile } from './models.js';

export const LS_KEYS = {
  USER_PROFILE: 'wte_user_profile',
  RECOMMEND_HISTORY: 'wte_recommend_history',
  ONBOARDING: 'wte_onboarding_completed',
  LAST_FEEDBACK: 'wte_last_feedback_prompt',
  LAST_VISIT: 'wte_last_visit_date',
  LOCATION_CACHE: 'wte_location_cache'
};

export const SS_KEY_SESSION = 'wte_session_state';

export const Storage = {
  get(key, storage = localStorage) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Storage read failed:', key, e);
      return null;
    }
  },

  set(key, value, storage = localStorage) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed:', key, e);
      return false;
    }
  },

  getProfile() {
    return UserProfile.fromJSON(this.get(LS_KEYS.USER_PROFILE));
  },

  saveProfile(profile) {
    return this.set(LS_KEYS.USER_PROFILE, profile.toJSON());
  },

  getHistory() {
    return this.get(LS_KEYS.RECOMMEND_HISTORY) || [];
  },

  appendHistory(item) {
    const list = this.getHistory();
    list.unshift({
      timestamp: item.timestamp,
      dishName: item.dishName,
      action: item.action,
      skipReason: item.skipReason
    });
    if (list.length > 20) list.length = 20;
    this.set(LS_KEYS.RECOMMEND_HISTORY, list);
  },

  getSession() {
    return (
      this.get(SS_KEY_SESSION, sessionStorage) || {
        skippedCategories: [],
        consecutiveSkips: 0,
        lastRecommendedDish: '',
        lastUpdated: Date.now()
      }
    );
  },

  saveSession(sessionState) {
    sessionState.lastUpdated = Date.now();
    return this.set(SS_KEY_SESSION, sessionState, sessionStorage);
  },

  recordVisit() {
    const today = new Date().toISOString().slice(0, 10);
    this.set(LS_KEYS.LAST_VISIT, today);
  },

  /** 清理超过 12 小时的会话跳过记录 */
  cleanupOldSession() {
    const session = this.getSession();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    if (session.lastUpdated && Date.now() - session.lastUpdated > TWELVE_HOURS) {
      session.skippedCategories = [];
      session.consecutiveSkips = 0;
    }
    session.lastUpdated = Date.now();
    this.saveSession(session);
    return session;
  }
};
