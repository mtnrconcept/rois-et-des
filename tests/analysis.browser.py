"""Real browser checks for calculation, cancellation and procedural wood audio.
OFFLINE_BROWSER=1 resolves local modules to data URLs (including the real Worker)
and uses optional in-memory storage. It makes no network-policy changes.
"""
import base64,json,os,pathlib,re,shutil,socket,subprocess,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OFFLINE=os.environ.get('OFFLINE_BROWSER')=='1'
with socket.socket() as s:s.bind(('127.0.0.1',0));PORT=s.getsockname()[1]
BASE=f'http://127.0.0.1:{PORT}'
server=subprocess.Popen(['python','-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
errors=[]
def fixture(name='tour-capture',bot=None):
 script="import{exerciseState}from './echgammon/catalog.mjs';const game=exerciseState("+json.dumps(name)+");"+("game.turn='b';game.dice=[3,3,3,3];game.used=[false,false,false,false];" if bot else "")+"console.log(JSON.stringify({game,mode:"+json.dumps('ai' if bot else 'local')+",level:'hard',bot:"+json.dumps(bot)+",assisted:true}));"
 return subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True).strip()
def mount(page,saved=None,query=''):
 page.on('pageerror',lambda e:errors.append(str(e)))
 if not OFFLINE:
  page.goto(BASE+'/play.html'+query)
  if saved:page.evaluate("s=>localStorage.setItem('echgammon.royal.v3',s)",saved);page.reload()
 else:
  cache={}
  def url(name):
   if name not in cache:
    source=(ROOT/'echgammon'/name).read_text().replace('location.search',json.dumps(query))
    source=re.sub(r"from ['\"]\./([^'\"]+)['\"]",lambda m:'from '+json.dumps(url(m[1])),source)
    source=source.replace("new URL('./analysis-worker.mjs',import.meta.url)","new URL("+json.dumps(url('analysis-worker.mjs'))+")") if name=='engine-client.mjs' else source
    cache[name]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
   return cache[name]
  html=(ROOT/'play.html').read_text();styles=re.findall(r'<link[^>]+href="([^\"]+\.css)"[^>]*>',html)
  html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S);html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
  page.set_content(html)
  page.evaluate("saved=>{const s=new Map();if(saved)s.set('echgammon.royal.v3',saved);Object.defineProperty(window,'localStorage',{value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k)},configurable:true});}",saved)
  for css in styles:page.add_style_tag(content=(ROOT/css).read_text())
  page.evaluate('u=>import(u)',url('view.mjs'))
 page.wait_for_selector('#sq-e1')
 # Count real scheduled sources, without replacing their audio implementation.
 page.evaluate("""()=>{window.__audioStarts=0;const original=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.__audioStarts++;return original.apply(this,a);};}""")
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':1440,'height':1100});page=ctx.new_page();mount(page,fixture())
  assert page.locator('#sound-toggle').count()==1,'Sound controls are missing'
  assert page.evaluate('window.__audioStarts')==0
  page.locator('#hint').click();page.wait_for_selector('#analysis-panel:not([hidden])')
  page.wait_for_selector('[data-analysis-choice]',timeout=18000)
  assert 'meilleur coup trouvé' in page.locator('#analysis-panel').inner_text().lower()
  assert page.locator('#analysis-panel').get_attribute('data-transport')=='worker'
  assert page.locator('#analysis-reasons li').count()>0
  assert page.locator('#analysis-stats').inner_text()
  page.screenshot(path=str(ROOT/'analysis-desktop.png'),full_page=True)
  page.locator('[data-analysis-choice]').first.click()
  # A hint and selection produce no contact sound; only the accepted movement does.
  assert page.evaluate('window.__audioStarts')==0
  page.locator('#sq-a1').click();page.locator('#sq-a1').click();page.locator('#sq-a4').click()
  page.wait_for_function('window.__audioStarts>0')
  assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.chess.board[24]")=='wR'
  page.locator('#sound-toggle').click();assert page.locator('#sound-toggle').get_attribute('aria-pressed')=='false'
  assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.sound.v1')).enabled")==False
  page.locator('#sound-volume').fill('0.2');page.locator('#sound-volume').dispatch_event('input')
  assert abs(page.evaluate("JSON.parse(localStorage.getItem('echgammon.sound.v1')).volume")-.2)<.001
  # Cancel a running analysis by resetting; a stale worker cannot alter the new board.
  page.close();page=ctx.new_page();mount(page,fixture('fourchette'))
  page.evaluate("()=>{document.querySelector('#hint').click();document.querySelector('#analysis-cancel').click();}");assert page.locator('#analysis-deepen').is_enabled(),'Cannot resume after cancelling'
  page.locator('#hint').click();page.locator('#new-game').click();page.locator('#confirm-new').click();page.wait_for_timeout(1000)
  assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.phase")=='opening'
  assert page.locator('#analysis-panel').is_hidden()
  # The strongest bot uses the Worker; cancelling it plays a legal fallback, never a stale result.
  page.close();page=ctx.new_page();saved=fixture('premier-pas','astra');mount(page,saved)
  before=json.loads(saved)['game']['revision']
  page.wait_for_selector('#analysis-panel[data-transport="calculating"]',timeout=4000)
  assert page.locator('#analysis-cancel').inner_text()=='Jouer sans attendre'
  page.locator('#analysis-cancel').click()
  page.wait_for_function('(rev)=>JSON.parse(localStorage.getItem("echgammon.royal.v3")).game.revision>rev',arg=before)
  page.locator('#new-game').click();page.locator('#confirm-new').click();page.wait_for_timeout(750)
  assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.phase")=='opening'
  # Normal bot analysis also reaches the real board and leaves a historical explanation.
  page.close();page=ctx.new_page();mount(page,fixture('premier-pas','astra'))
  page.wait_for_selector('#analysis-panel[data-transport="worker"]',timeout=18000)
  assert 'Pourquoi l’ordinateur' in page.locator('#analysis-title').inner_text()
  assert page.evaluate("JSON.parse(localStorage.getItem('echgammon.royal.v3')).game.revision")>before
  page.close()
  # Mobile analysis and mute controls stay within the viewport.
  mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
  mp=mobile.new_page();mount(mp,fixture('fourchette'))
  assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth')
  mp.locator('#hint').tap();mp.wait_for_selector('[data-analysis-choice]',timeout=18000)
  assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth')
  mp.screenshot(path=str(ROOT/'analysis-mobile.png'),full_page=True)
  assert not errors,errors
  print(json.dumps({'worker':'real module worker','audio':'native AudioBufferSourceNode','storage':'memory' if OFFLINE else 'native','checks':24,'consoleErrors':errors}))
  browser.close()
finally:server.terminate();server.wait(timeout=5)
