/**
 * Successful & Failed Edit Memory System
 * 
 * Lightweight memory store that records:
 * 1. User-approved successful generations ("Looks like me")
 * 2. User-reported failed generations ("Doesn't look like me") with specific failure reasons
 * 
 * Purpose:
 * Remembers which references, roles, combinations, and prompt strategies work well or fail
 * for specific edit contexts so future automatic selections and prompt planning can
 * avoid repeating past mistakes while keeping the user in complete manual control.
 * 
 * NOTE: This is NOT model training, LoRA, biometric scoring, or facial recognition.
 * The user is the single source of truth. No large image blobs are duplicated.
 */

const IDB_NAME = 'DressingRoomDB';
const IDB_STORE_MEMORY = 'edit_success_memory';
const IDB_STORE_FAILURE_MEMORY = 'edit_failure_memory';
const LOCAL_STORAGE_MEMORY_KEY = 'dressing_room_success_memory_v1';
const LOCAL_STORAGE_REF_STATS_KEY = 'dressing_room_ref_success_stats_v1';
const LOCAL_STORAGE_FAILURE_MEMORY_KEY = 'dressing_room_failure_memory_v1';
const LOCAL_STORAGE_REF_FAILURE_STATS_KEY = 'dressing_room_ref_failure_stats_v1';

export const FINE_GRAINED_SEGMENTS = [
  { id: 'face', label: 'Face Features', description: 'Eyes, nose, lips, jawline & expression' },
  { id: 'hair', label: 'Hair & Hairline', description: 'Texture, hairstyle & hairline shape' },
  { id: 'body', label: 'Body Silhouette', description: 'Natural posture, proportions & framing' },
  { id: 'complexion', label: 'Skin & Complexion', description: 'Natural skin tone, lighting & texture' },
];

export const FAILURE_REASONS = [
  { id: 'face_changed', label: 'Face changed', description: 'Facial structure, eyes, nose, lips, or expression altered' },
  { id: 'body_proportions_changed', label: 'Body proportions changed', description: 'Silhouette, curves, or height warped or slimmed' },
  { id: 'hair_changed', label: 'Hair changed', description: 'Hairstyle, texture, or hairline shape altered' },
  { id: 'skin_tone_changed', label: 'Skin tone changed', description: 'Complexion or undertones altered or lightened' },
  { id: 'pose_changed', label: 'Pose changed', description: 'Posture, arm, or hand position shifted' },
  { id: 'framing_changed', label: 'Framing changed', description: 'Camera angle, distance, or zoom shifted' },
  { id: 'background_changed', label: 'Background changed', description: 'Room, architecture, or environment altered' },
  { id: 'outfit_ignored', label: 'Outfit was ignored', description: 'Requested garment style or reference was not respected' },
  { id: 'accessories_changed', label: 'Hands/accessories changed', description: 'Phone, jewelry, or unique items changed' },
  { id: 'too_generic', label: 'Too generic / beautified', description: 'Identity altered into generic AI look' },
  { id: 'other', label: 'Other', description: 'Other issue with identity or visual execution' },
];

/**
 * Opens or upgrades IndexedDB to support edit_success_memory and edit_failure_memory stores
 */
function openMemoryDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    // Version 4 includes edit_success_memory & edit_failure_memory
    const request = window.indexedDB.open(IDB_NAME, 4);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('saved_looks')) {
        db.createObjectStore('saved_looks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('identity_references')) {
        db.createObjectStore('identity_references', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_MEMORY)) {
        db.createObjectStore(IDB_STORE_MEMORY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_FAILURE_MEMORY)) {
        db.createObjectStore(IDB_STORE_FAILURE_MEMORY, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * Extracts simple normalized keywords from an edit prompt for lightweight matching.
 * e.g. "red evening dress in ballroom" -> ["dress", "evening", "ballroom"]
 */
export function extractEditKeywords(prompt = '') {
  if (!prompt || typeof prompt !== 'string') return [];
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'and', 'or',
    'make', 'change', 'edit', 'wear', 'wearing', 'photo', 'style', 'dress', 'me', 'up',
    'look', 'into', 'put', 'this', 'that', 'from', 'is', 'are', 'be', 'my', 'her', 'his'
  ]);

  const clean = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  return Array.from(new Set(clean)).slice(0, 10);
}

/**
 * Retrieves all stored successful edit memories.
 * @returns {Promise<Array<object>>}
 */
export async function getSuccessfulEditsMemory() {
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_MEMORY)) {
      const items = await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE_MEMORY, 'readonly');
        const store = tx.objectStore(IDB_STORE_MEMORY);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });

      if (items.length > 0) return items;
    }
  } catch (err) {
    console.warn('IDB success memory read error:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('LocalStorage success memory read error:', e);
  }

  return [];
}

