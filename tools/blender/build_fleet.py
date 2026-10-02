"""Build editable, articulated Royal Fleet miniatures inside the local Blender scene."""
import bpy, math, json, random, sys, argparse
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin, cos, pi

parser=argparse.ArgumentParser(description='Add articulated Royal Fleet miniatures to the supplied board.')
parser.add_argument('--base-blend',type=Path,required=True)
parser.add_argument('--outdir',type=Path,required=True)
parser.add_argument('--references-dir',type=Path)
parser.add_argument('--skip-render',action='store_true')
parser.add_argument('--render-engine',choices=('EEVEE','CYCLES'),default='EEVEE')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(args.base_blend.resolve()))
OUT=args.outdir.resolve();OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
random.seed(15)

def coll(name):
    c=bpy.data.collections.get(name)
    if not c:c=bpy.data.collections.new(name);scene.collection.children.link(c)
    return c
assets=coll('RF_assets');pieces=coll('RF_pieces');controls=coll('RF_controls');fx=coll('RF_effects')
ACTIVE=assets;RIG=None;PART='Root';S=1.0

def material(name,col,metal=0,rough=.4,emission=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*col,1)
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    if emission:bs.inputs['Emission Color'].default_value=(*col,1);bs.inputs['Emission Strength'].default_value=emission
    return m
GOLD=material('RF • Or des insignes',(.83,.47,.115),.82,.26)
DARKGOLD=material('RF • Bronze antique',(.31,.14,.025),.75,.32)
RED=material('RF • Email cramoisi',(.32,.008,.017),.42,.26)
BLUE=material('RF • Email bleu amiral',(.007,.035,.11),.5,.25)
CLOTH_R=material('RF • Velours rouge',(.24,.009,.02),.03,.67)
CLOTH_B=material('RF • Velours marine',(.009,.033,.087),.02,.62)
STEEL=material('RF • Acier bleui',(.13,.17,.20),.86,.23)
SKIN=material('RF • Visages ivoire bronze',(.49,.28,.12),.33,.41)
HAIR=material('RF • Cheveux ebene',(.018,.008,.005),.15,.39)
BEARD=material('RF • Barbe vieil amiral',(.25,.20,.12),.38,.46)
BLACK=material('RF • Ombres et pupilles',(.002,.003,.006),.2,.38)
WHITE=material('RF • Eclat des yeux',(.69,.60,.37),.15,.29)
RUBY=material('RF • Rubis de pouvoir',(.65,.015,.008),.35,.19,.7)
SAPPHIRE=material('RF • Saphir des marees',(.005,.21,.73),.25,.18,.65)

def attach(o,name,ma,bone=None):
    o.name=name;ACTIVE.objects.link(o)
    if ma:o.data.materials.append(ma)
    if RIG:
        bn=bone or PART
        original=o.matrix_basis.copy();o.parent=RIG;o.parent_type='BONE';o.parent_bone=bn
        rest=RIG.data.bones[bn]
        o.matrix_parent_inverse=(rest.matrix_local @ Matrix.Translation((0,rest.length,0))).inverted()
        o.matrix_basis=original
        o['rf_owner']=RIG.name
    return o
def mesh(name,vs,fs,ma,bone=None):
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);return attach(o,name,ma,bone)
def cube(name,loc,size,ma,b=.006):
    x,y,z=[v/2 for v in size];o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],ma)
    o.location=loc
    if b:mod=o.modifiers.new('Filet de lumiere','BEVEL');mod.width=b;mod.segments=2
    return o
def cone(name,loc,r1,r2,h,ma,n=32):
    vs=[(r*cos(i*2*pi/n),r*sin(i*2*pi/n),z) for z,r in [(-h/2,r1),(h/2,max(r2,.0001))] for i in range(n)]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh(name,vs,fs,ma);o.location=loc
    for p in o.data.polygons:
        if len(p.vertices)==4:p.use_smooth=True
    return o
def sphere(name,loc,size,ma,n=16,m=10):
    vs=[(sin(pi*j/m)*cos(2*pi*i/n),sin(pi*j/m)*sin(2*pi*i/n),cos(pi*j/m)) for j in range(m+1) for i in range(n)]
    fs=[(j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n) for j in range(m) for i in range(n)]
    o=mesh(name,vs,fs,ma);o.location=loc;o.scale=size
    for p in o.data.polygons:p.use_smooth=True
    return o
