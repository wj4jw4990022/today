// 自動測試用：在本機（模擬的 D1）直接呼叫 Worker，不需要網路
import { getPlatformProxy } from 'wrangler';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

const stmts = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);

export async function setup() {
  const { env, dispose } = await getPlatformProxy({ persist: false });
  for (const f of ['../migrations/0001_init.sql', '../migrations/0002_page_content.sql', '../migrations/0003_shop_order.sql', './seed.sql']) for (const s of stmts(f)) await env.DB.prepare(s).run();
  const mails = [], pushes = [], pending = [];
  env.GOOGLE_CLIENT_ID = 'cid'; env.ALLOW_TEST_TOKENS = '1';
  env.MAIL_RELAY_URL = 'https://relay.test/m'; env.MAIL_RELAY_KEY = 'k';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    if (String(u).startsWith('https://relay.test/')) { mails.push(JSON.parse(o.body)); return new Response('ok'); }
    if (String(u).startsWith('https://api.line.me/')) { pushes.push(JSON.parse(o.body)); return new Response('{}'); }
    return realFetch(u, o);
  };
  const ctx = { waitUntil: (p) => pending.push(p) };
  const call = async (req) => { const r = await worker.fetch(req, env, ctx); await Promise.all(pending.splice(0)); return r; };
  const post = async (o) => JSON.parse(await (await call(new Request('https://t.test/api', { method: 'POST', body: JSON.stringify(o) }))).text());
  const get = async (q) => JSON.parse(await (await call(new Request('https://t.test/api?' + new URLSearchParams(q)))).text());
  const raw = (path) => call(new Request('https://t.test' + path));
  return { env, post, get, raw, mails, pushes, dispose, db: env.DB };
}

let ok = 0, bad = 0;
export async function t(name, fn) {
  try { await fn(); ok++; console.log('✓', name); } catch (e) { bad++; console.log('✗', name, '\n   ', e.message); process.exitCode = 1; }
}
export const summary = () => console.log(`${ok} passed${bad ? ', ' + bad + ' FAILED' : ''}`);