/**
 * Retrieves reference success statistics aggregated across all approved edits.
 * @returns {Record<string, { approvedCount: number, successfulKeywords: string[], successfulRoles: Record<string, number>, lastApprovedAt: number }>}
 */
export function getAllReferenceSuccessStats() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_REF_STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Failed to read ref success stats:', e);
  }
  return {};
}

/**
 * Re-aggregates and saves success stats from all memory records
 * @param {Array<object>} memories 
 */
export function syncReferenceSuccessStats(memories) {
  const stats = {};

  for (const mem of memories) {
    const refIds = Array.isArray(mem.identityRefIds) ? mem.identityRefIds : [];
    const keywords = Array.isArray(mem.keywords) ? mem.keywords : [];
    const roles = mem.segmentWeights || {};

    for (const refId of refIds) {
      if (!stats[refId]) {
        stats[refId] = {
          approvedCount: 0,
          successfulKeywords: [],
          successfulRoles: {},
          lastApprovedAt: 0,
        };
      }

      stats[refId].approvedCount += 1;
      stats[refId].lastApprovedAt = Math.max(stats[refId].lastApprovedAt, mem.timestamp || 0);

      // Record role used
      const assignedRole = roles[refId] || 'auto';
      stats[refId].successfulRoles[assignedRole] = (stats[refId].successfulRoles[assignedRole] || 0) + 1;

      // Merge keywords
      const existingKw = new Set(stats[refId].successfulKeywords);
      keywords.forEach((kw) => existingKw.add(kw));
      stats[refId].successfulKeywords = Array.from(existingKw).slice(0, 20);
    }
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_REF_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('Failed to write ref stats:', e);
  }

  return stats;
}

/**
 * Records an explicit user approval ("Looks like me") for a generated result.
 * Saves lightweight metadata only (no duplicate image blobs).
 * 
 * @param {object} params
 * @param {string} params.generationId - Unique ID of the generation
 * @param {string} params.prompt - Original edit prompt
 * @param {string} [params.finalInstruction] - Prompt Intelligence refined instruction
 * @param {string} [params.basePhotoContext] - Context about the base photo
 * @param {Array<string>} params.identityRefIds - Identity reference IDs used
 * @param {Record<string, string>} [params.segmentWeights] - Segment roles assigned per reference
 * @param {Array<string>} [params.approvedSegments] - Specific fine-grained segments user approved
 * @param {boolean} [params.manualOverrides] - Whether user manually configured references
 * @param {boolean} [params.hasOutfitReference] - Whether outfit reference was used
 * @param {Array<string>} [params.identityTags] - Aggregated tags from references used
 * @param {boolean} [params.usedSearch] - Whether search was used
 * @param {object} [params.searchDetails] - Search query/details
 * @param {string} [params.planSummary] - Prompt plan summary or ID
 * @returns {Promise<object>} The saved memory record
 */
