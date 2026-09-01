import { SB_URL, SB_KEY } from './config.js';

export async function sbGet(tabla, query = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${query}`, {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  });
  return r.json();
}

export async function sbPost(tabla, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  return { ok: r.ok, data: await r.json() };
}

export async function sbPatch(tabla, query, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${query}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return r.ok;
}

export async function authLogin(email, pass) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  return r.json();
}
