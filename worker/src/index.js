/**
 * Choreia Photos Proxy — Cloudflare Worker
 *
 * Google Photos Picker API の baseUrl ダウンロードを中継するプロキシ。
 * ブラウザからは CORS 制約で Authorization ヘッダー付きリクエストが
 * Google の画像サーバーに到達できないため、このワーカーが中継する。
 *
 * エンドポイント:
 *   POST /download   — baseUrl から写真をダウンロードして返す
 *   POST /picker/*    — Photos Picker API へのプロキシ
 *
 * 無料枠: 100,000 リクエスト/日
 */

const PICKER_API = 'https://photospicker.googleapis.com';

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(env, new Response(null, { status: 204 }));
    }

    // Origin check
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    if (!allowed.includes(origin) && !allowed.includes('*')) {
      return new Response('Forbidden', { status: 403 });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/download' && request.method === 'POST') {
        return corsResponse(env, await handleDownload(request));
      }
      if (url.pathname.startsWith('/picker/') && request.method === 'POST') {
        return corsResponse(env, await handlePickerProxy(request, url));
      }
      return corsResponse(env, new Response(JSON.stringify({
        status: 'ok',
        endpoints: ['POST /download', 'POST /picker/*']
      }), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) {
      return corsResponse(env, new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ));
    }
  }
};

/**
 * POST /download
 * Body: { baseUrl, accessToken }
 * → Google Photos からダウンロードして返す
 */
async function handleDownload(request) {
  const { baseUrl, accessToken } = await request.json();

  if (!baseUrl || !accessToken) {
    return new Response(
      JSON.stringify({ error: 'baseUrl and accessToken required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate URL — only allow Google domains
  const parsed = new URL(baseUrl);
  if (!parsed.hostname.endsWith('.googleusercontent.com') &&
      !parsed.hostname.endsWith('.googleapis.com')) {
    return new Response(
      JSON.stringify({ error: 'Invalid baseUrl domain' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Append =d for original quality download
  const dlUrl = baseUrl.includes('=') ? baseUrl : baseUrl + '=d';

  const resp = await fetch(dlUrl, {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: 'Download failed: ' + resp.status, detail: errText }),
      { status: resp.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Stream the photo back with original content type
  const headers = new Headers();
  headers.set('Content-Type', resp.headers.get('Content-Type') || 'application/octet-stream');
  const cd = resp.headers.get('Content-Disposition');
  if (cd) headers.set('Content-Disposition', cd);

  return new Response(resp.body, { status: 200, headers });
}

/**
 * POST /picker/*
 * Photos Picker API へのプロキシ
 * Body: { accessToken, ...apiBody }
 */
async function handlePickerProxy(request, url) {
  const body = await request.json();
  const { accessToken, ...apiBody } = body;

  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: 'accessToken required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Map /picker/sessions → PICKER_API/v1/sessions etc.
  const apiPath = url.pathname.replace('/picker/', '/v1/');
  const apiUrl = PICKER_API + apiPath;

  const fetchOpts = {
    method: Object.keys(apiBody).length ? 'POST' : 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    }
  };
  if (Object.keys(apiBody).length) {
    fetchOpts.body = JSON.stringify(apiBody);
  }

  const resp = await fetch(apiUrl, fetchOpts);
  const data = await resp.text();

  return new Response(data, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function corsResponse(env, response) {
  const headers = new Headers(response.headers);
  const allowed = (env.ALLOWED_ORIGINS || '').split(',')[0].trim();
  headers.set('Access-Control-Allow-Origin', allowed || '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    headers
  });
}