def line(name,pts,r,ma,closed=False):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2
    sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
    for a,b in zip(sp.points,pts):a.co=(*b,1)
    sp.use_cyclic_u=closed;o=bpy.data.objects.new(name,cu);return attach(o,name,ma)
def ring(name,c,r,t,ma,plane='XY',scale=(1,1)):
    x,y,z=c
    ps=[]
    for i in range(48):
        a=i*pi/24;u=r*cos(a)*scale[0];v=r*sin(a)*scale[1]
        ps.append((x+u,y+v,z) if plane=='XY' else (x+u,y,z+v) if plane=='XZ' else (x,y+u,z+v))
    return line(name,ps,t,ma,True)
def beam(name,a,b,r,ma):
    a,b=Vector(a),Vector(b);o=cone(name,(a+b)/2,r,r,(b-a).length,ma,16);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def skull(c,s=.045):
    x,y,z=c;sphere('Insigne • crane',(x,y,z),(.75*s,.42*s,s),GOLD)
    for d in [-1,1]:sphere('Crane • orbite',(x+d*.28*s,y-.40*s,z+.12*s),(.24*s,.10*s,.25*s),BLACK)
    for d in [-1,0,1]:cube('Crane • dent',(x+d*.20*s,y-.35*s,z-.7*s),(.14*s,.19*s,.28*s),GOLD,.001)
def anchor(c,s=.10):
    x,y,z=c
    line('Ancre • verge',[(x,y,z+s),(x,y,z-s*.67)],.01,GOLD)
    line('Ancre • jas',[(x-s*.46,y,z+s*.5),(x+s*.46,y,z+s*.5)],.01,GOLD)
    line('Ancre • bras',[(x-s*.65,y,z-s*.2),(x-s*.5,y,z-s*.65),(x,y,z-s),(x+s*.5,y,z-s*.65),(x+s*.65,y,z-s*.2)],.011,GOLD)
    ring('Ancre • anneau',(x,y,z+s*1.17),s*.18,.007,GOLD,'XZ')
def lion(c,s=.1):
    x,y,z=c;sphere('Lion • corps',(x,y,z),(.8*s,.11*s,.4*s),GOLD);sphere('Lion • criniere',(x+.6*s,y,z+.5*s),(.46*s,.13*s,.5*s),DARKGOLD)
    for ps in [[(-.5,0),(-.8,-.6),(-1,-.6)],[(.4,0),(.7,-.6),(1,-.6)],[(.6,.5),(.5,1),(1,1)], [(-.6,.2),(-1.3,.6),(-1.2,1.1),(-.8,1.1)]]:
        line('Lion • membres',[(x+a*s,y-.01,z+b*s) for a,b in ps],.012,GOLD)
def base(house,role):
    global PART;PART='Root'
    cone('Socle • pied',(0,0,.035),.355,.355,.07,GOLD)
    cone('Socle • tore bas',(0,0,.086),.35,.322,.032,DARKGOLD)
    cone('Socle • email',(0,0,.15),.322,.29,.12,house)
    for zz,rr in [(.098,.33),(.205,.30),(.235,.30)]:ring('Socle • cordon',(0,0,zz),rr,.012,GOLD)
    for i in range(16):
        a=i*pi/8;sphere('Socle • rivet',(.314*cos(a),.314*sin(a),.15),(.015,.015,.015),GOLD,n=8,m=6)
    if house==BLUE:skull((0,-.321,.15),.055)
    else:lion((0,-.322,.145),.045)

