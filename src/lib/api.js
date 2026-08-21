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
 * Converts any image source (File, Data URL, Blob URL, HTTP URL) into a Gemini inline data part
 * @param {File|string|null} source - Image source
 * @returns {Promise<{inlineData: {data: string, mimeType: string}, dataUrl: string}|null>}
 */
export async function imageSourceToPart(source) {
  if (!source) return null;

  if (typeof File !== 'undefined' && source instanceof File) {
    return await fileToPart(source);
  }

  if (typeof source === 'string') {
    // Data URL format: data:image/png;base64,....
    if (source.startsWith('data:')) {
      const commaIdx = source.indexOf(',');
      if (commaIdx !== -1) {
        const meta = source.slice(0, commaIdx);
        const data = source.slice(commaIdx + 1);
        const mimeMatch = meta.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        return {
          inlineData: {
            mimeType,
            data,
          },
          dataUrl: source,
        };
      }
    }

    // Blob URL or HTTP(s) URL
    if (
      source.startsWith('blob:') ||
      source.startsWith('http://') ||
      source.startsWith('https://') ||
      source.startsWith('/api/')
    ) {
      try {
        const res = await fetch(source);
        if (!res.ok) return null;
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              const base64Data = reader.result.split(',')[1];
              resolve({
                inlineData: {
                  data: base64Data,
                  mimeType: blob.type || 'image/jpeg',
                },
                dataUrl: reader.result,
              });
            } else {
              resolve(null);
            }
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn('Failed to resolve image source URL to inline data part:', err);
        return null;
      }
    }
  }

  return null;
}

/**
 * Executes photo editing request
 * @param {any} photoPart - Base photo part or file
 * @param {any} garmentPart - Optional garment reference part or file
 * @param {string} prompt - Text prompt describing the desired look
 * @param {Array<any>} identityParts - Optional array of user identity reference image parts
 * @returns {Promise<string|object>} - Image data URL / URL or text response
 */