export async function recordSuccessfulEdit({
  generationId,
  prompt = '',
  finalInstruction = '',
  basePhotoContext = '',
  identityRefIds = [],
  segmentWeights = {},
  approvedSegments = [],
  manualOverrides = false,
  hasOutfitReference = false,
  identityTags = [],
  usedSearch = false,
  searchDetails = null,
  planSummary = '',
}) {
  const memoryRecord = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    generationId: generationId || `gen_${Date.now()}`,
    prompt: (prompt || '').trim(),
    keywords: extractEditKeywords(prompt),
    finalInstruction: (finalInstruction || '').trim(),
    basePhotoContext: basePhotoContext || 'Uploaded photo',
    identityRefIds: Array.isArray(identityRefIds) ? identityRefIds : [],
    segmentWeights: segmentWeights || {},
    approvedSegments: Array.isArray(approvedSegments) ? approvedSegments : [],
    manualOverrides: Boolean(manualOverrides),
    hasOutfitReference: Boolean(hasOutfitReference),
    identityTags: Array.isArray(identityTags) ? identityTags : [],
    usedSearch: Boolean(usedSearch),
    searchDetails: searchDetails || null,
    planSummary: planSummary || '',
    timestamp: Date.now(),
  };

  // Save to IndexedDB
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEMORY);
      store.put(memoryRecord);
    }
  } catch (err) {
    console.warn('IDB success memory put error:', err);
  }

  // Sync to LocalStorage list
  let updatedMemories = [memoryRecord];
  try {
    const current = await getSuccessfulEditsMemory();
    const filtered = current.filter((m) => m.generationId !== memoryRecord.generationId);
    updatedMemories = [memoryRecord, ...filtered];
    localStorage.setItem(LOCAL_STORAGE_MEMORY_KEY, JSON.stringify(updatedMemories));
  } catch (e) {
    console.warn('LocalStorage success memory write error:', e);
  }

  // Update aggregated reference success statistics
  syncReferenceSuccessStats(updatedMemories);

  return memoryRecord;
}

/**
 * Updates fine-grained approved segments for an existing memory record.
 * @param {string} generationId 
 * @param {Array<string>} approvedSegments 
 */
export async function updateApprovedSegments(generationId, approvedSegments = []) {
  if (!generationId) return;
  const current = await getSuccessfulEditsMemory();
  const target = current.find((m) => m.generationId === generationId);
  if (!target) return;

  target.approvedSegments = Array.isArray(approvedSegments) ? approvedSegments : [];

  // Update IDB
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEMORY);
      store.put(target);
    }
  } catch (err) {
    console.warn('IDB memory segment update error:', err);
  }

  // Update LocalStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_MEMORY_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('LocalStorage memory segment update error:', e);
  }
}

/**
 * Deletes a successful edit memory record by memory ID or generation ID.
 * @param {string} memoryOrGenId 
 */
export async function deleteSuccessfulEdit(memoryOrGenId) {
  if (!memoryOrGenId) return;

  // IDB removal
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEMORY);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        for (const item of items) {
          if (item.id === memoryOrGenId || item.generationId === memoryOrGenId) {
            store.delete(item.id);
          }
        }
      };
    }
  } catch (err) {
    console.warn('IDB memory delete error:', err);
  }

  // LocalStorage removal
  try {
    const current = await getSuccessfulEditsMemory();
    const updated = current.filter(
      (m) => m.id !== memoryOrGenId && m.generationId !== memoryOrGenId
    );
    localStorage.setItem(LOCAL_STORAGE_MEMORY_KEY, JSON.stringify(updated));
    syncReferenceSuccessStats(updated);
  } catch (e) {
    console.warn('LocalStorage memory delete error:', e);
  }
}

/**
 * Unrecords an approval by generation ID.
 * @param {string} generationId 
 */
export async function unrecordSuccessfulEdit(generationId) {
  return deleteSuccessfulEdit(generationId);
}

/**
 * Checks if a specific generation ID has been approved ("Looks like me").
 * @param {string} generationId 
 * @returns {Promise<boolean>}
 */
export async function isGenerationApproved(generationId) {
  if (!generationId) return false;
  const list = await getSuccessfulEditsMemory();
  return list.some((m) => m.generationId === generationId);
}

/**
 * Retrieves the memory record for a specific generation ID.
 * @param {string} generationId 
 * @returns {Promise<object|null>}
 */
export async function getGenerationMemoryData(generationId) {
  if (!generationId) return null;
  const list = await getSuccessfulEditsMemory();
  return list.find((m) => m.generationId === generationId) || null;
}

