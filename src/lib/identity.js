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

/**
 * Lightweight Quality / Evidence Labels for Identity References.
 * Signals what kind of evidence the reference photo is most useful for.
 */
export const IDENTITY_QUALITY_LABELS = [
  { id: 'face', label: 'Face', description: 'Clear facial features, eyes, nose & smile' },
  { id: 'body', label: 'Body', description: 'Full outfit, silhouette & body proportions' },
  { id: 'angle', label: 'Angle', description: 'Profile, 3/4 turn, or dynamic pose angle' },
  { id: 'lighting', label: 'Lighting', description: 'Clean or distinct lighting conditions' },
  { id: 'overall identity', label: 'Overall Identity', description: 'General reliable likeness anchor' },
];

/**
 * Automatically detects recommended quality labels from photo metadata, aspect ratio, tags, or image dimensions.
 * @param {object} params
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {Array<string>} [params.tags]
 * @param {string} [params.fileName]
 * @returns {Array<string>} list of suggested quality label IDs
 */
export function detectPhotoQualityLabels({ width, height, tags = [], fileName = '' } = {}) {
  const detected = new Set();
  const lowerName = (fileName || '').toLowerCase();
  const lowerTags = tags.map((t) => t.toLowerCase());

  // Base likeness is always relevant
  detected.add('overall identity');

  const aspectRatio = width && height ? height / width : 1;

  // Aspect ratio & tag heuristics
  // Tall vertical photo (aspectRatio >= 1.45) strongly indicates full body / outfit
  if (aspectRatio >= 1.45 || lowerTags.includes('full body') || lowerTags.includes('mirror selfie') || lowerName.includes('body') || lowerName.includes('outfit') || lowerName.includes('dress') || lowerName.includes('standing')) {
    detected.add('body');
  }

  // Square or slightly portrait (aspectRatio between 0.85 and 1.35) or face tag indicates face / close-up
  if (aspectRatio < 1.35 || lowerTags.includes('face') || lowerTags.includes('close-up') || lowerTags.includes('neutral') || lowerName.includes('face') || lowerName.includes('headshot') || lowerName.includes('portrait') || lowerName.includes('selfie')) {
    detected.add('face');
  }

  // Angle detection
  if (lowerTags.includes('3/4 angle') || lowerTags.includes('profile') || lowerName.includes('angle') || lowerName.includes('profile') || lowerName.includes('side') || lowerName.includes('turn')) {
    detected.add('angle');
  }

  // Lighting detection
  if (lowerTags.includes('bright lighting') || lowerTags.includes('indoor') || lowerTags.includes('outdoor') || lowerTags.includes('glam') || lowerName.includes('light') || lowerName.includes('flash') || lowerName.includes('sun') || lowerName.includes('studio') || lowerName.includes('night')) {
    detected.add('lighting');
  }

  // Fallback defaults if set is empty
  if (detected.size === 0) {
    detected.add('face');
    detected.add('overall identity');
  }

  return Array.from(detected);
}

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

  // Lightweight Quality / Evidence Signals (additional recommendation nudge)
  const qualityLabels = Array.isArray(item.qualityLabels) ? item.qualityLabels : [];
  
  // Overall Identity acts as a general-purpose helpful likeness signal
  if (qualityLabels.includes('overall identity') || qualityLabels.includes('overall')) {
    score += 4;
  }

  // Face quality: close-ups, headshots, face segment, beauty/makeup
  if (qualityLabels.includes('face')) {
    if (activeSegment === 'face' || lowerPrompt.includes('headshot') || lowerPrompt.includes('face') || lowerPrompt.includes('close-up') || lowerPrompt.includes('portrait') || lowerPrompt.includes('makeup') || lowerPrompt.includes('earring') || lowerPrompt.includes('glasses') || lowerPrompt.includes('smile') || lowerPrompt.includes('beauty')) {
      score += 7;
    }
  }

  // Body quality: full-body, outfit changes, garments, silhouette
  if (qualityLabels.includes('body')) {
    if (activeSegment === 'body' || lowerPrompt.includes('dress') || lowerPrompt.includes('gown') || lowerPrompt.includes('suit') || lowerPrompt.includes('pants') || lowerPrompt.includes('coat') || lowerPrompt.includes('shoes') || lowerPrompt.includes('outfit') || lowerPrompt.includes('full body') || lowerPrompt.includes('standing') || lowerPrompt.includes('skirt') || lowerPrompt.includes('jeans')) {
      score += 7;
    }
  }

  // Angle quality: profile, 3/4 turn, looking away, pose angles
  if (qualityLabels.includes('angle')) {
    if (lowerPrompt.includes('profile') || lowerPrompt.includes('3/4') || lowerPrompt.includes('angle') || lowerPrompt.includes('side view') || lowerPrompt.includes('turned') || lowerPrompt.includes('looking away') || lowerPrompt.includes('pose') || lowerPrompt.includes('over shoulder') || activeSegment === 'hair') {
      score += 7;
    }
  }

  // Lighting quality: tricky, atmospheric, or distinct lighting
  if (qualityLabels.includes('lighting')) {
    if (lowerPrompt.includes('light') || lowerPrompt.includes('shadow') || lowerPrompt.includes('golden hour') || lowerPrompt.includes('night') || lowerPrompt.includes('sun') || lowerPrompt.includes('bright') || lowerPrompt.includes('dark') || lowerPrompt.includes('studio') || lowerPrompt.includes('dramatic') || lowerPrompt.includes('neon') || lowerPrompt.includes('flash') || lowerPrompt.includes('moody')) {
      score += 7;
    }
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
    qualityLabels: Array.isArray(item.qualityLabels) ? item.qualityLabels : (Array.isArray(item.quality) ? item.quality : []),
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

