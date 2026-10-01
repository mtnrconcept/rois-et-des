import bpy, math, random, os, json, time, sys, argparse
from mathutils import Vector
from math import sin, cos, pi

random.seed(28)
parser=argparse.ArgumentParser()
parser.add_argument('--out-dir',required=True)
parser.add_argument('--reference')
parser.add_argument('--skip-render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(args.out_dir)
ROOT=OUT
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'LA CITADELLE DES MAREES'

def collection(name):
    c=bpy.data.collections.new(name); scene.collection.children.link(c); return c
COL={n:collection(n) for n in ['01 • Socle et ocean','02 • Damier de marbre','03 • Maison du Lion','04 • Maison de l Aigle','05 • Citadelle et remparts','06 • Navires et quais','07 • Heraldique et orfevrerie','08 • Iles et decor','09 • Lumiere et cameras']}
ACTIVE=COL['01 • Socle et ocean']
def put(obj,name,mat=None):
    obj.name=name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    ACTIVE.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    return obj
def mat(name,col,metal=0,rough=.45,noise=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
    n=m.node_tree.nodes; l=m.node_tree.links; bs=n.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*col,1); bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    if noise:
        tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=noise; tex.inputs['Detail'].default_value=3.5
        ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position=.15; ramp.color_ramp.elements[0].color=(*(v*.53 for v in col),1); ramp.color_ramp.elements[1].position=.82; ramp.color_ramp.elements[1].color=(*(min(1,v*1.2) for v in col),1)
        l.new(tex.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],bs.inputs['Base Color'])
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.18; bump.inputs['Distance'].default_value=.065; l.new(tex.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],bs.inputs['Normal'])
    return m
gold=mat('OR • laiton ancien poli',(.63,.35,.085),.8,.27,7)
goldbright=mat('OR • filets et gravure',(.89,.59,.19),.76,.24)
darkgold=mat('BRONZE • patine',(.19,.105,.033),.78,.38,5)
navy=mat('BLEU • laque marine',(.012,.038,.083),.25,.32,5)
blue=mat('AZUR • velours royal',(.015,.13,.32),.08,.52,24)
red=mat('CARMIN • velours du lion',(.38,.017,.025),.04,.56,30)
ink=mat('ANTHRACITE • gravures',(.016,.023,.028),.05,.62)
stone=[mat('CALCAIRE • nuance %02d'%i,(.48+i*.035,.40+i*.029,.285+i*.025),0,.77,8) for i in range(5)]
cream=mat('IVOIRE • parchemin',(.76,.60,.37),.05,.58,9)
sailmat=mat('LIN • voiles',(.79,.73,.57),0,.79,28)
wood=mat('CHENE • ponts et coques',(.17,.066,.022),0,.55,5)
woodlight=mat('CHENE • planches dorees',(.31,.155,.051),0,.65,6)
rope=mat('CORDAGE • chanvre',(.44,.28,.105),0,.8,30)
roof=mat('ARDOISE • toitures',(.018,.069,.13),.23,.36,16)

def marble(name,col):
    m=mat(name,col,.10,.31)
    n=m.node_tree.nodes; l=m.node_tree.links; bs=n.get('Principled BSDF')
    tc=n.new('ShaderNodeTexCoord'); noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=1.15; noise.inputs['Detail'].default_value=2; noise.inputs['Roughness'].default_value=.6
    l.new(tc.outputs['Generated'],noise.inputs['Vector'])
    vor=n.new('ShaderNodeTexVoronoi'); vor.feature='DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value=2.6; l.new(noise.outputs['Color'],vor.inputs['Vector'])
    r=n.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position=.018; r.color_ramp.elements[0].color=(*(v*.3 for v in col),1); r.color_ramp.elements[1].position=.1; r.color_ramp.elements[1].color=(*col,1)
    l.new(vor.outputs['Distance'],r.inputs[0]); l.new(r.outputs[0],bs.inputs['Base Color'])
    b=n.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.11; b.inputs['Distance'].default_value=.023; l.new(vor.outputs[0],b.inputs['Height']); l.new(b.outputs[0],bs.inputs['Normal'])
    return m
white=marble('MARBRE • travertin dore',(.73,.58,.36)); black=marble('MARBRE • noir veine',(.027,.033,.030))

def bevel(o,w=.04,segments=2):
    mod=o.modifiers.new('Aretes patinees','BEVEL'); mod.width=w; mod.segments=segments
    mod=o.modifiers.new('Normales ponderees','WEIGHTED_NORMAL')
    return o
def cube(name,loc,scale,ma,b=.0):
    x,y,z=[v/2 for v in scale]
    o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],ma);o.location=loc
    if b: bevel(o,b)
    return o
