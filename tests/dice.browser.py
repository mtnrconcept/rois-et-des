"""Physics-derived rolls through the real browser worker, in both board views."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright
from browser_server import BrowserServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
server = None if os.environ.get('FLEET_BASE_URL') else BrowserServer(ROOT)
BASE = os.environ.get('FLEET_BASE_URL') or server.base_url
errors, failed, checks = [], [], []
STORE = 'echgammon.royal.v3'

def record(name):
    checks.append(name)
    print('PASS', name, flush=True)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,
            executable_path=os.environ.get('BROWSER_BIN') or shutil.which('chromium'),
            args=['--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width':1366,'height':768})
        page = context.new_page()
        page.set_default_timeout(60000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('requestfailed', lambda r: failed.append(r.url))
        workers = []
        page.on('worker', lambda w: workers.append(w.url))

        def state():
            return page.evaluate('k=>JSON.parse(localStorage.getItem(k)).game', STORE)

        def settled():
            page.wait_for_function("document.body.dataset.diceState==='settled'||document.body.dataset.diceState==='error'")
            assert page.locator('body').get_attribute('data-dice-state') == 'settled', page.locator('#instruction').inner_text()
            values = [int(v) for v in page.locator('#dice').get_attribute('data-physics-values').split(',')]
            assert len(values) == 2 and all(1 <= v <= 6 for v in values)
            assert page.locator('#dice').get_attribute('data-physics-engine') == 'cannon-es'
            return values

        def new_game():
            # Lifecycle assertion; options drawer itself is covered by layout tests.
            page.locator('#new-game').evaluate('el=>el.click()')
            page.locator('#confirm-new').click()

        page.goto(BASE+'/play.html?mode=local&fresh=1', wait_until='networkidle')
        before = state()
        page.locator('#roll').click()
        page.wait_for_selector('[data-dice-canvas]')
        assert page.locator('#roll').is_disabled()
        assert state() == before, 'values must not commit while the physical throw is moving'
        page.screenshot(path=str(ROOT/'dice-throw-preview.png'))
        values = settled()
        assert state()['revision'] == 1 and state()['dice'] == values
        assert any('dice-worker.mjs' in url for url in workers)
        page.screenshot(path=str(ROOT/'dice-result-preview.png'))
        record('classic board: real 3D canvas, physics worker and one committed pair after rest')

        new_game()
        page.locator('#roll').click()
        page.wait_for_function("document.body.dataset.diceState==='rolling'")
        # A synthetic second event exercises the guard even if a queued native click arrives.
        page.locator('#roll').evaluate('el=>el.dispatchEvent(new MouseEvent("click",{bubbles:true}))')
        values = settled()
        assert state()['revision'] == 1 and state()['dice'] == values
        record('rapid repeated roll input cannot produce two game transitions')

        new_game()
        page.locator('#roll').click()
        page.wait_for_selector('[data-dice-canvas]')
        new_game()
        page.wait_for_timeout(900)
        assert state()['phase'] == 'opening' and state()['revision'] == 0
        assert page.locator('[data-dice-canvas]').count() == 0
        record('reset interrupts the throw, terminates the worker and rejects its stale result')

        page.emulate_media(reduced_motion='reduce')
        page.locator('#roll').click()
        values = settled()
        assert state()['dice'] == values
        record('reduced motion still derives the result from settled physics')

        # Fail the simulation once during a bot turn. No fabricated pair is
        # accepted; the player can retry even though it is the computer's turn.
        page.route('**/echgammon/dice-worker.mjs', lambda route: route.fulfill(
            content_type='text/javascript',body="self.onmessage=()=>self.postMessage({error:'Dé coincé.'});"), times=1)
        page.evaluate("""async ()=>{
            const {createGame}=await import('/echgammon/game.mjs');
            const game=createGame();game.phase='roll';game.turn='b';
            localStorage.setItem('echgammon.royal.v3',JSON.stringify({game,mode:'ai',level:'easy'}));
        }""")
        page.reload(wait_until='networkidle')
        page.wait_for_function("document.body.dataset.diceState==='error'")
        assert state()['revision'] == 0 and state()['phase'] == 'roll'
        assert page.locator('#roll').is_enabled()
        page.locator('#roll').click()
        values = settled()
        assert state()['revision'] >= 1
        assert state()['dice'][:2] == values
        record('blocked bot roll has a reachable retry and then uses the same physical values')

        page.goto(BASE+'/play.html?view=fleet&mode=local&fresh=1', wait_until='networkidle')
        page.wait_for_selector('[data-fleet-state="ready"]', timeout=120000)
        page.wait_for_function("document.querySelector('#fleet-container').getAttribute('aria-busy')==='false'")
        page.emulate_media(reduced_motion='no-preference')
        page.locator('#roll').click()
        page.wait_for_function("document.querySelector('.fleet-mount').dataset.dicePhysics==='cannon-es'")
        assert state()['revision'] == 0
        assert page.locator('.fleet-mount').get_attribute('data-fleet-camera') == 'chess'
        page.screenshot(path=str(ROOT/'dice-fleet-throw-preview.png'))
        values = settled()
        assert state()['dice'] == values
        assert page.locator('.fleet-mount').get_attribute('data-dice-values') == ','.join(map(str,values))
        assert page.locator('[data-dice-canvas]').count() == 0, 'fleet dice live in its existing scene'
        record('Blender board: dice are rendered in the scene and their settled faces match the game')

        new_game()
        page.locator('#fleet-accessible-toggle').click()
        page.emulate_media(reduced_motion='reduce')
        page.locator('#roll').click()
        values = settled()
        assert page.locator('[data-dice-canvas]').is_visible()
        assert state()['dice'] == values
        record('accessible board receives a visible dice canvas instead of the hidden fleet scene')

        page.goto(BASE+'/play.html?mode=local&fresh=1', wait_until='networkidle')
        page.emulate_media(reduced_motion='no-preference')
        page.locator('#roll').click()
        page.wait_for_selector('[data-dice-canvas]')
        page.locator('[data-dice-canvas]').evaluate("el=>el.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
        values = settled()
        assert state()['dice'] == values
        assert page.locator('#roll').get_attribute('disabled') is not None or state()['phase'] == 'opening'
        record('lost dice WebGL context releases the animation and preserves the physical result')

        assert not errors, errors
        assert not failed, failed
        print(json.dumps({'checks':len(checks),'errors':errors,'failed_requests':failed,'base':BASE}), flush=True)
        browser.close()
finally:
    if server:
        server.close()
