import { UserError, clean, todayStr, nowMinute, isDate, imgUrl, isTrue, byOrder } from './util.js';
import { needShop, needAll } from './service.js';

/**
 * 健康餐模組（階段一：菜單與後台品項管理）
 * 權限：能管理 h1 的管理員可改品項、加購、蔬菜；「健康餐設定」只有總管理員能改。
 */
const SHOP = 'h1';

async function settings(c) {
  const m = {};
  (await c.db.all('健康餐設定')).forEach((r) => { m[r['設定項目']] = r['值']; });
  return m;
}
const num = (v, def) => { const n = Number(String(v === undefined || v === null ? '' : v).replace(/,/g, '')); return isNaN(n) || String(v).trim() === '' ? def : n; };
function int(v, label, max) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (s === '') return '';
  if (!/^\d+$/.test(s) || Number(s) > (max || 100000)) throw new UserError(label + '請填寫 0 以上的整數');
  return Number(s);
}
const img = (u) => { u = clean(u, 500); if (u && !imgUrl(u)) throw new UserError('圖片網址必須是 https 開頭'); return u; };
/** 解析蔬菜文字：「花椰菜 60g（綠）」→ { name, grams, color } */
export function parseVeg(txt) {
  return String(txt || '').split(/[,，、\n]+/).map((t) => t.trim()).filter(Boolean).map((t) => {
    let color = '', grams = '';
    t = t.replace(/[（(]\s*(紅|黃|綠|橙|紫|白|棕)\s*[）)]/, (m, col) => { color = col; return ''; });
    t = t.replace(/(\d+)\s*g\b/i, (m, g) => { grams = Number(g); return ''; });
    return { name: t.replace(/\s+/g, ' ').trim(), grams, color };
  }).filter((v) => v.name);
}
/** 目前這一週的蔬菜：週起始日 ≤ 今天 的最後一筆；都還沒到就用最早的一筆 */
async function currentVeg(c) {
  const today = todayStr();
  const rows = (await c.db.all('每週蔬菜')).filter((r) => isDate(String(r['週起始日']))).sort((a, b) => String(a['週起始日']).localeCompare(String(b['週起始日'])));
  let cur = null; rows.forEach((r) => { if (String(r['週起始日']) <= today) cur = r; });
  return cur || rows[0] || null;
}

/* ---------- 前台：菜單 ---------- */
export async function publicMenu(c) {
  const st = await settings(c);
  if (!isTrue(st['健康餐頁面開放'])) return { open: false }; // 還沒開放：不對外提供任何價格與品項
  const items = (await c.db.all('健康餐品項', { 店家ID: SHOP })).filter((r) => isTrue(r['顯示'])).sort(byOrder).map((r) => ({
    id: r['品項ID'], size: r['份量'], main: r['主菜'], mainDesc: r['主菜內容'], rice: num(r['飯克數'], 0), vegG: num(r['蔬菜克數'], 0),
    kcal: num(r['熱量'], 0), protein: num(r['蛋白質'], 0), carb: num(r['碳水'], 0), fat: num(r['脂肪'], 0),
    price: num(r['單點價'], 0), upg: num(r['訂閱加價'], 0), name: r['品名'], desc: r['介紹'], image: imgUrl(r['圖片網址'])
  }));
  const truffleOpen = isTrue(st['松露醬開放']);
  const addons = (await c.db.all('加購品項', { 店家ID: SHOP })).filter((r) => isTrue(r['顯示'])).sort(byOrder)
    .filter((r) => r['名稱'] !== '松露醬' || truffleOpen)
    .map((r) => ({ id: r['品項ID'], type: r['類型'], name: r['名稱'], desc: r['內容'], protein: num(r['蛋白質'], 0), price: num(r['加購價'], null), free: isTrue(r['免費']), image: imgUrl(r['圖片網址']) }));
  const v = await currentVeg(c);
  const veg = v ? { weekStart: String(v['週起始日']), fixed: parseVeg(v['固定蔬菜']), rotating: parseVeg(String(v['輪替蔬菜1'] || '') + ',' + String(v['輪替蔬菜2'] || '')), image: imgUrl(v['圖片網址']) } : null;
  const plans = [8, 12, 20].map((n) => {
    const total = num(st['方案' + n + '餐_總價'], 0), per = num(st['方案' + n + '餐_每餐'], 0) || (n ? Math.round(total / n) : 0);
    return { meals: n, total, per };
  }).filter((p) => p.total > 0);
  return {
    open: true, items, addons, veg, plans,
    upgrade: { size: { LIGHT: num(st['份量加價_LIGHT'], 0), BALANCE: num(st['份量加價_BALANCE'], 0), POWER: num(st['份量加價_POWER'], 0) }, main: { 雞胸: num(st['主菜加價_雞胸'], 0), 雞腿排: num(st['主菜加價_雞腿排'], 0), 牛排: num(st['主菜加價_牛排'], 0) } },
    days: num(st['每期天數'], 30), pause: { times: num(st['暫停每期次數'], 1), days: num(st['暫停最多天數'], 7) }
  };
}

