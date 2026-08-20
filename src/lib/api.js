// Client-side API orchestration layer
// Handles file preparation and communication with the /api/gemini backend route

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