def newrig(name,side,role,h):
    global RIG,PART
    data=bpy.data.armatures.new(name+' • squelette');ob=bpy.data.objects.new(name,data);ACTIVE.objects.link(ob);ob.show_in_front=True
    if bpy.context.view_layer.objects.active:bpy.context.view_layer.objects.active.select_set(False)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    spec={
      'Root':((0,0,0),(0,0,.15),None),
      'Body':((0,0,.42*h),(0,0,.72*h),'Root'),
      'Head':((0,0,.77*h),(0,0,.89*h),'Body'),
      'Arm.L':((.18*h,0,.67*h),(.24*h,-.03,.53*h),'Body'),
      'Forearm.L':((.24*h,-.03,.53*h),(.22*h,-.13,.46*h),'Arm.L'),
      'Arm.R':((-.18*h,0,.67*h),(-.24*h,-.03,.53*h),'Body'),
      'Forearm.R':((-.24*h,-.03,.53*h),(-.22*h,-.13,.46*h),'Arm.R'),
      'Weapon':((-.22*h,-.13,.46*h),(-.22*h,-.13,.70*h),'Forearm.R'),
      'Cape':((0,.09,.72*h),(0,.19,.42*h),'Body'),
      'Turret':((0,0,.63),(0,0,.96),'Root'),
      'Barrel':((0,0,.99),(0,-.35,.99),'Turret'),
    }
    for bn,(a,b,par) in spec.items():
        bone=data.edit_bones.new(bn);bone.head=a;bone.tail=b
        if par:bone.parent=data.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
    for pb in ob.pose.bones:pb.rotation_mode='XYZ'
    ob['rf_prototype']=True;ob['rf_side']=side;ob['rf_role']=role;ob['rf_height']=h
    RIG=ob;PART='Root';return ob

def emitter(loc,bone='Weapon'):
    o=bpy.data.objects.new(RIG.name+' • Emitter',None);o.empty_display_size=.055;attach(o,o.name,None,bone);o.location=loc;RIG['rf_emitter']=o.name

def coat(h,house,cloth,female=False):
    global PART;PART='Body'
    waist=.53*h;shoulder=.70*h
    # Tailored skirt or long coat, with modeled folds and embroidered front panels.
    n=48;vs=[];fs=[]
    for z,rx,ry in [(.255,.25,.19),(.43*h,.20,.145),(waist,.125 if female else .17,.10),(shoulder,.205 if female else .23,.14)]:
        for i in range(n):
            a=i*2*pi/n;fold=1+.055*cos(a*12)
            vs.append((rx*cos(a)*fold,ry*sin(a)*fold,z))
    for j in range(3):
        for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    o=mesh('Habit • silhouette taillee',vs,fs,house)
    for p in o.data.polygons:p.use_smooth=True
    for d in [-1,1]:line('Habit • galon devant',[(d*.17,-.17,.27),(d*.12,-.13,.42*h),(d*.05,-.108,waist),(d*.15,-.12,shoulder)],.009,GOLD)
    for zz,rr in [(.27,.25),(waist,.14 if female else .17)]:ring('Habit • broderie',(0,0,zz),rr,.011,GOLD,scale=(1,.7))
    for k in range(5):sphere('Habit • bouton',(0,-.146,.52*h+k*.035),(.018,.011,.018),GOLD,n=10,m=6)
    PART='Cape';vs=[];fs=[];nx=24;ny=18
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            u=i/nx-.5;vs.append((u*(.46+.10*t),.075+.11*t+.028*cos(u*16*pi)*t,.72*h-t*(.72*h-.29)))
    for j in range(ny):
        for i in range(nx):a=j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
    o=mesh('Cape • plis articules',vs,fs,cloth);sol=o.modifiers.new('Epaisseur velours','SOLIDIFY');sol.thickness=.012
    for p in o.data.polygons:p.use_smooth=True
    for d in [-1,1]:line('Cape • lisiere',[(d*(.23+.05*t),.075+.11*t+.028*cos(8*pi)*t,.72*h-t*(.72*h-.29)) for t in [j/18 for j in range(19)]],.009,GOLD)
    PART='Body'
    for d in [-1,1]:
        sphere('Armure • epaulette',(d*.23,-.005,.70*h),(.105,.12,.045),GOLD)
        for k in range(5):beam('Epaulette • frange',(d*(.17+k*.028),-.085,.69*h),(d*(.18+k*.028),-.09,.65*h),.008,GOLD)