/* ---------- 後台 ---------- */
export const healthOps = {
  async adminHealthList(c, p, a) {
    needShop(a, SHOP);
    const st = await settings(c);
    const settingsRows = a.all ? (await c.db.all('健康餐設定')).map((r) => ({ key: r['設定項目'], value: r['值'], note: r['說明'], status: r['狀態'] || '' })) : null;
    const cur = await currentVeg(c);
    return {
      items: (await c.db.all('健康餐品項', { 店家ID: SHOP })).sort(byOrder).map((r) => ({ id: r['品項ID'], size: r['份量'], main: r['主菜'], mainDesc: r['主菜內容'], rice: r['飯克數'], vegG: r['蔬菜克數'], kcal: r['熱量'], protein: r['蛋白質'], carb: r['碳水'], fat: r['脂肪'], price: r['單點價'], upg: r['訂閱加價'], name: r['品名'], desc: r['介紹'], image: r['圖片網址'], on: isTrue(r['顯示']), order: r['排序'] })),
      addons: (await c.db.all('加購品項', { 店家ID: SHOP })).sort(byOrder).map((r) => ({ id: r['品項ID'], type: r['類型'], name: r['名稱'], desc: r['內容'], protein: r['蛋白質'], price: r['加購價'], free: isTrue(r['免費']), image: r['圖片網址'], on: isTrue(r['顯示']), order: r['排序'] })),
      veg: (await c.db.all('每週蔬菜')).sort((x, y) => String(y['週起始日']).localeCompare(String(x['週起始日']))).slice(0, 12).map((r) => ({ start: String(r['週起始日']), fixed: r['固定蔬菜'], r1: r['輪替蔬菜1'], r2: r['輪替蔬菜2'], image: r['圖片網址'], by: r['更新人員'], at: r['更新時間'] })),
      open: isTrue(st['健康餐頁面開放']), currentWeek: cur ? cur['週起始日'] : '', settings: settingsRows
    };
  },
  /** 餐點品項：後台可新增、修改（含份量與主菜名稱）、刪除。沒有 id＝新增 */
  async adminSaveHealthItem(c, p, a) {
    needShop(a, SHOP);
    const it = p.item || {}, id = clean(it.id, 30), size = clean(it.size, 20), main = clean(it.main, 20);
    if (!size || !main) throw new UserError('請填寫份量與主菜');
    const vals = {
      份量: size, 主菜: main, 主菜內容: clean(it.mainDesc, 60), 飯克數: int(it.rice, '飯克數', 1000), 蔬菜克數: int(it.vegG, '蔬菜克數', 1000),
      熱量: int(it.kcal, '熱量', 5000), 蛋白質: int(it.protein, '蛋白質', 500), 碳水: int(it.carb, '碳水', 500), 脂肪: int(it.fat, '脂肪', 500),
      單點價: int(it.price, '單點價', 100000), 訂閱加價: int(it.upg, '訂閱加價', 100000),
      品名: clean(it.name, 60) || ('健康餐 ' + size + ' ' + main), 介紹: clean(it.desc, 300), 圖片網址: img(it.image), 顯示: !!it.on, 排序: parseInt(it.order, 10) || 999
    };
    if (vals['單點價'] === '') throw new UserError('請填寫單點價');
    const rows = await c.db.all('健康餐品項', { 店家ID: SHOP });
    if (rows.some((r) => r['份量'] === size && r['主菜'] === main && r['品項ID'] !== id)) throw new UserError('已經有「' + size + ' ' + main + '」這一款了');
    if (id) {
      const hit = rows.filter((r) => r['品項ID'] === id)[0];
      if (!hit) throw new UserError('找不到這個品項');
      await c.db.update('健康餐品項', hit._row, vals);
    } else { vals['品項ID'] = 'HM-' + Date.now().toString(36).toUpperCase(); vals['店家ID'] = SHOP; await c.db.insert('健康餐品項', vals); }
    return { ok: true };
  },
  async adminDeleteHealthItem(c, p, a) {
    needShop(a, SHOP);
    const hit = await c.db.first('健康餐品項', { 品項ID: p.id, 店家ID: SHOP });
    if (hit) await c.db.remove('健康餐品項', hit._row);
    return { ok: true };
  },
  async adminSaveAddon(c, p, a) {
    needShop(a, SHOP);
    const it = p.item || {}, name = clean(it.name, 40), type = clean(it.type, 10);
    if (!name) throw new UserError('請填寫名稱');
    if (['醬汁', '飲品'].indexOf(type) < 0) throw new UserError('類型請選醬汁或飲品');
    const vals = { 店家ID: SHOP, 類型: type, 名稱: name, 內容: clean(it.desc, 200), 蛋白質: int(it.protein, '蛋白質', 500), 加購價: int(it.price, '加購價', 100000), 免費: !!it.free, 圖片網址: img(it.image), 顯示: !!it.on, 排序: parseInt(it.order, 10) || 999 };
    if (vals['顯示'] && !vals['免費'] && vals['加購價'] === '') throw new UserError('要顯示的收費品項請填寫加購價（價格未定請先取消「顯示」）');
    if (it.id) {
      const hit = await c.db.first('加購品項', { 品項ID: it.id, 店家ID: SHOP });
      if (!hit) throw new UserError('找不到這個品項');
      await c.db.update('加購品項', hit._row, vals);
    } else { vals['品項ID'] = 'AD-' + Date.now().toString(36).toUpperCase(); await c.db.insert('加購品項', vals); }
    return { ok: true };
  },
  async adminDeleteAddon(c, p, a) {
    needShop(a, SHOP);
    const hit = await c.db.first('加購品項', { 品項ID: p.id, 店家ID: SHOP });
    if (hit) await c.db.remove('加購品項', hit._row);
    return { ok: true };
  },
  /** 每週蔬菜：以「週起始日」為鍵，同一週再存一次就是覆蓋 */
  async adminSaveVeg(c, p, a) {
    needShop(a, SHOP);
    const v = p.veg || {}, start = clean(v.start, 10);
    if (!isDate(start)) throw new UserError('請選擇週起始日');
    const vals = { 週起始日: start, 固定蔬菜: clean(v.fixed, 200), 輪替蔬菜1: clean(v.r1, 60), 輪替蔬菜2: clean(v.r2, 60), 圖片網址: img(v.image), 更新人員: a.email, 更新時間: nowMinute() };
    if (!parseVeg(vals['固定蔬菜']).length && !vals['輪替蔬菜1'] && !vals['輪替蔬菜2']) throw new UserError('請至少填一種蔬菜');
    const hit = await c.db.first('每週蔬菜', { 週起始日: start });
    if (hit) await c.db.update('每週蔬菜', hit._row, vals); else await c.db.insert('每週蔬菜', vals);
    return { ok: true };
  },
  async adminDeleteVeg(c, p, a) {
    needShop(a, SHOP);
    const hit = await c.db.first('每週蔬菜', { 週起始日: String(p.start) });
    if (hit) await c.db.remove('每週蔬菜', hit._row);
    return { ok: true };
  },
  /** 健康餐設定：只有總管理員能改「值」，設定項目名稱不能改 */
  async adminSaveHealthSetting(c, p, a) {
    needAll(a);
    const key = clean(p.key, 60), val = clean(p.value, 100);
    const hit = await c.db.first('健康餐設定', { 設定項目: key });
    if (!hit) throw new UserError('找不到這個設定項目');
    await c.db.update('健康餐設定', hit._row, { 值: val });
    console.log('健康餐設定 ' + key + ' 改為「' + val + '」 by ' + a.email);
    return { ok: true };
  }
};
