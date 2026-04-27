import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from './config';

// ── Cookie jar (session management) ─────────────────────────────────────────
// express-session sends a Set-Cookie header. React Native fetch doesn't
// persist cookies, so we capture and replay the session cookie manually.

let _sessionCookie = '';

export async function loadCookie() {
  try {
    _sessionCookie = (await AsyncStorage.getItem('session_cookie')) || '';
  } catch (_) {}
}

async function saveCookie(cookie) {
  _sessionCookie = cookie;
  try { await AsyncStorage.setItem('session_cookie', cookie); } catch (_) {}
}

export async function clearCookie() {
  _sessionCookie = '';
  try { await AsyncStorage.removeItem('session_cookie'); } catch (_) {}
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────
export async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    ...(options.headers || {}),
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
  };
  if (_sessionCookie) headers['Cookie'] = _sessionCookie;

  const res = await fetch(url, { ...options, headers });

  // Capture session cookie from response
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/connect\.sid=[^;]+/);
    if (match) await saveCookie(match[0]);
  }

  return res;
}

// ── Convenience helpers ──────────────────────────────────────────────────────
export const get  = (path)        => api(path, { method: 'GET' });
export const post = (path, body)  => api(path, {
  method: 'POST',
  body:   body instanceof FormData ? body : JSON.stringify(body),
  headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
});
export const del  = (path)        => api(path, { method: 'DELETE' });
export const patch = (path, body) => api(path, {
  method: 'PATCH',
  body: JSON.stringify(body),
});
