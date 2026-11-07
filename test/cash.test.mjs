// 2026-11-07 試跑修正：付現訂單取消、付現的方案升級、配送改自取、刪除帳號紅利歸零
import assert from 'node:assert/strict';
import { setup, t, summary } from './harness.mjs';

const S = await setup();
const { post, db } = S;
const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results;
const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(Date.now() + n * 86400000));
const dow = (s) => new Date(s + 'T12:00:00+08:00').getUTCDay();
const A = { idToken: 'test:boss@x.com' };
const { runCutoff } = await import('../src/orders.js'); const { startSession } = await import('../src/line.js'); const { Db } = await import('../src/db.js');
const cx = { env: S.env, db: new Db(S.env.DB) };
await q("UPDATE health_settings SET value='23:59' WHERE key='截單時間'");
let k = 1; while (dow(day(k)) === 3) k++; const D1 = day(k);
const cut = async () => { await q("UPDATE health_settings SET value='00:00' WHERE key='截單時間'"); await runCutoff(cx); await q("UPDATE health_settings SET value='23:59' WHERE key='截單時間'"); };
const newMember = async (line, name, phone, topup, meals) => {
  const ck = 'zm=' + await startSession(cx, line, name);
  assert((await S.postc({ action: 'memberRegister', name, phone, agreeTerms: 1, agreePrivacy: 1 }, ck)).ok);
  const id = (await S.postc({ action: 'memberMe' }, ck)).data.id;
  if (topup) await post({ ...A, action: 'adminTopup', memberId: id, amount: topup, method: '現金' });
  if (meals) await post({ ...A, action: 'adminBuyPlan', memberId: id, meals });
  return { id, O: (o) => S.postc(o, ck) };
};
const order = async (oid) => (await q('SELECT * FROM orders WHERE order_id=?', oid))[0];
const sub = { itemId: 'HM-L-CB', sauce: 'AD-S-OIL', useSub: 1 };

await t('付現：取消其中的單點，應收現金跟著減少', async () => {
  const m = await newMember('Uc1', '付現甲', '0955000001', 1400, 8);
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pay: '現付', lines: [sub, { itemId: 'HM-L-CB', sauce: 'AD-S-OIL', qty: 2 }] });
  assert(r.ok, r.error); assert.equal((await order(r.data.orderId)).cash_due, 380);
  const single = (await q("SELECT res_id FROM reservations WHERE order_id=? AND kind='單點'", r.data.orderId))[0].res_id;
  assert((await m.O({ action: 'orderCancel', resId: single })).ok);
  assert.equal((await order(r.data.orderId)).cash_due, 0);
});

await t('付現：方案餐的升級與加購算進應收，截單時不從錢包扣', async () => {
  const m = await newMember('Uc2', '付現乙', '0955000002', 1400, 8); // 買完錢包 0
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '晚上', pay: '現付', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', drinks: ['AD-D-PSM'], useSub: 1 }] });
  assert(r.ok, r.error); assert.equal(r.data.cashDue, 80); // 升級 20＋豆漿 60
  assert.equal((await order(r.data.orderId)).cash_due, 80);
  await cut();
  const res = (await q('SELECT * FROM reservations WHERE order_id=?', r.data.orderId))[0];
  assert.equal(res.status, '已鎖定'); assert.equal(res.size, 'BALANCE'); assert.equal(res.charge_status, '取餐付現');
  assert.equal((await q("SELECT COUNT(*) n FROM wallet_ledger WHERE member_id=? AND type='升級加購扣款'", m.id))[0].n, 0);
});

await t('付現：錢包付款的訂單照舊截單時從錢包扣', async () => {
  const m = await newMember('Uc3', '錢包丙', '0955000003', 2000, 8);
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pay: '錢包', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', useSub: 1 }] });
  assert(r.ok, r.error); await cut();
  assert.equal((await q("SELECT SUM(amount) s FROM wallet_ledger WHERE member_id=? AND type='升級加購扣款'", m.id))[0].s, -20);
});

