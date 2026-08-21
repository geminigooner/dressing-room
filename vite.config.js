import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta/models';

// In-memory development gallery storage
const devGalleryItems = [];
const devImagesMap = new Map();

function geminiDevApiPlugin() {
  return {
    name: 'gemini-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Health check
        if (req.url === '/api/health' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, key: Boolean(process.env.GEMINI_API_KEY) }));
          return;
        }

        // Gemini proxy
        if (req.url === '/api/gemini' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set in environment' }));
            return;
          }

          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });

          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr);
              const { model, contents, generationConfig, systemInstruction } = body;
              if (!model || !contents) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'need model and contents' }));
                return;
              }

              const response = await fetch(`${GOOGLE}/${model}:generateContent`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': apiKey,
                },
                body: JSON.stringify({ contents, generationConfig, systemInstruction }),
              });

              const data = await response.json();
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
            }
          });
          return;
        }

        // Dev Gallery: Serve Image
        if (req.url && req.url.startsWith('/api/gallery/image/') && req.method === 'GET') {
          const id = req.url.replace('/api/gallery/image/', '').split('?')[0];
          const imgData = devImagesMap.get(id);
          if (imgData) {
            res.setHeader('Content-Type', imgData.mimeType || 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.end(imgData.buffer);
            return;
          }
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Image not found' }));
          return;
        }

        // Dev Gallery: GET List
        if (req.url === '/api/gallery' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ items: devGalleryItems }));
          return;
        }

        // Dev Gallery: POST Save
        if (req.url === '/api/gallery' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', () => {
            try {
              const { image, prompt } = JSON.parse(bodyStr);
              const id = `look_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const createdAt = Date.now();
              const r2Key = `looks/${id}.png`;
              const imageUrl = `/api/gallery/image/${id}`;

              let mimeType = 'image/png';
              let buffer = Buffer.from('');
              if (typeof image === 'string' && image.startsWith('data:')) {
                const match = image.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  mimeType = match[1];
                  buffer = Buffer.from(match[2], 'base64');
                }
              }

              devImagesMap.set(id, { buffer, mimeType });

              const item = {
                id,
                r2Key,
                imageUrl,
                prompt: prompt || '',
                createdAt,
                fallbackDataUrl: image.startsWith('data:') ? image : null,
              };

              devGalleryItems.unshift(item);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, item }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Dev Gallery: DELETE by ID
        if (req.url && req.url.startsWith('/api/gallery/') && req.method === 'DELETE') {
          const id = req.url.replace('/api/gallery/', '').split('?')[0];
          const index = devGalleryItems.findIndex((item) => item.id === id);
          if (index !== -1) {
            devGalleryItems.splice(index, 1);
          }
          devImagesMap.delete(id);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, id }));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), geminiDevApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