def face(h,queen=False,bearded=False):
    global PART;PART='Head';z=.81*h
    sphere('Visage • tete',(0,-.016,z),(.105,.087,.13),SKIN)
    sphere('Visage • nez',(0,-.101,z-.003),(.025,.035,.037),SKIN)
    for d in [-1,1]:
        sphere('Visage • oeil',(d*.047,-.096,z+.031),(.022,.008,.011),WHITE)
        sphere('Visage • pupille',(d*.047,-.105,z+.032),(.009,.005,.010),BLACK,n=10,m=6)
        line('Visage • sourcil',[(d*.023,-.105,z+.052),(d*.07,-.093,z+.057)],.008,HAIR)
        sphere('Visage • oreille',(d*.106,-.012,z),(.024,.018,.04),SKIN)
    line('Visage • bouche',[(-.032,-.099,z-.067),(0,-.109,z-.071),(.032,-.099,z-.067)],.005,HAIR)
    if queen:
        for k in range(13):
            a=k*pi/12
            pts=[(.115*cos(a)*(1+.12*t),.006+.09*sin(a)+.016*sin(t*11+k),z+.06-t*.30) for t in [j/16 for j in range(17)]]
            line('Chevelure • boucle',pts,.022,HAIR)
    elif bearded:
        for k in range(7):
            xx=(k-3)*.021;line('Barbe • meche',[(xx,-.101,z-.048),(xx*1.25,-.119,z-.12),(xx*.6,-.12,z-.22)],.022,BEARD)
    else:
        sphere('Visage • cheveux',(0,.023,z+.056),(.111,.083,.078),HAIR)

def crown(h,queen=False):
    global PART;PART='Head';z=.91*h
    cone('Couronne • velours',(0,0,z+.035),.105,.08,.09,RED)
    ring('Couronne • bandeau',(0,0,z),.113,.016,GOLD)
    for i in range(8):
        a=i*pi/4
        line('Couronne • arche',[(.115*cos(a),.115*sin(a),z),(.12*cos(a),.12*sin(a),z+.05),(.065*cos(a),.065*sin(a),z+.14),(0,0,z+.17)],.012,GOLD)
        sphere('Couronne • rubis',(.116*cos(a),.116*sin(a),z+.028),(.018,.018,.022),RUBY,n=10,m=6)
    beam('Couronne • croix',(0,0,z+.15),(0,0,z+.245),.011,GOLD);beam('Couronne • traverse',(-.033,0,z+.215),(.033,0,z+.215),.009,GOLD)

def tricorn(h,admiral=False):
    global PART;PART='Head';z=.90*h
    cone('Tricorne • calotte',(0,0,z-.024),.13,.08,.15,BLUE,32)
    ps=[]
    for i in range(72):
        a=i*2*pi/72;r=.18+.064*cos(3*a+pi/2);ps.append((r*cos(a),r*sin(a),z+.035*cos(3*a+pi/2)))
    mesh('Tricorne • bord releve',[(0,0,z-.035)]+ps,[(0,i+1,(i+1)%72+1) for i in range(72)],BLUE)
    line('Tricorne • passementerie',ps,.010,GOLD,True);skull((0,-.14,z+.025),.037)
    if admiral:
        for d in [-1,1]:anchor((d*.105,-.109,z),.028)

def mitre(h,house):
    global PART;PART='Head';z=.89*h
    cone('Mitre • base',(0,0,z),.11,.105,.045,GOLD)
    o=sphere('Mitre • bonnet',(0,0,z+.085),(.105,.08,.15),house)
    cone('Mitre • fleche',(0,0,z+.19),.07,0,.15,house)
    line('Mitre • galon',[(0,-.085,z-.015),(0,-.083,z+.105),(0,0,z+.26)],.012,GOLD)
    sphere('Mitre • cabochon',(0,0,z+.27),(.017,.017,.024),RUBY)

def limbs(h,house,steel=False):
    global PART
    for d,side in [(1,'L'),(-1,'R')]:
        PART='Body';beam('Jambe • greviere',(d*.09,.00,.29),(d*.09,.0,.48*h),.057,STEEL if steel else house)
        sphere('Jambe • botte',(d*.09,-.065,.29),(.066,.105,.056),STEEL)
        PART='Arm.'+side;beam('Bras • manche',(d*.21,0,.69*h),(d*.28,-.04,.55*h),.065,house)
        sphere('Bras • coude',(d*.28,-.04,.55*h),(.059,.055,.06),GOLD)
        PART='Forearm.'+side;beam('Bras • avant-bras',(d*.28,-.04,.55*h),(d*.27,-.13,.48*h),.048,STEEL)
        sphere('Main • gantelet',(d*.27,-.15,.48*h),(.053,.042,.053),GOLD)

