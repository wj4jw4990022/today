# 產生商品／服務項目的示意插畫（SVG，1:1，600x600），存到 public/assets/illus/items/
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'illus', 'items')
os.makedirs(OUT, exist_ok=True)

def svg(body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs><radialGradient id="g" cx="75%" cy="15%" r="110%"><stop offset="0" stop-color="#33504A"/><stop offset=".5" stop-color="#233A36"/><stop offset="1" stop-color="#1B2E2B"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#FFD6A0" stop-opacity="0"/><stop offset=".48" stop-color="#FFD6A0" stop-opacity=".14"/><stop offset=".66" stop-color="#FFD6A0" stop-opacity="0"/></linearGradient></defs>
<rect width="600" height="600" fill="url(#g)"/>
<g fill="none" stroke="#D9B477" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
{body}
</g><rect width="600" height="600" fill="url(#b)"/></svg>'''

F = 'fill="rgba(217,180,119,.10)"'
I = {}
I['noodle'] = '''<path d="M130 300 h340 q-10 140 -170 160 q-160 -20 -170 -160z" ''' + F + '''/><path d="M240 470 h120"/>
<path d="M170 300 q40 -40 80 0 t80 0 t80 0" opacity=".7"/><path d="M200 280 q30 -30 60 0 t60 0 t60 0" opacity=".5"/>
<path d="M380 120 L250 300 M420 130 L290 300"/><path d="M250 230 q-12 -30 4 -60 M300 220 q-12 -30 4 -60" opacity=".6"/>'''
I['pasta'] = '''<ellipse cx="300" cy="360" rx="200" ry="70" ''' + F + '''/><ellipse cx="300" cy="350" rx="120" ry="38"/>
<path d="M230 350 q70 -60 140 0 q-70 40 -140 0 M260 348 q40 -30 80 0" opacity=".7"/><path d="M420 130 L320 330 M430 135 l-20 -10 M440 140 l-20 -10 M450 145 l-20 -10" />'''
I['cake'] = '''<path d="M150 420 L300 200 L450 420 z" ''' + F + '''/><path d="M150 420 v40 h300 v-40"/><path d="M300 200 l18 26 M200 350 q50 -14 100 0 t100 0" opacity=".6"/><path d="M110 470 h380"/>'''
I['dumpling'] = '''<ellipse cx="300" cy="400" rx="210" ry="60"/>''' + ''.join(f'<path d="M{x-70} {y} q70 -110 140 0 q-70 30 -140 0z" {F}/><path d="M{x-40} {y-40} l10 12 M{x-10} {y-52} l6 14 M{x+22} {y-46} l-2 14" opacity=".7"/>' for x, y in [(210, 390), (390, 390), (300, 330)])
I['roll'] = '''<circle cx="300" cy="300" r="140" ''' + F + '''/><path d="M300 300 m-20 0 a20 20 0 1 1 40 0 a50 50 0 1 1 -100 0 a80 80 0 1 1 160 0 a110 110 0 1 1 -220 0" opacity=".8"/><path d="M110 470 h380"/>'''
I['top'] = '''<path d="M300 110 q14 0 14 14 q0 12 -14 18 L140 220 h320 L300 142"/><path d="M200 220 l-60 60 l40 40 l30 -30 v170 h180 v-170 l30 30 l40 -40 l-60 -60" ''' + F + '''/><path d="M270 220 q30 30 60 0" opacity=".7"/>'''
I['coat'] = '''<path d="M300 100 q14 0 14 14 q0 12 -14 18 L140 210 h320 L300 132"/><path d="M200 210 l-40 40 v240 h90 v-180 M400 210 l40 40 v240 h-90 v-180 M250 310 v180 h100 v-180" ''' + F + '''/><path d="M270 210 l30 100 l30 -100 M300 330 v140" opacity=".7"/><circle cx="315" cy="360" r="5"/><circle cx="315" cy="410" r="5"/>'''
I['bag'] = '''<path d="M160 260 h220 l20 220 h-260 z" ''' + F + '''/><path d="M210 260 v-40 a60 60 0 0 1 120 0 v40"/><circle cx="440" cy="200" r="22"/><path d="M440 222 v40 l-14 40 h28 l-14 -40" /><path d="M440 160 v18" />'''
I['cut'] = '''<circle cx="220" cy="400" r="40"/><circle cx="330" cy="420" r="40"/><path d="M245 370 L420 140 M305 390 L180 140" stroke-width="5"/><path d="M420 330 h120 v26 h-120 z"/><path d="M430 356 v34 M450 356 v34 M470 356 v34 M490 356 v34 M510 356 v34 M530 356 v34" opacity=".7"/>'''
I['dye'] = '''<path d="M140 320 h200 q-10 110 -100 120 q-90 -10 -100 -120z" ''' + F + '''/><path d="M160 320 q40 -24 80 0 t80 0" opacity=".6"/><path d="M330 300 L470 140"/><path d="M455 120 l40 40 l-30 26 l-40 -40 z"/><path d="M380 460 q30 -60 60 0 q-30 30 -60 0z" opacity=".7"/>'''
I['perm'] = '''<path d="M180 140 q-60 80 0 160 q60 80 0 160 M260 140 q-60 80 0 160 q60 80 0 160 M340 140 q-60 80 0 160 q60 80 0 160 M420 140 q-60 80 0 160 q60 80 0 160" opacity=".85"/><path d="M150 140 h300" />'''
I['tattoo'] = '''<path d="M160 420 l170 -170 l60 30 l-150 160 z" ''' + F + '''/><path d="M390 280 l90 -90 M300 300 l40 40 M240 410 l-80 80"/><circle cx="360" cy="250" r="20"/><path d="M460 170 q30 -40 60 -10" opacity=".7"/>'''
I['design'] = '''<rect x="140" y="140" width="260" height="320" ''' + F + '''/><path d="M140 140 v320" stroke-width="8"/><path d="M270 220 c-50 30 -50 100 0 150 c50 -50 50 -120 0 -150z M270 220 v170 M270 290 l-26 -18 M270 320 l26 -18" opacity=".85"/><path d="M430 460 L480 180 l20 6 l-50 280 z M430 460 l-6 30 l26 -20"/>'''
I['consult'] = '''<path d="M120 160 h250 v150 h-150 l-50 50 v-50 h-50 z" ''' + F + '''/><path d="M260 340 h220 v130 h-40 v44 l-44 -44 h-136 z"/><circle cx="190" cy="235" r="7"/><circle cx="245" cy="235" r="7"/><circle cx="300" cy="235" r="7"/><path d="M300 400 h120 M300 430 h80" opacity=".7"/>'''
I['crystal'] = '''<path d="M220 440 l-30 -140 l50 -80 l40 110 z M270 440 l20 -260 l60 -60 l30 220 l-40 90 z M380 440 l30 -170 l50 50 l-10 120 z M180 440 l-10 -70 l30 -30 l20 70" ''' + F + '''/><path d="M290 180 l60 -60 M310 360 l30 -200" opacity=".5"/><path d="M130 440 h340"/>'''
I['bracelet'] = ''.join(f'<circle cx="{300+150*__import__("math").cos(a*0.3927):.1f}" cy="{300+150*__import__("math").sin(a*0.3927):.1f}" r="26" {F}/>' for a in range(16)) + '<circle cx="300" cy="300" r="150" opacity=".35"/>'
I['ornament'] = '''<circle cx="300" cy="250" r="120" ''' + F + '''/><path d="M240 210 q30 -40 70 -30" opacity=".7"/><path d="M200 380 h200 l-30 60 h-140 z"/><path d="M160 470 h280"/>'''
I['massage'] = '''<path d="M110 330 h380 a20 20 0 0 1 0 40 h-380 a20 20 0 0 1 0 -40z" ''' + F + '''/><path d="M150 370 l-20 110 M450 370 l20 110"/><path d="M150 330 v-26 h100 v26" /><ellipse cx="380" cy="320" rx="50" ry="10"/><ellipse cx="380" cy="304" rx="36" ry="9"/><ellipse cx="380" cy="290" rx="24" ry="8"/>'''
I['neck'] = '''<circle cx="300" cy="190" r="70" ''' + F + '''/><path d="M260 260 v30 q-120 20 -140 150 M340 260 v30 q120 20 140 150"/><path d="M200 300 q-20 -30 0 -60 M400 300 q20 -30 0 -60 M180 330 q-24 -40 0 -80 M420 330 q24 -40 0 -80" opacity=".6"/>'''
I['foot'] = '''<path d="M260 470 c-80 0 -100 -100 -80 -170 c20 -80 120 -90 140 -20 c20 60 10 190 -60 190z" ''' + F + '''/><circle cx="330" cy="200" r="18"/><circle cx="300" cy="170" r="16"/><circle cx="265" cy="160" r="14"/><circle cx="232" cy="164" r="12"/><circle cx="205" cy="180" r="10"/>'''
I['venue'] = '''<path d="M110 470 V170 h380 V470"/><path d="M150 210 h120 v120 h-120 z M330 210 h120 v120 h-120 z" ''' + F + '''/><path d="M150 470 v-60 h70 v60 M150 410 v-40 M380 470 v-60 h70 v60 M450 410 v-40"/><path d="M90 470 h420"/>'''
I['lecture'] = '''<rect x="160" y="130" width="280" height="190" ''' + F + '''/><path d="M200 180 h150 M200 220 h200 M200 260 h120" opacity=".7"/><path d="M300 320 v40 M240 470 l60 -110 l60 110"/><circle cx="160" cy="430" r="20"/><path d="M130 480 q30 -40 60 0"/><circle cx="440" cy="430" r="20"/><path d="M410 480 q30 -40 60 0"/>'''
I['party'] = '''<path d="M200 160 h100 l-16 140 q-34 20 -68 0 z M330 160 h100 l-16 140 q-34 20 -68 0 z" ''' + F + '''/><path d="M250 310 v120 M380 310 v120 M210 430 h80 M340 430 h80"/><path d="M300 120 l14 -30 M315 140 l30 -18 M285 140 l-30 -18" opacity=".7"/>'''
I['camera'] = '''<rect x="130" y="210" width="340" height="220" ''' + F + '''/><path d="M220 210 l26 -50 h108 l26 50"/><circle cx="300" cy="320" r="72"/><circle cx="300" cy="320" r="40" opacity=".7"/><circle cx="420" cy="250" r="8"/>'''
I['gown'] = '''<path d="M300 100 q14 0 14 14 q0 12 -14 18 L160 200 h280 L300 132"/><path d="M262 200 q38 20 76 0 l-8 80 q-30 14 -60 0 z"/><path d="M270 280 q-90 120 -110 210 h280 q-20 -90 -110 -210" ''' + F + '''/><path d="M220 400 q80 26 160 0" opacity=".5"/>'''
I['portrait'] = '''<rect x="160" y="110" width="280" height="380" ''' + F + '''/><rect x="185" y="135" width="230" height="330" opacity=".5"/><circle cx="300" cy="260" r="56"/><path d="M200 465 q100 -170 200 0"/>'''

for k, b in I.items():
    open(os.path.join(OUT, k + '.svg'), 'w').write(svg(b))
print(len(I), sorted(I))
