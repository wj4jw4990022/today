/* 致日子官網 前台共用程式 */
(function () {
  var cfg = window.SITE_CONFIG || {};
  var Z = window.Z = {};

  Z.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  Z.isPlaceholder = function (s) { return !s || /^\s*(待補|\[.*\])\s*$/.test(String(s)); };
  Z.safeUrl = function (u) { return /^https?:\/\//i.test(u || '') || /^\/img\/[\w-]+$/.test(u || '') ? u : ''; }; // 本站上傳的圖片是 /img/編號

  /* ---------- API ---------- */
  function unwrap(j) { if (!j.ok) throw new Error(j.error || '發生錯誤'); return j.data; }
  Z.demo = !cfg.API_URL;
  Z.get = function (params) {
    if (Z.demo) return Promise.resolve(demoGet(params));
    return fetch(cfg.API_URL + '?' + new URLSearchParams(params)).then(function (r) { return r.json(); }).then(unwrap);
  };
  Z.post = function (body) {
    if (Z.demo) return Promise.resolve(demoPost(body));
    return fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(unwrap);
  };
  function demoGet(p) {
    if (p.action === 'public') return window.DEMO.data;
    if (p.action === 'healthMenu') return window.DEMO.health;
    var s = window.DEMO.slots[p.shopId], shop = window.DEMO.data.shops.filter(function (x) { return x.id === p.shopId; })[0];
    var d = new Date(p.date + 'T12:00:00'), res = { shopId: p.shopId, date: p.date, open: shop.open, slots: [], reason: '' };
    if (!shop.open) res.reason = '這間店目前暫停線上預約';
    else if (shop.closed.indexOf(d.getDay()) >= 0) res.reason = '這天公休';
    else res.slots = s.list.map(function (t, i) { return { time: t, left: i === 1 ? 0 : s.cap }; });
    return res;
  }
  function demoPost(b) { if (b.action === 'book') return { id: 'DEMO-0001' }; return { ok: true }; }

  var CK = 'zhirizi_pub2';
  function fresh() {
    return Z.get({ action: 'public' }).then(function (d) {
      try { localStorage.setItem(CK, JSON.stringify({ t: Date.now(), d: d, api: cfg.API_URL })); } catch (e) {}
      return d;
    });
  }
  Z.clearPub = function () { try { localStorage.removeItem(CK); } catch (e) {} };
  /* 有快取就立刻用（秒開），超過 30 秒會在背景更新，下一頁就是新資料 */
  Z.pub = function () {
    try {
      var c = JSON.parse(localStorage.getItem(CK) || 'null');
      if (c && c.api === cfg.API_URL && Date.now() - c.t < 3600000) {
        if (Date.now() - c.t > 30000) fresh().catch(function () {});
        return Promise.resolve(c.d);
      }
    } catch (e) {}
    return fresh();
  };

  /* ---------- 版面 ---------- */
  var HOME = 'index.html';
  var GROUPS = [
    { key: 'hankou', label: '漢口店', hall: '漢口總店', home: 'hankou.html', menu: 'hankou-menu.html', book: 'booking.html' },
    { key: 'huangpu', label: '黃埔店', hall: '黃埔二店', home: 'huangpu.html', menu: 'huangpu-menu.html', book: 'booking.html?shop=p' }
  ];
  function groupOf(active) { return /^(hankou|shop)/.test(active || '') ? 'hankou' : /^huangpu/.test(active || '') ? 'huangpu' : ''; }

  /* 下拉選單內容：先放固定項目，資料載入後再補上各店家 */
  function panelHtml(g, shops) {
    var h = '<a href="' + g.home + '">' + g.hall + ' 介紹</a><a href="' + g.menu + '">餐點介紹</a>';
    if (shops && g.key === 'hankou') {
      var list = shops.filter(function (s) { return s.hall === g.hall; }), order = [], by = {};
      list.forEach(function (s) { var f = String(s.floor).split(' ')[0]; if (!by[f]) { by[f] = []; order.push(f); } by[f].push(s); });
      order.sort();
      h += '<div class="sep"></div>' + order.map(function (f) {
        return '<div class="gl">' + Z.esc(f) + '</div>' + by[f].map(function (s) {
          var sub = String(s.floor).indexOf(' ') > 0 ? '（' + Z.esc(String(s.floor).split(' ')[1]) + '）' : '';
          return '<a href="shop.html?id=' + encodeURIComponent(s.id) + '">' + Z.esc(s.name) + '<span class="sub">' + sub + '</span>' + (s.open ? '' : '<span class="pause">暫停預約</span>') + '</a>';
        }).join('');
      }).join('');
    }
    return h + '<div class="sep"></div><a class="bk" href="' + g.book + '">線上預約 →</a>';
  }
  Z.fillNav = function (d) {
    GROUPS.forEach(function (g) { var el = document.querySelector('.dd[data-g="' + g.key + '"] .ddp'); if (el) el.innerHTML = panelHtml(g, d.shops); });
    var ln = document.querySelector('.links');
    if (d.healthOpen && ln && !ln.querySelector('.hl')) ln.insertAdjacentHTML('beforeend', '<a class="hl ddb' + (/healthy/.test(location.pathname) ? ' on' : '') + '" href="healthy.html" style="display:inline-flex;align-items:center">健康餐</a>');
  };
  function closeAll() { document.querySelectorAll('.dd').forEach(function (d) { d.classList.remove('open'); d.querySelector('.ddb').setAttribute('aria-expanded', 'false'); }); }

  Z.layout = function (active) {
    var cur = groupOf(active);
    document.getElementById('nav').outerHTML =
      '<div class="nav"><a class="logo" href="' + HOME + '" aria-label="致日子"><img class="l1" src="assets/logo.png" alt="致日子"><img class="l2" src="assets/logo-brown.png" alt="致日子"></a><div class="links">' +
      GROUPS.map(function (g) {
        return '<div class="dd" data-g="' + g.key + '"><button type="button" class="ddb' + (g.key === cur ? ' on' : '') + '" aria-haspopup="true" aria-expanded="false">' + g.label + '<span class="car">▾</span></button>' +
          '<div class="ddp">' + panelHtml(g, null) + '</div></div>';
      }).join('') + '</div></div>';
    document.querySelectorAll('.ddb').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var dd = b.parentNode, was = dd.classList.contains('open');
        closeAll();
        if (!was) { dd.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.dd')) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
    var f = document.getElementById('foot');
    if (f) f.outerHTML =
      '<div class="foot"><div style="flex:1 1 220px"><div class="logo" style="color:var(--ink)">致日子</div><div>TO DAY Coffee</div></div>' +
      '<div style="flex:1 1 260px"><b>漢口總店</b><br><span data-c="漢口總店|地址">高雄市三民區漢口街 200 號</span><br><span data-c="漢口總店|電話">[電話]</span></div>' +
      '<div style="flex:1 1 260px"><b>黃埔二店</b><br><span data-c="黃埔二店|地址">高雄市鳳山區黃埔新村西四巷 37 號</span><br><span data-c="黃埔二店|電話">07-7193820</span></div>' +
      '<div style="flex:1 1 200px"><b>更多</b><br><a href="booking.html">線上預約</a><br><a href="contact.html">合作洽談</a><br><a data-c="全站|Facebook" data-link="1">Facebook</a><br><a data-c="全站|Instagram" data-link="1">Instagram</a></div></div>';
  };

  /* 把「內容」分頁的文字、圖片填進有 data-c / data-ci 的元素；沒填或「待補」就保留頁面上的預設字 */
  Z.bind = function (d) {
    var c = d.content || {};
    document.querySelectorAll('[data-c]').forEach(function (el) {
      var v = c[el.getAttribute('data-c')];
      if (!v || Z.isPlaceholder(v.text)) { if (el.hasAttribute('data-link')) el.style.display = 'none'; return; }
      if (el.hasAttribute('data-link')) { var u = Z.safeUrl(v.text); if (u) { el.href = u; el.target = '_blank'; el.rel = 'noopener'; } else el.style.display = 'none'; }
      else el.textContent = v.text;
    });
    document.querySelectorAll('[data-ci]').forEach(function (el) {
      var v = c[el.getAttribute('data-ci')], u = v && Z.safeUrl(v.image);
      if (u) { el.classList.add('has'); el.innerHTML = '<img src="' + Z.esc(u) + '" alt="">'; }
    });
  };

  /* 店家照片：有網址顯示圖片，沒有就顯示站位框 */
  Z.photo = function (url, label, style) {
    var u = Z.safeUrl(url);
    return '<div class="ph' + (u ? ' has' : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + (u ? '<img src="' + Z.esc(u) + '" alt="' + Z.esc(label) + '" loading="lazy">' : '[照片]') + '</div>';
  };
  Z.fail = function (el, msg) { el.innerHTML = '<div class="msg err">' + Z.esc(msg || '資料載入失敗，請稍後再試。') + '</div>'; };

  Z.init = function (active, fn) {
    Z.layout(active);
    Z.pub().then(function (d) { Z.fillNav(d); Z.bind(d); if (fn) fn(d); }).catch(function (e) {
      var m = document.getElementById('main'); if (m) Z.fail(m, e.message);
    });
    if (Z.demo) {
      var b = document.createElement('div');
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#8A5A3B;color:#fff;font-size:12px;letter-spacing:.1em;text-align:center;padding:6px;z-index:9';
      b.textContent = '預覽模式：使用範例資料，尚未連接資料庫';
      document.body.appendChild(b);
    }
  };

  /* 台北時間與營業狀態（首頁「今日營業」、店家頁用） */
  function toMin(t) { var a = String(t).split(':'); return Number(a[0]) * 60 + Number(a[1]); }
  Z.nowTpe = function () {
    var o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).forEach(function (x) { o[x.type] = x.value; });
    return { wd: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday], min: (Number(o.hour) % 24) * 60 + Number(o.minute) };
  };
  Z.hoursState = function (s) {
    if (!s.hoursStart || !s.hoursEnd) return null;
    var n = Z.nowTpe(), a = toMin(s.hoursStart), b = toMin(s.hoursEnd), night = b <= a;
    if ((s.closed || []).indexOf(n.wd) >= 0) return { state: 'closed', text: '今日公休' };
    var open = night ? (n.min >= a || n.min < b) : (n.min >= a && n.min < b);
    if (open) return { state: 'open', text: '營業中・至 ' + s.hoursEnd };
    if (n.min < a) return { state: 'soon', text: s.hoursStart + ' 開始營業' };
    return { state: 'done', text: '今日已打烊' };
  };

  /* 店家主按鈕（依後台「按鈕模式」：預約／電話／不顯示）與社群連結 */
  Z.mainBtn = function (s, cls) {
    var c = s.contact || {}, m = c.btnMode || 'book', t = c.btnText || '預約';
    cls = cls || 'btn';
    if (m === 'none') return '';
    if (m === 'tel') return c.phone ? '<a class="' + cls + '" href="tel:' + Z.esc(String(c.phone).replace(/[^0-9+#]/g, '')) + '">' + Z.esc(t) + '</a>' : '';
    return s.open ? '<a class="' + cls + '" href="booking.html?shop=' + encodeURIComponent(s.id) + '">' + Z.esc(t) + '</a>' : '<span class="btn sm off">暫停' + Z.esc(t) + '</span>';
  };
  Z.social = function (s) {
    var c = s.contact || {}, out = [];
    [['ig', 'IG', 'Instagram'], ['fb', 'FB', 'Facebook'], ['line', 'LINE', 'LINE']].forEach(function (x) { var u = Z.safeUrl(c[x[0]]); if (u) out.push('<a href="' + Z.esc(u) + '" target="_blank" rel="noopener" aria-label="' + x[2] + '">' + x[1] + '</a>'); });
    return out.length ? '<div class="soc">' + out.join('') + '</div>' : '';
  };
  /* 漢口樓層頁的店家卡片（版型 B）：大圖輪播（可滑動／左右鍵）＋縮圖列＋一句話介紹＋按鈕；整張卡片都可點 */
  Z.card = function (s) {
    var href = 'shop.html?id=' + encodeURIComponent(s.id), sub = String(s.floor).indexOf(' ') > 0 ? String(s.floor).split(' ')[1] : '';
    var tag = [sub, Z.isPlaceholder(s.type) ? '' : s.type].filter(Boolean).join('・');
    var hs = s.showHours ? Z.hoursState(s) : null;
    var pics = [s.image].concat(s.gallery || []).filter(function (u, i, a) { return Z.safeUrl(u) && a.indexOf(u) === i; }).slice(0, 12), n = pics.length;
    var media;
    if (!n) media = Z.photo('', s.name, 'height:300px');
    else {
      media = '<div class="car" data-n="' + n + '"><div class="trk">' + pics.map(function (u, i) { return '<div class="sl"><img src="' + Z.esc(u) + '" alt="' + Z.esc(s.name) + ' 照片 ' + (i + 1) + '"' + (i ? ' loading="lazy"' : '') + '></div>'; }).join('') + '</div>' +
        (n > 1 ? '<button type="button" class="ar pv" aria-label="上一張">‹</button><button type="button" class="ar nx" aria-label="下一張">›</button><span class="cnt">1 / ' + n + '</span>' : '') + '</div>';
      if (n > 1) media += '<div class="tb" style="grid-template-columns:repeat(' + Math.min(n, 5) + ',1fr)">' + pics.slice(0, 5).map(function (u, i) {
        var more = i === 4 && n > 5;
        return '<button type="button" class="tn' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-label="看第 ' + (i + 1) + ' 張"><img src="' + Z.esc(u) + '" alt="" loading="lazy">' + (more ? '<span class="mo">+' + (n - 4) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    var line = Z.isPlaceholder(s.tagline) ? '' : (s.tagline || '');
    var intro = line ? '<div class="sd tg">' + Z.esc(line) + '</div>' : (Z.isPlaceholder(s.intro) || !s.intro ? '' : '<div class="sd clamp">' + Z.esc(s.intro) + '</div>');
    var extra = s.id === 'h1' ? '<a class="btn sm" href="hankou-menu.html">看菜單</a>' : '';
    return '<article class="cx" data-href="' + href + '">' + media + '<div class="bd"><div class="row2">' + (tag ? '<span class="tag">' + Z.esc(tag) + '</span>' : '') + (hs ? '<span class="stt ' + hs.state + '">' + Z.esc(hs.text) + '</span>' : '') + '</div>' +
      '<a class="nm" href="' + href + '">' + Z.esc(s.name) + '</a>' + intro +
      '<div class="acts">' + Z.mainBtn(s) + extra + '<a class="btn sm" href="' + href + '">看介紹</a></div>' + Z.social(s) + '</div></article>';
  };
  /* 輪播操作：用瀏覽器原生橫向捲動（手機可直接滑），按鈕與縮圖只是控制捲動位置 */
  (function () {
    function go(car, i) { var t = car.querySelector('.trk'); i = Math.max(0, Math.min(Number(car.getAttribute('data-n')) - 1, i)); t.scrollTo({ left: t.clientWidth * i, behavior: 'smooth' }); }
    function cur(car) { var t = car.querySelector('.trk'); return Math.round(t.scrollLeft / (t.clientWidth || 1)); }
    function sync(car) {
      var i = cur(car), c = car.querySelector('.cnt'), card = car.closest('.cx');
      if (c) c.textContent = (i + 1) + ' / ' + car.getAttribute('data-n');
      card.querySelectorAll('.tn').forEach(function (b) { b.classList.toggle('on', Number(b.getAttribute('data-i')) === i); });
    }
    document.addEventListener('click', function (e) {
      var sl = e.target.closest && e.target.closest('.cx .sl'); if (sl) { var hf = sl.closest('.cx').getAttribute('data-href'); if (hf) location.href = hf; return; } // 後台預覽卡片沒有 data-href，不跳轉
      var b = e.target.closest && e.target.closest('.cx .ar,.cx .tn'); if (!b) return;
      var card = b.closest('.cx'), car = card.querySelector('.car'); if (!car) return;
      if (b.classList.contains('tn')) { var i = Number(b.getAttribute('data-i')); if (b.querySelector('.mo')) { location.href = card.getAttribute('data-href'); return; } go(car, i); }
      else go(car, cur(car) + (b.classList.contains('nx') ? 1 : -1));
    });
    document.addEventListener('scroll', function (e) { var t = e.target; if (t && t.classList && t.classList.contains('trk')) sync(t.parentNode); }, true);
  })();

  /* 日期工具 */
  Z.ymd = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  Z.wd = ['日', '一', '二', '三', '四', '五', '六'];
})();
