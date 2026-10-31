/* 漢口總店頁：電梯大樓版。
   樓層由 floor 欄位第一段推導（「1F 後段」→「1F」），依數字排序；店家順序沿用後端（sort_order）；
   每層的英文小標、標題、介紹、門內照片可在後台「頁面內容 › 漢口總店頁 › 各樓層」修改，照片留白時用該層第一間店的主圖。 */
(function () {
  var DEF = {
    '1F': ['Café & Select', '咖啡與選物', '一進門的那一層。咖啡、早午餐與選物，從這裡開始一天。'],
    '2F': ['Hair & Ink', '髮型與刺青', '整理頭髮，或留下一個圖案。'],
    '3F': ['Stone · Touch · Space', '靈石、推拿與空間', '安靜的一層：靈石、推拿，以及即將開幕的空間。'],
    '4F': ['Bridal Studio', '婚紗攝影・租借', '頂樓的攝影棚，留下重要日子的樣子。']
  };
  var E = Z.esc, floors = [], cur = '', io = null, doorIo = null;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function num(f) { return String(f).replace(/F$/i, ''); }
  function angle(i, n) { return n < 2 ? 90 : 180 - i * 180 / (n - 1); }

  /* 半圓樓層指針（老電梯樣式），樓層數自動分配角度 */
  function dial() {
    var n = floors.length, cx = 115, cy = 112, g = '';
    floors.forEach(function (f, i) {
      var a = angle(i, n) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      g += '<text x="' + (cx + 78 * c).toFixed(1) + '" y="' + (cy - 78 * s + 6).toFixed(1) + '" data-f="' + E(f.f) + '">' + E(num(f.f)) + '</text>' +
        '<line x1="' + (cx + 93 * c).toFixed(1) + '" y1="' + (cy - 93 * s).toFixed(1) + '" x2="' + (cx + 100 * c).toFixed(1) + '" y2="' + (cy - 100 * s).toFixed(1) + '" stroke="#D9B477" stroke-opacity=".6"/>';
    });
    return '<svg viewBox="0 0 230 118" fill="none"><path d="M15 112 A100 100 0 0 1 215 112" stroke="#D9B477"/><path d="M30 112 A85 85 0 0 1 200 112" stroke="#D9B477" stroke-opacity=".35"/>' +
      '<g font-family="Cormorant Garamond,serif" font-size="17" fill="#EFE8DA" text-anchor="middle">' + g + '</g>' +
      '<text x="115" y="96" font-family="Cormorant Garamond,serif" font-style="italic" font-size="11" fill="#D9B477" text-anchor="middle" letter-spacing="3">FLOOR</text>' +
      '<g class="ev-needle" id="needle"><line x1="115" y1="112" x2="177" y2="112" stroke="#FBE3B2" stroke-width="1.5"/></g><circle cx="115" cy="112" r="5" fill="#D9B477"/></svg>';
  }
  function btn(f, tag) { return '<' + tag + ' class="ev-b" data-go="' + E(f.f) + '" aria-label="前往 ' + E(f.f) + '">' + E(num(f.f)) + '</' + tag + '>'; }

  function shopRow(s) {
    var href = 'shop.html?id=' + encodeURIComponent(s.id), hs = Z.hoursState(s), c = s.contact || {};
    var sub = String(s.floor).indexOf(' ') > 0 ? String(s.floor).split(' ')[1] : '';
    var ty = [sub, Z.isPlaceholder(s.type) ? '' : s.type, hs ? hs.text : (Z.isPlaceholder(s.hours) ? '' : s.hours)].filter(Boolean).join(' · ');
    var acts = '';
    if (s.id === 'h1') acts += '<a href="hankou-menu.html">' + Z.ct('漢口總店|卡片看菜單', '看菜單') + '</a>';
    var m = c.btnMode || 'book';
    if (m === 'book' && s.open) acts += '<a href="booking.html?shop=' + encodeURIComponent(s.id) + '">' + E(c.btnText || '預約') + ' →</a>';
    else if (m === 'tel' && c.phone) acts += '<a href="tel:' + E(String(c.phone).replace(/[^0-9+#]/g, '')) + '">' + E(c.btnText || '電話') + ' →</a>';
    else acts += '<a class="dim" href="' + href + '">' + Z.ct('漢口總店|卡片看介紹', '看介紹') + ' →</a>';
    return '<div class="ev-shop"><span class="ev-dot ' + (hs ? hs.state : '') + '" title="' + E(hs ? hs.text : '營業時間未公布') + '"></span>' +
      '<div class="x"><a class="nm" href="' + href + '">' + E(s.name) + '</a>' + (ty ? '<div class="ty">' + E(ty) + '</div>' : '') + '</div><div class="acts">' + acts + '</div></div>';
  }

  function floorHtml(f, i) {
    var d = DEF[f.f] || ['', '', ''], k = '漢口總店|' + f.f;
    var img = f.shops.map(function (s) { return Z.safeUrl(s.image); }).filter(Boolean)[0];
    var first = f.shops.filter(function (s) { return Z.safeUrl(s.image); })[0] || f.shops[0];
    var arch = floors.map(function (g) { return g.f === f.f ? '<b>' + E(num(g.f)) + '</b>' : '<span>' + E(num(g.f)) + '</span>'; }).join('');
    var pic = img ? '<img src="' + E(img) + '" alt="' + E(first.name) + '" loading="lazy">' : '<div class="ev-beam"></div>';
    return '<section class="ev-wall ev-fl' + (i % 2 ? ' rev' : '') + '" id="fl-' + E(f.f) + '" data-f="' + E(f.f) + '"><div class="ev-beam' + (i % 2 ? '' : ' b2') + '"></div>' +
      '<div class="ev-fh"><div class="n">' + E(num(f.f)) + '<sup>F</sup></div><div><span class="ev-caps">' + Z.ct(k + '英文', d[0]) + '</span><span class="zh">' + Z.ct(k + '標題', d[1]) + '</span></div></div>' +
      (f.shops.length > 1 ? lobby(f, k, d) :
      '<div class="ev-grid">' + door(first, arch, pic, k + '照片') +
      '<div><p class="ev-desc">' + Z.ct(k + '介紹', d[2]) + '</p>' + f.shops.map(shopRow).join('') + '</div></div>') + '</section>';
  }
  function door(s, arch, pic, ci) {
    return '<a class="ev-door' + (reduce || Z.edit ? ' op' : '') + '" href="shop.html?id=' + encodeURIComponent(s.id) + '" aria-label="' + E(s.name) + '"><span class="ev-arch">' + arch + '</span><div class="ev-in"><div class="ev-pic"' + (ci ? ' data-ci="' + E(ci) + '"' : '') + '>' + pic + '</div><div class="ev-dl"></div><div class="ev-dr"></div></div></a>';
  }
  /* 同一層多間店：電梯廳，一間店一扇門（店家自己的主圖，3:2），門下是店名與連結；手機版左右滑 */
  function lobby(f, k, d) {
    var n = f.shops.length;
    return '<p class="ev-desc ev-lead">' + Z.ct(k + '介紹', d[2]) + '</p><div class="ev-lobby" style="--n:' + Math.min(n, 3) + '">' + f.shops.map(function (s, j) {
      var u = Z.safeUrl(s.image), pic = u ? '<img src="' + E(u) + '" alt="' + E(s.name) + '" loading="lazy">' : '<div class="ev-beam"></div>';
      return '<div class="ev-cell">' + door(s, '<b>' + E(f.f) + '</b><span>·</span><span>' + (j < 9 ? '0' : '') + (j + 1) + '</span>', pic, '') + shopRow(s) + '</div>';
    }).join('') + '</div>';
  }

  function setFloor(f) {
    if (!f || f === cur) return;
    cur = f;
    var i = 0, fl = null;
    floors.forEach(function (g, j) { if (g.f === f) { i = j; fl = g; } });
    document.querySelectorAll('[data-go]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === f); });
    document.querySelectorAll('.ev-lift a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-go') === f); });
    var lv = E(num(f)) + '<small>F</small>';
    document.getElementById('sidelv').innerHTML = lv;
    document.getElementById('fbarlv').innerHTML = lv + '<span>' + E(Z.t('漢口總店|' + f + '標題', (DEF[f] || [])[1] || '')) + '</span>';
    var nd = document.getElementById('needle'); if (nd) nd.style.transform = 'rotate(' + (-angle(i, floors.length)) + 'deg)';
    document.querySelectorAll('#dial text[data-f]').forEach(function (t) { t.setAttribute('fill', t.getAttribute('data-f') === f ? '#D9B477' : '#EFE8DA'); });
  }

  function render(d) {
    var shops = d.shops.filter(function (s) { return s.hall === '漢口總店'; }), by = {};
    floors = [];
    shops.forEach(function (s) { var f = String(s.floor).split(' ')[0]; if (!by[f]) { by[f] = { f: f, shops: [] }; floors.push(by[f]); } by[f].shops.push(s); });
    floors.sort(function (a, b) { return parseInt(a.f, 10) - parseInt(b.f, 10); });

    document.getElementById('count').textContent = Z.t('漢口總店|說明', '一棟樓，{n} 間店。由一樓往上逛，每一層都有不同的日子。').replace('{n}', shops.length);
    var st = shops.map(Z.hoursState).filter(Boolean), open = st.filter(function (x) { return x.state === 'open'; }).length;
    document.getElementById('nowrow').style.display = st.length ? '' : 'none';
    document.getElementById('nowtxt').innerHTML = '<b>' + open + '</b> / ' + shops.length + ' 間營業中';

    document.getElementById('dial').innerHTML = dial();
    document.getElementById('panel').innerHTML = floors.map(function (f) { return btn(f, 'button'); }).join('');
    document.getElementById('fbarbtn').innerHTML = floors.map(function (f) { return btn(f, 'button'); }).join('');
    document.getElementById('lift').innerHTML = floors.map(function (f) {
      return '<a href="#fl-' + E(f.f) + '" data-go="' + E(f.f) + '"><span class="ev-b">' + E(num(f.f)) + '</span><span class="t"><b>' + E(Z.t('漢口總店|' + f.f + '標題', (DEF[f.f] || [])[1] || f.f)) + '</b>' + f.shops.length + ' 間</span></a>';
    }).join('');
    document.getElementById('floors').innerHTML = floors.map(floorHtml).join('');

    var tel = document.getElementById('tel'), ph = Z.t('漢口總店|電話', '');
    if (ph && !Z.isPlaceholder(ph)) { tel.href = 'tel:' + String(ph).replace(/[^0-9+#]/g, ''); tel.style.display = ''; } else tel.style.display = 'none';

    cur = ''; if (floors[0]) setFloor(floors[0].f);
    watch();
    if (window.EVPlants) { EVPlants(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(EVPlants); }
  }

  /* 捲動：目前樓層＝畫面中段那一層；門在進到畫面中段時打開 */
  function watch() {
    if (io) io.disconnect(); if (doorIo) doorIo.disconnect();
    if (!('IntersectionObserver' in window)) { document.querySelectorAll('.ev-door').forEach(function (x) { x.classList.add('op'); }); return; }
    io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) setFloor(en.target.getAttribute('data-f')); }); }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.ev-fl').forEach(function (el) { io.observe(el); });
    doorIo = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('op'); doorIo.unobserve(en.target); } }); }, { rootMargin: '-20% 0px -20% 0px' });
    document.querySelectorAll('.ev-fl .ev-door:not(.op)').forEach(function (el) { doorIo.observe(el); });
  }

  /* 按電梯按鈕：門先關上，捲到該層再打開 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-go]'); if (!b || Z.edit) return;
    e.preventDefault();
    var f = b.getAttribute('data-go'), sec = document.getElementById('fl-' + f); if (!sec) return;
    setFloor(f);
    var doors = sec.querySelectorAll('.ev-door');
    if (!reduce) doors.forEach(function (x) { x.classList.remove('op'); });
    sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { doors.forEach(function (x) { x.classList.add('op'); }); }, reduce ? 0 : 700);
  });

  Z.init('hankou', render);
})();
