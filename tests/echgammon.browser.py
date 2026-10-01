"""Browser smoke tests; run with Python + Playwright, no app runtime dependencies."""
import base64, json, os, pathlib, re, shutil
from playwright.sync_api import sync_playwright
from browser_server import BrowserServer
ROOT = pathlib.Path(__file__).resolve().parents[1]
server=BrowserServer(ROOT)
BASE=server.base_url
OFFLINE=os.environ.get('OFFLINE_BROWSER')=='1'
module_urls={}
def module_url(name):
    if name not in module_urls:
        source=(ROOT/'echgammon'/name).read_text()
        source=re.sub(r"from ['\"]\./([^'\"]+)['\"]",lambda m:'from '+json.dumps(module_url(m[1])),source)
        module_urls[name]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
    return module_urls[name]
def mount(page, saved=None):
    if not OFFLINE:
        page.goto(BASE+'/play.html')
        if saved is not None:
            page.evaluate("v=>localStorage.setItem('echgammon.royal.v3',v)",saved);page.reload()
        return
    # No browser/network policy is changed. Render and execute the real local assets.
    html=(ROOT/'play.html').read_text()
    html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
    page.set_content(html)
    page.evaluate('''saved=>{const values=new Map();if(saved)values.set('echgammon.royal.v3',saved);Object.defineProperty(window,'localStorage',{value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},configurable:true});}''',saved)
    page.add_style_tag(content=(ROOT/'echgammon/royal.css').read_text())
    page.add_style_tag(content=(ROOT/'echgammon/academy.css').read_text())
    page.add_style_tag(content=(ROOT/'echgammon/analysis.css').read_text())
    page.evaluate('url=>import(url)',module_url('view.mjs'))

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_BIN') or shutil.which('chromium'),args=['--no-sandbox'])
        desktop=browser.new_context(viewport={'width':1440,'height':1100});page=desktop.new_page()
        errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
        mount(page);page.wait_for_selector('#chess-board button',timeout=2500)
        assert page.title()=='Échgammon — Classique Royal'
        assert page.locator('#chess-board .square').count()==64
        assert page.locator('.point').count()==24
        assert page.locator('#chess-board .chess-piece').count()==32
        page.screenshot(path=str(ROOT/'desktop-preview.png'),full_page=True)
        # Helpers create valid persisted fixtures through the real engine, not production test hooks.
        def reload_page():
            global page
            if OFFLINE:
                saved=page.evaluate("localStorage.getItem('echgammon.royal.v3')")
                context=page.context;page.close();page=context.new_page();page.on('pageerror',lambda e: errors.append(str(e)));mount(page,saved)
            else:page.reload()
        def fixture(body):
            if OFFLINE:page.evaluate('u=>globalThis.__testGameURL=u',module_url('game.mjs'))
            page.evaluate("""async body=>{const {createGame}=await import(globalThis.__testGameURL||'/echgammon/game.mjs');const g=createGame();const sq=s=>s.charCodeAt(0)-97+(+s[1]-1)*8;new Function('g','sq',body)(g,sq);localStorage.setItem('echgammon.royal.v3',JSON.stringify({game:g,mode:'local',level:'medium'}));} """,body)
            reload_page();page.wait_for_selector('#chess-board button')
        fixture("g.phase='play';g.dice=[2,3];g.used=[false,false];")
        page.locator('#sq-e2').click();page.locator('#sq-e4').click()
        state=page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game")
        assert state['chess']['board'][28]=='wP' and state['used']==[True,False]
        # Capture an occupied target by clicking the piece itself.
        fixture("g.phase='play';g.dice=[3,1];g.used=[false,false];g.chess.board.fill(null);g.chess.rights={wK:false,wQ:false,bK:false,bQ:false};g.chess.board[sq('e1')]='wK';g.chess.board[sq('h8')]='bK';g.chess.board[sq('a1')]='wR';g.chess.board[sq('a4')]='bN';")
        page.locator('#sq-a1').click();page.locator('#sq-a4').click()
        state=page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game")
        assert state['chess']['board'][24]=='wR'
        # Returning from bar is actually selectable in the interface.
        fixture("g.phase='play';g.dice=[1,2];g.used=[false,false];g.race.points[23]=1;g.race.bar.w=1;")
        page.locator('#bar-w').click();page.locator('#point-23').click()
        state=page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game")
        assert state['race']['bar']['w']==0 and state['race']['points'][23]==2
        # Promotion choice and final race exit.
        fixture("g.phase='play';g.dice=[1,2];g.used=[false,false];g.chess.board.fill(null);g.chess.rights={wK:false,wQ:false,bK:false,bQ:false};g.chess.board[sq('e1')]='wK';g.chess.board[sq('h8')]='bK';g.chess.board[sq('a7')]='wP';")
        page.locator('#sq-a7').click();page.locator('#sq-a8').click();page.locator('[data-promote="N"]').click()
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.chess.board[56]")=='wN'
        fixture("g.phase='play';g.dice=[1,2];g.used=[false,false];g.race.points.fill(0);g.race.points[0]=1;g.race.points[18]=-15;g.race.off.w=14;")
        page.locator('#point-0').click();page.locator('#off-w').click()
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.winner")=='w'
        assert 'gagne' in page.locator('#status').inner_text()
        # Fresh game cancels all prior AI timers.
        page.locator('#new-game').click();page.locator('#confirm-new').click()
        assert page.locator('#chess-board .chess-piece').count()==32
        page.locator('#rules-button').click();assert page.locator('#rules-dialog').is_visible();page.locator('#close-rules').click()
        # AI must consume its entire turn, not stop after its first action.
        fixture("g.phase='roll';g.turn='b';")
        page.evaluate("let p=JSON.parse(localStorage.getItem('echgammon.royal.v3'));p.mode='ai';localStorage.setItem('echgammon.royal.v3',JSON.stringify(p));")
        reload_page();page.wait_for_function("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.turn==='w'",timeout=15000)
        # Reset while an AI roll is pending: the old callback must never mutate the new game.
        fixture("g.phase='roll';g.turn='b';")
        page.evaluate("let p=JSON.parse(localStorage.getItem('echgammon.royal.v3'));p.mode='ai';localStorage.setItem('echgammon.royal.v3',JSON.stringify(p));")
        reload_page();page.locator('#new-game').click();page.locator('#confirm-new').click();page.wait_for_timeout(1200)
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.phase")=='opening'
        # Narrow touch screen, routes to both tracks, reduced motion.
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
        mp=mobile.new_page();mp.on('pageerror',lambda e: errors.append(str(e)));mount(mp);mp.wait_for_selector('#sq-e2')
        assert mp.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
        mp.locator('[data-focus="right"]').tap();mp.locator('[data-focus="left"]').tap();mp.locator('[data-focus="chess"]').tap()
        mp.screenshot(path=str(ROOT/'mobile-preview.png'),full_page=True)
        mp.evaluate('''async url=>{const {createGame}=await import(url);const g=createGame();g.phase='play';g.dice=[2,3];g.used=[false,false];localStorage.setItem('echgammon.royal.v3',JSON.stringify({game:g,mode:'local',level:'medium'}));}''',module_url('game.mjs') if OFFLINE else BASE+'/echgammon/game.mjs')
        if OFFLINE:
            saved=mp.evaluate("localStorage.getItem('echgammon.royal.v3')");mp.close();mp=mobile.new_page();mp.on('pageerror',lambda e: errors.append(str(e)));mount(mp,saved)
        else:mp.reload()
        mp.wait_for_selector('#sq-e2');mp.locator('#sq-e2').tap();mp.locator('#sq-e4').tap()
        assert mp.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.chess.board[28]")=='wP'
        assert not errors,errors
        print(json.dumps({'browser':'Chromium','offlineAssets':OFFLINE,'storageAdapter':'in-memory' if OFFLINE else 'native','desktop':'1440x1100','mobile':'390x844','checks':14,'consoleErrors':errors},ensure_ascii=False))
        browser.close()
finally:
    server.close()