def cyl(name,loc,r,depth,ma,vertices=32,b=0):
    vs=[(r*cos(2*pi*i/vertices),r*sin(2*pi*i/vertices),z) for z in [-depth/2,depth/2] for i in range(vertices)]
    fs=[tuple(reversed(range(vertices))),tuple(range(vertices,vertices*2))]+[(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
    o=mesh(name,vs,fs,ma);o.location=loc
    if b: bevel(o,b)
    return o
def sphere(name,loc,scale,ma):
    nu=16;nv=10;vs=[(sin(pi*j/nv)*cos(2*pi*i/nu),sin(pi*j/nv)*sin(2*pi*i/nu),cos(pi*j/nv)) for j in range(nv+1) for i in range(nu)]
    fs=[(j*nu+i,(j+1)*nu+i,(j+1)*nu+(i+1)%nu,j*nu+(i+1)%nu) for j in range(nv) for i in range(nu)]
    o=mesh(name,vs,fs,ma);o.location=loc;o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return o
def cone(name,loc,r1,r2,depth,ma,vertices=40):
    vs=[(r*cos(2*pi*i/vertices),r*sin(2*pi*i/vertices),z) for z,r in [(-depth/2,r1),(depth/2,max(.0001,r2))] for i in range(vertices)]
    fs=[tuple(reversed(range(vertices))),tuple(range(vertices,vertices*2))]+[(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
    o=mesh(name,vs,fs,ma);o.location=loc;return o
def mesh(name,verts,faces,ma):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update(); o=bpy.data.objects.new(name,me); ACTIVE.objects.link(o)
    if ma: me.materials.append(ma)
    return o
def curve(name,pts,r,ma,cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=2; cu.bevel_depth=r; cu.bevel_resolution=2
    p=cu.splines.new('POLY');p.points.add(len(pts)-1)
    for v,co in zip(p.points,pts):v.co=(*co,1)
    p.use_cyclic_u=cyclic; o=bpy.data.objects.new(name,cu); ACTIVE.objects.link(o); cu.materials.append(ma); return o
def beam(name,a,b,r,ma):
    a,b=Vector(a),Vector(b); o=cyl(name,(a+b)/2,r,(b-a).length,ma,12); o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def ring(name,center,r,t,ma,plane='XY'):
    x,y,z=center; pts=[]
    for k in range(65):
        a=2*pi*k/64
        pts.append((x+r*cos(a),y+r*sin(a),z) if plane=='XY' else (x+r*cos(a),y,z+r*sin(a)))
    return curve(name,pts,t,ma,True)
def frame(name,x,y,z,w,h,ma,t=.07):
    return curve(name,[(x-w/2,y-h/2,z),(x+w/2,y-h/2,z),(x+w/2,y+h/2,z),(x-w/2,y+h/2,z)],t,ma,True)
def text(name,body,loc,size,ma,rot=(0,0,0),align='CENTER'):
    cu=bpy.data.curves.new(name,'FONT'); cu.body=body; cu.align_x=align; cu.size=size;cu.extrude=.006;cu.bevel_depth=.002
    o=bpy.data.objects.new(name,cu); ACTIVE.objects.link(o);o.location=loc;o.rotation_euler=rot;cu.materials.append(ma);return o

def anchor(cx,cy,cz,s=1,vertical=False):
    def p(x,y,z=.0):return (cx+x*s,cy-z*s,cz+y*s) if vertical else (cx+x*s,cy+y*s,cz+z*s)
    curve('Ancre • verge',[p(0,.62),p(0,-.52)],.046*s,goldbright)
    curve('Ancre • jas',[p(-.36,.31),p(.36,.31)],.044*s,goldbright)
    curve('Ancre • bras',[p(-.57,-.16),p(-.48,-.43),p(-.24,-.63),p(0,-.73),p(.24,-.63),p(.48,-.43),p(.57,-.16)],.049*s,goldbright)
    for d in [-1,1]:mesh('Ancre • patte',[p(d*.57,-.16),p(d*.31,-.30),p(d*.59,-.47)],[(0,1,2)],goldbright)
    pts=[p(.13*cos(a),.78+.13*sin(a)) for a in [i*2*pi/32 for i in range(32)]];curve('Ancre • organeau',pts,.028*s,goldbright,True)

def compass(x,y,z,r):
    cyl('Rose • medaillon', (x,y,z-.025),r,.07,navy,64)
    for rad,t in [(r,.035),(r*.88,.018),(r*.64,.015)]:ring('Rose • anneau grave',(x,y,z+.03),rad,t,goldbright)
    for i in range(32):
        a=i*pi/16; aa=r*(.78 if i%4==0 else .84);beam('Rose • graduation',(x+aa*sin(a),y+aa*cos(a),z+.045),(x+.94*r*sin(a),y+.94*r*cos(a),z+.045),.013,gold)
    for i in range(8):
        a=i*pi/4; rr=r*(1.17 if i%2==0 else .74); wid=r*.115
        end=(x+rr*sin(a),y+rr*cos(a),z+.11); left=(x+wid*cos(a),y-wid*sin(a),z+.075);right=(x-wid*cos(a),y+wid*sin(a),z+.075); mid=(x,y,z+.18)
        mesh('Rose • aiguille claire',[mid,left,end],[(0,1,2)],goldbright);mesh('Rose • aiguille bronze',[mid,end,right],[(0,1,2)],darkgold)
    sphere('Rose • cabochon',(x,y,z+.19),(.08,.08,.06),goldbright)

def eagle(x,y,z,s=.5,vertical=False):
    def p(a,b,d=0):return (x+a*s,y-d*s,z+b*s) if vertical else (x+a*s,y+b*s,z+d*s)
    # A relief of two fanned wings, a central body, crown, and tail.
    for d in [-1,1]:
        for k in range(7):
            a=.16+k*.1; h=.45-k*.095
            mesh('Aigle • plume', [p(d*.05,-.12),p(d*(a+.13),h-.16),p(d*(a+.29),h+.20),p(d*a,h+.05)],[(0,1,2,3)],goldbright)
    curve('Aigle • corps',[p(0,-.42),p(0,.28),p(.13,.35)],.064*s,goldbright)
    for d in [-1,0,1]:curve('Aigle • queue',[p(0,-.22),p(d*.22,-.62)],.028*s,gold)
    sphere('Aigle • tete',p(.045,.3),(.09*s,.055*s,.1*s) if vertical else (.09*s,.1*s,.055*s),goldbright)

def lion_icon(x,y,z,s=.5):
    sphere('Lion • corps relief',(x,y,z),(.27*s,.12*s,.038*s),goldbright)
    sphere('Lion • criniere relief',(x+.27*s,y+.12*s,z),(.14*s,.16*s,.044*s),gold)
    for pts in [[(-.23,0),(-.38,-.25),(-.5,-.26)],[(.15,0),(.3,-.2),(.4,-.19)],[(.22,.14),(.18,.38),(.34,.43)],[(-.2,.04),(-.46,.26),(-.47,.5),(-.33,.5)]]:
        curve('Lion • silhouette',[(x+a*s,y+b*s,z+.02) for a,b in pts],.035*s,goldbright)

# Broad beveled foundation with engraved, layered molding.
cube('Socle • plateau amiral',(0,0,.27),(31.4,15.5,.62),navy,.3)
for z,w,d in [(.1,31.7,15.8),(.55,31.65,15.75),(.72,31.35,15.45)]:
    frame('Socle • moulure doree',0,0,z,w,d,gold,.105)
cube('Socle • quai avant',(0,-8.05,.30),(14.8,1.6,.58),navy,.15)
frame('Socle • liseret avant',0,-8.05,.62,14.7,1.55,gold,.085)

# Water geometry is real, with waves plus micro normal detail.
water=mat('MER • eau turquoise profonde',(.011,.115,.17),.32,.21)
bs=water.node_tree.nodes.get('Principled BSDF');bs.inputs['IOR'].default_value=1.333;bs.inputs['Transmission Weight'].default_value=.14
n=water.node_tree.nodes;l=water.node_tree.links;tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=4.5;tex.inputs['Detail'].default_value=4;tex.inputs['Roughness'].default_value=.75
b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.19;b.inputs['Distance'].default_value=.075;l.new(tex.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],bs.inputs['Normal'])
verts=[];faces=[]; nx=190;ny=160
for j in range(ny+1):
    yy=-22+j*55/ny
    for i in range(nx+1):
        xx=-35+i*70/nx;zz=-.12+.095*sin(xx*2.4+yy*1.8)+.055*cos(yy*3.5-xx*.9)+.027*sin(xx*6+yy*7);verts.append((xx,yy,zz))
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
o=mesh('Ocean • surface ondulee',verts,faces,water)
for p in o.data.polygons:p.use_smooth=True

# Shallow interior canals separate the fortress from the lateral game tables.
def canal(name,x,y,w,h):
    vs=[];fs=[];nx=14;ny=90
    for j in range(ny+1):
        for i in range(nx+1):
            xx=x+(i/nx-.5)*w;yy=y+(j/ny-.5)*h
            vs.append((xx,yy,.81+.027*sin(xx*9+yy*7)+.015*cos(yy*13)))
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
    ob=mesh(name,vs,fs,water)
    for f in ob.data.polygons:f.use_smooth=True
for xx in [-6.02,6.02]:canal('Douve • canal lateral',xx,0,1.32,12.38)
canal('Douve • bassin des pontons',0,-6.28,11.95,1.75)
canal('Douve • canal arriere',0,7.08,12.6,1.04)

# Inlaid central playing field: 64 independent beveled marble tiles.
ACTIVE=COL['02 • Damier de marbre']
cube('Damier • fondation',(0,0,1.03),(9.5,9.5,.78),stone[1],.12)
for i in range(8):
    for j in range(8):cube('Case %s%d'%('ABCDEFGH'[i],j+1),((i-3.5)*1.10,(j-3.5)*1.10,1.46),(1.088,1.088,.16),white if (i+j)%2==0 else black,.018)
for r,z in [(9.04,1.54),(9.31,1.43)]:frame('Damier • filet',0,0,z,r,r,gold,.045)
compass(0,0,1.565,.95)
for i in range(8):
    text('Coordonnee fichier','ABCDEFGH'[i],((i-3.5)*1.1,-4.60,1.54),.13,goldbright)
    text('Coordonnee rang',str(i+1),(-4.60,(i-3.5)*1.1,1.54),.13,goldbright)

# Two complete lateral tables and eight heraldic counters per house.
for side in [-1,1]:
    ACTIVE=COL['03 • Maison du Lion' if side==-1 else '04 • Maison de l Aigle']; cx=side*10.40
    cube('Table • coffret laque',(cx,0,1.0),(7.45,12.6,.65),navy,.18)
    cube('Table • ivoire incruste',(cx,0,1.35),(6.72,11.8,.10),cream,.10)
    for w,h,z,t in [(7.4,12.55,1.38,.095),(7.04,12.17,1.44,.047),(6.76,11.9,1.43,.025)]:frame('Table • double cadre or',cx,0,z,w,h,gold,t)
    house=red if side==-1 else blue
    for end in [-1,1]:
        for i in range(6):
            xx=cx+(i-2.5)*1.035; y0=end*5.78;yt=end*.98
            ma=house if i%2==0 else navy
            mesh('Fleche de jeu %d %d'%(end,i),[(xx-.48,y0,1.416),(xx+.48,y0,1.416),(xx,yt,1.416)],[(0,1,2)],ma)
            curve('Fleche • couture',[(xx-.48,y0,1.428),(xx,yt,1.428),(xx+.48,y0,1.428)],.014,gold)
    compass(cx,0,1.47,1.01)
    anchor(cx,-3.9,1.447,.62)
    for yy in [-1.28,1.28]:
        pts=[(cx-3.26+k*6.52/60,yy+.11*sin(k*.43),1.46) for k in range(61)];curve('Table • corde ornementale',pts,.033,darkgold)
    for dx in [-2.4,2.4]:
        compass(cx+dx,0,1.46,.22)
    coinx=side*14.6
    cube('Reserve • rail',(coinx,.6,1.02),(1.08,10.9,.38),navy,.12)
    frame('Reserve • filet',coinx,.6,1.25,1.02,10.85,gold,.035)
    for k in range(8):
        yy=4.86-k*1.23
        cyl('Jeton %02d • tranche'%(k+1),(coinx,yy,1.32),.48,.20,gold,48,b=.02)
        cyl('Jeton %02d • email'%(k+1),(coinx,yy,1.435),.417,.045,house,48,b=.015)
        ring('Jeton • perle',(coinx,yy,1.466),.396,.014,goldbright)
        if side==-1:lion_icon(coinx,yy,1.48,.67)
        else:eagle(coinx,yy,1.48,.46)
    for yy in [-6.05,6.05]:
        compass(side*14.45,yy,1.37,.49)
        for xx in [cx-3.3,cx+3.3]: sphere('Cadre • rivet',(xx,yy,1.51),(.075,.075,.045),goldbright)
    for xx in [cx-3.58,cx+3.58]:
        for k in range(31):sphere('Cadre • clou perle',(xx,-5.7+k*.38,1.48),(.033,.033,.022),goldbright)
    for yy in [-6.18,6.18]:
        for k in range(19):sphere('Cadre • clou perle',(cx-3.25+k*.36,yy,1.48),(.033,.033,.022),goldbright)

ACTIVE=COL['05 • Citadelle et remparts']
def arch_panel(name,x,y,z,w,h,ma):
    r=w/2; spring=h-r; pts=[(x-r,y,z),(x+r,y,z),(x+r,y,z+spring)]
    pts += [(x+r*cos(a),y,z+spring+r*sin(a)) for a in [k*pi/20 for k in range(21)]]
    return mesh(name,pts,[tuple(range(len(pts)))],ma)
def arched_gate(x,y,z,w,h):
    arch_panel('Porte • retrait sombre',x,y,z,w+.25,h+.13,ink)
    arch_panel('Porte • chene cloute',x,y-.021,z,w,h,wood)
    r=w/2;sp=h-r
    for k in range(11):
        xx=(k-5)*w/11;top=sp+math.sqrt(max(0,r*r-xx*xx));beam('Porte • joint des planches',(x+xx,y-.045,z+.06),(x+xx,y-.045,z+top-.035),.014,darkgold)
    for zz in [.28,h*.49]:
        cube('Porte • penture',(x,y-.065,z+zz),(w,.065,.08),darkgold,.01)
        for xx in [-.36,.0,.36]:sphere('Porte • clou',(x+xx*w,y-.106,z+zz),(.03,.018,.03),gold)
    for i in range(13):
        a=i*pi/12; ob=cube('Voussoir de porte',(x+(r+.15)*cos(a),y+.02,z+sp+(r+.15)*sin(a)),(.27,.27,.32),random.choice(stone),.018);ob.rotation_euler[1]=pi/2-a
    for d in [-1,1]:
        for k in range(int(sp/.31)):cube('Piedroit',(x+d*(r+.14),y+.015,z+.16+k*.32),(.24,.27,.3),random.choice(stone),.02)
    for dx in [-.10,.10]:ring('Porte • heurtoir',(x+dx,y-.11,z+h*.39),.075,.015,gold,'XZ')

def wall(name,x,y,z,w,h,depth=.6,crenels=True):
    cube(name,(x,y,z+h/2),(w,depth,h),stone[2],.06)
    rows=max(1,int(h/.38));cols=max(1,int(w/.64))
    for j in range(rows):
        for i in range(cols):
            xx=x-w/2+(i+.5)*w/cols
            cube(name+' • parement',(xx,y-depth/2-.025,z+(j+.5)*h/rows),(w/cols-.025,.12,h/rows-.025),random.choice(stone),.018)
    cube(name+' • corniche',(x,y,z+h+.04),(w+.12,depth+.15,.13),stone[3],.025)
    if crenels:
        for i in range(int(w/.65)+1):cube(name+' • merlon',(x-w/2+i*w/max(1,int(w/.65)),y,z+h+.26),(.34,depth+.08,.4),stone[2],.026)

def tower(x,y,h,r=1.0,rooftop=True):
    cyl('Tour • soubassement',(x,y,.55),r*1.22,.66,stone[1],40,b=.045)
    cyl('Tour • corps',(x,y,h/2+.48),r,h-.15,stone[2],40)
    rows=int(h/.40); n=18
    for j in range(rows):
        z=.48+(j+.5)*(h-.12)/rows
        for k in range(n):
            a=(k+(j%2)*.5)*2*pi/n; da=pi/n*.94; ri=r-.025;ro=r+.035;zz=(h-.12)/rows*.47
            ve=[]
            for dz in [-zz,zz]:
                for rr,aa in [(ri,a-da),(ro,a-da),(ro,a+da),(ri,a+da)]:ve.append((x+rr*cos(aa),y+rr*sin(aa),z+dz))
            mesh('Tour • pierre de taille',ve,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3)],random.choice(stone))
    for zz,rad,dep in [(.67,r*1.12,.17),(h+.12,r*1.10,.19),(h+.47,r*1.18,.20)]:cyl('Tour • cordon',(x,y,zz),rad,dep,stone[3],40,b=.028)
    for a in [0,pi/2,pi,3*pi/2]:
        # Front windows remain visible in the chosen camera view.
        if a==3*pi/2:arch_panel('Tour • archere',x,y-r-.045,h*.58,.22,.68,ink)
    for k in range(12):
        a=k*2*pi/12;o=cube('Tour • crenelage',(x+r*1.04*cos(a),y+r*1.04*sin(a),h+.70),(.31,.31,.40),stone[2],.025);o.rotation_euler[2]=a
    if rooftop:
        base=h+.63;rh=1.9*r
        for j in range(6):cone('Toit • rangee d ardoises',(x,y,base+(j+.5)*rh/6),r*1.03*(1-j/6),r*1.03*(1-(j+1)/6)+.015,rh/6+.025,roof,48)
        for k in range(12):
            a=k*2*pi/12;curve('Toit • nervure',[(x+1.04*r*cos(a),y+1.04*r*sin(a),base),(x+.035*cos(a),y+.035*sin(a),base+rh)],.014,gold)
        ring('Toit • gouttiere',(x,y,base),r*1.05,.035,gold)
        beam('Tour • fleche',(x,y,base+rh-.08),(x,y,base+rh+.48),.026,gold)
        sphere('Tour • epi',(x,y,base+rh+.16),(.082,.082,.11),goldbright)
    return h

for x in [-5.25,5.25]:
    tower(x,-5.3,3.35,.89)
    tower(x,5.15,4.75,.96)
    # Side galleries deliberately stay low enough to preserve board visibility.
    cube('Galerie • mur',(x,0,1.04),(.45,9.0,1.8),stone[1],.035)
    for yy in [i*.62-4.34 for i in range(15)]:
        cube('Galerie • pile',(x,yy,2.10),(.54,.31,.39),stone[3],.025)
        sphere('Galerie • clou',(x,yy,2.33),(.055,.055,.075),gold)
    for xx in [x-.24,x+.24]:beam('Galerie • main courante',(xx,-4.7,2.07),(xx,4.6,2.07),.06,stone[3])

wall('Courtine avant',0,-5.15,.62,8.4,1.65,.66,True)
arched_gate(0,-5.51,.62,1.8,1.48)
for x in [-3.25,-2.6,2.6,3.25]:arch_panel('Courtine • meurtriere',x,-5.5,1.0,.20,.61,ink)
wall('Chateau • aile gauche',-2.9,5.6,1.1,3.0,3.0,1.4)
wall('Chateau • aile droite',2.9,5.6,1.1,3.0,3.0,1.4)
wall('Donjon • tour maitresse',0,6.0,1.0,3.7,5.25,1.85)
arched_gate(0,4.997,1.52,1.26,2.2)
for x in [-3.35,-2.1,2.1,3.35]:arched_gate(x,4.83,1.62,.48,1.0)
for k in range(6):cube('Escalier du trone',(0,4.34+k*.12,1.53+k*.09),(2.55,.34,.13),stone[3],.016)
for x in [-1.75,1.75]:
    for z in [2.0,3.2,4.4,5.6]:cube('Donjon • chainage',(x,5.04,z),(.34,.3,.38),stone[3],.027)
    tower(x,6.46,6.22,.26,False)

ACTIVE=COL['07 • Heraldique et orfevrerie']
def banner(x,y,z,w,h,ma,emblem='anchor'):
    vs=[];fs=[];nx=12;ny=18
    for j in range(ny+1):
        for i in range(nx+1):
            u=i/nx;v=j/ny; zz=z-v*h + (.19*h*abs(2*u-1) if j==ny else 0)
            vs.append((x+(u-.5)*w,y+.065*sin(u*pi*3+v*2)*v,zz))
    for j in range(ny):
        for i in range(nx):a=j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
    o=mesh('Banniere • etoffe',vs,fs,ma); sol=o.modifiers.new('Epaisseur textile','SOLIDIFY');sol.thickness=.018
    for p in o.data.polygons:p.use_smooth=True
    for u in [.035,.965]:curve('Banniere • galon',[(x+(u-.5)*w,y+.065*sin(u*pi*3+v*2)*v-.012,z-v*h) for v in [j/18 for j in range(19)]],.016,gold)
    curve('Banniere • pointe',[(x-w*.465,y,z-h*.81),(x,y-.015,z-h),(x+w*.465,y,z-h*.81)],.021,gold)
    beam('Banniere • traverse',(x-w*.63,y,z+.035),(x+w*.63,y,z+.035),.031,gold)
    if emblem=='anchor':anchor(x,y-.12,z-h*.48,min(w*.55,h*.31),True)
    else:eagle(x,y-.12,z-h*.46,min(w*.60,h*.40),True)

for x in [-5.25,5.25]:
    banner(x,-6.215,3.12,.69,1.95,red if x<0 else blue,'anchor' if x<0 else 'eagle')
    banner(x,4.165,4.30,.72,1.85,red if x<0 else blue,'anchor' if x<0 else 'eagle')
for x in [-2.1,2.1]:banner(x,-5.57,2.48,.66,1.61,blue)
banner(0,4.98,5.87,1.46,2.00,navy)
for x in [-3.6,3.6]:
    beam('Pavillon • hampe',(x,6.15,4.35),(x,6.15,8.0),.045,gold)
    sphere('Pavillon • pomme',(x,6.15,8.04),(.1,.1,.14),goldbright)
    banner(x+.41,6.11,7.86,.86,1.79,red if x<0 else blue,'anchor' if x<0 else 'eagle')

def lion_statue(x,y,z,s=.6):
    cube('Lion gardien • piedestal',(x,y,z-.1),(.86*s,1.25*s,.25*s),stone[3],.04)
    sphere('Lion gardien • corps',(x,y,z+.55*s),(.29*s,.50*s,.30*s),gold)
    for d in [-1,1]:
        for yy in [-.31,.31]:
            beam('Lion gardien • patte',(x+d*.22*s,y+yy*s,z+.47*s),(x+d*.25*s,y+(yy-.03)*s,z+.10*s),.087*s,gold)
            sphere('Lion gardien • griffe',(x+d*.25*s,y+(yy-.09)*s,z+.08*s),(.13*s,.16*s,.08*s),goldbright)
    sphere('Lion gardien • criniere',(x,y-.40*s,z+.88*s),(.35*s,.22*s,.39*s),gold)
    for k in range(12):
        a=k*2*pi/12;sphere('Lion gardien • meche',(x+.29*s*cos(a),y-.42*s,z+.9*s+.34*s*sin(a)),(.092*s,.13*s,.11*s),darkgold if k%3==0 else goldbright)
    sphere('Lion gardien • visage',(x,y-.59*s,z+.89*s),(.19*s,.13*s,.22*s),goldbright)
    sphere('Lion gardien • museau',(x,y-.72*s,z+.82*s),(.13*s,.11*s,.085*s),gold)
    for d in [-1,1]:sphere('Lion gardien • oeil',(x+d*.088*s,y-.707*s,z+.96*s),(.024*s,.018*s,.024*s),ink)
    curve('Lion gardien • queue',[(x,y+.4*s,z+.56*s),(x+.33*s,y+.63*s,z+.64*s),(x+.43*s,y+.5*s,z+1.0*s),(x+.27*s,y+.42*s,z+1.13*s)],.047*s,gold)
for x in [-2.8,2.8]:lion_statue(x,5.53,4.48,1.1)

# Braziers, flags and filigree on the outer frame.
fire=mat('FEU • ambre',(.95,.25,.013),.05,.3);bs=fire.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.21,.014,1);bs.inputs['Emission Strength'].default_value=4
def brazier(x,y,z):
    cyl('Brasero • pied',(x,y,z),.23,.12,gold,24,b=.025);cyl('Brasero • colonne',(x,y,z+.22),.1,.4,darkgold,20)
    cone('Brasero • coupe',(x,y,z+.43),.14,.25,.23,gold,20)
    for i in range(6):
        a=i*pi/3;beam('Brasero • griffe',(x+.2*cos(a),y+.2*sin(a),z+.4),(x+.28*cos(a),y+.28*sin(a),z+.72),.025,gold)
        cone('Brasero • flamme',(x+.10*cos(a),y+.10*sin(a),z+.68),.095,0,.4+random.random()*.13,fire,9)
    ld=bpy.data.lights.new('Feu chaud','POINT');ld.energy=20;ld.color=(1,.33,.08);ld.shadow_soft_size=.4;o=bpy.data.objects.new('Feu chaud',ld);ACTIVE.objects.link(o);o.location=(x,y,z+.82)
for x in [-4.1,4.1]:
    for y in [-4.35,4.38]:brazier(x,y,2.0 if y<0 else 2.4)
for x in [-15.15,15.15]:
    beam('Etendard • hampe',(x,5.65,1.0),(x,5.65,7.3),.073,gold)
    sphere('Etendard • fleuron',(x,5.65,7.38),(.14,.14,.23),goldbright)
    banner(x,5.53,7.05,1.42,2.66,red if x<0 else blue,'anchor' if x<0 else 'eagle')

# Foreground central signature cartouche.
cube('Cartouche • plaque',(0,-7.83,.77),(8.55,1.67,.16),navy,.12)
frame('Cartouche • cadre',0,-7.83,.89,8.43,1.56,gold,.046)
text('Titre • nom du plateau','CITADELLE DES MAREES',(0,-7.98,.877),.31,goldbright)
text('Titre • sous-titre','L I O N   &   A I G L E',(0,-8.30,.877),.135,gold)
compass(0,-6.93,.94,.50)
lion_icon(-3.58,-7.77,.9,.8);eagle(3.56,-7.74,.9,.56)
for side in [-1,1]:
    anchor(side*9.35,-7.0,.79,.72)
    for x in [side*6.75,side*12.3]:
        cyl('Borne • pied',(x,-7.08,.95),.18,.48,darkgold,20)
        sphere('Borne • chapeau',(x,-7.08,1.21),(.22,.22,.10),gold)
    curve('Amarre • drape',[(side*6.75,-7.08,1.2),(side*8.1,-7.17,.96),(side*9.8,-7.18,.90),(side*11.3,-7.17,1.03),(side*12.3,-7.08,1.2)],.059,rope)
    # Interlocked heavy mooring chain, with each link alternating its plane.
    for k in range(13):
        xx=side*(6.75+.024*k);yy=-7.09-k*.112;zz=1.12-.07*k
        if k%2:pts=[(xx+.085*cos(a),yy+.12*sin(a),zz) for a in [i*2*pi/24 for i in range(24)]]
        else:pts=[(xx,yy+.12*sin(a),zz+.085*cos(a)) for a in [i*2*pi/24 for i in range(24)]]
        curve('Chaine • maillon',pts,.025,darkgold,True)
    for yy in [-4.9,-2.5,0,2.5,4.9]:
        xx=side*15.25
        for d in [-1,1]:
            curve('Volute • cadre amiral',[(xx+d*(.17+.07*t)*sin(t*pi*2),yy+t*.84,.90) for t in [i/40 for i in range(41)]],.032,gold)

ACTIVE=COL['06 • Navires et quais']
def dock(x,y,w=1.5,d=1.8):
    for i in range(9):cube('Ponton • planche',(x-w/2+(i+.5)*w/9,y,1.01),(w/9-.018,d,.16),woodlight,.012)
    for dx in [-w/2,w/2]:
        for dy in [-d/2,d/2]:
            cyl('Ponton • pilotis',(x+dx,y+dy,.55),.095,1.4,wood,12)
            cyl('Ponton • cabestan',(x+dx,y+dy,1.24),.13,.15,rope,16)
for x in [-2.2,2.2]:dock(x,-6.49,1.48,1.69)

def barrel(x,y,z,s=.45):
    cone('Tonneau • douelles bas',(x,y,z+s*.28),s*.58,s*.68,s*.56,woodlight,16)
    cone('Tonneau • douelles haut',(x,y,z+s*.82),s*.68,s*.57,s*.53,woodlight,16)
    cyl('Tonneau • couvercle',(x,y,z+s*1.10),s*.57,.045,wood,24)
    for zz,rr in [(.13,.61),(.39,.66),(.75,.66),(1.03,.59)]:ring('Tonneau • cerclage',(x,y,z+s*zz),s*rr,.028,darkgold)
    for i in range(12):
        a=i*pi/6;curve('Tonneau • joint',[(x+s*.59*cos(a),y+s*.59*sin(a),z+.03),(x+s*.69*cos(a),y+s*.69*sin(a),z+s*.54),(x+s*.57*cos(a),y+s*.57*sin(a),z+s*1.10)],.009,ink)

def crate(x,y,z,s=.5):
    cube('Caisse • chene',(x,y,z+s/2),(s,s,s),wood,.03)
    for dx in [-.41,.41]:cube('Caisse • renfort',(x+dx*s,y-s*.515,z+s/2),(.10*s,.07,s*.96),woodlight,.008)
    for zz in [.10,.88]:cube('Caisse • traverse',(x,y-s*.54,z+s*zz),(s,.06,.10*s),gold,.008)

def ship(x,y,z,s,house,angle=0):
    before=set(ACTIVE.objects)
    # The model is built in local coordinates and transformed as a group afterwards.
    N=20;vs=[]
    for level,zz in enumerate([.05,.23,.57]):
        for i in range(N):
            a=2*pi*i/N; xx=sin(a)*(.28 if level==0 else .47 if level==1 else .50);yy=cos(a)*(1.13 if level==0 else 1.44 if level==1 else 1.6);vs.append((xx,yy,zz+abs(cos(a))**6*.18))
    fs=[]
    for j in range(2):
        for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    fs.append(tuple(range(2*N,3*N)));mesh('Navire • coque',vs,fs,wood)
    for zz,rr in [(.34,.47),(.58,.51),(.71,.50)]:curve('Navire • lisse doree',[(sin(a)*rr,cos(a)*1.59,zz+abs(cos(a))**6*.18) for a in [i*2*pi/60 for i in range(60)]],.032,gold,True)
    for yy in [-.92,-.56,-.20,.16,.52,.88]:cube('Navire • pont',(0,yy,.60),(.84,.30,.046),woodlight,.008)
    for yy,height in [(-.60,2.35),(.45,2.9)]:
        beam('Navire • mat',(0,yy,.61),(0,yy,height),.043,woodlight)
        for xx in [-.44,.44]:curve('Navire • hauban',[(xx,yy-.46,.75),(0,yy,height-.06),(xx,yy+.48,.75)],.011,rope)
        for bot,top,width in [(1.05,height-.18,1.2)]:
            beam('Navire • vergue',(-width/2,yy,top),(width/2,yy,top),.026,woodlight)
            vv=[];ff=[]; nu=12;nv=14
            for j in range(nv+1):
                v=j/nv
                for i in range(nu+1):
                    u=i/nu;vv.append(((u-.5)*width*(.85+.15*v),yy-.29*sin(pi*u)*sin(pi*v),top-v*(top-bot)+.15*(u-.5)**2))
            for j in range(nv):
                for i in range(nu):a=j*(nu+1)+i;ff.append((a,a+1,a+nu+2,a+nu+1))
            sail=mesh('Navire • voile bombee',vv,ff,sailmat);sail.data.materials.append(house)
            for p in sail.data.polygons:p.material_index=1 if p.index%nu in [2,3,8,9] else 0;p.use_smooth=True
            sol=sail.modifiers.new('Toile','SOLIDIFY');sol.thickness=.008
        mesh('Navire • flamme',[(0,yy,height),(.59,yy,height-.10),(0,yy,height-.28)],[(0,1,2)],house)
    beam('Navire • beaupre',(0,1.1,.75),(0,2.04,1.18),.034,woodlight)
    mesh('Navire • foc',[(0,1.96,1.14),(0,.48,2.64),(0,1.22,1.00)],[(0,1,2)],sailmat)
    for yy in [-1.17,-.7,-.2,.3,.8,1.19]:
        for xx in [-.48,.48]:beam('Navire • chandelier',(xx,yy,.65),(xx,yy,.91),.018,gold)
    for yy in [-.7,-.2,.3,.8]:
        for xx in [-.48,.48]:cyl('Navire • sabord',(xx,yy,.42),.064,.05,ink,12).rotation_euler[1]=pi/2
    root=bpy.data.objects.new('NAVIRE • ensemble editable',None);ACTIVE.objects.link(root)
    for o in set(ACTIVE.objects)-before-{root}:o.parent=root
    root.location=(x,y,z);root.scale=(s,s,s);root.rotation_euler[2]=angle

for side in [-1,1]:
    ship(side*12.7,-6.01,1.12,.9,red if side<0 else blue,side*.22)
    ship(side*6.24,2.40,.77,.63,red if side<0 else blue,-side*.08)
    for k in range(3):barrel(side*(7.2+k*.51),-5.85,1.06,.38+random.random()*.08)
    for k in range(2):crate(side*(9.3+k*.53),-5.62,1.09,.45)
    # Pair of bronze cannon on a timber carriage.
    for yy in [-5.74,-6.33]:
        xx=side*8.57;cube('Canon • affut',(xx,yy,1.32),(.84,.37,.20),wood,.03)
        for dx in [-.26,.26]:
            for dy in [-.23,.23]:
                o=cyl('Canon • roue',(xx+dx,yy+dy,1.31),.18,.07,gold,20);o.rotation_euler[0]=pi/2
        a=(xx-side*.35,yy,1.58);b=(xx+side*.51,yy,1.75);beam('Canon • fut',a,b,.13,ink);beam('Canon • bouche',b,(b[0]+side*.07,yy,1.765),.15,darkgold)

# Rear scenic islands, arched bridge and moored ships provide depth beyond the board.
ACTIVE=COL['08 • Iles et decor']
rockmat=mat('ROCHER • falaise calcaire',(.24,.265,.25),0,.91,3)
green=mat('VEGETATION • cypres',(.055,.105,.063),0,.9,4)
def rock(x,y,z,sc):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,z));o=put(bpy.context.object,'Falaise • roche',rockmat);o.scale=sc
    for v in o.data.vertices:v.co*=random.uniform(.83,1.12)
    return o
