// Storage helpers for clips, settings, sessions
// JSDoc types for clarity
/**
 * @typedef {Object} Clip
 * @property {string} id
 * @property {string} text
 * @property {string} [rawHtml]
 * @property {string} sourceUrl
 * @property {string} sourceTitle
 * @property {string} domain
 * @property {'text'|'code'|'article'|'other'} type
 * @property {string[]} tags
 * @property {string} [summary]
 * @property {number} createdAt
 * @property {boolean} [favorite]
 */

/**
 * @typedef {Object} Settings
 * @property {number} maxClips
 * @property {'system'|'light'|'dark'} theme
 * @property {boolean} autoSummarize
 * @property {boolean} autoCleanUrls
 * @property {string[]} ignoreList
 * @property {boolean} cceEnabled
 * @property {string[]} blockedLabels
 * @property {boolean} autoCaptureEnabled
 * @property {number} sessionDurationMin
 */

/** @typedef {{activeSessionId?: string, groups: Record<string,{id:string,name:string,createdAt:number,expiresAt:number}>}} Sessions */

import { api } from './api.js';
import { cleanUrlTracking } from './url.js';

const KEYS = {
  clips: 'clips',
  settings: 'settings',
  sessions: 'sessions',
};

export const DEFAULT_SETTINGS = /** @type {Settings} */ ({
  maxClips: 500,
  theme: 'system',
  autoSummarize: true,
  autoCleanUrls: true,
  ignoreList: [],
  cceEnabled: false,
  blockedLabels: [],
  autoCaptureEnabled: false,
  sessionDurationMin: 45,
});

export async function getSettings() {
  const data = await api.storage.local.get([KEYS.settings]);
  return { ...DEFAULT_SETTINGS, ...(data[KEYS.settings] || {}) };
}

export async function setSettings(partial) {
  const old = await getSettings();
  const next = { ...old, ...partial };
  await api.storage.local.set({ [KEYS.settings]: next });
  return next;
}

export async function getClips() {
  const data = await api.storage.local.get([KEYS.clips]);
  const clips = /** @type {Clip[]} */ (data[KEYS.clips] || []);
  return clips.sort((a,b)=>b.createdAt-a.createdAt);
}

export async function setClips(clips) {
  await api.storage.local.set({ [KEYS.clips]: clips });
}

export function deriveDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return 'unknown'; }
}

export async function addClip(clip) {
  const settings = await getSettings();
  const existing = await getClips();
  // Optional URL clean
  const sourceUrl = settings.autoCleanUrls ? cleanUrlTracking(clip.sourceUrl) : clip.sourceUrl;
  const newClip = { ...clip, sourceUrl };
  // Dedup by text+domain within small window (~5min) to avoid storms
  const windowMs = 5 * 60 * 1000;
  const now = Date.now();
  const dup = existing.find(c => c.text === newClip.text && c.domain === newClip.domain && Math.abs(c.createdAt - now) < windowMs);
  let list = dup ? existing : [newClip, ...existing];
  // Enforce LRU cap
  if (list.length > settings.maxClips) list = list.slice(0, settings.maxClips);
  await setClips(list);
  return newClip;
}

export async function updateClip(id, patch) {
  const clips = await getClips();
  const idx = clips.findIndex(c => c.id === id);
  if (idx >= 0) {
    clips[idx] = { ...clips[idx], ...patch };
    await setClips(clips);
    return clips[idx];
  }
  return null;
}

export async function deleteClip(id) {
  const clips = await getClips();
  await setClips(clips.filter(c => c.id !== id));
}

export async function clearClips() {
  await setClips([]);
}

export async function getSessions() {
  const data = await api.storage.local.get([KEYS.sessions]);
  /** @type {Sessions} */
  const sessions = data[KEYS.sessions] || { groups: {} };
  return sessions;
}

export async function setSessions(sessions) {
  await api.storage.local.set({ [KEYS.sessions]: sessions });
}

export function newId() {
  // nano-ish id
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