/**
 * Retrieves all stored failed edit memories.
 * @returns {Promise<Array<object>>}
 */
export async function getFailedEditsMemory() {
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_FAILURE_MEMORY)) {
      const items = await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE_FAILURE_MEMORY, 'readonly');
        const store = tx.objectStore(IDB_STORE_FAILURE_MEMORY);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });

      if (items.length > 0) return items;
    }
  } catch (err) {
    console.warn('IDB failure memory read error:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FAILURE_MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('LocalStorage failure memory read error:', e);
  }

  return [];
}

/**
 * Retrieves reference failure statistics aggregated across all rejected edits.
 * @returns {Record<string, { rejectedCount: number, failureReasons: Record<string, number>, rejectedKeywords: string[], lastRejectedAt: number }>}
 */
export function getAllReferenceFailureStats() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_REF_FAILURE_STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Failed to read ref failure stats:', e);
  }
  return {};
}

/**
 * Re-aggregates and saves failure stats from all failure memory records
 * @param {Array<object>} failedMemories 
 */
export function syncReferenceFailureStats(failedMemories) {
  const stats = {};

  for (const mem of failedMemories) {
    const refIds = Array.isArray(mem.identityRefIds) ? mem.identityRefIds : [];
    const keywords = Array.isArray(mem.keywords) ? mem.keywords : [];
    const reasons = Array.isArray(mem.failureReasons) ? mem.failureReasons : [];

    for (const refId of refIds) {
      if (!stats[refId]) {
        stats[refId] = {
          rejectedCount: 0,
          failureReasons: {},
          rejectedKeywords: [],
          lastRejectedAt: 0,
        };
      }

      stats[refId].rejectedCount += 1;
      stats[refId].lastRejectedAt = Math.max(stats[refId].lastRejectedAt, mem.timestamp || 0);

      // Record failure reasons
      reasons.forEach((reason) => {
        stats[refId].failureReasons[reason] = (stats[refId].failureReasons[reason] || 0) + 1;
      });

      // Merge keywords
      const existingKw = new Set(stats[refId].rejectedKeywords);
      keywords.forEach((kw) => existingKw.add(kw));
      stats[refId].rejectedKeywords = Array.from(existingKw).slice(0, 20);
    }
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_REF_FAILURE_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('Failed to write ref failure stats:', e);
  }

  return stats;
}

/**
 * Records an explicit user rejection ("Doesn't look like me") for a generated result.
 * Saves lightweight metadata only (no duplicate image blobs).
 * 
 * @param {object} params
 * @param {string} params.generationId - Unique ID of the generation
 * @param {string} params.prompt - Original edit prompt
 * @param {string} [params.basePhotoContext] - Context about the base photo
 * @param {Array<string>} params.identityRefIds - Identity reference IDs used
 * @param {Record<string, string>} [params.segmentWeights] - Segment roles assigned per reference
 * @param {Array<string>} [params.failureReasons] - User-selected failure reasons
 * @param {string} [params.userNote] - Optional user note
 * @param {boolean} [params.manualOverrides] - Whether user manually configured references
 * @param {boolean} [params.hasOutfitReference] - Whether outfit reference was used
 * @param {Array<string>} [params.identityTags] - Aggregated tags from references used
 * @param {boolean} [params.usedSearch] - Whether search was used
 * @param {object} [params.searchDetails] - Search query/details
 * @param {string} [params.planSummary] - Prompt plan summary or ID
 * @returns {Promise<object>} The saved failure record
 */