for side in [-1,1]:
    for i in range(11):
        xx=side*(10+random.random()*7);yy=11+random.random()*5
        rock(xx,yy,.5,(random.uniform(1,2.5),random.uniform(1,2),random.uniform(1,2)))
    for k in range(18):
        xx=side*(10+random.random()*7);yy=12+random.random()*3;zz=1.0;hh=random.uniform(.6,1.9);ww=random.uniform(.4,.85)
        cube('Port lointain • maison',(xx,yy,zz+hh/2),(ww,.7,hh),random.choice(stone),.03)
        cone('Port lointain • toit',(xx,yy,zz+hh+.25),ww*.75,0,.55,roof if k%3 else red,4).rotation_euler[2]=pi/4
        if k%2==0:arch_panel('Port lointain • fenetre',xx,yy-.356,zz+.2,.15,.30,ink)
    for k in range(12):
        xx=side*(10+random.random()*7);yy=11+random.random()*4
        cone('Cypres • silhouette',(xx,yy,2.0),.18,0,1.5,green,10)
for side in [-1,1]:
    tower(side*13.2,14.3,3.3,.55)
    tower(side*14.7,14.2,4.1,.47)
    wall('Port lointain • fort',side*14,14.3,1.0,2.6,1.8,.8,True)
ACTIVE=COL['06 • Navires et quais']
ship(-8.3,10.4,0,.92,sailmat,-.4);ship(8.5,11.3,0,.7,blue,.3)

