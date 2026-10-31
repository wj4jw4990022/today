/* 後台圖片裁切視窗：外框比例鎖定，拖曳選位置、滑桿／滾輪／兩指縮放、旋轉 90°，右側即時顯示電腦版與手機版。
   Crop.open({ img: HTMLImageElement, ratio: [w,h], out: [W,H], label: '3 : 2', title, crumb, crop: {x,y,w,h,rot} })
   → Promise：{ blob, crop } 或 null（取消）。crop 是原圖（未旋轉）座標的裁切範圍與旋轉角度。 */
(function () {
  var css = '.cr-bg{position:fixed;inset:0;z-index:60;background:rgba(23,48,42,.6);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 12px}' +
    '.cr{background:var(--bg);border:1px solid var(--line);width:100%;max-width:1180px;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
    '.cr-h{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 22px;border-bottom:1px solid var(--line)}' +
    '.cr-h b{font-family:"Noto Serif TC",serif;font-weight:500;font-size:18px;letter-spacing:.08em}' +
    '.cr-rt{display:inline-block;border:1px solid var(--accent);color:var(--accent);font-size:12px;padding:2px 10px;letter-spacing:.1em;margin-left:10px;vertical-align:2px}' +
    '.cr-x{background:none;border:0;font-size:24px;color:var(--mute);cursor:pointer;line-height:1}' +
    '.cr-b{display:grid;grid-template-columns:minmax(0,640px) minmax(0,1fr);gap:26px;padding:20px 22px}' +
    '.cr-st{position:relative;width:100%;aspect-ratio:4/3;background:#1b2421;overflow:hidden;touch-action:none;cursor:grab;user-select:none}' +
    '.cr-st.drag{cursor:grabbing}' +
    '.cr-st canvas{position:absolute;left:0;top:0;width:100%;height:100%}' +
    '.cr-fr{position:absolute;border:2px solid #fff;outline:9999px solid rgba(15,22,20,.62);pointer-events:none}' +
    '.cr-fr:before,.cr-fr:after{content:"";position:absolute;inset:0}' +
    '.cr-fr:before{left:33.33%;right:33.33%;border-left:1px solid rgba(255,255,255,.35);border-right:1px solid rgba(255,255,255,.35)}' +
    '.cr-fr:after{top:33.33%;bottom:33.33%;border-top:1px solid rgba(255,255,255,.35);border-bottom:1px solid rgba(255,255,255,.35)}' +
    '.cr-tip{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;font-size:12px;padding:4px 14px;letter-spacing:.1em;white-space:nowrap;pointer-events:none}' +
    '.cr-c{display:flex;align-items:center;gap:12px;margin-top:12px;font-size:13px;flex-wrap:wrap}' +
    '.cr-c input{flex:1 1 160px;accent-color:var(--accent)}.cr-c .btn.sm{padding:6px 14px}' +
    '.cr-s h4{margin:0 0 10px;font-weight:500;font-size:13px;letter-spacing:.14em;color:var(--mute)}' +
    '.cr-pv{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}' +
    '.cr-dk{width:260px;border:1px solid var(--line);background:#141F21;padding:10px}.cr-mb{width:132px;border:6px solid #222;border-radius:18px;background:#141F21;padding:10px 8px 14px}' +
    '.cr-pv canvas{display:block;width:100%;height:auto;outline:1px solid rgba(217,180,119,.6);outline-offset:2px}' +
    '.cr-ln{height:4px;background:#2f4042;margin-top:6px}.cr-cap{font-size:11px;color:var(--mute);margin-top:6px;text-align:center;letter-spacing:.1em}' +
    '.cr-ok{margin-top:14px;border:1px solid var(--accent);color:var(--accent);padding:10px 14px;font-size:13px;line-height:1.8}' +
    '.cr-w{margin-top:10px;border:1px solid #B07A2A;color:#8A5A1B;background:#FBF3E2;padding:10px 14px;font-size:13px;line-height:1.8}' +
    '.cr-m{margin-top:12px;font-size:12px;color:var(--mute);line-height:2}' +
    '.cr-f{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--line)}' +
    '.cr-f .l{font-size:12px;color:var(--mute)}.cr-f .btn{margin-left:8px}' +
    '@media(max-width:860px){.cr-b{grid-template-columns:1fr}.cr-bg{padding:0}.cr{border:0}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function open(o) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div'); bg.className = 'cr-bg';
      bg.innerHTML = '<div class="cr" role="dialog" aria-modal="true"><div class="cr-h"><div><span class="crumb" style="display:block;margin-bottom:2px">' + esc(o.crumb || '') + '</span><b>裁切：' + esc(o.title || '圖片') + '</b><span class="cr-rt">固定比例 ' + esc(o.label) + '</span></div><button type="button" class="cr-x" data-cr="no" aria-label="取消">×</button></div>' +
        '<div class="cr-b"><div><div class="cr-st"><canvas></canvas><div class="cr-fr"></div><div class="cr-tip">拖曳照片調整位置　·　滾輪或兩指縮放</div></div>' +
        '<div class="cr-c"><span>縮放</span><span style="color:var(--mute)">－</span><input type="range" min="0" max="1000" value="0" aria-label="縮放"><span style="color:var(--mute)">＋</span><button type="button" class="btn sm" data-cr="center">置中</button><button type="button" class="btn sm" data-cr="rot">旋轉 90°</button></div></div>' +
        '<div class="cr-s"><h4>前台預覽</h4><div class="cr-pv"><div><div class="cr-dk"><canvas class="p1"></canvas><div class="cr-ln"></div><div class="cr-ln" style="width:70%"></div></div><div class="cr-cap">電腦版</div></div>' +
        '<div><div class="cr-mb"><canvas class="p2"></canvas><div class="cr-ln"></div><div class="cr-ln" style="width:60%"></div></div><div class="cr-cap">手機版</div></div></div>' +
        '<div class="cr-ok">這個位置在所有設備都固定 ' + esc(o.label) + '，前台看到的就是框內的畫面，不會再被裁切。</div><div class="cr-w" style="display:none"></div><div class="cr-m"></div></div></div>' +
        '<div class="cr-f"><span class="l">按「確定」只會更新預覽，要按頁面下方的「儲存」才會上線。</span><div><button type="button" class="btn sm" data-cr="no">取消</button><button type="button" class="btn" data-cr="ok">確定</button></div></div></div>';
      document.body.appendChild(bg);
      var stg = bg.querySelector('.cr-st'), cv = stg.querySelector('canvas'), fr = bg.querySelector('.cr-fr'), rng = bg.querySelector('input[type=range]');
      var p1 = bg.querySelector('.p1'), p2 = bg.querySelector('.p2'), warn = bg.querySelector('.cr-w'), meta = bg.querySelector('.cr-m');
      var R = o.ratio[0] / o.ratio[1], rot = 0, src = null, iw = 0, ih = 0, s = 1, sMin = 1, ox = 0, oy = 0, fx = 0, fy = 0, fw = 0, fh = 0, SW = 0, SH = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
      [p1, p2].forEach(function (c) { c.width = 480; c.height = Math.round(480 / R); });

      /* 依旋轉角度產生來源畫布 */
      function makeSrc() {
        var w = o.img.naturalWidth, h = o.img.naturalHeight, c = document.createElement('canvas'), x = c.getContext('2d');
        if (rot % 180) { c.width = h; c.height = w; } else { c.width = w; c.height = h; }
        x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(o.img, -w / 2, -h / 2);
        src = c; iw = c.width; ih = c.height;
      }
      function layout() {
        SW = stg.clientWidth; SH = stg.clientHeight; cv.width = SW * dpr; cv.height = SH * dpr;
        var m = Math.max(16, SW * .06); fw = SW - 2 * m; fh = fw / R; if (fh > SH - 2 * m) { fh = SH - 2 * m; fw = fh * R; }
        fx = (SW - fw) / 2; fy = (SH - fh) / 2;
        fr.style.left = fx + 'px'; fr.style.top = fy + 'px'; fr.style.width = fw + 'px'; fr.style.height = fh + 'px';
        sMin = Math.max(fw / iw, fh / ih);
      }
      function clamp() { s = Math.max(sMin, Math.min(sMin * 6, s)); ox = Math.min(0, Math.max(fw - iw * s, ox)); oy = Math.min(0, Math.max(fh - ih * s, oy)); }
      function rect() { return { x: -ox / s, y: -oy / s, w: fw / s, h: fh / s }; }
      function draw() {
        clamp();
        var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, SW, SH);
        x.imageSmoothingQuality = 'high'; x.drawImage(src, fx + ox, fy + oy, iw * s, ih * s);
        var r = rect();
        [p1, p2].forEach(function (c) { var k = c.getContext('2d'); k.imageSmoothingQuality = 'high'; k.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height); });
        rng.value = Math.round(Math.log(s / sMin) / Math.log(6) * 1000);
        var lo = r.w < o.out[0] * .98;
        warn.style.display = lo ? '' : 'none';
        if (lo) warn.textContent = '⚠ 框內實際只有 ' + Math.round(r.w) + ' × ' + Math.round(r.h) + ' px，低於建議的 ' + o.out[0] + ' × ' + o.out[1] + '，大螢幕上可能略糊。可以繼續使用，或縮小一點、換一張解析度較高的照片。';
        meta.innerHTML = '原圖：' + esc(o.name || '') + '　' + o.img.naturalWidth + ' × ' + o.img.naturalHeight + '<br>輸出：' + o.out[0] + ' × ' + o.out[1] + ' JPG<br>原圖會一起保存，之後可以「重新裁切」換位置，不用重新上傳。';
      }
      function zoomAt(ns, cx, cy) { var px = (cx - fx - ox) / s, py = (cy - fy - oy) / s; s = ns; clamp(); ox = cx - fx - px * s; oy = cy - fy - py * s; draw(); }
      function center() { s = sMin; ox = (fw - iw * s) / 2; oy = (fh - ih * s) / 2; draw(); }
      /* 原圖座標 ↔ 旋轉後座標 */
      function toRot(c) {
        var W = o.img.naturalWidth, H = o.img.naturalHeight;
        if (rot === 90) return { x: H - c.y - c.h, y: c.x, w: c.h, h: c.w };
        if (rot === 180) return { x: W - c.x - c.w, y: H - c.y - c.h, w: c.w, h: c.h };
        if (rot === 270) return { x: c.y, y: W - c.x - c.w, w: c.h, h: c.w };
        return c;
      }
      function fromRot(c) {
        var W = o.img.naturalWidth, H = o.img.naturalHeight;
        if (rot === 90) return { x: c.y, y: H - c.x - c.w, w: c.h, h: c.w };
        if (rot === 180) return { x: W - c.x - c.w, y: H - c.y - c.h, w: c.w, h: c.h };
        if (rot === 270) return { x: W - c.y - c.h, y: c.x, w: c.h, h: c.w };
        return c;
      }

      if (o.crop && [0, 90, 180, 270].indexOf(Number(o.crop.rot)) >= 0) rot = Number(o.crop.rot);
      makeSrc(); layout();
      if (o.crop && o.crop.w > 0) { var c0 = toRot(o.crop); s = fw / c0.w; ox = -c0.x * s; oy = -c0.y * s; draw(); } else center();

      var ptr = {}, last = null, pinch = 0;
      stg.addEventListener('pointerdown', function (e) { stg.setPointerCapture(e.pointerId); ptr[e.pointerId] = [e.clientX, e.clientY]; stg.classList.add('drag'); last = [e.clientX, e.clientY]; pinch = 0; });
      stg.addEventListener('pointermove', function (e) {
        if (!ptr[e.pointerId]) return; ptr[e.pointerId] = [e.clientX, e.clientY];
        var ks = Object.keys(ptr), b = stg.getBoundingClientRect();
        if (ks.length >= 2) {
          var a = ptr[ks[0]], c = ptr[ks[1]], d = Math.hypot(a[0] - c[0], a[1] - c[1]);
          if (pinch) zoomAt(s * d / pinch, (a[0] + c[0]) / 2 - b.left, (a[1] + c[1]) / 2 - b.top);
          pinch = d; return;
        }
        ox += e.clientX - last[0]; oy += e.clientY - last[1]; last = [e.clientX, e.clientY]; draw();
      });
      function up(e) { delete ptr[e.pointerId]; pinch = 0; var ks = Object.keys(ptr); if (ks.length) last = ptr[ks[0]].slice(); else stg.classList.remove('drag'); }
      stg.addEventListener('pointerup', up); stg.addEventListener('pointercancel', up);
      stg.addEventListener('wheel', function (e) { e.preventDefault(); var b = stg.getBoundingClientRect(); zoomAt(s * Math.exp(-e.deltaY * .0015), e.clientX - b.left, e.clientY - b.top); }, { passive: false });
      rng.addEventListener('input', function () { zoomAt(sMin * Math.pow(6, rng.value / 1000), fx + fw / 2, fy + fh / 2); });
      function onResize() { var r = rect(); layout(); s = fw / r.w; ox = -r.x * s; oy = -r.y * s; draw(); }
      window.addEventListener('resize', onResize);
      function onKey(e) { if (e.key === 'Escape') done(null); }
      document.addEventListener('keydown', onKey);

      function done(v) { window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey); bg.parentNode.removeChild(bg); resolve(v); }
      bg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cr]'); if (!b) return;
        var a = b.getAttribute('data-cr');
        if (a === 'no') done(null);
        else if (a === 'center') center();
        else if (a === 'rot') { var keep = fromRot(rect()); rot = (rot + 90) % 360; makeSrc(); layout(); var c1 = toRot(keep); s = Math.max(fw / c1.w, sMin); ox = -c1.x * s + (fw - c1.w * s) / 2; oy = -c1.y * s + (fh - c1.h * s) / 2; draw(); }
        else if (a === 'ok') {
          var r = rect(), out = document.createElement('canvas'); out.width = o.out[0]; out.height = o.out[1];
          var x = out.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height); x.imageSmoothingQuality = 'high';
          x.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
          var o0 = fromRot(r), cropInfo = { x: Math.max(0, o0.x), y: Math.max(0, o0.y), w: o0.w, h: o0.h, rot: rot };
          b.disabled = true; b.textContent = '處理中…';
          jpeg(out, 1400000).then(function (blob) { done({ blob: blob, crop: cropInfo }); }).catch(function () { b.disabled = false; b.textContent = '確定'; alert('圖片處理失敗，請再試一次'); });
        }
      });
    });
  }
  /* 轉成 JPG，太大就降低品質 */
  function jpeg(canvas, maxBytes) {
    var qs = [.86, .8, .72, .64, .55];
    return new Promise(function (res, rej) {
      (function next(i) {
        canvas.toBlob(function (b) { if (!b) return rej(new Error('fail')); if (b.size <= maxBytes || i === qs.length - 1) res(b); else next(i + 1); }, 'image/jpeg', qs[i]);
      })(0);
    });
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* 讀圖：檔案或網址 → Image（網址要同網域，畫布才能輸出） */
  function load(srcOrFile) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = typeof srcOrFile === 'string' ? srcOrFile : URL.createObjectURL(srcOrFile);
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error(typeof srcOrFile === 'string' ? '原圖讀取失敗，請重新上傳' : '這個檔案無法讀取。請使用 JPG、PNG 或 WebP（iPhone 的 HEIC 請先轉成 JPG）')); };
      img.src = url;
    });
  }
  window.Crop = { open: open, load: load, jpeg: jpeg };
})();