def sword(h,d=1,dagger=False):
    global PART;PART='Forearm.L' if d==1 else 'Weapon'
    xx=d*.27;yy=-.155;zz=.48*h;length=.24 if dagger else .52
    beam('Epee • poignee',(xx,yy,zz-.02),(xx,yy,zz+.1),.018,BLACK)
    beam('Epee • garde',(xx-.09,yy,zz-.04),(xx+.09,yy,zz-.04),.011,GOLD)
    mesh('Epee • lame',[(xx-.036,yy,zz-.055),(xx+.036,yy,zz-.055),(xx+.023,yy,zz-length),(xx,yy,zz-length-.08),(xx-.023,yy,zz-length)],[(0,1,2,3,4)],STEEL)
    beam('Epee • nervure',(xx,yy-.005,zz-.05),(xx,yy-.005,zz-length-.08),.003,GOLD)

def staff(h,house,orb=False):
    global PART;PART='Weapon';xx=-.30;yy=-.145;top=h*.95
    beam('Sceptre • hampe',(xx,yy,.3),(xx,yy,top-.10),.015,GOLD)
    for zz in [.4,.65,.90,top-.15]:ring('Sceptre • bague',(xx,yy,zz),.025,.007,DARKGOLD)
    if orb:
        sphere('Sceptre • noyau magique',(xx,yy,top),(.06,.06,.065),RUBY if house==RED else SAPPHIRE)
        for p in ['XY','XZ','YZ']:ring('Sceptre • cage',(xx,yy,top),.09,.010,GOLD,p)
        for d in [-1,1]:beam('Sceptre • pointe',(xx+d*.07,yy,top+.02),(xx+d*.045,yy,top+.16),.007,GOLD)
    else:
        ring('Crosse • rosace',(xx,yy,top),.063,.012,GOLD,'XZ')
        beam('Crosse • croix',(xx,yy,top-.06),(xx,yy,top+.11),.011,GOLD);beam('Crosse • traverse',(xx-.07,yy,top+.03),(xx+.07,yy,top+.03),.009,GOLD)
    emitter((xx,yy,top+.10),'Weapon')

def shield(h,house):
    global PART;PART='Forearm.L';x=.25;y=-.21;z=.51*h
    ps=[(x-.115,y,z+.15),(x+.115,y,z+.15),(x+.12,y,z-.07),(x,y,z-.23),(x-.12,y,z-.07)]
    mesh('Bouclier • ecu',ps,[(0,1,2,3,4)],house);line('Bouclier • bordure',ps,.012,GOLD,True);lion((x,y-.015,z),.075)

def humanoid(side,role):
    global PART
    house=RED if side=='w' else BLUE;cloth=CLOTH_R if side=='w' else CLOTH_B
    h={'KING':1.54,'QUEEN':1.55,'BISHOP':1.46,'PAWN':1.05}[role]
    rig=newrig('RF_ASSET_'+('R' if side=='w' else 'B')+'_'+role,side,role,h)
    base(house,role);coat(h,house,cloth,role=='QUEEN');limbs(h,house,side=='w');face(h,role=='QUEEN',role=='KING' and side=='b')
    if side=='b':tricorn(h,role in ['KING','QUEEN'])
    elif role in ['KING','QUEEN']:crown(h,role=='QUEEN')
    else:mitre(h,house)
    PART='Body'
    if side=='b':anchor((0,-.148,.40*h),.067)
    else:lion((0,-.151,.41*h),.055)
    if role=='KING':sword(h,1);staff(h,house,False)
    elif role=='QUEEN':staff(h,house,True);sword(h,1)
    elif role=='BISHOP':
        if side=='w':staff(h,house,False)
        else:
            PART='Weapon';c=(0,-.27,.57*h)
            for p in ['XY','XZ','YZ']:ring('Astrolabe • sphere armillaire',c,.11,.009,GOLD,p)
            sphere('Astrolabe • etoile',c,(.035,.035,.035),SAPPHIRE);emitter((0,-.31,.60*h))
    else:
        sword(h,-1,True)
        if side=='w':shield(h,house)
        emitter((-.27,-.17,.51*h))
    return rig