await t('付現：已收現金後店家補償，付的錢退到錢包、方案加回 1 餐', async () => {
  const m = await newMember('Uc4', '補償丁', '0955000004', 1400, 8);
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pay: '現付', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', useSub: 1 }, { itemId: 'HM-L-CB', sauce: 'AD-S-OIL', qty: 1 }] });
  assert(r.ok, r.error); await cut();
  await q('UPDATE reservations SET date=? WHERE order_id=?', day(0), r.data.orderId); // 假裝今天是取餐日
  assert((await post({ ...A, action: 'adminOrderCash', orderId: r.data.orderId })).ok);
  for (const x of await q('SELECT res_id FROM reservations WHERE order_id=?', r.data.orderId)) assert((await post({ ...A, action: 'adminMarkPickup', resId: x.res_id, status: '店家補償', reason: '做錯' })).ok);
  assert.equal((await q("SELECT SUM(amount) s FROM wallet_ledger WHERE member_id=? AND type='退款轉入'", m.id))[0].s, 210); // 單點 190＋升級 20
  assert.equal((await q("SELECT remaining FROM subscriptions WHERE member_id=?", m.id))[0].remaining, 8);
});

await t('整期升級：付現的已預約餐，應收跟著減少', async () => {
  const m = await newMember('Uc5', '升級戊', '0955000005', 2000, 8);
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pay: '現付', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', useSub: 1 }] });
  assert.equal((await order(r.data.orderId)).cash_due, 20);
  const u = await m.O({ action: 'planUpgrade', size: 'BALANCE', main: '雞胸' }); assert(u.ok, u.error);
  assert.equal((await order(r.data.orderId)).cash_due, 0);
  assert.equal((await q('SELECT charge_status FROM reservations WHERE order_id=?', r.data.orderId))[0].charge_status, '未扣款');
});

await t('配送點未達門檻改自取：訂單也改成自取', async () => {
  await q("INSERT INTO delivery_points (point_id,name,address,distance_km,slots,enabled,note) VALUES ('DPT','測試點','',1,'中午,晚上',1,'')");
  const m = await newMember('Uc6', '配送己', '0955000006', 1000, 0);
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '晚上', pickup: '配送點', pointId: 'DPT', feeOk: false, pay: '錢包', lines: [{ itemId: 'HM-L-CB', sauce: 'AD-S-OIL', qty: 1 }] });
  assert(r.ok, r.error); await cut();
  const o = await order(r.data.orderId); assert.equal(o.pickup, '自取'); assert.equal(o.point_id, '');
});

await t('刪除帳號：只剩紅利可以刪，紅利歸零；有可退現金仍要先退款', async () => {
  const m = await newMember('Uc7', '刪除庚', '0955000007', 0, 0);
  await q("INSERT INTO wallet_ledger (rec_id,member_id,at,type,amount,refundable,status) VALUES ('WB1',?,'2026-11-07 10:00:00','推薦紅利',50,0,'已入帳')", m.id);
  await post({ ...A, action: 'adminTopup', memberId: m.id, amount: 1000, method: '現金' });
  const e = await m.O({ action: 'memberDelete', confirm: '刪除' }); assert(!e.ok && e.error.includes('可退現金'), JSON.stringify(e));
  await q("INSERT INTO wallet_ledger (rec_id,member_id,at,type,amount,refundable,status) VALUES ('WB2',?,'2026-11-07 11:00:00','退現金',-1000,1,'已入帳')", m.id);
  const r = await m.O({ action: 'memberDelete', confirm: '刪除' }); assert(r.ok, r.error);
  assert.equal((await q("SELECT amount FROM wallet_ledger WHERE member_id=? AND type='紅利收回'", m.id))[0].amount, -50);
  assert.equal((await q('SELECT status FROM members WHERE member_id=?', m.id))[0].status, '已刪除');
});

await t('錢包紀錄：每筆顯示扣了多少紅利、多少錢包', async () => {
  const m = await newMember('Uc8', '紅利辛', '0955000008', 1000, 0);
  await q("INSERT INTO wallet_ledger (rec_id,member_id,at,type,amount,refundable,status) VALUES ('WB9',?,'2026-11-07 12:00:00','推薦紅利',100,0,'已入帳')", m.id);
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '晚上', pay: '錢包', lines: [{ itemId: 'HM-L-CB', sauce: 'AD-S-OIL', qty: 1 }] }); assert(r.ok, r.error);
  const me = (await m.O({ action: 'memberMe' })).data;
  assert.equal(me.wallet.total, 910); assert.equal(me.wallet.cash, 910); assert.equal(me.wallet.bonus, 0); assert.equal(me.wallet.held, 0);
  const x = me.ledger.find((l) => l.type === '單點扣款'); assert.equal(x.bonus, -100); assert.equal(x.cash, -90);
  assert.equal(me.ledger.find((l) => l.type === '推薦紅利').bonus, 100);
  const g = (await post({ ...A, action: 'adminMemberGet', memberId: m.id })).data; assert.equal(g.ledger.find((l) => l.type === '單點扣款').bonus, -100);
});

