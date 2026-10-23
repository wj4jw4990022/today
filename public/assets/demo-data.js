// 預覽用範例資料（API_URL 留空時使用）。正式上線後不會用到。
(function () {
  var hk = '漢口總店', S = [
    ['h1', hk, '1F 前段', '致日子咖啡 複合式餐館', '餐館', true, 10, 8, [], '11:30,13:00,14:30,16:00,18:00'],
    ['h1b', hk, '1F 後段', '167 選物服飾', '選物服飾', true, 3, 4, [], '11:00,13:00,15:00,17:00,19:00'],
    ['h2', hk, '2F', 'HEJ 髮型工作室', '髮型', true, 1, 1, [], '11:00,13:00,15:00,17:00,19:00'],
    ['h2b', hk, '2F', '蝕 刺青', '刺青', true, 1, 1, [], '11:00,13:00,15:00,17:00,19:00'],
    ['h3', hk, '3F', '關於小三', '靈石選物', true, 3, 4, [], '11:00,13:00,15:00,17:00,19:00'],
    ['h3b', hk, '3F', '旧室推拿', '推拿', true, 1, 1, [], '11:00,13:00,15:00,17:00,19:00'],
    ['h3c', hk, '3F', '杉境・川合空間', '待補', true, 1, 1, [], '11:00,13:00,15:00,17:00,19:00'],
    ['h4', hk, '4F', 'our time', '婚紗攝影、租借', true, 1, 4, [], '10:00,12:00,14:00,16:00,18:00'],
    ['p', '黃埔二店', '全館', '致日子 黃埔二店', '餐館', true, 10, 8, [2, 3], '11:30,13:00,14:30,16:00,18:00']
  ];
  var slots = {};
  var shops = S.map(function (r) {
    slots[r[0]] = { cap: r[6], list: r[9].split(',') };
    return { id: r[0], hall: r[1], floor: r[2], name: r[3], type: r[4], open: r[5], hours: '待補', note: '', image: '', tagline: r[0] === 'h1' ? '從清晨的手沖到午後的甜點，一樓最先亮起來的那盞燈。' : '', intro: r[0] === 'h1' || r[0] === 'h1b' || r[0] === 'h2' ? '[店家介紹：這裡會顯示這間店的簡短介紹，最多三行，超過的部分會用刪節號截斷，客人點進店家頁才看全文。]' : '', gallery: r[0] === 'h1' ? ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'] : [], contact: r[0] === 'h1b' ? { btnText: '到店參觀', btnMode: 'tel', phone: '07-0000000', ig: 'https://instagram.com/x', fb: '', line: '' } : r[0] === 'h4' ? { btnText: '諮詢預約', btnMode: 'book', phone: '', ig: 'https://instagram.com/x', fb: 'https://facebook.com/x', line: 'https://line.me/x' } : r[0] === 'h2b' ? { btnText: '預約', btnMode: 'none', phone: '', ig: '', fb: '', line: '' } : { btnText: '預約', btnMode: 'book', phone: '', ig: '', fb: '', line: '' }, hoursStart: r[0] === 'h2b' ? '' : '11:00', hoursEnd: r[0] === 'h2b' ? '' : '20:00', showHours: r[0] !== 'h2b', itemsTitle: r[0] === 'h2' ? '服務項目' : '商品', items: r[0] === 'h2' ? [{ id: 'a', cat: '剪髮', name: '[項目 A]', desc: '[介紹]', price: 'NT$1,200 起', image: '' }, { id: 'b', cat: '剪髮', name: '[項目 B]', desc: '', price: '', image: '' }, { id: 'c', cat: '染燙', name: '[項目 C]', desc: '[介紹]', price: 'NT$3,000 起', image: '' }] : [],
      maxParty: r[7], advanceDays: r[0] === 'h4' ? 60 : 30, closed: r[8] };
  });
  var menu = [];
  [['漢口總店', '牛肉麵'], ['漢口總店', '咖啡與茶飲'], ['漢口總店', '甜點與輕食'], ['黃埔二店', '主餐'], ['黃埔二店', '飲品與甜點']].forEach(function (c) {
    for (var i = 1; i <= 3; i++) menu.push({ id: c[0] + c[1] + i, hall: c[0], cat: c[1], name: '[品名 ' + i + ']', desc: '[品項介紹]', price: '[價格]', image: '' });
  });
  window.DEMO = { data: { shops: shops, content: {}, menu: menu }, slots: slots };

  /* 健康餐示範資料（只在預覽模式使用；正式資料來自試算表「健康餐品項」等分頁） */
  (function () {
    var mains = [['雞胸', '雞胸', [100, 150, 200], 0], ['雞腿排', '雞腿排', [100, 150, 210], 10], ['牛排', '牛排', [75, 100, '75g＋雞胸 100'], 50]];
    var sz = [['LIGHT', 120, [545, 40, 54, 19], 190], ['BALANCE', 150, [650, 53, 65, 20], 220], ['POWER', 200, [785, 66, 82, 21], 250]], items = [], n = 0;
    mains.forEach(function (m, mi) {
      sz.forEach(function (s, si) {
        n++; var d = [0, 20, 50][si] + m[3] + (mi === 2 && si === 2 ? 0 : 0);
        items.push({ id: 'HM-' + n, size: s[0], main: m[0], mainDesc: m[0] + ' ' + m[2][si] + (typeof m[2][si] === 'number' ? 'g' : 'g'), rice: s[1], vegG: 250, kcal: s[2][0] + mi * 70, protein: s[2][1] - mi * 4, carb: s[2][2], fat: s[2][3] + mi * 8, price: s[3] + [0, 10, 50][mi], upg: d, name: '健康餐 ' + s[0] + ' ' + m[0], desc: '', image: '' });
      });
    });
    window.DEMO.health = { open: true, items: items,
      addons: [{ id: 'a1', type: '醬汁', name: '油醋', desc: '', protein: 0, price: 0, free: true, image: '' }, { id: 'a2', type: '醬汁', name: '百香果', desc: '', protein: 0, price: 0, free: true, image: '' }, { id: 'a3', type: '醬汁', name: '和風', desc: '可能含大豆、麩質', protein: 0, price: 0, free: true, image: '' },
        { id: 'a4', type: '飲品', name: '高蛋白豆漿', desc: '無糖豆漿 300ml＋乳清', protein: 24, price: 60, free: false, image: '' }],
      veg: { weekStart: '2026-10-19', fixed: [{ name: '花椰菜', grams: 60, color: '綠' }, { name: '高麗菜', grams: 60, color: '綠' }, { name: '炒菇', grams: 50, color: '棕' }], rotating: [{ name: '彩椒', grams: '', color: '紅' }, { name: '南瓜', grams: '', color: '黃' }], image: '' },
      plans: [{ meals: 8, total: 1400, per: 175 }, { meals: 12, total: 1980, per: 165 }, { meals: 20, total: 3100, per: 155 }],
      upgrade: { size: { LIGHT: 0, BALANCE: 20, POWER: 50 }, main: { '雞胸': 0, '雞腿排': 10, '牛排': 50 } }, days: 30, pause: { times: 1, days: 7 } };
    window.DEMO.data.healthOpen = true;
  })();
})();
