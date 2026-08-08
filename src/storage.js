/* Хранилище. Ключи с "session" — в localStorage (у каждого браузера свой вход).
   Остальное (общая база krisha:db) — на сервере через /api/kv, чтобы данные
   были общими для всех пользователей. Если API недоступен — откат в localStorage. */
const BASE = (import.meta.env && import.meta.env.VITE_API_URL) || "/api";
const isLocal = (key) => /session/i.test(key);
const lsGet = (k) => { const v = localStorage.getItem("mb:" + k); return v === null ? null : { key: k, value: v }; };

async function req(path, opts) {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error("api " + r.status);
  return r;
}

window.storage = {
  async get(key) {
    if (isLocal(key)) return lsGet(key);
    try { const d = await (await req("/kv/" + encodeURIComponent(key))).json(); return d && d.value != null ? { key, value: d.value } : null; }
    catch (e) { return lsGet(key); }
  },
  async set(key, value) {
    if (isLocal(key)) { localStorage.setItem("mb:" + key, value); return { key, value }; }
    try { await req("/kv/" + encodeURIComponent(key), { method: "PUT", body: JSON.stringify({ value }) }); }
    catch (e) { localStorage.setItem("mb:" + key, value); }
    return { key, value };
  },
  async delete(key) {
    if (isLocal(key)) { localStorage.removeItem("mb:" + key); return { key, deleted: true }; }
    try { await req("/kv/" + encodeURIComponent(key), { method: "DELETE" }); }
    catch (e) { localStorage.removeItem("mb:" + key); }
    return { key, deleted: true };
  },
  async list(prefix = "") {
    try { const d = await (await req("/kv?prefix=" + encodeURIComponent(prefix))).json(); return { keys: d.keys || [], prefix }; }
    catch (e) { return { keys: [], prefix }; }
  },
};