def rook(side):
    global PART
    house=RED if side=='w' else BLUE;h=1.26;rig=newrig('RF_ASSET_'+('R' if side=='w' else 'B')+'_ROOK',side,'ROOK',h);base(house,'ROOK');PART='Body'
    cone('Tour • colonne email',(0,0,.57),.255,.235,.66,house)
    for zz,rr in [(.30,.265),(.82,.26),(.88,.285)]:ring('Tour • moulure',(0,0,zz),rr,.024,GOLD)
    for k in range(8):
        a=k*pi/4;beam('Tour • pilastre',(.247*cos(a),.247*sin(a),.33),(.24*cos(a),.24*sin(a),.82),.017,GOLD)
    if side=='w':
        for k in range(8):
            a=k*pi/4;o=cube('Tour • creneau',(.24*cos(a),.24*sin(a),1.03),(.095,.095,.27),GOLD);o.rotation_euler.z=a
        cone('Tour • terrasse',(0,0,.92),.30,.30,.075,GOLD)
        mesh('Tour • banniere',[(-.13,-.257,.80),(.13,-.257,.80),(.12,-.261,.42),(0,-.27,.35),(-.12,-.261,.42)],[(0,1,2,3,4)],CLOTH_R)
        lion((0,-.282,.60),.09);PART='Turret';sphere('Tour • foyer',(0,0,1.03),(.07,.07,.025),RUBY);emitter((0,0,1.13),'Turret')
    else:
        anchor((0,-.256,.58),.13)
        PART='Turret';cube('Canon • berceau',(0,0,.92),(.38,.27,.11),GOLD)
        for d in [-1,1]:beam('Canon • tourillon',(d*.21,0,.95),(d*.21,0,1.13),.028,GOLD)
        PART='Barrel';a=(0,.18,1.04);b=(0,-.40,1.10);beam('Canon • tube bronze',a,b,.125,BLUE)
        for yy in [.17,.02,-.24,-.40]:
            zz=1.04+(.18-yy)*.103;ring('Canon • frettage',(0,yy,zz),.135,.018,GOLD,'XZ')
        o=cone('Canon • ame sombre',(0,-.415,1.101),.092,.092,.012,BLACK);o.rotation_euler.x=pi/2
        for k in range(6):sphere('Canon • boulon',(.123*cos(k*pi/3),-.421,1.10+.123*sin(k*pi/3)),(.01,.008,.01),GOLD)
        emitter((0,-.44,1.105),'Barrel')
    return rig

def knight(side):
    global PART
    house=RED if side=='w' else BLUE;rig=newrig('RF_ASSET_'+('R' if side=='w' else 'B')+'_KNIGHT',side,'KNIGHT',1.44);base(house,'KNIGHT');PART='Body'
    sphere('Destrier • poitrail',(0,.04,.54),(.21,.22,.27),house)
    n=28;vs=[];fs=[]
    for y,z,rx,ry in [(.06,.52,.17,.18),(.11,.78,.15,.17),(.035,1.0,.11,.15),(-.08,1.16,.095,.13)]:
        for i in range(n):a=i*2*pi/n;vs.append((rx*cos(a),y+ry*sin(a),z))
    for j in range(3):
        for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    o=mesh('Destrier • encolure',vs,fs,house)
    for p in o.data.polygons:p.use_smooth=True
    for d in [-1,1]:
        beam('Destrier • anterieur',(d*.15,-.05,.61),(d*.14,-.26,.78),.06,house)
        beam('Destrier • jambe levee',(d*.14,-.26,.78),(d*.14,-.30,.53),.047,house)
        sphere('Destrier • sabot',(d*.14,-.33,.52),(.065,.074,.05),GOLD)
    PART='Head';sphere('Destrier • tete',(0,-.075,1.19),(.11,.16,.13),house);sphere('Destrier • chanfrein',(0,-.24,1.12),(.102,.16,.10),house)
    for d in [-1,1]:
        cone('Destrier • oreille',(d*.066,-.013,1.34),.036,.009,.18,house)
        sphere('Destrier • oeil',(d*.096,-.16,1.215),(.018,.016,.019),BLACK)
        sphere('Destrier • narine',(d*.065,-.361,1.12),(.020,.013,.016),BLACK)
        line('Destrier • bride',[(d*.09,-.34,1.12),(d*.11,-.10,1.2),(d*.09,.015,1.25)],.011,GOLD)
        line('Destrier • renes',[(d*.08,-.32,1.11),(d*.17,-.10,.84),(d*.18,.02,.71)],.011,DARKGOLD)
    ring('Destrier • muserolle',(0,-.27,1.12),.104,.013,GOLD,'XZ',scale=(1,.9))
    PART='Body'
    for k in range(9):
        z=.62+k*.07;y=.25-(z-.62)*.20
        mesh('Destrier • criniere', [(-.024,y-.025,z),(.024,y-.025,z),(0,y+.11,z+.055),(0,y+.09,z-.025)],[(0,1,2),(0,2,3)],GOLD if k%3==0 else house)
    for d in [-1,1]:
        line('Destrier • armure',[ (d*.17,.0,.52),(d*.17,-.08,.72),(d*.12,-.055,.98)],.019,GOLD)
    if side=='w':lion((0,-.19,.57),.078)
    else:anchor((0,-.19,.57),.09)
    emitter((0,-.40,1.15),'Head');return rig

