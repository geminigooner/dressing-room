const ENDPOINT = "/api/gemini";

// Strips the "data:image/png;base64," prefix off a data URL.
export function stripDataUrl(dataUrl) {
  return dataUrl.split(",")[1];
}

// Reads a File (from an <input type="file">) into { mimeType, data }.
export function fileToPart(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        inlineData: {
          mimeType: file.type,
          data: stripDataUrl(reader.result),
        },
      });
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

async function callGemini(model, parts) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      contents: [{ role: "user", parts }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || "request failed");
  }
  return data;
}

// Pulls the first image out of a response, as a data URL ready for <img src>.
function firstImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData) {
      return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
    }
  }
  return null;
}

// Pulls any text the model returned (useful when it refuses instead of generating).
function firstText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.find((p) => p.text)?.text || null;
}

/**
 * Edit a photo. `photo` is required. `garment` is optional — when present,
 * the model treats it as the reference item to apply.
 * Returns { image, text }.
 */
export async function editPhoto({ photo, garment, prompt }) {
  const parts = [];

  parts.push({ text: "IMAGE 1 — the person and scene to edit:" });
  parts.push(photo);

  if (garment) {
    parts.push({ text: "IMAGE 2 — the reference garment to apply:" });
    parts.push(garment);
  }

  parts.push({ text: prompt });

  const data = await callGemini("gemini-3.1-flash-image", parts);

  return { image: firstImage(data), text: firstText(data) };
}