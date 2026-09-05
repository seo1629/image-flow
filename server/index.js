import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Proxies VWorld's address search/geocoding API so the browser doesn't hit
// CORS issues calling api.vworld.kr directly. Unlike a typical server-key
// setup, the key itself still comes from the client (the same key the user
// enters in Settings → localStorage), passed as a query param — this app
// has no server-side key storage of its own, so the proxy only exists to
// route around CORS, not to hide the key. A VWORLD_API_KEY in server/.env
// is used only as a fallback when the client doesn't send one.
app.get('/api/vworld/search', async (req, res) => {
  const apiKey = req.query.apiKey || process.env.VWORLD_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'VWorld API 키가 없습니다. Settings에서 VWorld API 키를 입력해주세요.' });

  const query = req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const type = req.query.type === 'place' ? 'place' : 'address';
  const url = new URL('https://api.vworld.kr/req/search');
  url.searchParams.set('service', 'search');
  url.searchParams.set('request', 'search');
  url.searchParams.set('version', '2.0');
  url.searchParams.set('crs', 'EPSG:4326');
  url.searchParams.set('size', '10');
  url.searchParams.set('page', '1');
  url.searchParams.set('query', query);
  url.searchParams.set('type', type);
  if (type === 'address') url.searchParams.set('category', 'road');
  url.searchParams.set('format', 'json');
  url.searchParams.set('errorformat', 'json');
  url.searchParams.set('key', apiKey);

  try {
    const vworldRes = await fetch(url.toString());
    const json = await vworldRes.json();
    return res.json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'VWorld search request failed' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.SERVER_PORT || 4001;
app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
