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
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { baseUrl, accessToken } = body;

  if (!baseUrl || !accessToken) {
    return new Response(
      JSON.stringify({ error: 'baseUrl and accessToken required', hasBaseUrl: !!baseUrl, hasToken: !!accessToken }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate URL — only allow Google domains
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid baseUrl', baseUrl: baseUrl.substring(0, 100) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!parsed.hostname.endsWith('.googleusercontent.com') &&
      !parsed.hostname.endsWith('.googleapis.com')) {
    return new Response(
      JSON.stringify({ error: 'Invalid baseUrl domain', hostname: parsed.hostname }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Try multiple download strategies
  const urls = [
    baseUrl + '=w16383-h16383',  // max resolution
    baseUrl + '=d',               // original download
    baseUrl,                      // raw baseUrl
  ];

  for (const dlUrl of urls) {
    try {
      const resp = await fetch(dlUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });

      if (resp.ok) {
        const headers = new Headers();
        headers.set('Content-Type', resp.headers.get('Content-Type') || 'application/octet-stream');
        const cd = resp.headers.get('Content-Disposition');
        if (cd) headers.set('Content-Disposition', cd);
        return new Response(resp.body, { status: 200, headers });
      }
    } catch (e) {
      // Try next URL
    }
  }

  // All failed — return debug info
  // Try one more time to get error details
  try {
    const lastResp = await fetch(urls[0], {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const errText = await lastResp.text().catch(() => '');
    return new Response(
      JSON.stringify({
        error: 'All download strategies failed',
        status: lastResp.status,
        triedUrls: urls.map(u => u.substring(0, 80)),
        detail: errText.substring(0, 500)
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Download failed: ' + e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /picker/*
 * Photos Picker API へのプロキシ
 * Body: { accessToken, ...apiBody }
 */
async function handlePickerProxy(request, url) {
  const body = await request.json();
  const { accessToken, method, ...apiBody } = body;

  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: 'accessToken required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Map /picker/sessions → PICKER_API/v1/sessions etc.
  const apiPath = url.pathname.replace('/picker/', '/v1/');
  const apiUrl = PICKER_API + apiPath + url.search;

  // Use explicit method if provided, otherwise infer
  const httpMethod = method || (Object.keys(apiBody).length ? 'POST' : 'GET');

  const fetchOpts = {
    method: httpMethod,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    }
  };
  if (httpMethod === 'POST' && Object.keys(apiBody).length) {
    fetchOpts.body = JSON.stringify(apiBody);
  }

  const resp = await fetch(apiUrl, fetchOpts);
  const data = await resp.text();

  // On error, include debug info
  if (!resp.ok) {
    return new Response(JSON.stringify({
      error: 'Picker API error',
      status: resp.status,
      apiUrl: apiUrl,
      method: httpMethod,
      googleResponse: data
    }), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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