export async function recordFailedEdit({
  generationId,
  prompt = '',
  basePhotoContext = '',
  identityRefIds = [],
  segmentWeights = {},
  failureReasons = [],
  userNote = '',
  manualOverrides = false,
  hasOutfitReference = false,
  identityTags = [],
  usedSearch = false,
  searchDetails = null,
  planSummary = '',
}) {
  const failureRecord = {
    id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    generationId: generationId || `gen_${Date.now()}`,
    prompt: (prompt || '').trim(),
    keywords: extractEditKeywords(prompt),
    basePhotoContext: basePhotoContext || 'Uploaded photo',
    identityRefIds: Array.isArray(identityRefIds) ? identityRefIds : [],
    segmentWeights: segmentWeights || {},
    failureReasons: Array.isArray(failureReasons) ? failureReasons : [],
    userNote: (userNote || '').trim(),
    manualOverrides: Boolean(manualOverrides),
    hasOutfitReference: Boolean(hasOutfitReference),
    identityTags: Array.isArray(identityTags) ? identityTags : [],
    usedSearch: Boolean(usedSearch),
    searchDetails: searchDetails || null,
    planSummary: planSummary || '',
    timestamp: Date.now(),
  };

  // Save to IndexedDB
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_FAILURE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_FAILURE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_FAILURE_MEMORY);
      store.put(failureRecord);
    }
  } catch (err) {
    console.warn('IDB failure memory put error:', err);
  }

  // Sync to LocalStorage list
  let updatedMemories = [failureRecord];
  try {
    const current = await getFailedEditsMemory();
    const filtered = current.filter((m) => m.generationId !== failureRecord.generationId);
    updatedMemories = [failureRecord, ...filtered];
    localStorage.setItem(LOCAL_STORAGE_FAILURE_MEMORY_KEY, JSON.stringify(updatedMemories));
  } catch (e) {
    console.warn('LocalStorage failure memory write error:', e);
  }

  // Update aggregated reference failure statistics
  syncReferenceFailureStats(updatedMemories);

  return failureRecord;
}

/**
 * Updates failure reasons and optional note for an existing failure record.
 * @param {string} generationId 
 * @param {Array<string>} failureReasons 
 * @param {string} [userNote]
 */
export async function updateFailedEditReasons(generationId, failureReasons = [], userNote = '') {
  if (!generationId) return;
  const current = await getFailedEditsMemory();
  const target = current.find((m) => m.generationId === generationId);
  if (!target) return;

  target.failureReasons = Array.isArray(failureReasons) ? failureReasons : [];
  if (userNote !== undefined) target.userNote = (userNote || '').trim();

  // Update IDB
  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_FAILURE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_FAILURE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_FAILURE_MEMORY);
      store.put(target);
    }
  } catch (err) {
    console.warn('IDB failure reasons update error:', err);
  }

  // Update LocalStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_FAILURE_MEMORY_KEY, JSON.stringify(current));
    syncReferenceFailureStats(current);
  } catch (e) {
    console.warn('LocalStorage failure reasons update error:', e);
  }
}

/**
 * Deletes a failure memory record by memory id or generation id.
 * @param {string} memoryOrGenId 
 */
export async function deleteFailedEdit(memoryOrGenId) {
  if (!memoryOrGenId) return;

  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_FAILURE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_FAILURE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_FAILURE_MEMORY);
      const all = await new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      const match = all.find((m) => m.id === memoryOrGenId || m.generationId === memoryOrGenId);
      if (match) {
        store.delete(match.id);
      }
    }
  } catch (err) {
    console.warn('IDB failure memory delete error:', err);
  }

  try {
    const current = await getFailedEditsMemory();
    const updated = current.filter((m) => m.id !== memoryOrGenId && m.generationId !== memoryOrGenId);
    localStorage.setItem(LOCAL_STORAGE_FAILURE_MEMORY_KEY, JSON.stringify(updated));
    syncReferenceFailureStats(updated);
  } catch (e) {
    console.warn('LocalStorage failure memory remove sync error:', e);
  }
}

/**
 * Removes a failure record for a generation (if user untoggles it).
 * @param {string} generationId 
 */
export async function unrecordFailedEdit(generationId) {
  return deleteFailedEdit(generationId);
}

/**
 * Checks if a specific generation ID has been marked as rejected ("Doesn't look like me").
 * @param {string} generationId 
 * @returns {Promise<boolean>}
 */
export async function isGenerationRejected(generationId) {
  if (!generationId) return false;
  const list = await getFailedEditsMemory();
  return list.some((m) => m.generationId === generationId);
}

/**
 * Retrieves the rejection record for a specific generation ID.
 * @param {string} generationId 
 * @returns {Promise<object|null>}
 */
