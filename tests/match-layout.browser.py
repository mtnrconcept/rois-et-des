"""Viewport-fit regression: real HTML, game interactions and Blender WebGL."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright
from browser_server import BrowserServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'match-layout-captures'
OUT.mkdir(exist_ok=True)
errors, checks = [], []
server = None if os.environ.get('FLEET_BASE_URL') else BrowserServer(ROOT)
BASE = os.environ.get('FLEET_BASE_URL',server.base_url if server else '').rstrip('/')

def passed(label):
    checks.append(label)
    print('PASS', label, flush=True)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,
            executable_path=os.environ.get('BROWSER_BIN') or shutil.which('chromium'),
            args=['--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width':1440,'height':900}, reduced_motion='reduce')
        page = context.new_page()
        page.set_default_timeout(30000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: errors.append(r.url + ': ' + str(r.failure)))

        def fit(label, fleet=False):
            page.wait_for_timeout(150)
            report = page.evaluate('''fleet=>{
                const selectors=['.players','.race-rails','.console','#instruction','#dice','#roll','.assistant-bar',fleet?'#fleet-container':'#cabinet'];
                const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}};
                const c=document.querySelector('.console').getBoundingClientRect();
                return {w:innerWidth,h:innerHeight,sh:document.documentElement.scrollHeight,sw:document.documentElement.scrollWidth,consoleBottom:c.bottom,boxes:selectors.map(box),square:document.querySelector('.square').getBoundingClientRect().width};
            }''', fleet)
            assert report['sh'] <= report['h']+1, (label, report)
            assert report['sw'] <= report['w']+1, (label, report)
            for b in report['boxes']:
                assert b['w'] > 1 and b['h'] > 1, (label,b)
                assert b['x'] >= -1 and b['y'] >= -1 and b['b'] <= report['h']+1 and b['r'] <= report['w']+1, (label,b,report)
                if b['s'] in ['#instruction','#dice','#roll']:
                    assert b['b'] <= report['consoleBottom']-1, (label,'primary control is clipped by console',b,report)
            if not fleet:
                assert report['square'] >= 24, (label, report['square'])
            passed(label)

        page.goto(BASE+'/play.html?mode=local&fresh=1', wait_until='networkidle')
        for w,h in [(1920,1080),(1440,900),(1366,768)]:
            page.set_viewport_size({'width':w,'height':h})
            fit(f'2D free game {w}x{h}')
        page.screenshot(path=str(OUT/'desktop-2d.png'))

        page.goto(BASE+'/play.html?puzzle=premier-pas', wait_until='networkidle')
        for w,h in [(1920,1080),(1440,900),(1366,768)]:
            page.set_viewport_size({'width':w,'height':h})
            fit(f'2D exercise {w}x{h}')
            assert page.locator('#training-hint').is_visible()
            assert page.locator('#training-solution').bounding_box()['y'] < h
        page.screenshot(path=str(OUT/'desktop-exercise.png'))
        page.locator('#sq-e2').click()
        page.locator('#sq-e4').click()
        page.wait_for_selector('#training-success')
        fit('exercise success stays in viewport')

        page.set_viewport_size({'width':390,'height':844})
        page.goto(BASE+'/play.html?puzzle=proteger', wait_until='networkidle')
        fit('mobile 390x844 exercise')
        page.locator('[data-focus="left"]').click()
        assert page.locator('#track-left').is_visible() and not page.locator('.chess-frame').is_visible()
        page.locator('#point-8').click()
        page.locator('[data-focus="right"]').click()
        page.locator('#point-5').click()
        page.locator('#match-help').click()
        assert page.locator('#match-help-dialog').evaluate('el=>el.open')
        assert page.locator('#training-success').is_visible()
        page.keyboard.press('Escape')
        assert page.locator('#match-help').evaluate('el=>el===document.activeElement')
        passed('mobile course tabs, real legal move, teaching drawer and keyboard focus')
        page.locator('[data-focus="chess"]').click()
        page.screenshot(path=str(OUT/'mobile-2d.png'))

        page.goto(BASE+'/play.html?puzzle=premier-pas', wait_until='networkidle')
        page.locator('[data-focus="left"]').click()
        page.locator('#match-help').click()
        page.locator('#training-hint').click()
        assert page.locator('#match-help-dialog').evaluate('el=>el.open')
        assert page.locator('.hint-explanation').is_visible()
        page.locator('#training-hint').click()
        page.locator('#training-hint').click()
        assert not page.locator('#match-help-dialog').evaluate('el=>el.open')
        assert page.locator('.chess-frame').is_visible()
        passed('mobile hint opens its board section before anchoring the guide')
        # Closing the guide is equivalent to its accessible close button; no game hook.
        if page.locator('.coach-bubble [aria-label]').count():
            page.locator('.coach-bubble [aria-label]').first.click()
        page.locator('#match-options').click()
        page.locator('#rules-button').click()
        assert page.locator('#rules-dialog').evaluate('el=>el.open')
        page.locator('#close-rules').click()
        passed('rules remain accessible from the compact options drawer')

        page.goto(BASE+'/play.html?mode=local&fresh=1', wait_until='networkidle')
        for w,h in [(844,390),(720,450),(390,844)]:
            page.set_viewport_size({'width':w,'height':h})
            fit(f'compact 2D {w}x{h} (landscape / 200% viewport / phone)')
        page.set_viewport_size({'width':844,'height':390})
        page.screenshot(path=str(OUT/'landscape-2d.png'))

        page.goto(BASE+'/play.html?puzzle=addition-tour', wait_until='networkidle')
        fit('long exercise objective remains visible in low landscape')
        page.locator('#back-to-lobby').click()
        page.wait_for_selector('#app-nav')
        page.go_back(wait_until='networkidle')
        page.wait_for_selector('#sq-e2')
        fit('history navigation restores the compact layout')
        page.set_viewport_size({'width':390,'height':844})
        fit('restored layout still responds to resize')
        page.goto(BASE+'/play.html?puzzle=double-pas', wait_until='networkidle')
        page.set_viewport_size({'width':844,'height':390})
        fit('four dice and long exercise objective remain visible in landscape')

        if os.environ.get('MATCH_SKIP_WEBGL') != '1':
            page.set_viewport_size({'width':1366,'height':768})
            page.goto(BASE+'/play.html?view=fleet&mode=local&fresh=1', wait_until='networkidle')
            page.wait_for_selector('[data-fleet-state="ready"]',timeout=90000)
            page.wait_for_function("document.querySelector('#fleet-container').getAttribute('aria-busy')==='false'")
            for w,h in [(1366,768),(1440,900),(1920,1080),(390,844),(844,390)]:
                page.set_viewport_size({'width':w,'height':h})
                fit(f'Blender 3D {w}x{h}', fleet=True)
                if (w,h) in [(1440,900),(390,844)]:
                    page.screenshot(path=str(OUT/('mobile-3d.png' if w==390 else 'desktop-3d.png')))
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#fleet-accessible-toggle').click()
            fit('mobile 3D accessible 2D alternative')
            page.locator('[data-focus="right"]').click()
            assert page.locator('#track-right').is_visible()
            page.locator('#fleet-accessible-toggle').click()
            fit('return from accessible board to 3D',fleet=True)
            page.goto(BASE+'/play.html?view=fleet&puzzle=addition-tour', wait_until='networkidle')
            page.wait_for_selector('[data-fleet-state="ready"]',timeout=90000)
            fit('mobile 3D exercise and long objective',fleet=True)
            page.set_viewport_size({'width':1366,'height':768})
            fit('desktop 3D exercise with its teaching sidebar',fleet=True)

        assert not errors, errors
        browser.close()
        print(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False),flush=True)
finally:
    if server: server.close()
