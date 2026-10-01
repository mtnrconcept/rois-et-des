"""Lobby/academy journeys. OFFLINE_BROWSER=1 runs real assets with in-memory storage.
Only the offline test adapter substitutes URL query inputs; production has no test hooks.
"""
import base64, json, os, pathlib, re, shutil, socket, subprocess, time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OFFLINE=os.environ.get('OFFLINE_BROWSER')=='1'
with socket.socket() as s:s.bind(('127.0.0.1',0));PORT=s.getsockname()[1]
BASE=f'http://127.0.0.1:{PORT}'
server=subprocess.Popen(['python','-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def mount(page,kind='lobby',query='',storage=None):
    filename='index.html' if kind=='lobby' else 'play.html'
    if not OFFLINE:
        page.goto(BASE+'/'+filename+query)
        page.evaluate('s=>{localStorage.clear();Object.entries(s||{}).forEach(([k,v])=>localStorage.setItem(k,v));}',storage);page.reload()
        return
    cache={}
    def url(name):
        if name not in cache:
            file=ROOT/'echgammon'/name
            source=(file.read_text() if file.exists() else '').replace('location.search',json.dumps(query))
            source=re.sub(r"from ['\"]\./([^'\"]+)['\"]",lambda m:'from '+json.dumps(url(m[1])),source)
            cache[name]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
        return cache[name]
    html=(ROOT/filename).read_text()
    styles=re.findall(r'<link[^>]+href="([^\"]+\.css)"[^>]*>',html)
    html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
    page.set_content(html)
    page.evaluate('''s=>{const v=new Map(Object.entries(s||{}));Object.defineProperty(window,'localStorage',{value:{getItem:k=>v.get(k)??null,setItem:(k,a)=>v.set(k,String(a)),removeItem:k=>v.delete(k)},configurable:true});}''',storage)
    for css in styles:page.add_style_tag(content=(ROOT/css).read_text())
    page.evaluate('u=>import(u)',url('lobby.mjs' if kind=='lobby' else 'view.mjs'))
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        mount(page);page.wait_for_selector('#home-title',timeout=3000)
        assert page.locator('[data-nav]').count()==5
        assert page.locator('#home-title').inner_text()
        page.screenshot(path=str(ROOT/'lobby-desktop.png'),full_page=True)
        page.locator('[data-nav="bots"]').click();page.wait_for_selector('[data-bot="astra"]');assert page.locator('[data-bot]').count()==6
        page.locator('[data-bot="astra"]').click();assert 'Astra' in page.locator('.bot-detail h2').inner_text()
        assert 'bot=astra' in page.locator('.bot-detail [data-start]').get_attribute('href')
        page.locator('[data-nav="puzzles"]').click();page.wait_for_selector('.puzzle-card');assert page.locator('.puzzle-card').count()==18
        page.locator('#theme-filter').select_option('course');assert page.locator('.puzzle-card').count()==5
        page.locator('#puzzle-search').fill('introuvable');assert page.locator('.empty-state').is_visible()
        page.locator('[data-clear-filters]').click();assert page.locator('.puzzle-card').count()==18
        page.locator('[data-nav="learn"]').click();page.wait_for_selector('.lesson-row');assert page.locator('.lesson-row').count()==8
        page.close();page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        mount(page,'play','?puzzle=premier-pas');page.wait_for_selector('#training-title',timeout=2500)
        assert 'Le premier pas' in page.locator('#training-title').inner_text()
        page.locator('#sq-d2').click();page.locator('#sq-d4').click()
        assert 'ne réalise pas' in page.locator('#training-feedback').inner_text()
        assert page.locator('#sq-d2 .chess-piece').count()==1
        page.locator('#sq-e2').click();page.locator('#sq-e4').click()
        assert page.locator('#training-success').is_visible()
        data=page.evaluate("JSON.parse(localStorage.getItem('echgammon.academy.v1'))")
        assert data['exercises']['premier-pas']['stars']==2
        assert page.evaluate("localStorage.getItem('echgammon.royal.v3')") is None
        def open_view(kind='play',query='',storage=None,ctx=None):
            target=(ctx or context).new_page();target.on('pageerror',lambda e:errors.append(str(e)))
            mount(target,kind,query,storage);target.wait_for_selector('#home-title' if kind=='lobby' else '#sq-e2',timeout=3000)
            return target
        def stored(target):
            return target.evaluate("Object.fromEntries(['echgammon.royal.v3','echgammon.academy.v1'].map(k=>[k,localStorage.getItem(k)]).filter(x=>x[1]))")
        # Anchored lessons must have unique DOM IDs and cannot accept a move during the intro.
        page.close();page=open_view(query='?lesson=decouvrir')
        page.wait_for_selector('.coach-bubble:not([hidden])')
        ids=page.locator('[id]').evaluate_all('es=>es.map(e=>e.id)')
        assert len(ids)==len(set(ids)), 'Duplicate IDs in guidance UI'
        page.locator('#sq-e2').dispatch_event('click');page.locator('#sq-e4').dispatch_event('click')
        assert page.locator('#sq-e2 .chess-piece').count()==1
        page.locator('.coach-bubble:not([hidden]) #coach-next').click()
        page.locator('.coach-bubble:not([hidden]) #coach-prev').click()
        assert '1 / 3' in page.locator('.coach-bubble:not([hidden])').inner_text()
        page.keyboard.press('Escape');assert page.locator('.coach-bubble:visible').count()==0
        page.locator('#restart-guide').click()
        page.locator('#sq-e2').dispatch_event('click');page.locator('#sq-e4').dispatch_event('click')
        assert page.locator('#sq-e2 .chess-piece').count()==1, 'Reopened guide must disable exercise moves'
        for _ in range(3):page.locator('.coach-bubble:not([hidden]) #coach-next').click()
        page.locator('#sq-e2').click();page.locator('#sq-e4').click();assert page.locator('#training-success').is_visible()
        assert 'decouvrir' in page.evaluate("JSON.parse(localStorage.getItem('echgammon.academy.v1')).lessons")
        # All 18 catalogue problems can actually be solved through rendered controls.
        plans=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
        import{EXERCISES}from'./echgammon/catalog.mjs';import{startTraining,solutionAction,attemptTraining}from'./echgammon/training.mjs';import{actions}from'./echgammon/game.mjs';
        console.log(JSON.stringify(EXERCISES.map(e=>{let s=startTraining(e.id);const moves=[];while(!s.complete){const id=solutionAction(s);moves.push(actions(s.game).find(a=>a.id===id));s=attemptTraining(s,id).session;}return{id:e.id,moves};})));
        """],cwd=ROOT))
        for plan in plans:
            page.close();page=open_view(query='?puzzle='+plan['id'])
            for a in plan['moves']:
                if a['type']=='chess':
                    sq=lambda n:chr(97+n%8)+str(1+n//8)
                    page.locator('#sq-'+sq(a['from'])).click();page.locator('#sq-'+sq(a['to'])).click()
                    if a.get('promotion'):page.locator('[data-promote="'+a['promotion']+'"]').click()
                else:
                    page.locator('#bar-w' if a['from']=='bar' else '#point-'+str(a['from'])).click()
                    page.locator('#off-w' if a['to']=='off' else '#point-'+str(a['to'])).click()
            assert page.locator('#training-success').is_visible(),plan['id']
            assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.academy.v1')).exercises["+json.dumps(plan['id'])+"].stars")==3
        # Progressive hints and assisted solution credit, including retry.
        page.close();page=open_view(query='?puzzle=addition-tour')
        for _ in range(3):page.locator('#training-hint').click()
        assert 'dernier indice' in page.locator('#training-hint').inner_text()
        assert page.locator('.coach-bubble:visible').count()==1
        page.keyboard.press('Escape');page.locator('#sq-a6').click()
        assert page.locator('#training-success').is_visible()
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.academy.v1')).exercises['addition-tour'].stars")==1
        page.locator('#retry-exercise').click();page.locator('#training-solution').click()
        assert page.locator('#training-success').is_visible()
        # Prior best is not replaced by assisted replay.
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.academy.v1')).exercises['addition-tour'].stars")==1
        page.close();page=open_view(query='?puzzle=ordre-des')
        page.locator('#training-solution').click();assert page.locator('#training-success').count()==0
        page.locator('#training-solution').click();assert page.locator('#training-success').is_visible()
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.academy.v1')).exercises['ordre-des'].stars")==0
        # Training and malformed routes cannot overwrite a suspended normal game.
        saved=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
        import{exerciseState}from'./echgammon/catalog.mjs';console.log(JSON.stringify({game:exerciseState('premier-pas'),mode:'local',level:'medium',sessionId:'protected-game'}));
        """],cwd=ROOT));raw=json.dumps(saved,separators=(',',':'))
        page.close();page=open_view(query='?lesson=decouvrir',storage={'echgammon.royal.v3':raw})
        page.keyboard.press('Escape');page.locator('#training-solution').click()
        assert page.evaluate("localStorage.getItem('echgammon.royal.v3')")==raw
        allstore=stored(page)
        assert 'decouvrir' not in json.loads(allstore['echgammon.academy.v1'])['lessons']
        page.close();page=open_view(query='?puzzle=missing',storage=allstore)
        assert 'n’existe pas' in page.locator('#learning-panel').inner_text()
        assert page.evaluate("localStorage.getItem('echgammon.royal.v3')")==raw
        page.close();page=open_view(storage=allstore)
        assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).sessionId")=='protected-game'
        assert page.locator('#sq-e2 .chess-piece').count()==1
        # Lobby resumes a real game and asks before replacing it; reset affects progress only.
        page.close();page=open_view(kind='lobby',storage=allstore)
        assert page.locator('a[href="./play.html"]').count()>0
        page.locator('[data-nav="bots"]').click();page.wait_for_selector('.bot-detail')
        page.locator('.bot-detail [data-start]').click();assert page.locator('#confirm-dialog').is_visible()
        page.locator('#confirm-cancel').click();assert not page.locator('#confirm-dialog').is_visible()
        page.locator('[data-nav="progress"]').click();page.wait_for_selector('#reset-progress')
        page.locator('#reset-progress').click();page.locator('#confirm-accept').click()
        assert page.evaluate("localStorage.getItem('echgammon.royal.v3')")==raw
        # Real bot selection and assisted-mode explanations are connected to gameplay.
        page.close();page=open_view(query='?bot=astra&fresh=1&assist=1')
        assert page.locator('#level').input_value()=='astra'
        assert page.locator('#match-guidance').is_visible()
        assert 'ASTRA' in page.locator('#match-context').inner_text()
        page.locator('#explain-move').click();assert page.locator('.coach-bubble:visible').count()==1
        page.keyboard.press('Escape')
        page.locator('#level').select_option('leon');assert 'LÉON' in page.locator('#role-b').inner_text()
        # An explanation must close as soon as its move/position changes.
        page.close();saved['assisted']=True
        page=open_view(storage={'echgammon.royal.v3':json.dumps(saved)})
        page.locator('#explain-move').click();assert page.locator('.coach-bubble:visible').count()==1
        page.locator('#sq-e2').dispatch_event('click');page.locator('#sq-e4').dispatch_event('click')
        assert page.locator('.coach-bubble:visible').count()==0, 'Outdated explanation remains over the new position'
        # Tablet names remain accessible when visual labels collapse.
        page.close();tablet=browser.new_context(viewport={'width':820,'height':1000})
        page=open_view(kind='lobby',ctx=tablet)
        assert page.get_by_role('link',name='Académie',exact=True).count()>=1
        # Mobile lobby, bot cards and anchored learning remain reachable with touch.
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
        page.close();page=open_view(kind='lobby',ctx=mobile)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(ROOT/'lobby-mobile.png'),full_page=True)
        page.locator('[data-nav="bots"]').tap();page.wait_for_selector('[data-bot="astra"]')
        page.locator('[data-bot="astra"]').tap();assert 'Astra' in page.locator('.bot-detail h2').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.close();page=open_view(query='?lesson=barre',ctx=mobile)
        page.wait_for_selector('.coach-bubble:visible')
        for _ in range(3):
            rect=page.locator('.coach-bubble:visible').bounding_box()
            assert rect['x']>=0 and rect['x']+rect['width']<=391 and rect['y']>=0 and rect['y']+rect['height']<=845
            page.locator('.coach-bubble:visible #coach-next').tap()
        for _ in range(3):page.locator('#training-hint').tap()
        page.screenshot(path=str(ROOT/'academy-mobile.png'),full_page=True)
        page.keyboard.press('Escape');page.locator('#bar-w').tap();page.locator('#point-22').tap()
        assert page.locator('#training-success').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(json.dumps({'browser':'Chromium','offlineAssets':OFFLINE,'storageAdapter':'in-memory' if OFFLINE else 'native','catalogueSolvedThroughUI':len(plans),'botProfiles':6,'lessonFlows':2,'desktop':'1440x1000','tablet':'820x1000','touch':'390x844','consoleErrors':errors}))
        browser.close()
finally:server.terminate();server.wait(timeout=5)
