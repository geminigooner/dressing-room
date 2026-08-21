/**
 * Identity Reference Bank State & Storage Management
 * 
 * Provides client-side persistence and data modeling for user identity reference photos,
 * tag presets, and the identity fidelity contract.
 */

import { scoreMemorySynergy } from './memory.js';

export const DEFAULT_IDENTITY_TAGS = [
  'face',
  'close-up',
  'full body',
  'mirror selfie',
  '3/4 angle',
  'profile',
  'neutral',
  'glam',
  'indoor',
  'outdoor',
  'bright lighting',
];

export const DEFAULT_IDENTITY_CONTRACT = {
  preserveFacialStructure: true,
  preserveEyes: true,
  preserveNose: true,
  preserveLips: true,
  preserveComplexion: true,
  preserveRecognizableBodyProportions: true,
  preserveHairUnlessRequested: true,
  doNotReinterpretIntoGenericBeautyIdeal: true,
};

/**
 * Segment-specific target roles for identity references.
 * Enables the user or matching heuristics to designate specific references for distinct anatomical anchors.
 */
export const IDENTITY_SEGMENT_ROLES = [
  { id: 'auto', label: 'Balanced / Full Look', description: 'General facial features, complexion, and overall identity' },
  { id: 'face', label: 'Face & Features', description: 'Primary anchor for eyes, nose, lips, jawline & expression' },
  { id: 'hair', label: 'Hair & Hairline', description: 'Anchors hairstyle, hair texture, color, and volume' },
  { id: 'body', label: 'Body & Silhouette', description: 'Anchors natural body proportions, posture & framing' },
];

/**
 * Identity Lock Modes: Controls aggressiveness of identity & source-photo preservation
 */
export const IDENTITY_LOCK_MODES = [
  {
    id: 'soft',
    label: 'Soft',
    tagline: 'Styling Freedom',
    description: 'Lighter preservation instructions. Allows larger styling, hair/glam changes, and creative reinterpretation.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    tagline: 'Standard',
    description: 'Normal identity preservation. Preserves recognizable face, body proportions, pose, framing, and setting while styling.',
  },
  {
    id: 'strict',
    label: 'Strict',
    tagline: 'Max Fidelity',
    description: 'Maximum lock. Uncompromisingly anchors facial bone structure, body proportions, posture, environment, and lighting.',
  },
];

export const DEFAULT_IDENTITY_LOCK_MODE = 'balanced';
export const IDENTITY_LOCK_STORAGE_KEY = 'dressing_room_identity_lock_mode_v1';

/**
 * Helper to compute relevance recommendation score based on tags, notes, prompt keywords, and identity lock mode.
 * Keeps manual user selection as authoritative while providing helpful visual cues.
 */
export function scoreReferenceRelevance(item, prompt = '', activeSegment = 'auto', selectedIds = [], identityLockMode = 'balanced') {
  if (!item) return 0;
  let score = 0;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const textCorpus = `${item.label || ''} ${tags.join(' ')} ${item.notes || ''}`.toLowerCase();
  const lowerPrompt = (prompt || '').toLowerCase();

  // Favorite boost (amplified in strict mode to prioritize trusted references)
  if (item.favorite) {
    score += identityLockMode === 'strict' ? 22 : identityLockMode === 'soft' ? 10 : 15;
  }

  // Segment-specific relevance (Primary visual relevance)
  if (activeSegment === 'face') {
    if (tags.includes('face') || tags.includes('close-up')) score += 30;
    if (tags.includes('neutral') || tags.includes('bright lighting')) score += 10;
  } else if (activeSegment === 'hair') {
    if (tags.includes('face') || tags.includes('close-up') || tags.includes('profile') || tags.includes('3/4 angle')) score += 25;
    if (textCorpus.includes('hair') || textCorpus.includes('curl') || textCorpus.includes('straight')) score += 20;
  } else if (activeSegment === 'body') {
    if (tags.includes('full body') || tags.includes('mirror selfie')) score += 35;
    if (tags.includes('outdoor') || tags.includes('indoor')) score += 10;
  } else {
    // Balanced
    if (tags.includes('face') || tags.includes('close-up')) score += 20;
    if (tags.includes('full body') || tags.includes('mirror selfie')) score += 15;
  }

  // Prompt keyword synergy (Primary visual relevance)
  if (lowerPrompt.includes('headshot') || lowerPrompt.includes('face') || lowerPrompt.includes('makeup') || lowerPrompt.includes('earring') || lowerPrompt.includes('glasses')) {
    if (tags.includes('face') || tags.includes('close-up')) score += 15;
  }
  if (lowerPrompt.includes('dress') || lowerPrompt.includes('gown') || lowerPrompt.includes('suit') || lowerPrompt.includes('pants') || lowerPrompt.includes('coat') || lowerPrompt.includes('shoes')) {
    if (tags.includes('full body') || tags.includes('mirror selfie')) score += 15;
  }
  if (lowerPrompt.includes('hair') || lowerPrompt.includes('hairstyle') || lowerPrompt.includes('bangs') || lowerPrompt.includes('updo')) {
    if (tags.includes('face') || textCorpus.includes('hair')) score += 15;
  }

  // Secondary Preference: User-Approved & Failed Edit Memory synergy (capped so visual relevance dominates)
  const memoryAdjustment = scoreMemorySynergy(item, prompt, selectedIds, activeSegment);
  score += memoryAdjustment;

  return Math.max(0, score);
}