await t('圈存：方案餐升級＋加購先預留，可用餘額不夠就不能再加點', async () => {
  const m = await newMember('Uh1', '圈存壬', '0955000011', 1400, 8); // 買完錢包 0
  await post({ ...A, action: 'adminTopup', memberId: m.id, amount: 1000, method: '現金' }); // 錢包 1000
  let ok = 0, last; const days = []; for (let i = 1; days.length < 8; i++) if (dow(day(i)) !== 3) days.push(day(i));
  for (const d of days) { last = await m.O({ action: 'orderCreate2', date: d, slot: '中午', pay: '錢包', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', drinks: ['AD-D-PSM'], useSub: 1 }] }); if (last.ok) ok++; else break; } // 每份預留 20＋60＝80
  assert.equal(ok, 8); // 8 × 80 = 640 ≤ 1000
  const me = (await m.O({ action: 'memberMe' })).data; assert.equal(me.wallet.held, 640); assert.equal(me.wallet.avail.total, 360); assert.equal(me.wallet.total, 1000);
  const r = await m.O({ action: 'orderCreate2', date: days[0], slot: '晚上', pay: '錢包', lines: [{ itemId: 'HM-L-CB', sauce: 'AD-S-OIL', qty: 2 }] }); // 單點 380 > 可用 360
  assert(!r.ok && r.error.includes('可用餘額不足'), JSON.stringify(r));
  const rf = await m.O({ action: 'payRefund', amount: 400, method: '門市領現' }); assert(!rf.ok && rf.error.includes('最多可以退 360'), JSON.stringify(rf));
});

await t('圈存：取消就解除預留；截單才真的扣', async () => {
  const m = await newMember('Uh2', '圈存癸', '0955000012', 1400, 8);
  await post({ ...A, action: 'adminTopup', memberId: m.id, amount: 1000, method: '現金' });
  const a1 = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pay: '錢包', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', drinks: ['AD-D-PSM'], useSub: 1 }] }); assert(a1.ok, a1.error);
  let k2 = k + 1; while (dow(day(k2)) === 3) k2++;
  const a2 = await m.O({ action: 'orderCreate2', date: day(k2), slot: '中午', pay: '錢包', lines: [{ itemId: 'HM-B-CB', sauce: 'AD-S-OIL', useSub: 1 }] }); assert(a2.ok, a2.error);
  assert.equal((await m.O({ action: 'memberMe' })).data.wallet.held, 100);
  assert((await m.O({ action: 'orderCancelWhole', orderId: a2.data.orderId })).ok);
  assert.equal((await m.O({ action: 'memberMe' })).data.wallet.held, 80);
  await cut(); // 截單只鎖 D1
  const w = (await m.O({ action: 'memberMe' })).data.wallet; assert.equal(w.held, 0); assert.equal(w.total, 920);
});

await t('圈存：配送點勾「願付配送費」先預留，錢包付款的可用餘額要夠', async () => {
  const m = await newMember('Uh3', '圈存子', '0955000013', 1400, 8);
  await post({ ...A, action: 'adminTopup', memberId: m.id, amount: 1000, method: '現金' });
  await post({ ...A, action: 'adminWalletAdjust', memberId: m.id, amount: -990, reason: '測試', refundable: true }); // 剩 10
  const r = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pickup: '配送點', pointId: 'DPT', feeOk: true, pay: '錢包', lines: [sub] });
  assert(!r.ok && r.error.includes('配送費'), JSON.stringify(r));
  const r2 = await m.O({ action: 'orderCreate2', date: D1, slot: '中午', pickup: '配送點', pointId: 'DPT', feeOk: false, pay: '錢包', lines: [sub] }); assert(r2.ok, r2.error);
});

summary(); await S.dispose(); process.exit(process.exitCode || 0);