def action_library(rig):
    rig.animation_data_create();lib={};role=rig['rf_role'];side=rig['rf_side']
    def clear_pose():
        for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
    for name,end in [('IDLE',48),('MOVE',32),('ATTACK',48),('HIT',24),('DEFEAT',48),('VICTORY',64)]:
        ac=bpy.data.actions.new(rig.name.replace('ASSET_','')+'_'+name);ac.use_fake_user=True;rig.animation_data.action=ac;lib[name]=ac.name
        for f,t in [(1,0),(end//3,.8),(2*end//3,1),(end,0)]:
            clear_pose();bo=rig.pose.bones
            if name=='IDLE':bo['Body'].location.y=.008*t;bo['Head'].rotation_euler.z=.035*t;bo['Cape'].rotation_euler.x=.02*t
            elif name=='MOVE':bo['Root'].location.y=(.16 if role=='KNIGHT' else .035)*t;bo['Body'].rotation_euler.x=.06*t;bo['Cape'].rotation_euler.x=-.15*t
            elif name=='ATTACK':
                if role=='ROOK' and side=='b':bo['Barrel'].location.y=-.095*t
                else:bo['Arm.R'].rotation_euler.x=-.52*t;bo['Forearm.R'].rotation_euler.x=-.42*t;bo['Body'].rotation_euler.z=.16*t
            elif name=='HIT':bo['Body'].rotation_euler.x=-.2*t;bo['Head'].rotation_euler.z=.15*t
            elif name=='DEFEAT':
                t=(f-1)/(end-1);bo['Body'].rotation_euler.x=-.8*t;bo['Root'].location.y=-.9*t
            elif name=='VICTORY':
                bo['Arm.R'].rotation_euler.x=-1.1*t;bo['Arm.L'].rotation_euler.x=-.5*t;bo['Head'].rotation_euler.x=-.15*t
                if role=='ROOK':bo['Body'].location.y=.065*t;bo['Turret'].rotation_euler.y=.25*t
            for bn in ['Root','Body','Head','Cape','Arm.R','Forearm.R','Arm.L','Turret','Barrel']:
                bo[bn].keyframe_insert('location',frame=f,group=bn);bo[bn].keyframe_insert('rotation_euler',frame=f,group=bn)
        if name=='IDLE':
            for fc in ac.fcurves:fc.modifiers.new('CYCLES')
    rig.animation_data.action=None;clear_pose();rig['rf_actions']=json.dumps(lib)

def clone_asset(proto,name,square):
    objs=[proto]+list(proto.children_recursive);mapping={}
    for src in objs:
        ob=src.copy()
        if src.type=='ARMATURE':ob.data=src.data.copy();ob.animation_data_clear()
        pieces.objects.link(ob);ob.name=name if src==proto else name+' • '+src.name.split(' • ')[-1];mapping[src]=ob
    for src,ob in mapping.items():
        if src.parent in mapping:
            # Blender resets the inverse when assigning a different bone parent.
            # Preserve both matrices explicitly after the parent assignment.
            ob.parent=mapping[src.parent]
            ob.matrix_parent_inverse=src.matrix_parent_inverse.copy()
            ob.matrix_basis=src.matrix_basis.copy()
        ob.hide_render=False;ob.hide_viewport=False;ob.hide_set(False)
    root=mapping[proto];root['rf_prototype']=False;root['rf_piece']=True;root['rf_active']=True;root['rf_square']=square;root['rf_home_square']=square
    root['rf_emitter']=mapping[bpy.data.objects[proto['rf_emitter']]].name
    root.location=((ord(square[0])-97-3.5)*1.1,(int(square[1])-1-3.5)*1.1,1.56);root.rotation_euler.z=pi if root['rf_side']=='w' else 0
    return root

protos={}
for side in ['w','b']:
    for role in ['KING','QUEEN','ROOK','BISHOP','KNIGHT','PAWN']:
        rig=rook(side) if role=='ROOK' else knight(side) if role=='KNIGHT' else humanoid(side,role)
        action_library(rig);protos[(side,role)]=rig
        print('ASSET_READY',side,role,len(rig.children_recursive),flush=True)
RIG=None
for side,back,rank in [('w',1,2),('b',8,7)]:
    counts={}
    for i,role in enumerate(['ROOK','KNIGHT','BISHOP','QUEEN','KING','BISHOP','KNIGHT','ROOK']):
        counts[role]=counts.get(role,0)+1;clone_asset(protos[(side,role)],'RF_'+('R' if side=='w' else 'B')+'_'+role+'_'+str(counts[role]),chr(97+i)+str(back))
    for i in range(8):clone_asset(protos[(side,'PAWN')],'RF_'+('R' if side=='w' else 'B')+'_PAWN_'+str(i+1),chr(97+i)+str(rank))
assets.hide_render=True;assets.hide_viewport=True

# Keep the playing surface usable: central rose becomes a shallow inlay.
light=bpy.data.materials.get('BLENDERKIT • Marbre ivoire • Simple marble')
dark=bpy.data.materials.get('BLENDERKIT • Marbre noir • variation')
if light and dark:
    for ob in scene.objects:
        if ob.name.startswith('Case ') and len(ob.name)==7:
            square=ob.name[5:].lower()
            if square[0] in 'abcdefgh' and square[1] in '12345678':
                ob.data.materials[0]=dark if ((ord(square[0])-97)+(int(square[1])-1))%2==0 else light
for ob in scene.objects:
    if ob.name.startswith('Rose') and ob.location.length==0:
        pass
scene['rf_piece_manifest']=json.dumps({'armies':2,'pieces':32,'roles':6,'rigs':32,'library_actions':72,'orientation':'Red/white ranks 1-2; Blue/black ranks 7-8'})
scene['rf_fen']='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
scene['rf_history']='[]'
if args.references_dir:
    for filename,label in [('blue-pieces.png','REFERENCE • Flotte royale bleue'),('red-pieces.png','REFERENCE • Royaume rouge')]:
        path=args.references_dir/filename
        if path.exists():im=bpy.data.images.load(str(path),check_existing=True);im.name=label;im.use_fake_user=True;im.pack()
scene.frame_start=1;scene.frame_end=240;scene.render.fps=24;scene.frame_set(1)
scene.camera=bpy.data.objects['Camera • vue de presentation']
scene.render.resolution_x=2100;scene.render.resolution_y=1400;scene.cycles.samples=64
scene.render.filepath=str(OUT/'royal-fleet-armees.png')
scene.cycles.use_denoising=True;scene.cycles.denoiser='OPTIX'
scene.render.engine='BLENDER_EEVEE_NEXT' if args.render_engine=='EEVEE' else 'CYCLES'
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.shading.type='SOLID';ar.spaces.active.shading.color_type='MATERIAL';ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.region_3d.view_camera_zoom=18
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'royal-fleet-jeu.blend'),compress=True)
print('FLEET_SAVED',len(scene.objects),flush=True)
try:
    p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='OPTIX';p.get_devices()
    for d in p.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:pass
if not args.skip_render:
    bpy.ops.render.render(write_still=True)