# Scattered fine foam curls around the foundation rather than an opaque flat plane.
ACTIVE=COL['01 • Socle et ocean']
foam=mat('ECUME • reflet nacre',(.40,.68,.7),.08,.35)
for k in range(130):
    xx=random.uniform(-19,19);yy=random.uniform(-11,17)
    if abs(xx)<15.9 and abs(yy)<8.6:continue
    length=random.uniform(.16,.76); zz=.0+.095*sin(xx*2.4+yy*1.8)+.055*cos(yy*3.5-xx*.9)
    curve('Ecume • vague',[(xx+length*t,yy+.055*sin(t*pi*2),zz+.022*sin(t*pi)) for t in [i/8 for i in range(9)]],.009,foam)

# Lighting, composition, saved opening state and packed reference.
ACTIVE=COL['09 • Lumiere et cameras']
world=bpy.data.worlds.new('Ciel • lumiere marine');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.38,.53,.69,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.40
def area(name,loc,energy,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);ACTIVE.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Soleil • grande lumiere doree',(-13,-10,23),4200,(1,.80,.55),12,(0,0,0))
area('Ciel • remplissage froid',(12,4,19),3200,(.51,.71,1),15,(0,0,0))
area('Rim • citadelle',(0,15,18),3400,(1,.79,.52),9,(0,2,2))
sun=bpy.data.lights.new('Soleil','SUN');sun.energy=2.3;sun.angle=.15;sun.color=(1,.86,.66);o=bpy.data.objects.new('Soleil',sun);ACTIVE.objects.link(o);o.rotation_euler=(.5,-.45,-.45)
camd=bpy.data.cameras.new('Camera • vue de presentation');cam=bpy.data.objects.new('Camera • vue de presentation',camd);ACTIVE.objects.link(cam);cam.location=(0,-30.5,33.8);target=Vector((0,1.45,1.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=37.3;scene.camera=cam;camd.lens=45
camd.clip_end=300
# Secondary camera gives a clean overhead inspection view of all playing surfaces.
d=bpy.data.cameras.new('Camera • plan du jeu');o=bpy.data.objects.new('Camera • plan du jeu',d);ACTIVE.objects.link(o);o.location=(0,0,40);o.rotation_euler=(0,0,0);d.type='ORTHO';d.ortho_scale=34
scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for dev in prefs.devices:dev.use=dev.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception as e:print('GPU fallback',e)
scene.cycles.max_bounces=6;scene.cycles.transparent_max_bounces=4
scene.render.resolution_x=2100;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.render.image_settings.color_mode='RGB';bpy.context.preferences.filepaths.save_version=0
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.35
scene.render.filepath=os.path.join(OUT,'citadelle-des-marees.png')
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.025
scene['Description']='Plateau de jeu nautique inspire de la reference fournie. Geometrie 3D, materiaux proceduraux, 64 cases, 2 plateaux lateraux, 16 jetons.'
scene['Edition']='Chaque composant est modifiable; collections numerotees et cameras de presentation et de dessus.'
ref=args.reference or ''
if os.path.exists(ref):
    im=bpy.data.images.load(ref,check_existing=True);im.name='REFERENCE • plateau fourni';im.pack()
note=bpy.data.texts.new('LIRE MOI • Citadelle des Marees');note.write('CITADELLE DES MAREES\nCreation 3D inspiree de votre reference.\n\nLes objets sont ranges dans neuf collections.\nVue principale : pavé numerique 0.\nRendu : F12.\nDeux cameras : presentation et plan de jeu.\nMateriaux proceduraux, sans textures externes requises.\nLa reference est integree au fichier dans les images.\nLes figurines heraldiques sont des interpretations stylisees.\n')
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.overlay.show_overlays=False;ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.shading.use_scene_world=False
bpy.ops.object.select_all(action='DESELECT')
blend=os.path.join(OUT,'citadelle-des-marees.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)
info={'blend':blend,'objects':len(scene.objects),'mesh_objects':sum(o.type=='MESH' for o in scene.objects),'materials':len(bpy.data.materials),'tiles':len([o for o in scene.objects if o.name.startswith('Case ')]),'render':scene.render.filepath}
with open(os.path.join(OUT,'board-source-manifest.json'),'w',encoding='utf8') as f:json.dump(info,f,indent=2)
print('SCENE_READY',json.dumps(info),flush=True)
if not args.skip_render:
    bpy.ops.render.render(write_still=True)
    print('RENDER_DONE',flush=True)
