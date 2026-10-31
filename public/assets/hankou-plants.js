/* 漢口總店頁：植物線條（垂掛版）。每層天花板垂下蕨類與黃金葛，地面角落一片龜背芋大葉。
   全部是金色細線的靜態 SVG，沒有濾鏡與混色，不影響捲動效能；版面寬度改變時重畫。 */
(function () {
  var NS = 'http://www.w3.org/2000/svg', FL = 'rgba(29,61,52,.3)', lastW = 0;
  function G(o) { return 'rgba(241,239,230,' + (o * .8).toFixed(3) + ')'; }
  function rot(x, y, a) { var c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
  function add(p, q) { return [p[0] + q[0], p[1] + q[1]]; }
  function T(p, a, x, y) { return add(p, rot(x, y, a)); }
  function P(p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }

  /* 經過各點的平滑曲線，回傳路徑與取樣點 */
  function curve(pts) {
    var d = 'M' + P(pts[0]), smp = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
      for (var k = 0; k < 24; k++) {
        var t = k / 24, u = 1 - t;
        smp.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
      }
    }
    smp.push(pts[pts.length - 1]);
    var len = [0]; for (var j = 1; j < smp.length; j++) len.push(len[j - 1] + Math.hypot(smp[j][0] - smp[j - 1][0], smp[j][1] - smp[j - 1][1]));
    return { d: d, smp: smp, len: len };
  }
  /* 沿曲線每隔 gap 呼叫 fn(點, 方向角, 位置比例, 序號) */
  function along(c, gap, fn) {
    var tot = c.len[c.len.length - 1], j = 1, n = 0;
    for (var x = gap * .5; x < tot - 2; x += gap) {
      while (c.len[j] < x) j++;
      fn(c.smp[j], Math.atan2(c.smp[j][1] - c.smp[j - 1][1], c.smp[j][0] - c.smp[j - 1][0]), x / tot, n++);
    }
  }
  /* 細長葉片（蕨的羽片） */
  function pinna(p, a, L, W, op) {
    return '<path d="M' + P(p) + 'Q' + P(T(p, a, L * .45, W)) + ' ' + P(T(p, a, L, 0)) + 'Q' + P(T(p, a, L * .45, -W)) + ' ' + P(p) + 'Z" fill="none" stroke="' + G(op) + '" stroke-width=".8"/>';
  }
  /* 心形葉（黃金葛小葉、龜背芋大葉）；split＝有裂口 */
  function heart(p, a, L, W, o) {
    var op = o.op, s = '', b = T(p, a, .08 * L, 0);
    function side(sg) {
      return 'C' + P(T(p, a, -.14 * L, sg * .38 * W)) + ' ' + P(T(p, a, -.06 * L, sg * 1.02 * W)) + ' ' + P(T(p, a, .36 * L, sg * .98 * W)) +
        'C' + P(T(p, a, .7 * L, sg * .92 * W)) + ' ' + P(T(p, a, .92 * L, sg * .38 * W)) + ' ' + P(T(p, a, L, 0));
    }
    s += '<path d="M' + P(b) + side(1) + 'M' + P(b) + side(-1) + '" fill="' + (o.fill || 'none') + '" stroke="' + G(op) + '" stroke-width="' + (o.sw || 1) + '"/>';
    s += '<path d="M' + P(b) + 'L' + P(T(p, a, .94 * L, 0)) + '" stroke="' + G(op * .75) + '" stroke-width=".8"/>';
    var n = o.veins || 2;
    for (var i = 1; i <= n; i++) {
      var t = .1 + .78 * i / (n + 1), m = T(p, a, t * L, 0), wd = Math.sin(Math.PI * Math.min(.95, t + .12)) * W * .86;
      [1, -1].forEach(function (sg) {
        s += '<path d="M' + P(m) + 'Q' + P(T(p, a, t * L + .08 * L, sg * wd * .5)) + ' ' + P(T(p, a, t * L + .18 * L, sg * wd)) + '" fill="none" stroke="' + G(op * .5) + '" stroke-width=".7"/>';
        if (o.split && i % 2 === 0) s += '<path d="M' + P(T(p, a, t * L + .2 * L, sg * wd * 1.02)) + 'L' + P(T(p, a, t * L + .12 * L, sg * wd * .52)) + '" stroke="#4A6A5D" stroke-width="' + (W * .07).toFixed(1) + '" stroke-linecap="round"/>';
      });
    }
    return s;
  }
  /* 蕨類羽葉：中段羽片最大 */
  function frond(pts, gap, size, op) {
    var c = curve(pts), s = '<path d="' + c.d + '" fill="none" stroke="' + G(op) + '" stroke-width="1"/>';
    along(c, gap, function (q, an, r) {
      var sz = size * Math.pow(Math.sin(Math.PI * Math.min(1, r * .85 + .12)), .6) * (1 - .25 * r);
      s += pinna(q, an + 1.05, sz, sz * .26, op * .9) + pinna(q, an - 1.05, sz, sz * .26, op * .9);
    });
    return s;
  }
  /* 垂掛黃金葛 */
  function trail(pts, leaf, gap, op) {
    var c = curve(pts), s = '<path d="' + c.d + '" fill="none" stroke="' + G(op) + '" stroke-width="1"/>';
    along(c, gap, function (q, an, r, n) { var sz = leaf * (.75 + .25 * Math.sin(n * 2.3)); s += heart(q, an + (n % 2 ? 1 : -1), sz, sz * .55, { op: op, sw: .8, fill: FL }); });
    return s;
  }
  function layer(host, w, h, inner) {
    var sv = document.createElementNS(NS, 'svg');
    sv.setAttribute('class', 'ev-plant'); sv.setAttribute('aria-hidden', 'true');
    sv.setAttribute('viewBox', '0 0 ' + w + ' ' + h); sv.setAttribute('width', w); sv.setAttribute('height', h);
    sv.innerHTML = inner;
    var beam = host.querySelector(':scope>.ev-beam');
    host.insertBefore(sv, beam ? beam.nextSibling : host.firstChild);
  }

  function draw() {
    document.querySelectorAll('.ev-plant').forEach(function (x) { x.parentNode.removeChild(x); });
    var mob = innerWidth <= 900, k = mob ? .55 : 1;
    /* 頁首：右上方吊盆 */
    var hero = document.querySelector('.ev-wall'), w = hero.offsetWidth, h = hero.offsetHeight, s = '';
    if (mob) {
      s = trail([[w * .78, -5], [w * .8, 60], [w * .76, 130], [w * .79, 190]], 12, 16, .45) + trail([[w * .93, -5], [w * .9, 80], [w * .94, 140]], 11, 15, .4) +
        frond([[w * .86, -5], [w * .72, 40], [w * .66, 110]], 7, 15, .42) + frond([[w * .86, -5], [w, 50]], 7, 13, .38);
    } else {
      [[.56, 230], [.68, 330], [.8, 190], [.9, 280]].forEach(function (v, i) {
        var x = w * v[0], L = v[1], dx = i % 2 ? 14 : -14;
        s += trail([[x, -5], [x + dx, L * .35], [x - dx, L * .7], [x + dx * .5, L]], 18, 24, .45);
      });
      s += frond([[w * .74, -5], [w * .74 - 70, 60], [w * .74 - 120, 170], [w * .74 - 110, 250]], 11, 28, .42) +
        frond([[w * .74, -5], [w * .74 + 80, 70], [w * .74 + 110, 180]], 11, 24, .38) +
        heart([-30, h + 40], -55 * Math.PI / 180, 260, 120, { fill: FL, op: .4, split: 1, veins: 6 });
    }
    layer(hero, w, h, s);
    /* 每層：天花板垂下兩枝蕨與一條黃金葛，地面角落一片大葉 */
    document.querySelectorAll('.ev-fl').forEach(function (fl, i) {
      var w2 = fl.offsetWidth, h2 = fl.offsetHeight, R = i % 2 === 1, x = mob ? w2 * .88 : (R ? w2 * .47 : w2 * .88);
      var t = frond([[x, -2], [x - 50 * k, 50 * k], [x - 80 * k, 140 * k], [x - 70 * k, 210 * k]], 9 * k + 2, 24 * k, .4) +
        frond([[x, -2], [x + 60 * k, 60 * k], [x + 80 * k, 150 * k]], 9 * k + 2, 20 * k, .36) +
        trail([[x + 20 * k, -2], [x + 26 * k, 110 * k], [x + 12 * k, 220 * k], [x + 24 * k, 300 * k]], 15 * k + 2, 22 * k + 3, .42);
      if (!mob) t += heart([R ? w2 - 20 : 20, h2 + 30], (R ? -125 : -55) * Math.PI / 180, 200, 92, { fill: FL, op: .38, split: 1, veins: 5 });
      layer(fl, w2, h2, t);
    });
    lastW = innerWidth;
  }
  window.EVPlants = draw;
  var tm; addEventListener('resize', function () { if (innerWidth === lastW) return; clearTimeout(tm); tm = setTimeout(draw, 200); });
})();