export async function editPhoto(photoPart, garmentPart, prompt, identityParts = []) {
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

  // 3. Add any active user Identity Reference photos
  if (Array.isArray(identityParts) && identityParts.length > 0) {
    for (const idPart of identityParts) {
      if (idPart && idPart.inlineData) {
        parts.push({
          inlineData: {
            mimeType: idPart.inlineData.mimeType,
            data: idPart.inlineData.data,
          },
        });
      }
    }
  }

  // 4. Construct structured image-edit instruction
  const userPrompt = prompt && prompt.trim() ? prompt.trim() : '';
  const hasIdentityRefs = Array.isArray(identityParts) && identityParts.some((p) => p && p.inlineData);

  // Build segment-role breakdown for prompt
  let segmentRoleGuidance = '';
  if (hasIdentityRefs) {
    const roleLines = identityParts
      .filter((p) => p && p.inlineData)
      .map((p, idx) => {
        const role = p.role || 'auto';
        const label = p.label || `Photo ${idx + 1}`;
        if (role === 'face') return `- Image ${idx + (resolvedGarment ? 3 : 2)} ("${label}"): Primary reference for facial structure, eyes, nose, lips, jawline & expression.`;
        if (role === 'hair') return `- Image ${idx + (resolvedGarment ? 3 : 2)} ("${label}"): Primary reference for hairstyle, hairline, texture, volume & hair color.`;
        if (role === 'body') return `- Image ${idx + (resolvedGarment ? 3 : 2)} ("${label}"): Primary reference for natural body proportions, silhouette & posture.`;
        return `- Image ${idx + (resolvedGarment ? 3 : 2)} ("${label}"): General balanced identity anchor for facial features and complexion.`;
      });
    segmentRoleGuidance = `\n[SEGMENT-SPECIFIC IDENTITY REFERENCE MAPPING]:\n${roleLines.join('\n')}\n`;
  }

  let promptInstruction = '';

  if (resolvedGarment && resolvedGarment.inlineData) {
    promptInstruction = `[TASK: VIRTUAL DRESSING ROOM OUTFIT TRANSFER]
You are an expert AI virtual dressing room stylist. You are provided with:
- Image 1 (Base Photo): The original photo of the subject.
- Image 2 (Outfit Reference): Visual reference for the replacement clothing/garment.
${hasIdentityRefs ? `- Additional Identity Reference Images attached with segment-specific roles.` : ''}
${segmentRoleGuidance}
Your objective is to replace or dress the clothing of the person in Image 1 using the outfit shown in Image 2.

[CRITICAL PRESERVATION RULES - DEFAULT MANDATES]:
1. IDENTITY & FACE: Strictly preserve the exact identity, facial features, facial structure, skin tone, and expression of the person in Image 1${hasIdentityRefs ? ' (cross-verified with attached Identity Reference photos according to their designated segment roles)' : ''}. Do NOT beautify, alter, smooth, or reshape the face.
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
You are an expert AI virtual dressing room stylist. You are provided with Image 1 (Base Photo)${hasIdentityRefs ? ' and additional user Identity Reference Images with designated segment roles' : ''}.
${segmentRoleGuidance}
Your objective is to edit or style the clothing of the person in Image 1 according to the user's instructions.

[CRITICAL PRESERVATION RULES - DEFAULT MANDATES]:
1. IDENTITY & FACE: Strictly preserve the exact identity, facial features, facial structure, skin tone, and expression of the person in Image 1${hasIdentityRefs ? ' (cross-verified with attached Identity Reference photos according to their designated segment roles)' : ''}. Do NOT beautify, alter, smooth, or reshape the face.
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

  // Primary image generation / edit model with automatic fallback to latest official models
  const modelsToTry = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.7-flash'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
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
        lastError = new Error(message);
        // Try fallback model if 404/400 (e.g. model not enabled or not found on key)
        if (response.status === 404 || response.status === 400) {
          continue;
        }
        throw lastError;
      }

      if (!data?.candidates || data.candidates.length === 0) {
        if (data?.error) {
          throw new Error(data.error.message || 'Generation failed');
        }
        continue;
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
    } catch (err) {
      lastError = err;
      console.warn(`Model ${model} attempt failed:`, err);
    }
  }

  if (lastError) {
    throw lastError;
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

// -------------------------------------------------------------
// Persistent Gemini Assistant Shell API
// -------------------------------------------------------------

/**
 * Sends conversation history, current workspace state snapshot, and active tool registry to Gemini.
 * @param {Array<{role: string, content: string}>} messages - Conversation turns
 * @param {object} workspaceContext - Live snapshot of app state
 * @param {Array<object>} capabilities - Dynamic tool / capability registry
 * @returns {Promise<{content: string, toolRequest: {tool: string, params: object}|null}>} - Assistant's reply with optional tool request
 */
export async function chatWithAssistant(messages, workspaceContext, capabilities) {
  const model = 'gemini-3.7-flash';

  const gallerySummary = Array.isArray(workspaceContext.galleryItems) && workspaceContext.galleryItems.length > 0
    ? workspaceContext.galleryItems.slice(0, 8).map((item, idx) => `[#${item.id || idx + 1}: "${item.prompt || 'Untitled Look'}"]`).join(', ')
    : 'No saved looks';

  // 1. Asynchronously resolve visual attachments from current workspace
  let basePart = null;
  let outfitPart = null;
  let resultPart = null;

  try {
    [basePart, outfitPart, resultPart] = await Promise.all([
      workspaceContext.basePhotoSource ? imageSourceToPart(workspaceContext.basePhotoSource) : null,
      workspaceContext.outfitPhotoSource ? imageSourceToPart(workspaceContext.outfitPhotoSource) : null,
      (workspaceContext.resultImageSource || workspaceContext.selectedLook?.imageUrl)
        ? imageSourceToPart(workspaceContext.resultImageSource || workspaceContext.selectedLook?.imageUrl)
        : null,
    ]);
  } catch (imgErr) {
    console.warn('Could not resolve one or more workspace image parts:', imgErr);
  }

  const visualAttachments = [];
  if (basePart && basePart.inlineData) {
    visualAttachments.push({
      text: '=== VISUAL ATTACHMENT: BASE PHOTO (BEFORE / ORIGINAL SUBJECT) ===',
    });
    visualAttachments.push({
      inlineData: {
        mimeType: basePart.inlineData.mimeType,
        data: basePart.inlineData.data,
      },
    });
  }

  if (outfitPart && outfitPart.inlineData) {
    visualAttachments.push({
      text: '=== VISUAL ATTACHMENT: OUTFIT REFERENCE PHOTO (DESIRED GARMENTS / STYLE) ===',
    });
    visualAttachments.push({
      inlineData: {
        mimeType: outfitPart.inlineData.mimeType,
        data: outfitPart.inlineData.data,
      },
    });
  }

  if (resultPart && resultPart.inlineData) {
    const label = workspaceContext.selectedLook
      ? `SAVED GALLERY LOOK #${workspaceContext.selectedLook.id}`
      : 'CURRENT GENERATED RESULT (AFTER / STYLED PHOTO)';
    visualAttachments.push({
      text: `=== VISUAL ATTACHMENT: ${label} ===`,
    });
    visualAttachments.push({
      inlineData: {
        mimeType: resultPart.inlineData.mimeType,
        data: resultPart.inlineData.data,
      },
    });
  }

  const systemInstruction = `You are Gemini, the built-in AI styling assistant inside "Dressing Room" (AI Style Studio).
You are grounded, sharp, attentive, and helpful. You speak naturally, concisely, and directly.

[CURRENT WORKSPACE STATE SNAPSHOT]:
- Base Photo Loaded: ${workspaceContext.hasBasePhoto ? `YES (${workspaceContext.basePhotoName || 'uploaded photo'})` : 'NO (User has not uploaded a base photo yet)'}
- Outfit Reference Loaded: ${workspaceContext.hasOutfitReference ? `YES (${workspaceContext.outfitPhotoName || 'reference image'})` : 'NO (No separate outfit photo loaded)'}
- Identity Reference Bank: ${workspaceContext.identityReferencesCount || 0} saved reference photo(s) in personal bank
- Selected Identity References & Segment Roles: ${
    Array.isArray(workspaceContext.selectedIdentityReferences) && workspaceContext.selectedIdentityReferences.length > 0
      ? workspaceContext.selectedIdentityReferences.map((r) => `"${r.label || 'Photo'}" [Role: ${r.segmentRole || 'auto'}, Tags: ${(r.tags || []).join(', ')}]`).join('; ')
      : 'None active (User can select up to 4 to anchor facial/body consistency)'
  }
- Identity Fidelity Contract: Active (Ensures face shape, eye shape, nose/lips contour, complexion, body proportions, and recognizable features are preserved)
- Successful Edit Memory: ${workspaceContext.successMemoryCount || 0} user-approved generation(s) recorded in memory ("Looks like me").
${workspaceContext.memoryInsights ? `- Memory Insights:\n${workspaceContext.memoryInsights}` : ''}
- Current Styling Prompt: ${workspaceContext.prompt ? `"${workspaceContext.prompt}"` : '(empty prompt field)'}
- Generation Status: ${workspaceContext.isGenerating ? 'Currently processing generation...' : 'Idle'}
- Result Status: ${workspaceContext.hasResultImage ? 'Generated look image available on canvas' : workspaceContext.hasResultText ? 'Text styling response available' : 'No result generated yet'}
- Active Tab/View: ${workspaceContext.activeTab || 'create'} (Gallery has ${workspaceContext.galleryCount || 0} saved looks)
- Selected Lightbox Look: ${workspaceContext.selectedLook ? `Look #${workspaceContext.selectedLook.id} (Prompt: "${workspaceContext.selectedLook.prompt || ''}")` : 'None'}
- Saved Looks in Gallery: ${gallerySummary}
- Visual Images Attached to Session: ${visualAttachments.length > 0 ? `${visualAttachments.filter(p => p.inlineData).length} image(s) loaded for direct visual inspection` : 'None'}
${workspaceContext.lastErrorMessage ? `- Last Error: "${workspaceContext.lastErrorMessage}"` : ''}

[REGISTERED APP CAPABILITIES / TOOLS]:
${JSON.stringify(capabilities, null, 2)}

[VISUAL INSPECTION & COMPARISON CRITERIA]:
When visual attachments are available (Before base photo, After generated result, and optional Outfit reference), you have multimodal vision to inspect and compare them.
When the user asks questions such as:
* "what changed?"
* "did it change my face?"
* "did it preserve my body?"
* "did the background drift?"
* "is this close to the outfit reference?"
* "what went wrong with this one?"
or any general visual review question, compare the Before and After images and report clearly on:
1. IDENTITY & FACE CONSISTENCY: Compare facial bone structure, eyes, nose, lips, smile/expression, skin tone, and unique features. Confirm whether the subject's face is identical or if AI smoothing/face-swapping occurred.
2. HAIR CONSISTENCY: Check hairstyle, hair texture, color, volume, highlights, and hairline compared to the original photo.
3. BODY PROPORTIONS & SILHOUETTE: Check whether natural body shape, curves, height, and limb thickness were preserved without unwanted slimming, widening, or warping.
4. POSE & FRAMING: Check posture, arm/hand placement, head tilt, camera angle, perspective, and shot distance.
5. BACKGROUND & ENVIRONMENT: Check the room setting, background walls, furniture, architectural details, outdoor scenery, and confirm whether background perspective drifted.
6. LIGHTING & SHADOWS: Evaluate ambient light direction, shadows, exposure, highlights, and color temperature consistency.
7. PHONE, HANDS, & ACCESSORIES: Inspect fingers/hands, nails, phone position/case, jewelry, watches, glasses, and tattoos.
8. CLOTHING ADHERENCE: Compare the new outfit against the styling prompt ("${workspaceContext.prompt || 'None'}") and any Outfit Reference photo provided. Evaluate fabric texture, garment fit, cut, color fidelity, and realism.
9. OBVIOUS GENERATION ARTIFACTS: Check for unnatural warping, blurry seams, haloing around edges, phantom limbs, or distorted fabric boundaries.
10. DRIFT EXPLANATION & RETRY SUGGESTIONS:
    - If the result drifted, explain specifically what changed and why.
    - Offer the user a refined retry with targeted preservation instructions.
    - STRICT RULE: Do NOT automatically regenerate anything. You must wait for the user to explicitly ask or approve a retry before executing any tool.

[VISUAL QA TO REFINED RETRY GENERATION PIPELINE]:
When you have visually inspected a look and identified problems or drift, follow this strict protocol:
1. INSPECT & EXPLAIN FIRST:
   - Provide a clear, honest breakdown of what changed vs. what was preserved.
   - Proactively suggest a refined edit approach and ask the user if they'd like you to run the retry.
   - Stop and wait for user approval. DO NOT execute any tool yet.

2. USER RETRY APPROVAL TRIGGERS:
   When the user replies with approval or a fix request, such as:
   - "fix it"
   - "retry it" / "retry"
   - "try again" / "try this edit again"
   - "try again but preserve my face"
   - "fix the background drift"
   - "keep everything else the same"
   - "yes, please retry" / "go ahead and fix it" / "let's try that"
   - or any explicit command to execute the fix or retry:

3. SYNTHESIZE THE REFINED RETRY PROMPT:
   Construct a comprehensive, refined edit instruction that wraps around the user's original styling intent:
   a. Original Creative Intent: Retain the user's original styling request ("${workspaceContext.prompt || 'the desired outfit'}") exactly. Do NOT discard or replace what they asked to wear.
   b. Targeted Preservation Constraints: Add explicit, strict preservation clauses for each item identified in the visual QA:
      - Face / Identity: "Strictly preserve exact facial bone structure, eyes, nose, lips, smile/expression, skin tone, and unique identity from the original base photo with zero alterations or face-swapping."
      - Body Proportions / Silhouette: "Preserve the subject's exact natural body proportions, curves, waistline, height, and anatomical silhouette from the original base photo without slimming, widening, or warping."
      - Background / Environment: "Preserve the original background environment, walls, architectural features, furniture, and lighting identically with zero background drift."
      - Pose / Camera Framing: "Maintain the exact original pose, posture, arm/hand placement, camera framing, distance, and angle."
      - Outfit Reference Adherence: "Strictly adhere to the supplied outfit reference photo's garment cut, fabric texture, seams, silhouette, and color palette."
      - Hands & Accessories: "Preserve natural hands, fingers, phone, jewelry, and accessories accurately."
   c. Call the Existing Generate Tool:
      Emit a tool_request block calling 'generate_image_edit' with the refined prompt string:
      \`\`\`tool_request
      {
        "tool": "generate_image_edit",
        "params": {
          "prompt": "<Original creative request> - Strictly preserve: <Targeted preservation clauses>"
        }
      }
      \`\`\`
   d. Conversational Confirmation: In your response text, briefly let the user know you've refined the prompt with the strict preservation constraints and initiated the retry generation.

[SUCCESSFUL EDIT MEMORY & EXPLAINABILITY]:
You have access to Successful Edit Memory ("Looks like me" user approvals).
- When the user asks why certain identity references were chosen or suggested (e.g. "why did you choose these photos?"), you can explain based on prior successes when applicable (e.g. "Two of these references worked well in a previous full-body outfit edit you approved.").
- Do NOT constantly or repetitively bring up memory stats unless relevant or asked.
- Current visual relevance remains paramount. User manual selections always override memory.

[TOOL EXECUTION GUIDELINES]:
1. When the user EXPLICITLY requests an action that corresponds to one of the registered tools (such as "generate this", "try this edit again", "save this one", "download this", "open my gallery", "show me this gallery item", "delete this gallery item", "change prompt to..."):
   - Request the app tool by including a structured code block formatted as:
   \`\`\`tool_request
   {
     "tool": "<tool_id>",
     "params": { ... }
   }
   \`\`\`
   - Accompany the tool block with a concise conversational response explaining what action you are executing.

2. Situational Pronouns & Context:
   - Use the workspace snapshot to resolve relative phrases like "this", "that one", "save it", "try again", which refer to the current result or current look selection.
   - If a request is ambiguous or missing required inputs, DO NOT request a tool. Ask the user for clarification.

3. Strict Restraints:
   - NEVER emit a tool request unless the user explicitly requested that action.
   - NEVER execute unsolicited generations, saves, deletes, or loops.
   - Only use tools present in [REGISTERED APP CAPABILITIES / TOOLS]. Do not invent tools.`;

  // 1. Filter out error/empty messages and keep only valid user/model turns
  const validMessages = (messages || []).filter(
    (m) => m && (m.role === 'user' || m.role === 'model') && typeof m.content === 'string' && m.content.trim() && !m.isError
  );

  // 2. Drop leading 'model' messages so the sequence always starts with a 'user' turn (Gemini API strict requirement)
  while (validMessages.length > 0 && validMessages[0].role !== 'user') {
    validMessages.shift();
  }

  // 3. Consolidate consecutive turns with the same role so turns alternate strictly: user -> model -> user -> model
  const consolidated = [];
  for (const msg of validMessages) {
    if (consolidated.length > 0 && consolidated[consolidated.length - 1].role === msg.role) {
      consolidated[consolidated.length - 1].content += `\n\n${msg.content}`;
    } else {
      consolidated.push({ role: msg.role, content: msg.content });
    }
  }

  // 4. Ensure there is at least one user message
  if (consolidated.length === 0) {
    consolidated.push({ role: 'user', content: 'Hello Gemini, please review my current workspace.' });
  }

  // 5. Attach visual parts to the latest user message
  const lastUserIndex = consolidated.map((m) => m.role).lastIndexOf('user');

  const formattedContents = consolidated.map((m, idx) => {
    if (m.role === 'user') {
      const parts = [];
      if (idx === lastUserIndex && visualAttachments.length > 0) {
        parts.push(...visualAttachments);
      }
      parts.push({ text: m.content });
      return {
        role: 'user',
        parts,
      };
    }
    return {
      role: 'model',
      parts: [{ text: m.content }],
    };
  });

  const payload = {
    model,
    contents: formattedContents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
    systemInstruction: {
      parts: [{ text: systemInstruction }],
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
    throw new Error(`Failed to parse assistant response (status ${response.status})`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || `Assistant request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!data?.candidates || data.candidates.length === 0) {
    throw new Error('No response from Gemini assistant.');
  }

  const candidate = data.candidates[0];
  const responseParts = candidate?.content?.parts || [];
  const rawText = responseParts
    .filter((p) => typeof p.text === 'string' && p.text.trim())
    .map((p) => p.text.trim())
    .join('\n\n');

  // Parse out any tool_request block
  let toolRequest = null;
  let cleanContent = rawText;

  // Regex matching ```tool_request ... ``` or ```json { "tool": ... } ```
  const toolBlockRegex = /```(?:tool_request|json)?\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/i;
  const match = rawText.match(toolBlockRegex);

  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && parsed.tool) {
        toolRequest = {
          tool: parsed.tool,
          params: parsed.params || parsed.parameters || {},
        };
        // Remove the code block from the user-facing text display
        cleanContent = rawText.replace(match[0], '').trim();
      }
    } catch (parseErr) {
      console.warn('Failed to parse tool request JSON from model response:', parseErr);
    }
  }

  return {
    content: cleanContent || "I'm right here. How can I help you with your look?",
    toolRequest,
  };
}