const IDB_NAME = 'DressingRoomDB';
const IDB_STORE_IDENTITY = 'identity_references';
const LOCAL_STORAGE_KEY = 'dressing_room_identity_refs_v1';
const SELECTED_IDS_KEY = 'dressing_room_selected_identity_ids_v1';

/**
 * Opens or upgrades IndexedDB to support identity_references store
 */
function openIdentityDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('saved_looks')) {
        db.createObjectStore('saved_looks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_IDENTITY)) {
        db.createObjectStore(IDB_STORE_IDENTITY, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * Loads all saved identity references
 * @returns {Promise<Array<object>>}
 */
export async function getIdentityReferences() {
  try {
    const db = await openIdentityDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_IDENTITY)) {
      const items = await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE_IDENTITY, 'readonly');
        const store = tx.objectStore(IDB_STORE_IDENTITY);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });

      if (items.length > 0) return items;
    }
  } catch (err) {
    console.warn('IDB identity read error:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('LocalStorage identity read error:', e);
  }

  return [];
}

/**
 * Saves a new or updated identity reference
 * @param {object} item
 * @returns {Promise<object>}
 */
export async function saveIdentityReference(item) {
  const completeItem = {
    id: item.id || `id_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    imageUrl: item.imageUrl || item.dataUrl,
    dataUrl: item.dataUrl || item.imageUrl,
    fileName: item.fileName || 'identity-photo.jpg',
    label: item.label || 'Identity Reference',
    tags: Array.isArray(item.tags) ? item.tags : ['face'],
    notes: item.notes || '',
    createdAt: item.createdAt || Date.now(),
    favorite: Boolean(item.favorite),
  };

  try {
    const db = await openIdentityDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_IDENTITY)) {
      const tx = db.transaction(IDB_STORE_IDENTITY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_IDENTITY);
      store.put(completeItem);
    }
  } catch (err) {
    console.warn('IDB identity put error:', err);
  }

  // Also sync to localStorage
  try {
    const current = await getIdentityReferences();
    const filtered = current.filter((r) => r.id !== completeItem.id);
    const updated = [completeItem, ...filtered];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('LocalStorage identity write error:', e);
  }

  return completeItem;
}

/**
 * Deletes an identity reference by ID
 * @param {string} id
 */
export async function deleteIdentityReference(id) {
  if (!id) return;

  try {
    const db = await openIdentityDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_IDENTITY)) {
      const tx = db.transaction(IDB_STORE_IDENTITY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_IDENTITY);
      store.delete(id);
    }
  } catch (err) {
    console.warn('IDB identity delete error:', err);
  }

  try {
    const current = await getIdentityReferences();
    const updated = current.filter((r) => r.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('LocalStorage identity delete sync error:', e);
  }

  // Remove from selected list if present
  try {
    const selected = getSelectedIdentityIds();
    const updatedSelected = selected.filter((sid) => sid !== id);
    saveSelectedIdentityIds(updatedSelected);
  } catch {
    // Ignore
  }
}

/**
 * Retrieves the currently active selected identity reference IDs (max 4)
 * @returns {Array<string>}
 */
export function getSelectedIdentityIds() {
  try {
    const raw = localStorage.getItem(SELECTED_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 4);
    }
  } catch (e) {
    console.warn('Failed to read selected identity IDs:', e);
  }
  return [];
}

/**
 * Saves selected identity IDs to storage
 * @param {Array<string>} ids
 */
export function saveSelectedIdentityIds(ids) {
  try {
    const sanitized = Array.isArray(ids) ? ids.slice(0, 4) : [];
    localStorage.setItem(SELECTED_IDS_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.warn('Failed to save selected identity IDs:', e);
  }
}

const SEGMENT_WEIGHTS_KEY = 'dressing_room_segment_weights_v1';

/**
 * Retrieves stored segment-specific roles for identity references
 * @returns {Record<string, string>}
 */
export function getSegmentWeights() {
  try {
    const raw = localStorage.getItem(SEGMENT_WEIGHTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Failed to read segment weights:', e);
  }
  return {};
}

/**
 * Saves segment-specific roles for identity references
 * @param {Record<string, string>} weights
 */
export function saveSegmentWeights(weights) {
  try {
    localStorage.setItem(SEGMENT_WEIGHTS_KEY, JSON.stringify(weights || {}));
  } catch (e) {
    console.warn('Failed to save segment weights:', e);
  }
}

/**
 * Retrieves the stored Identity Lock mode preference ('soft' | 'balanced' | 'strict')
 * Defaults to 'balanced'.
 * @returns {string}
 */
export function getIdentityLockMode() {
  try {
    const raw = localStorage.getItem(IDENTITY_LOCK_STORAGE_KEY);
    if (raw && ['soft', 'balanced', 'strict'].includes(raw.toLowerCase().trim())) {
      return raw.toLowerCase().trim();
    }
  } catch (e) {
    console.warn('Failed to read identity lock mode:', e);
  }
  return DEFAULT_IDENTITY_LOCK_MODE;
}

/**
 * Saves Identity Lock mode preference to storage
 * @param {string} mode - 'soft' | 'balanced' | 'strict'
 */
export function saveIdentityLockMode(mode) {
  try {
    const normalized = (mode || '').toLowerCase().trim();
    const valid = ['soft', 'balanced', 'strict'].includes(normalized) ? normalized : DEFAULT_IDENTITY_LOCK_MODE;
    localStorage.setItem(IDENTITY_LOCK_STORAGE_KEY, valid);
    return valid;
  } catch (e) {
    console.warn('Failed to save identity lock mode:', e);
    return DEFAULT_IDENTITY_LOCK_MODE;
  }
}

