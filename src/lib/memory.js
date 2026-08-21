/**
 * Successful Edit Memory System
 * 
 * Lightweight memory store that records user-approved successful generations ("Looks like me").
 * Remembers which references, roles, and combinations worked well for specific edit contexts
 * so future automatic selections can apply a secondary preference while keeping the user
 * in complete manual control.
 * 
 * NOTE: This is NOT model training, LoRA, biometric scoring, or facial recognition.
 * The user is the single source of truth. No large image blobs are duplicated.
 */

const IDB_NAME = 'DressingRoomDB';
const IDB_STORE_MEMORY = 'edit_success_memory';
const LOCAL_STORAGE_MEMORY_KEY = 'dressing_room_success_memory_v1';
const LOCAL_STORAGE_REF_STATS_KEY = 'dressing_room_ref_success_stats_v1';

export const FINE_GRAINED_SEGMENTS = [
  { id: 'face', label: 'Face Features', description: 'Eyes, nose, lips, jawline & expression' },
  { id: 'hair', label: 'Hair & Hairline', description: 'Texture, hairstyle & hairline shape' },
  { id: 'body', label: 'Body Silhouette', description: 'Natural posture, proportions & framing' },
  { id: 'complexion', label: 'Skin & Complexion', description: 'Natural skin tone, lighting & texture' },
];

/**
 * Opens or upgrades IndexedDB to support edit_success_memory store
 */
function openMemoryDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    // Version 3 includes edit_success_memory
    const request = window.indexedDB.open(IDB_NAME, 3);
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
    console.warn('IDB memory read error:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('LocalStorage memory read error:', e);
  }

  return [];
}

/**
 * Retrieves reference success statistics aggregated across all approved edits.
 * @returns {Record<string, { approvedCount: number, approvedKeywords: string[], coOccurredWith: Record<string, number>, lastApprovedAt: number }>}
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
 * Re-aggregates and saves stats from all memory records
 * @param {Array<object>} memories 
 */
function syncReferenceStats(memories) {
  const stats = {};

  for (const mem of memories) {
    const refIds = Array.isArray(mem.identityRefIds) ? mem.identityRefIds : [];
    const keywords = Array.isArray(mem.keywords) ? mem.keywords : [];
    const approvedSegments = Array.isArray(mem.approvedSegments) ? mem.approvedSegments : [];
    const segmentWeights = mem.segmentWeights || {};

    for (const refId of refIds) {
      if (!stats[refId]) {
        stats[refId] = {
          approvedCount: 0,
          approvedKeywords: [],
          approvedSegments: {},
          coOccurredWith: {},
          lastApprovedAt: 0,
        };
      }

      stats[refId].approvedCount += 1;
      stats[refId].lastApprovedAt = Math.max(stats[refId].lastApprovedAt, mem.timestamp || 0);

      // Record approved segment tallies
      approvedSegments.forEach((seg) => {
        stats[refId].approvedSegments[seg] = (stats[refId].approvedSegments[seg] || 0) + 1;
      });

      // If the reference was assigned a specific segment role in an approved generation, record it
      const assignedRole = segmentWeights[refId];
      if (assignedRole && assignedRole !== 'auto') {
        stats[refId].approvedSegments[assignedRole] = (stats[refId].approvedSegments[assignedRole] || 0) + 1;
      }

      // Merge keywords
      const existingKw = new Set(stats[refId].approvedKeywords);
      keywords.forEach((kw) => existingKw.add(kw));
      stats[refId].approvedKeywords = Array.from(existingKw).slice(0, 20);

      // Track co-occurrences
      for (const otherId of refIds) {
        if (otherId !== refId) {
          stats[refId].coOccurredWith[otherId] = (stats[refId].coOccurredWith[otherId] || 0) + 1;
        }
      }
    }
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_REF_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('Failed to write ref success stats:', e);
  }

  return stats;
}

/**
 * Records an explicit user approval ("Looks like me") for a generated result.
 * Saves lightweight metadata only (no image blobs).
 * 
 * @param {object} params
 * @param {string} params.generationId - Unique ID of the generation
 * @param {string} params.prompt - Original edit prompt
 * @param {string} [params.basePhotoContext] - Context about the base photo (e.g. file name or type)
 * @param {Array<string>} params.identityRefIds - Identity reference IDs used
 * @param {Record<string, string>} [params.segmentWeights] - Segment roles assigned per reference
 * @param {Array<string>} [params.approvedSegments] - Specific parts that worked well (e.g. ['face', 'hair'])
 * @param {boolean} [params.manualOverrides] - Whether user manually configured references
 * @param {boolean} [params.hasOutfitReference] - Whether outfit reference was used
 * @param {Array<string>} [params.identityTags] - Aggregated tags from references used
 * @returns {Promise<object>} The saved memory record
 */
