"""Real HTTP/WebGL smoke tests for the Blender presentation, with native storage.

Fixtures use the existing game serializer. No production debug endpoint or rule
override is installed. Reduced motion makes software-rendered CI deterministic;
the capture clips are also exercised at their normal duration.
"""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright
from browser_server import BrowserServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
server = None if os.environ.get('FLEET_BASE_URL') else BrowserServer(ROOT)
BASE_URL = os.environ.get('FLEET_BASE_URL', server.base_url if server else '').rstrip('/')
SMOKE = os.environ.get("FLEET_SMOKE") == "1"
STORE = "echgammon.royal.v3"
errors = []
failed = []
checks = []


def recorded(name):
    checks.append(name)
    print("PASS", name, flush=True)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=os.environ.get("BROWSER_BIN") or shutil.which("chromium"),
            args=["--enable-unsafe-swiftshader"],
        )
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, reduced_motion="reduce")
        page = context.new_page()
        page.set_default_timeout(45000)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("requestfailed", lambda request: failed.append(request.url + ": " + str(request.failure)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        def ready():
            page.wait_for_selector('[data-fleet-state="ready"]', timeout=90000)
            page.wait_for_function("document.querySelector('#fleet-container').getAttribute('aria-busy')==='false'")
            assert page.locator('[data-fleet-canvas]').count() == 1

        def state():
            return page.evaluate("k=>JSON.parse(localStorage.getItem(k)).game", STORE)

        def fixture(body):
            page.evaluate("""async body=>{
                const {createGame,isState}=await import('/echgammon/game.mjs');
                const g=createGame(),sq=s=>s.charCodeAt(0)-97+(+s[1]-1)*8;
                new Function('g','sq',body)(g,sq);
                if(!isState(g))throw Error('Invalid browser fixture');
                localStorage.setItem('echgammon.royal.v3',JSON.stringify({game:g,mode:'local',level:'medium'}));
            }""", body)
            page.reload(wait_until="networkidle")
            ready()

        def camera(which):
            page.locator('[data-camera="' + which + '"]').evaluate("el=>el.click()")
            page.locator('#fleet-container').evaluate("el=>el.scrollIntoView({block:'center',behavior:'instant'})")

        def ray_click(kind, n, which="chess"):
            camera(which)
            # Project the published Blender coordinates through the documented
            # camera preset, then send an actual pointer event to the canvas.
            pos = page.evaluate("""async ({kind,n,which})=>{
                const T=await import('/assets/fleet/vendor/three.module.js');
                const {squarePosition,pointPosition,reservePosition}=await import('/echgammon/royal-fleet.mjs');
                const rect=document.querySelector('[data-fleet-canvas]').getBoundingClientRect();
                const aspect=rect.width/rect.height,h=which==='chess'?13.3:9.4,v=which==='chess'?12.2:13.8;
                const half=Math.max(v,h/aspect)/2,x=which==='left'?-10.4:which==='right'?10.4:0;
                const cam=new T.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,180);
                cam.position.set(x,34,10);cam.lookAt(x,1.1,0);cam.updateMatrixWorld();
                const location=kind==='square'?squarePosition(n):kind==='point'?pointPosition(n):reservePosition(kind,n,0);
                if(kind==='point')location[2]=n>=12?-3.27:3.27;
                const point=new T.Vector3(...location).project(cam);
                return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
            }""", {"kind": kind, "n": n, "which": which})
            assert 0 <= pos["x"] <= page.viewport_size["width"]
            assert 0 <= pos["y"] <= page.viewport_size["height"]
            page.mouse.click(pos["x"], pos["y"])

        def finished(revision=1):
            page.wait_for_function("r=>document.querySelector('.fleet-mount')?.dataset.fleetRevision===String(r)&&document.querySelector('#fleet-container').getAttribute('aria-busy')==='false'", arg=revision)

        page.goto(BASE_URL + "/play.html?view=fleet&mode=local&fresh=1", wait_until="networkidle")
        ready()
        data = page.locator('.fleet-mount').evaluate("el=>({...el.dataset})")
        assert data["fleetPieces"] == "32" and data["fleetCheckers"] == "30" and data["fleetClips"] == "72"
        assert data["fleetAssetSource"] == "blender-glb"
        page.screenshot(path=str(ROOT / "fleet-desktop-preview.png"), full_page=True)
        recorded("14 Blender GLBs, 32 chess pieces, 30 race checkers, 72 clips")
        page.set_viewport_size({'width':960,'height':800})

        fixture("g.phase='play';g.dice=[2,3];g.used=[false,false];")
        ray_click("square", 12)
        assert page.locator('#sq-e2').get_attribute('aria-pressed') == 'true'
        ray_click("square", 28)
        finished()
        assert state()["chess"]["board"][28] == "wP" and state()["used"] == [True, False]
        recorded("real 3D raycasts select e2 and move to e4")

        basic = "g.phase='play';g.dice=[3,1];g.used=[false,false];g.chess.board.fill(null);g.chess.rights={wK:false,wQ:false,bK:false,bQ:false};g.chess.board[sq('h1')]='wK';g.chess.board[sq('h8')]='bK';"
        fixture(basic + "g.turn='b';g.chess.board[sq('a8')]='bR';g.chess.board[sq('a5')]='wN';")
        page.emulate_media(reduced_motion="no-preference")
        ray_click("square", 56)
        ray_click("square", 32)
        finished()
        page.emulate_media(reduced_motion="reduce")
        assert state()["chess"]["board"][32] == "bR"
        assert page.locator('.fleet-mount').get_attribute('data-fleet-last-animation') == 'cannon'
        recorded("blue rook capture: real ATTACK/HIT/DEFEAT clips and cannon effect")

        if not SMOKE:
            fixture(basic + "g.chess.board[sq('d1')]='wQ';g.chess.board[sq('d4')]='bB';")
            ray_click("square", 3)
            ray_click("square", 27)
            finished()
            assert state()["chess"]["board"][27] == "wQ"
            assert page.locator('.fleet-mount').get_attribute('data-fleet-last-animation') == 'royal-energy'
            recorded("red queen capture emits royal energy from the Blender staff")

            fixture("g.phase='play';g.dice=[2,1];g.used=[false,false];g.race.points.fill(0);g.race.points[5]=1;g.race.points[23]=14;g.race.points[3]=-1;g.race.points[18]=-14;")
            ray_click("point", 5, "right")
            ray_click("point", 3, "right")
            finished()
            assert state()["race"]["points"][3] == 1 and state()["race"]["bar"]["b"] == 1
            assert page.locator('.fleet-mount').get_attribute('data-fleet-last-animation') == 'race-hit'
            assert page.locator('.fleet-mount').get_attribute('data-fleet-checkers') == '30'
            recorded("3D race raycasts hit a lone opposing checker and send it to bar")

            fixture("g.phase='play';g.dice=[1,2];g.used=[false,false];g.race.points[23]=1;g.race.bar.w=1;")
            ray_click("bar", "w", "left")
            ray_click("point", 23, "right")
            finished()
            assert state()["race"]["bar"]["w"] == 0 and state()["race"]["points"][23] == 2
            recorded("3D bar and point callbacks re-enter a checker")

            fixture("g.phase='play';g.dice=[1,2];g.used=[false,false];g.race.points.fill(0);g.race.points[0]=1;g.race.points[18]=-15;g.race.off.w=14;")
            ray_click("point", 0, "right")
            ray_click("off", "w", "left")
            finished()
            assert state()["winner"] == "w" and state()["race"]["off"]["w"] == 15
            recorded("3D bearing off preserves all 30 checkers and ends the race")

            fixture(basic.replace("[3,1]", "[2,3]") + "g.chess.board[sq('h1')]=null;g.chess.board[sq('e1')]='wK';g.chess.board[sq('h1')]='wR';g.chess.rights.wK=true;")
            ray_click("square", 4)
            ray_click("square", 6)
            finished()
            assert state()["chess"]["board"][6] == 'wK' and state()["chess"]["board"][5] == 'wR'
            recorded("castling moves the exported king and rook together")

            fixture(basic.replace("[3,1]", "[1,2]") + "g.chess.board[sq('e5')]='wP';g.chess.board[sq('d5')]='bP';g.chess.ep={target:sq('d6'),pawn:sq('d5'),side:'b'};")
            ray_click("square", 36)
            ray_click("square", 43)
            finished()
            assert state()["chess"]["board"][35] is None and state()["chess"]["board"][43] == 'wP'
            recorded("en passant removes the pawn on its actual square")

            fixture(basic.replace("[3,1]", "[1,2]") + "g.chess.board[sq('a7')]='wP';")
            ray_click("square", 48)
            ray_click("square", 56)
            page.locator('[data-promote="N"]').click()
            finished()
            assert state()["chess"]["board"][56] == 'wN'
            assert page.locator('.fleet-mount').get_attribute('data-fleet-pieces') == '3'
            recorded("promotion dialog replaces the pawn with the Blender knight")

            fixture("g.phase='play';g.dice=[2,3];g.used=[false,false];")
            page.emulate_media(reduced_motion="no-preference")
            camera('chess')
            page.evaluate("""()=>{
              document.querySelector('#sq-e2').click();document.querySelector('#sq-e4').click();
              if(document.querySelector('#fleet-container').getAttribute('aria-busy')!=='true')throw Error('Animation not started');
              document.querySelector('#new-game').click();document.querySelector('#confirm-new').click();
            }""")
            page.emulate_media(reduced_motion="reduce")
            ready()
            assert state()['phase'] == 'opening' and state()['revision'] == 0
            assert page.locator('.fleet-mount').get_attribute('data-fleet-pieces') == '32'
            recorded("reset during animation disposes the previous scene without a stale move")

            before_toggle = state()
            page.locator('#fleet-toggle').evaluate('el=>el.click()')
            assert page.locator('[data-fleet-canvas]').count() == 0
            assert state() == before_toggle
            page.locator('#fleet-toggle').evaluate('el=>el.click()')
            ready()
            assert state() == before_toggle
            recorded("2D/3D toggle preserves the exact game state")

        else:
            fixture('')

        page.set_viewport_size({'width':390,'height':844})
        camera('chess')
        page.screenshot(path=str(ROOT / 'fleet-mobile-preview.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('[data-fleet-canvas]').count() == 1
        recorded("390px mobile layout, camera controls and reduced-motion rendering")
        before_loss=state()
        saved_before_loss=page.evaluate('key=>localStorage.getItem(key)',STORE)
        assert page.evaluate("""()=>{
            const gl=document.querySelector('[data-fleet-canvas]').getContext('webgl2');
            const extension=gl.getExtension('WEBGL_lose_context');
            if(!extension)return false;extension.loseContext();return true;
        }""")
        page.wait_for_selector('#fleet-fallback',state='visible')
        assert page.locator('[data-fleet-canvas]').count() == 0
        assert state() == before_loss
        assert page.evaluate('key=>localStorage.getItem(key)',STORE) == saved_before_loss
        assert 'fleet-mode' not in page.locator('body').get_attribute('class')
        recorded("real WebGL context loss returns to 2D with unchanged native saved state")
        assert not errors, errors
        assert not failed, failed
        print(json.dumps({'checks':len(checks),'errors':errors,'failed_requests':failed}), flush=True)
        browser.close()
finally:
    if server: server.close()
