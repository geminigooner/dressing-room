const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, key: Boolean(env.GEMINI_API_KEY) });
    }

    if (url.pathname === "/api/gemini") {
      if (request.method !== "POST") {
        return json({ error: "POST only" }, 405);
      }
      if (!env.GEMINI_API_KEY) {
        return json({ error: "GEMINI_API_KEY not set" }, 500);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad JSON" }, 400);
      }

      const { model, contents, generationConfig } = body;
      if (!model || !contents) {
        return json({ error: "need model and contents" }, 400);
      }

      const res = await fetch(`${GOOGLE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({ contents, generationConfig }),
      });

      const data = await res.json();

      // log the prompt, but never let a DB error kill a generation
      try {
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
      } catch (e) {
        console.log("db log skipped:", e.message);
      }

      return json(data, res.status);
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