export async function recordSuccessfulEdit({
  generationId,
  prompt = '',
  basePhotoContext = '',
  identityRefIds = [],
  segmentWeights = {},
  approvedSegments = [],
  manualOverrides = false,
  hasOutfitReference = false,
  identityTags = [],
}) {
  const memoryRecord = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    generationId: generationId || `gen_${Date.now()}`,
    prompt: (prompt || '').trim(),
    keywords: extractEditKeywords(prompt),
    basePhotoContext: basePhotoContext || 'Uploaded photo',
    identityRefIds: Array.isArray(identityRefIds) ? identityRefIds : [],
    segmentWeights: segmentWeights || {},
    approvedSegments: Array.isArray(approvedSegments) ? approvedSegments : [],
    manualOverrides: Boolean(manualOverrides),
    hasOutfitReference: Boolean(hasOutfitReference),
    identityTags: Array.isArray(identityTags) ? identityTags : [],
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
    console.warn('IDB memory put error:', err);
  }

  // Sync to LocalStorage list
  let updatedMemories = [memoryRecord];
  try {
    const current = await getSuccessfulEditsMemory();
    const filtered = current.filter((m) => m.generationId !== memoryRecord.generationId);
    updatedMemories = [memoryRecord, ...filtered];
    localStorage.setItem(LOCAL_STORAGE_MEMORY_KEY, JSON.stringify(updatedMemories));
  } catch (e) {
    console.warn('LocalStorage memory write error:', e);
  }

  // Update aggregated reference statistics
  syncReferenceStats(updatedMemories);

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
    console.warn('IDB segment update error:', err);
  }

  // Update LocalStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_MEMORY_KEY, JSON.stringify(current));
    syncReferenceStats(current);
  } catch (e) {
    console.warn('LocalStorage segment update error:', e);
  }
}

/**
 * Deletes a memory record by memory id or generation id.
 * @param {string} memoryOrGenId 
 */
export async function deleteSuccessfulEdit(memoryOrGenId) {
  if (!memoryOrGenId) return;

  try {
    const db = await openMemoryDB();
    if (db && db.objectStoreNames.contains(IDB_STORE_MEMORY)) {
      const tx = db.transaction(IDB_STORE_MEMORY, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MEMORY);
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
    console.warn('IDB memory delete error:', err);
  }

  try {
    const current = await getSuccessfulEditsMemory();
    const updated = current.filter((m) => m.id !== memoryOrGenId && m.generationId !== memoryOrGenId);
    localStorage.setItem(LOCAL_STORAGE_MEMORY_KEY, JSON.stringify(updated));
    syncReferenceStats(updated);
  } catch (e) {
    console.warn('LocalStorage memory remove sync error:', e);
  }
}

/**
 * Removes an approved status for a generation (if user toggles it off).
 * @param {string} generationId 
 */
export async function unrecordSuccessfulEdit(generationId) {
  return deleteSuccessfulEdit(generationId);
}

/**
 * Checks if a specific generation ID has been marked as approved.
 * @param {string} generationId 
 * @returns {Promise<boolean>}
 */
export async function isGenerationApproved(generationId) {
  if (!generationId) return false;
  const list = await getSuccessfulEditsMemory();
  return list.some((m) => m.generationId === generationId);
}

/**
 * Computes a subtle historical success bonus score for reference recommendation.
 * 
 * Rules:
 * - Current visual relevance is ALWAYS primary.
 * - Historical success provides a gentle secondary preference boost (+3 to +12 points max).
 * - Never overrides explicit user manual choices.
 * - Promotes diversity so the same reference isn't monopolized if not relevant.
 * 
 * @param {object} item - The identity reference item
 * @param {string} prompt - Current edit prompt
 * @param {Array<string>} currentSelectedIds - Currently selected identity reference IDs
 * @param {string} activeSegment - Active anatomical segment focus
 * @returns {number} Score bonus (0 to 12)
 */
export function scoreMemorySynergy(item, prompt = '', currentSelectedIds = [], activeSegment = 'auto') {
  if (!item || !item.id) return 0;
  const stats = getAllReferenceSuccessStats();
  const refStat = stats[item.id];
  if (!refStat || refStat.approvedCount <= 0) return 0;

  let bonus = 0;

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

  // Cap total bonus so visual relevance remains authoritative
  return Math.min(12, Math.round(bonus));
}

/**
 * Generates human-readable memory insights for Gemini Assistant workspace context.
 * Explains which references worked well for similar past edits.
 * 
 * @param {Array<object>} memories 
 * @param {Array<object>} references 
 * @param {string} currentPrompt 
 * @returns {string}
 */
export function generateMemoryInsightsSummary(memories = [], references = [], currentPrompt = '') {
  if (!Array.isArray(memories) || memories.length === 0) {
    return 'No previous approved edits recorded yet. As you mark results with "Looks like me", the system remembers which references work best.';
  }

  const promptKeywords = extractEditKeywords(currentPrompt);
  const refMap = new Map((references || []).map((r) => [r.id, r.label || 'Photo']));

  // Find similar approved edits
  const similarMemories = memories.filter((m) => {
    if (promptKeywords.length === 0) return true;
    const memKw = Array.isArray(m.keywords) ? m.keywords : [];
    return promptKeywords.some((kw) => memKw.includes(kw));
  });

  const topSample = (similarMemories.length > 0 ? similarMemories : memories).slice(0, 3);
  const lines = topSample.map((m) => {
    const refNames = (m.identityRefIds || []).map((id) => refMap.get(id) || id).join(' + ');
    const editDesc = m.prompt ? `"${m.prompt.slice(0, 40)}${m.prompt.length > 40 ? '...' : ''}"` : 'Outfit edit';
    return `- ${editDesc} (Approved: ${refNames || 'Identity references'})`;
  });

  return `${memories.length} total user-approved edit(s) in memory.\nRecent successful patterns:\n${lines.join('\n')}`;
}
