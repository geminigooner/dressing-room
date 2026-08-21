// Client-side API orchestration layer
// Handles file preparation, communication with /api/gemini backend route, and Gallery R2/D1 operations

/**
 * Converts a browser File object to a Gemini inline data part
 * @param {File} file
 * @returns {Promise<{inlineData: {data: string, mimeType: string}, dataUrl: string}>}
 */
export async function fileToPart(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64Data = reader.result.split(',')[1];
        resolve({
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'image/jpeg',
          },
          dataUrl: reader.result,
        });
      } else {
        resolve(null);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Executes photo editing request
 * @param {any} photoPart - Base photo part or file
 * @param {any} garmentPart - Optional garment reference part or file
 * @param {string} prompt - Text prompt describing the desired look
 * @returns {Promise<string|object>} - Image data URL / URL or text response
 */
export async function editPhoto(photoPart, garmentPart, prompt) {
  // If photoPart is a File instance, convert to part
  let resolvedPhoto = photoPart;
  if (typeof File !== 'undefined' && photoPart instanceof File) {
    resolvedPhoto = await fileToPart(photoPart);
  }

  // If garmentPart is a File instance, convert to part
  let resolvedGarment = garmentPart;
  if (typeof File !== 'undefined' && garmentPart instanceof File) {
    resolvedGarment = await fileToPart(garmentPart);
  }

  if (!resolvedPhoto || !resolvedPhoto.inlineData) {
    throw new Error('Please upload a base photo to style.');
  }

  const parts = [];

  // 1. Add base photo
  parts.push({
    inlineData: {
      mimeType: resolvedPhoto.inlineData.mimeType,
      data: resolvedPhoto.inlineData.data,
    },
  });

  // 2. Add outfit reference if provided
  if (resolvedGarment && resolvedGarment.inlineData) {
    parts.push({
      inlineData: {
        mimeType: resolvedGarment.inlineData.mimeType,
        data: resolvedGarment.inlineData.data,
      },
    });
  }

  // 3. Construct structured image-edit instruction
  const userPrompt = prompt && prompt.trim() ? prompt.trim() : '';

  let promptInstruction = '';

  if (resolvedGarment && resolvedGarment.inlineData) {
    promptInstruction = `[TASK: VIRTUAL DRESSING ROOM OUTFIT TRANSFER]
You are an expert AI virtual dressing room stylist. You are provided with two images:
- Image 1 (Base Photo): The original photo of the subject.
- Image 2 (Outfit Reference): Visual reference for the replacement clothing/garment.

Your objective is to replace or dress the clothing of the person in Image 1 using the outfit shown in Image 2.

[CRITICAL PRESERVATION RULES - DEFAULT MANDATES]:
1. IDENTITY & FACE: Strictly preserve the exact identity, facial features, facial structure, skin tone, and expression of the person in Image 1. Do NOT beautify, alter, smooth, or reshape the face.
2. HAIR: Strictly preserve the original hairstyle, hair color, texture, and hairline from Image 1 unless the user explicitly requested a hair change.
3. BODY PROPORTIONS & SILHOUETTE: Strictly preserve the person's exact body shape, proportions, and natural silhouette. Do NOT slim, augment, or alter any body parts.
4. POSE & FRAMING: Strictly maintain the exact same pose, body posture, hand positions, head angle, camera perspective, distance, and framing as Image 1.
5. ENVIRONMENT & LIGHTING: Strictly keep the exact same background, room, environment, shadows, ambient lighting, and color temperature from Image 1.
6. ACCESSORIES & DETAILS: Preserve hands, phone, jewelry, tattoos, and other accessories unless the requested clothing piece directly covers or replaces them.
7. MINIMAL MODIFICATION: Modify ONLY the clothing garments requested. Do not change anything else.

[OUTFIT APPLICATION]:
- Fit the clothing style, fabric, texture, pattern, and colors from Image 2 naturally onto the person in Image 1, adhering accurately to their body shape and pose.
${userPrompt ? `\n[USER SPECIFIC INSTRUCTIONS]:\n"${userPrompt}"\n(Follow these user instructions carefully while maintaining all other preservation rules above.)` : ''}`;
  } else {
    promptInstruction = `[TASK: VIRTUAL DRESSING ROOM OUTFIT EDIT]
You are an expert AI virtual dressing room stylist. You are provided with Image 1 (Base Photo).

Your objective is to edit or style the clothing of the person in Image 1 according to the user's instructions.

[CRITICAL PRESERVATION RULES - DEFAULT MANDATES]:
1. IDENTITY & FACE: Strictly preserve the exact identity, facial features, facial structure, skin tone, and expression of the person in Image 1. Do NOT beautify, alter, smooth, or reshape the face.
2. HAIR: Strictly preserve the original hairstyle, hair color, texture, and hairline from Image 1 unless the user explicitly requested a hair change.
3. BODY PROPORTIONS & SILHOUETTE: Strictly preserve the person's exact body shape, proportions, and natural silhouette. Do NOT slim, augment, or alter any body parts.
4. POSE & FRAMING: Strictly maintain the exact same pose, body posture, hand positions, head angle, camera perspective, distance, and framing as Image 1.
5. ENVIRONMENT & LIGHTING: Strictly keep the exact same background, room, environment, shadows, ambient lighting, and color temperature from Image 1.
6. ACCESSORIES & DETAILS: Preserve hands, phone, jewelry, tattoos, and other accessories unless the requested clothing piece directly covers or replaces them.
7. MINIMAL MODIFICATION: Modify ONLY the clothing garments requested. Do not change anything else.

[USER SPECIFIC INSTRUCTIONS]:
${userPrompt ? `"${userPrompt}"` : 'Style the person with a realistic, well-fitted modern outfit while keeping all other elements of the photo identical.'}`;
  }

  parts.push({
    text: promptInstruction,
  });

  // Using standard multimodal Gemini model
  const model = 'gemini-2.5-flash';

  const payload = {
    model,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: 0.4,
    },
  };

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Failed to parse server response (status ${response.status})`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!data?.candidates || data.candidates.length === 0) {
    if (data?.error) {
      throw new Error(data.error.message || 'Generation failed');
    }
    throw new Error('No candidate response returned from Gemini.');
  }

  const candidate = data.candidates[0];
  const responseParts = candidate?.content?.parts || [];

  // Check for inline image output in response
  for (const part of responseParts) {
    const inline = part.inlineData || part.inline_data;
    if (inline && inline.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
  }

  // Check for text output in response
  const textSegments = responseParts
    .filter((p) => typeof p.text === 'string' && p.text.trim())
    .map((p) => p.text.trim());

  if (textSegments.length > 0) {
    return textSegments.join('\n\n');
  }

  return 'Look styling processed successfully.';
}

// -------------------------------------------------------------
// IndexedDB Client Cache (guarantees survival across refreshes)
// -------------------------------------------------------------
const IDB_NAME = 'DressingRoomDB';
const IDB_STORE = 'saved_looks';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function idbGetItems() {
  const db = await openIndexedDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbSaveItem(item) {
  const db = await openIndexedDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(item);
  } catch (e) {
    console.warn('IDB put skipped:', e);
  }
}

async function idbDeleteItem(id) {
  const db = await openIndexedDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.delete(id);
  } catch (e) {
    console.warn('IDB delete skipped:', e);
  }
}

// -------------------------------------------------------------
// Gallery Storage API (Cloudflare R2 + D1 backend)
// -------------------------------------------------------------

/**
 * Fetches all saved looks from D1 metadata / R2
 * @returns {Promise<Array<{id: string, r2Key: string, imageUrl: string, prompt: string, createdAt: number}>>}
 */
export async function fetchGallery() {
  try {
    const res = await fetch('/api/gallery', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      const serverItems = Array.isArray(data?.items) ? data.items : [];
      if (serverItems.length > 0) {
        // Sync to IDB cache
        for (const it of serverItems) {
          await idbSaveItem(it);
        }
        return serverItems;
      }
    }
  } catch (err) {
    console.warn('Backend fetch gallery failed, reading client cache:', err);
  }

  // Fallback to IndexedDB client storage
  return await idbGetItems();
}

/**
 * Saves a newly generated look:
 * - Image binary is stored in R2
 * - Metadata (id, r2Key, prompt, createdAt) is stored in D1
 * @param {string} image - Base64 data URL or URL
 * @param {string} prompt - Prompt used to generate the image
 * @returns {Promise<object>}
 */
export async function saveToGallery(image, prompt) {
  if (!image) {
    throw new Error('No image to save to gallery');
  }

  const id = `look_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  const localItem = {
    id,
    r2Key: `looks/${id}.png`,
    imageUrl: image.startsWith('data:') ? image : `/api/gallery/image/${id}`,
    prompt: prompt || '',
    createdAt,
    dataUrl: image,
  };

  // Always save immediately to client cache
  await idbSaveItem(localItem);

  try {
    const res = await fetch('/api/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, prompt }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.item) {
        const itemWithLocal = {
          ...data.item,
          dataUrl: image.startsWith('data:') ? image : data.item.imageUrl,
        };
        await idbSaveItem(itemWithLocal);
        return itemWithLocal;
      }
    }
  } catch (err) {
    console.warn('Remote gallery save failed, saved locally in IndexedDB:', err);
  }

  return localItem;
}

/**
 * Deletes an image from D1 metadata and R2 storage
 * @param {string} id - Look ID
 */
export async function deleteFromGallery(id) {
  if (!id) return;
  // Remove from local cache
  await idbDeleteItem(id);

  try {
    await fetch(`/api/gallery/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Remote delete failed:', err);
  }
}
