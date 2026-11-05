# 產生各店家的示意插畫（SVG，3:2，900x600）。深綠＋銅金線條；黃埔用米白＋木棕。
import os
OUT = '/home/claude/today/public/assets/illus'
os.makedirs(OUT, exist_ok=True)

DARK = dict(bg1='#33504A', bg2='#233A36', bg3='#1B2E2B', ln='#D9B477', soft='rgba(217,180,119,.10)', beam='255,214,160', tag='rgba(217,180,119,.55)', deep='#13231F')
LIGHT = dict(bg1='#FBF7EF', bg2='#F1E8D8', bg3='#E6D8C0', ln='#7A5C3C', soft='rgba(122,92,60,.08)', beam='255,255,255', tag='rgba(122,92,60,.5)', deep='#E2D3BA')

def frame(body, c, extra=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="900" height="600">
<defs><radialGradient id="g" cx="78%" cy="12%" r="110%"><stop offset="0" stop-color="{c['bg1']}"/><stop offset=".45" stop-color="{c['bg2']}"/><stop offset="1" stop-color="{c['bg3']}"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset=".34" stop-color="rgb({c['beam']})" stop-opacity="0"/><stop offset=".49" stop-color="rgb({c['beam']})" stop-opacity=".16"/><stop offset=".64" stop-color="rgb({c['beam']})" stop-opacity="0"/></linearGradient></defs>
<rect width="900" height="600" fill="url(#g)"/>{extra}
<g fill="none" stroke="{c['ln']}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
{body}
</g>
<rect width="900" height="600" fill="url(#b)"/>
<text x="872" y="580" text-anchor="end" font-family="Georgia,serif" font-style="italic" font-size="15" letter-spacing="2" fill="{c['tag']}">illustration · 示意</text>
</svg>'''

def floor(c, y=470):
    return f'<path d="M0 {y} H900" stroke-opacity=".7"/><path d="M0 {y+12} H900" stroke-opacity=".25"/>'

def fern(x, y, n=9, s=1.0, d=1):
    """從 (x,y) 往下垂的蕨葉"""
    out = [f'<path d="M{x} {y} q{-14*d*s} {70*s} {-4*d*s} {150*s}" stroke-opacity=".7"/>']
    for i in range(n):
        t = (i + 1) / (n + 1); yy = y + 150 * s * t; xx = x - 12 * d * s * (t - t * t) * 4 * .3
        L = 26 * s * (1 - abs(t - .45))
        out.append(f'<path d="M{xx:.1f} {yy:.1f} q{-L*.6:.1f} {-4*s:.1f} {-L:.1f} {L*.35:.1f}" stroke-opacity=".6"/>')
        out.append(f'<path d="M{xx:.1f} {yy:.1f} q{L*.6:.1f} {-4*s:.1f} {L:.1f} {L*.35:.1f}" stroke-opacity=".6"/>')
    return '\n'.join(out)

def pot_plant(x, y, s=1.0):
    return f'''<path d="M{x-28*s} {y-56*s} h{56*s} l{-8*s} {56*s} h{-40*s} z"/>
<path d="M{x} {y-56*s} q{-40*s} {-60*s} {-70*s} {-70*s} q{36*s} {-4*s} {70*s} {70*s}"/><path d="M{x} {y-56*s} q{10*s} {-80*s} {50*s} {-110*s} q{4*s} {50*s} {-50*s} {110*s}"/><path d="M{x} {y-56*s} q{40*s} {-30*s} {80*s} {-30*s} q{-30*s} {30*s} {-80*s} {30*s}"/>'''

S = {}

# 2F HEJ 髮型工作室：拱形鏡、理髮椅、剪刀與梳子、層架
S['hair'] = (DARK, floor(DARK) + '''
<path d="M220 440 V200 a110 110 0 0 1 220 0 V440 z" fill="rgba(217,180,119,.06)"/><path d="M236 430 V202 a94 94 0 0 1 188 0 V430" stroke-opacity=".45"/>
<path d="M270 470 v-8 h120 v8"/><path d="M330 462 v-50"/><path d="M286 412 h88 a10 10 0 0 0 10 -10 v-10 h-108 v10 a10 10 0 0 0 10 10z"/>
<path d="M296 392 v-110 a34 34 0 0 1 68 0 v110"/><path d="M280 392 v-40 h-14 M380 392 v-40 h14"/><path d="M300 470 l-20 -24 h100 l-20 24" stroke-opacity=".6"/>
<path d="M560 160 h220 M560 250 h220" stroke-opacity=".7"/>
<path d="M584 160 v-34 h18 v34 M620 160 v-50 a10 10 0 0 1 20 0 v50 M660 160 v-28 h26 v28 M710 160 v-44 h14 v44"/>
<path d="M590 250 v-40 h30 v40 M640 250 v-30 a14 14 0 0 1 28 0 v30 M690 250 v-46 h12 v46"/>
<circle cx="610" cy="360" r="16"/><circle cx="650" cy="360" r="16"/><path d="M622 349 L700 300 M638 349 L560 300" stroke-width="2.6"/>
<path d="M720 330 h70 v16 h-70 z"/><path d="M726 346 v18 M736 346 v18 M746 346 v18 M756 346 v18 M766 346 v18 M776 346 v18 M786 346 v18" stroke-opacity=".7"/>
''' + fern(110, 0, 10, 1.1, 1))

# 2F 蝕 刺青：框起來的刺青圖稿、紋身機、墨水瓶、工作燈
S['tattoo'] = (DARK, floor(DARK) + '''
<rect x="150" y="110" width="140" height="180"/><rect x="320" y="90" width="120" height="150"/><rect x="320" y="260" width="120" height="110"/>
<path d="M220 150 c-30 20 -30 60 0 80 c30 -20 30 -60 0 -80z M220 150 v110 M220 190 l-18 -12 M220 210 l18 -12" stroke-opacity=".8"/>
<circle cx="380" cy="165" r="38"/><circle cx="394" cy="155" r="32" fill="rgba(35,58,54,1)" stroke="none"/><path d="M372 140 l4 8 l8 2 l-8 2 l-4 8 l-4 -8 l-8 -2 l8 -2z" stroke-opacity=".8"/>
<path d="M350 330 q30 -50 60 0 q-30 20 -60 0z M380 330 v24" stroke-opacity=".8"/>
<path d="M520 400 h300 M540 400 v70 M800 400 v70"/>
<path d="M600 390 l60 -40 l26 12 l-50 46 z"/><path d="M686 362 l40 -30 M628 380 l-30 18" /><circle cx="672" cy="372" r="8"/>
<path d="M750 400 v-34 h22 v34 M760 366 v-10 h2 v10 M782 400 v-26 h18 v26" />
<path d="M800 120 l-80 70 l40 60" /><path d="M740 250 l-30 30 h60 z" fill="rgba(217,180,119,.10)"/><path d="M800 120 v-120" stroke-opacity=".6"/>
''' + fern(60, 0, 8, .9, -1))

# 3F 關於小三 靈石選物：水晶簇、蠟燭、靈擺、月亮窗
S['crystal'] = (DARK, floor(DARK) + '''
<circle cx="660" cy="200" r="100" stroke-opacity=".6"/><circle cx="690" cy="188" r="78" fill="rgba(35,58,54,1)" stroke="none"/>
<path d="M300 470 v-110 h300 v110 M290 360 h320" />
<path d="M380 360 l-20 -60 l30 -50 l20 70 z M400 360 l10 -120 l40 -40 l10 110 l-20 50 z M450 360 l20 -90 l30 30 l-10 60z M350 360 l0 -40 l20 -20 l10 40" fill="rgba(217,180,119,.07)"/>
<path d="M410 240 l40 -40 M420 300 l20 -60" stroke-opacity=".5"/>
<path d="M540 360 v-60 h26 v60 z"/><path d="M553 300 q-10 -16 0 -30 q10 14 0 30z" fill="rgba(255,214,150,.35)"/>
<path d="M200 0 v220" stroke-opacity=".6"/><path d="M188 220 l12 30 l12 -30 z"/>
<ellipse cx="300" cy="352" rx="22" ry="6"/><circle cx="292" cy="346" r="6"/><circle cx="306" cy="347" r="5"/>
<path d="M120 300 l6 -14 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6z M780 380 l4 -9 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4z" stroke-opacity=".7"/>
''')

# 3F 旧室推拿：按摩床、毛巾、石頭、木屏風、植物
S['massage'] = (DARK, floor(DARK) + '''
<path d="M560 470 V150 h70 V470 M630 150 h70 V470 M700 150 h70 V470" stroke-opacity=".55"/><path d="M560 230 h210 M560 310 h210 M560 390 h210" stroke-opacity=".3"/>
<path d="M150 360 h330 a14 14 0 0 1 0 28 h-330 a14 14 0 0 1 0 -28z"/><ellipse cx="455" cy="374" rx="14" ry="6" stroke-opacity=".7"/>
<path d="M180 388 l-16 82 M450 388 l16 82 M200 388 l-6 82 M430 388 l6 82" stroke-opacity=".8"/>
<path d="M210 360 v-18 h90 v18 M220 342 v-14 h70 v14" />
<ellipse cx="370" cy="352" rx="34" ry="8"/><ellipse cx="370" cy="340" rx="26" ry="7"/><ellipse cx="370" cy="329" rx="18" ry="6"/>
<circle cx="420" cy="150" r="40" stroke-opacity=".6"/><path d="M420 110 v-110" stroke-opacity=".6"/>
''' + pot_plant(830, 470, 1.1))

# 3F 杉境・川合空間：大窗外的杉林與河、低矮長凳、坐墊、茶具
S['space'] = (DARK, floor(DARK) + '''
<rect x="200" y="80" width="500" height="300"/><path d="M450 80 v300" stroke-opacity=".6"/>
<path d="M230 330 l30 -110 l30 110 z M290 330 l36 -150 l36 150 z M370 330 l26 -90 l26 90 z M470 330 l34 -130 l34 130 z M560 330 l28 -100 l28 100 z M620 330 l40 -170 l40 170z" stroke-opacity=".75"/>
<path d="M200 350 q120 -24 250 6 t250 -10" stroke-opacity=".7"/><path d="M200 366 q140 -18 260 4 t240 -6" stroke-opacity=".4"/>
<path d="M260 440 h380 v14 h-380 z M280 454 v16 M620 454 v16"/>
<ellipse cx="330" cy="436" rx="44" ry="8"/><path d="M500 440 v-16 h40 v16 M540 428 q14 0 14 -8" /><circle cx="590" cy="434" r="7"/><circle cx="612" cy="434" r="7"/>
''' + fern(860, 0, 9, 1, 1))

# 4F our time 婚紗攝影：人台與禮服、相機腳架、柔光燈、拱形背景
S['bridal'] = (DARK, floor(DARK) + '''
<path d="M180 470 V180 a170 170 0 0 1 340 0 V470" stroke-opacity=".4" fill="rgba(217,180,119,.05)"/>
<path d="M350 120 a14 14 0 1 1 0.1 0" /><path d="M350 134 v14"/>
<path d="M322 150 q28 -10 56 0 l-6 70 q-22 8 -44 0 z"/><path d="M328 220 q-80 140 -110 250 h264 q-30 -110 -110 -250" fill="rgba(217,180,119,.07)"/>
<path d="M300 300 q50 20 100 0 M270 380 q80 30 160 0 M240 450 q110 30 220 0" stroke-opacity=".45"/>
<path d="M650 470 l40 -170 l40 170 M690 300 v170"/><rect x="655" y="250" width="70" height="46" rx="4"/><circle cx="690" cy="273" r="14"/><path d="M675 250 v-10 h20 v10"/>
<path d="M780 120 l90 40 v110 l-90 40 z"/><path d="M780 190 h-30 v280 M720 470 h60" />
<path d="M560 140 l4 -9 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4z M140 220 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3z" stroke-opacity=".8"/>
''')

# 漢口總店大樓外觀：四層樓、窗、電梯、垂掛植物
S['building'] = (DARK, '''<path d="M0 520 H900" stroke-opacity=".7"/><path d="M0 534 H900" stroke-opacity=".3"/>
<path d="M260 520 V60 h380 V520"/><path d="M240 60 h420" />
<path d="M260 175 h380 M260 290 h380 M260 405 h380" stroke-opacity=".7"/>
<rect x="290" y="85" width="90" height="70" fill="rgba(255,214,150,.18)"/><rect x="420" y="85" width="90" height="70"/><rect x="540" y="85" width="70" height="70" fill="rgba(255,214,150,.12)"/>
<rect x="290" y="200" width="90" height="70"/><rect x="420" y="200" width="90" height="70" fill="rgba(255,214,150,.18)"/><rect x="540" y="200" width="70" height="70"/>
<rect x="290" y="315" width="90" height="70" fill="rgba(255,214,150,.12)"/><rect x="420" y="315" width="90" height="70"/><rect x="540" y="315" width="70" height="70" fill="rgba(255,214,150,.18)"/>
<rect x="290" y="425" width="140" height="95" fill="rgba(255,214,150,.15)"/><rect x="470" y="430" width="70" height="90"/><path d="M505 430 v90" stroke-opacity=".6"/><path d="M490 418 h30" /><circle cx="505" cy="412" r="3"/>
<rect x="560" y="425" width="60" height="95"/>
<path d="M200 520 v-60 M200 460 q-20 -30 0 -60 q20 30 0 60" stroke-opacity=".7"/><path d="M700 520 v-90 M700 430 q-30 -40 0 -90 q30 50 0 90" stroke-opacity=".7"/>
''' + fern(300, 60, 6, .7, 1) + fern(600, 175, 6, .7, -1) + fern(380, 290, 5, .6, 1))

# 通用店面
S['shop'] = (DARK, floor(DARK) + '''
<path d="M220 470 V150 h460 V470"/><path d="M200 150 h500 l-20 -50 h-460 z" fill="rgba(217,180,119,.07)"/><path d="M240 100 l-10 50 M300 100 l-6 50 M360 100 l-2 50 M420 100 v50 M480 100 l2 50 M540 100 l6 50 M600 100 l10 50 M660 100 l10 50" stroke-opacity=".5"/>
<rect x="250" y="190" width="200" height="200" fill="rgba(255,214,150,.12)"/><rect x="490" y="190" width="160" height="280"/><circle cx="510" cy="340" r="5"/>
''' + pot_plant(170, 470, 1.0) + pot_plant(740, 470, .9))

# 咖啡
S['coffee'] = (DARK, floor(DARK) + '''
<path d="M180 400 h540" /><path d="M200 400 v70 M700 400 v70" stroke-opacity=".7"/>
<path d="M320 400 v-70 h90 v70 M410 345 q30 0 30 22 q0 22 -30 22"/><path d="M340 320 q-10 -20 6 -40 q16 -20 0 -40 M380 320 q-10 -20 6 -40 q16 -20 0 -40" stroke-opacity=".6"/>
<path d="M520 400 l20 -110 h80 l20 110 z" /><path d="M540 290 l20 -40 h40 l20 40"/><path d="M580 250 v-30 M560 220 h40"/>
<path d="M230 400 q30 -40 70 0" /><path d="M240 392 q20 -20 50 0" stroke-opacity=".6"/>
''' + fern(760, 0, 9, 1, -1))

# 黃埔二店：日式平房（淺色）
S['huangpu'] = (LIGHT, floor(LIGHT) + '''
<path d="M140 250 L450 120 L760 250" /><path d="M120 262 L450 126 L780 262" stroke-opacity=".5"/>
<path d="M180 250 V470 M720 250 V470"/><path d="M180 300 h540" stroke-opacity=".6"/>
<path d="M240 470 V320 h420 V470"/><path d="M310 320 v150 M380 320 v150 M450 320 v150 M520 320 v150 M590 320 v150" stroke-opacity=".6"/>
<path d="M240 360 h420 M240 410 h420" stroke-opacity=".3"/><path d="M160 470 h580 v-14 h-580 z"/>
<path d="M800 470 v-140 M800 330 q-60 -20 -40 -80 q30 -40 70 -10 q50 10 40 60 q-10 40 -70 30" fill="rgba(122,92,60,.06)"/>
<circle cx="110" cy="390" r="22"/><path d="M110 368 v-20 M110 412 v58" stroke-opacity=".7"/>
''')

for k, (c, body) in S.items():
    open(f'{OUT}/{k}.svg', 'w').write(frame(body, c))
print(sorted(S))

# ---- 健康餐餐盒示意（方形給品項卡、3:2 給頁首），2026-11-05 加 ----
def bento(w, h):
    s = min(w, h) / 600.0; ox = (w - 600 * s) / 2; oy = (h - 600 * s) / 2
    circ = ''.join('<circle cx="%d" cy="%d" r="%d"%s/>' % (x, y, 14 + (i % 3) * 5, ' opacity=".7"' if i % 2 else '') for i, (x, y) in enumerate([(350,200),(400,230),(450,200),(360,280),(430,290),(380,350),(450,370),(350,410),(420,420)]))
    body = ('<rect x="110" y="150" width="380" height="300" fill="rgba(217,180,119,.08)"/><path d="M300 150v300M110 300h190"/>'
            '<ellipse cx="205" cy="225" rx="62" ry="40"/><path d="M160 225q45 -30 90 0" opacity=".6"/>'
            '<circle cx="185" cy="375" r="36"/><circle cx="185" cy="375" r="14" fill="rgba(217,180,119,.35)"/>'
            '<path d="M240 360q20 -24 40 0M232 400q24 -20 48 0" opacity=".7"/>' + circ)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (w, h, w, h) +
            '<defs><radialGradient id="g" cx="78%" cy="12%" r="110%"><stop offset="0" stop-color="#33504A"/><stop offset=".45" stop-color="#233A36"/><stop offset="1" stop-color="#1B2E2B"/></radialGradient></defs>' +
            '<rect width="%d" height="%d" fill="url(#g)"/>' % (w, h) +
            '<g transform="translate(%.1f %.1f) scale(%.3f)" fill="none" stroke="#D9B477" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">%s</g>' % (ox, oy, s, body) +
            '<text x="%d" y="%d" text-anchor="end" font-family="Georgia,serif" font-style="italic" font-size="15" letter-spacing="2" fill="rgba(217,180,119,.55)">illustration · 示意</text></svg>' % (w - 28, h - 20))

open(os.path.join(OUT, 'bento.svg'), 'w').write(bento(600, 600))
open(os.path.join(OUT, 'bento-wide.svg'), 'w').write(bento(900, 600))
