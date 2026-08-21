const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/api/health") {
      return json({ ok: true, key: Boolean(env.GEMINI_API_KEY) });
    }

    // Gemini inference route
    if (url.pathname === "/api/gemini") {
      if (request.method !== "POST") {
        return json({ error: "POST only" }, 405);
      }
      if (!env.GEMINI_API_KEY) {
        return json({ error: "GEMINI_API_KEY not set in Cloudflare environment" }, 500);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload" }, 400);
      }

      const { model, contents, generationConfig, systemInstruction } = body;
      if (!model || !contents) {
        return json({ error: "Missing required model or contents parameter" }, 400);
      }

      const res = await fetch(`${GOOGLE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({ contents, generationConfig, systemInstruction }),
      });

      const data = await res.json();

      // Log the prompt run if D1 DB binding exists, but never let DB error break generation
      try {
        if (env.DB) {
          await env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT, prompt TEXT, status INTEGER, created_at INTEGER)"
          ).run();

          await env.DB.prepare(
            "INSERT INTO runs (model, prompt, status, created_at) VALUES (?, ?, ?, ?)"
          )
            .bind(
              model,
              JSON.stringify(contents).slice(0, 2000),
              res.status,
              Date.now()
            )
            .run();
        }
      } catch (e) {
        console.log("db log skipped:", e.message);
      }

      return json(data, res.status);
    }

    // Serve R2-stored image by ID
    if (url.pathname.startsWith("/api/gallery/image/")) {
      const id = url.pathname.replace("/api/gallery/image/", "");
      if (!id) return json({ error: "Missing image id" }, 400);

      if (env.BUCKET) {
        let r2Key = `looks/${id}.png`;
        if (env.DB) {
          try {
            const row = await env.DB.prepare("SELECT r2_key FROM gallery WHERE id = ?").bind(id).first();
            if (row && row.r2_key) {
              r2Key = row.r2_key;
            }
          } catch (e) {
            console.log("DB lookup skipped:", e.message);
          }
        }

        const object = await env.BUCKET.get(r2Key);
        if (object) {
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set("etag", object.httpEtag);
          headers.set("Cache-Control", "public, max-age=31536000");
          return new Response(object.body, { headers });
        }
      }

      return json({ error: "Image not found" }, 404);
    }

    // Gallery List (GET) and Create (POST)
    if (url.pathname === "/api/gallery") {
      // 1. GET List of gallery items from D1
      if (request.method === "GET") {
        if (!env.DB) {
          return json({ items: [] });
        }
        try {
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS gallery (
              id TEXT PRIMARY KEY,
              r2_key TEXT,
              image_url TEXT,
              prompt TEXT,
              created_at INTEGER
            )
          `).run();

          const { results } = await env.DB.prepare(
            "SELECT id, r2_key as r2Key, image_url as imageUrl, prompt, created_at as createdAt FROM gallery ORDER BY created_at DESC"
          ).all();

          return json({ items: results || [] });
        } catch (e) {
          console.log("Gallery fetch error:", e.message);
          return json({ items: [], error: e.message });
        }
      }

      // 2. POST Save new image to R2 + metadata to D1
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const { image, prompt } = body;
        if (!image) {
          return json({ error: "Missing image data" }, 400);
        }

        const id = `look_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const createdAt = Date.now();

        let mimeType = "image/png";
        let extension = "png";
        let binaryBuffer;

        if (typeof image === "string" && image.startsWith("data:")) {
          const match = image.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            if (mimeType.includes("jpeg") || mimeType.includes("jpg")) extension = "jpg";
            else if (mimeType.includes("webp")) extension = "webp";

            const binaryStr = atob(match[2]);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            binaryBuffer = bytes.buffer;
          }
        }

        const r2Key = `looks/${id}.${extension}`;
        const imageUrl = `/api/gallery/image/${id}`;

        // Save image binary file into Cloudflare R2
        if (env.BUCKET && binaryBuffer) {
          try {
            await env.BUCKET.put(r2Key, binaryBuffer, {
              httpMetadata: { contentType: mimeType },
              customMetadata: {
                prompt: (prompt || "").slice(0, 500),
                createdAt: String(createdAt),
              },
            });
          } catch (e) {
            console.log("R2 put error:", e.message);
          }
        }

        // Save lightweight metadata in Cloudflare D1
        if (env.DB) {
          try {
            await env.DB.prepare(`
              CREATE TABLE IF NOT EXISTS gallery (
                id TEXT PRIMARY KEY,
                r2_key TEXT,
                image_url TEXT,
                prompt TEXT,
                created_at INTEGER
              )
            `).run();

            await env.DB.prepare(`
              INSERT INTO gallery (id, r2_key, image_url, prompt, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).bind(id, r2Key, imageUrl, prompt || "", createdAt).run();
          } catch (e) {
            console.log("D1 insert error:", e.message);
          }
        }

        const item = {
          id,
          r2Key,
          imageUrl,
          prompt: prompt || "",
          createdAt,
          // If R2 isn't reachable, client can use local fallback
          fallbackDataUrl: image.startsWith("data:") ? image : null,
        };

        return json({ success: true, item });
      }

      return json({ error: "Method not allowed" }, 405);
    }

    // Delete single gallery image by ID
    if (url.pathname.startsWith("/api/gallery/") && request.method === "DELETE") {
      const id = url.pathname.replace("/api/gallery/", "");
      if (!id) return json({ error: "Missing id" }, 400);

      if (env.DB) {
        try {
          const row = await env.DB.prepare("SELECT r2_key FROM gallery WHERE id = ?").bind(id).first();
          if (row && row.r2_key && env.BUCKET) {
            await env.BUCKET.delete(row.r2_key);
          }
          await env.DB.prepare("DELETE FROM gallery WHERE id = ?").bind(id).run();
        } catch (e) {
          console.log("Gallery delete error:", e.message);
        }
      }

      return json({ success: true, id });
    }

    return json({ error: "not found" }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