export async function getGenerationRejectionData(generationId) {
  if (!generationId) return null;
  const list = await getFailedEditsMemory();
  return list.find((m) => m.generationId === generationId) || null;
}

/**
 * Computes a subtle historical failure penalty for reference recommendation.
 * 
 * Rules:
 * - Current visual relevance is ALWAYS primary.
 * - Prior failures act as a gentle secondary negative signal (-1 to -6 points max).
 * - One bad result NEVER permanently blacklists a reference.
 * - Manual user selections ALWAYS override automatic avoidance.
 * 
 * @param {object} item - The identity reference item
 * @param {string} prompt - Current edit prompt
 * @param {string} activeSegment - Active anatomical segment focus
 * @returns {number} Failure penalty score (0 to 6)
 */
export function scoreFailurePenalty(item, prompt = '', activeSegment = 'auto') {
  if (!item || !item.id) return 0;
  const failureStats = getAllReferenceFailureStats();
  const refFail = failureStats[item.id];
  if (!refFail || refFail.rejectedCount <= 0) return 0;

  let penalty = 0;

  // 1. Mild baseline penalty for repeated rejection (capped at 3)
  penalty += Math.min(3, refFail.rejectedCount * 0.75);

  // 2. Keyword matching with previous failed contexts (e.g. mirror selfie, full body)
  const currentKeywords = extractEditKeywords(prompt);
  if (currentKeywords.length > 0 && Array.isArray(refFail.rejectedKeywords)) {
    const sharedKw = currentKeywords.filter((kw) => refFail.rejectedKeywords.includes(kw));
    if (sharedKw.length > 0) {
      penalty += Math.min(2, sharedKw.length * 1);
    }
  }

  // 3. Segment-specific failure reason alignment
  if (refFail.failureReasons) {
    if (activeSegment === 'face' && refFail.failureReasons['face_changed']) {
      penalty += 1.5;
    }
    if (activeSegment === 'body' && refFail.failureReasons['body_proportions_changed']) {
      penalty += 1.5;
    }
    if (activeSegment === 'hair' && refFail.failureReasons['hair_changed']) {
      penalty += 1.5;
    }
  }

  // Cap total penalty to 6 so visual relevance (up to +35) easily overcomes it when relevant
  return Math.min(6, Math.round(penalty));
}

/**
 * Computes historical memory synergy (combines positive success bonus and subtle failure penalty).
 * 
 * Rules:
 * - Current visual relevance is ALWAYS primary.
 * - Success bonus (+3 to +12)
 * - Failure penalty (-1 to -6)
 * - Never permanently blacklists any reference.
 * - Never overrides explicit user manual choices.
 * 
 * @param {object} item - The identity reference item
 * @param {string} prompt - Current edit prompt
 * @param {Array<string>} currentSelectedIds - Currently selected identity reference IDs
 * @param {string} activeSegment - Active anatomical segment focus
 * @returns {number} Score adjustment (-6 to +12)
 */
export function scoreMemorySynergy(item, prompt = '', currentSelectedIds = [], activeSegment = 'auto') {
  if (!item || !item.id) return 0;

  let bonus = 0;
  const successStats = getAllReferenceSuccessStats();
  const refStat = successStats[item.id];

  if (refStat && refStat.approvedCount > 0) {
    // 1. Gentle baseline boost for proven fidelity in user-approved edits (capped at +5)
    bonus += Math.min(5, refStat.approvedCount * 1.5);

    // 2. Keyword synergy with prior successful edits (+2 to +4)
    const currentKeywords = extractEditKeywords(prompt);
    if (currentKeywords.length > 0 && Array.isArray(refStat.approvedKeywords)) {
      const sharedKw = currentKeywords.filter((kw) => refStat.approvedKeywords.includes(kw));
      if (sharedKw.length > 0) {
        bonus += Math.min(4, sharedKw.length * 2);
      }
    }

    // 3. Segment endorsement synergy (+3)
    if (activeSegment && activeSegment !== 'auto' && refStat.approvedSegments) {
      const segCount = refStat.approvedSegments[activeSegment] || 0;
      if (segCount > 0) {
        bonus += Math.min(4, segCount * 2);
      }
    }

    // 4. Co-occurrence synergy with already-selected references (+3)
    if (Array.isArray(currentSelectedIds) && currentSelectedIds.length > 0 && refStat.coOccurredWith) {
      const hasCoOccurred = currentSelectedIds.some((otherId) => {
        return otherId !== item.id && (refStat.coOccurredWith[otherId] || 0) > 0;
      });
      if (hasCoOccurred) {
        bonus += 3;
      }
    }
  }

  // Calculate subtle failure penalty
  const penalty = scoreFailurePenalty(item, prompt, activeSegment);

  const netAdjustment = bonus - penalty;
  return Math.max(-6, Math.min(12, Math.round(netAdjustment)));
}

/**
 * Extracts top recurring failure patterns across all failed edit records.
 * Used by Prompt Intelligence to apply targeted corrective guidance.
 * 
 * @param {Array<object>} failedMemories 
 * @returns {Array<{ reason: string, count: number, label: string }>}
 */
export function getTopFailurePatterns(failedMemories = []) {
  if (!Array.isArray(failedMemories) || failedMemories.length === 0) return [];

  const counts = {};
  for (const mem of failedMemories) {
    const reasons = Array.isArray(mem.failureReasons) ? mem.failureReasons : [];
    for (const r of reasons) {
      counts[r] = (counts[r] || 0) + 1;
    }
  }

  const reasonMap = new Map(FAILURE_REASONS.map((fr) => [fr.id, fr.label]));

  return Object.entries(counts)
    .map(([reason, count]) => ({
      reason,
      count,
      label: reasonMap.get(reason) || reason,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Generates human-readable memory insights for Gemini Assistant workspace context.
 * Explains both successful patterns and user-reported failure patterns.
 * 
 * @param {Array<object>} successfulMemories 
 * @param {Array<object>} failedMemories 
 * @param {Array<object>} references 
 * @param {string} currentPrompt 
 * @returns {string}
 */
export function generateMemoryInsightsSummary(
  successfulMemories = [],
  failedMemories = [],
  references = [],
  currentPrompt = ''
) {
  const hasSuccess = Array.isArray(successfulMemories) && successfulMemories.length > 0;
  const hasFailures = Array.isArray(failedMemories) && failedMemories.length > 0;

  if (!hasSuccess && !hasFailures) {
    return 'No previous edit feedback recorded yet. As you mark results with "Looks like me" or "Doesn\'t look like me", the system learns what preserves your look best.';
  }

  const sections = [];
  const refMap = new Map((references || []).map((r) => [r.id, r.label || 'Photo']));
  const promptKeywords = extractEditKeywords(currentPrompt);

  if (hasSuccess) {
    const similarMemories = successfulMemories.filter((m) => {
      if (promptKeywords.length === 0) return true;
      const memKw = Array.isArray(m.keywords) ? m.keywords : [];
      return promptKeywords.some((kw) => memKw.includes(kw));
    });

    const topSample = (similarMemories.length > 0 ? similarMemories : successfulMemories).slice(0, 2);
    const lines = topSample.map((m) => {
      const refNames = (m.identityRefIds || []).map((id) => refMap.get(id) || id).join(' + ');
      const editDesc = m.prompt ? `"${m.prompt.slice(0, 35)}${m.prompt.length > 35 ? '...' : ''}"` : 'Outfit edit';
      return `  - ${editDesc} (Approved: ${refNames || 'References'})`;
    });

    sections.push(`${successfulMemories.length} approved edit(s) in memory.\nSuccessful patterns:\n${lines.join('\n')}`);
  }

  if (hasFailures) {
    const topPatterns = getTopFailurePatterns(failedMemories).slice(0, 3);
    const patternSummary = topPatterns.map((p) => `${p.label} (${p.count}x)`).join(', ');
    sections.push(`${failedMemories.length} rejected edit(s) in memory. Reported issues to avoid: ${patternSummary || 'General drift'}`);
  }

  return sections.join('\n');
}
