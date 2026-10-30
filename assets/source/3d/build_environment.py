"""Curated Oakrest environment sample. Execute through BlenderMCP.

Editable scene sources and GLB exports are written by pipeline.finish().
All coordinates use metres, Blender Z-up and front -Y. No external assets.
"""
import math
from mathutils import Vector
from pipeline import reset, empty, cube, mesh, cylinder, beam, finish


def lamp_marker(parent, name, location, kind="window", intensity=5, distance=5):
    marker = empty(name, location, parent)
    marker["kind"] = kind
    marker["color"] = "ffce8b" if kind != "forge" else "ff9d50"
    marker["intensity"] = intensity
    marker["distance"] = distance
    marker["castShadow"] = False
    return marker


def lantern(parent, x, y, z):
    fixture = empty("Lantern", (x, y, z), parent)
    cube("lantern-top", (0, 0, .17), (.21, .2, .07), "wood_dark", fixture)
    cube("window-glass", (0, 0, 0), (.15, .14, .27), "window", fixture)
    cube("lantern-foot", (0, 0, -.16), (.2, .19, .055), "wood_dark", fixture)
    for px in (-.082, .082):
        cube("lantern-frame", (px, -.078, 0), (.025, .026, .27), "iron", fixture)
    beam("lantern-hook", (0, .12, .25), (0, 0, .25), .035, "iron", fixture)
    lamp_marker(fixture, "light-window", (0, -.1, -.015), "lantern", 4, 4)


def crate(parent, location, scale=1):
    group = empty("SupplyCrate", location, parent)
    cube("crate-planks", (0, 0, .28*scale), (.57*scale, .5*scale, .55*scale), "wood", group)
    for x in (-.235, .235):
        cube("crate-edge", (x*scale, -.26*scale, .28*scale), (.07*scale, .045*scale, .54*scale), "wood_light", group)
    for z in (.07, .49):
        cube("crate-edge", (0, -.26*scale, z*scale), (.55*scale, .045*scale, .07*scale), "wood_light", group)
    beam("crate-diagonal", (-.23*scale, -.29*scale, .08*scale), (.23*scale, -.29*scale, .49*scale), .055*scale, "wood_light", group)
    return group


def barrel(parent, location, scale=1):
    group = empty("OakBarrel", location, parent)
    sides = 10
    rings = [(.22, .035), (.28, .19), (.29, .42), (.235, .65)]
    vertices = [(math.cos(i*math.tau/sides)*r*scale, math.sin(i*math.tau/sides)*r*scale, z*scale)
                for r, z in rings for i in range(sides)]
    faces = [tuple(reversed(range(sides))), tuple(range((len(rings)-1)*sides, len(rings)*sides))]
    faces += [(ring*sides+i, ring*sides+(i+1)%sides, (ring+1)*sides+(i+1)%sides, (ring+1)*sides+i)
              for ring in range(len(rings)-1) for i in range(sides)]
    mesh("barrel-staves", vertices, faces, "wood", group)
    for z, r in ((.13, .272), (.49, .278)):
        cylinder("iron-hoop", (0, 0, z*scale), r*scale, .055*scale, "iron", group, vertices=sides)
    cylinder("barrel-lid", (0, 0, .654*scale), .21*scale, .025*scale, "wood_light", group, vertices=sides)
    return group


def roof(parent, width=4.38, depth=3.35, front_z=2.48, back_z=2.66, ridge_z=3.62, slate=False):
    """Distinct bank bell-cast gable and forge half-hip, with thick supported eaves."""
    group = empty("roof", parent=parent)
    pitch = "slate" if slate else "roof"
    half = width/2
    front_y, ridge_y, back_y = -depth/2, .22, depth/2
    if slate:
        ridge_half = half*.64
        front = [(-half,front_y,front_z),(half,front_y,front_z),(ridge_half,ridge_y,ridge_z),(-ridge_half,ridge_y,ridge_z)]
        rear = [(-ridge_half,ridge_y,ridge_z),(ridge_half,ridge_y,ridge_z),(half,back_y,back_z),(-half,back_y,back_z)]
        mesh("broad-hipped-front-pitch",front,[(0,1,2,3)],pitch,group)
        mesh("broad-hipped-rear-pitch",rear,[(0,1,2,3)],pitch,group)
        for side in (-1,1):
            x = side*half
            vertices=[(x,front_y,front_z),(x,back_y,back_z),(side*ridge_half,ridge_y,ridge_z)]
            mesh("sloping-side-hip",vertices,[(0,1,2)] if side == 1 else [(2,1,0)],pitch,group)
            beam("hip-front-timber-edge",vertices[0],vertices[2],.14,"wood_dark",group)
            beam("hip-back-timber-edge",vertices[2],vertices[1],.13,"wood_dark",group)
        beam("short-ridge-cap",(-ridge_half-.03,ridge_y,ridge_z+.025),(ridge_half+.03,ridge_y,ridge_z+.025),.18,"slate",group)
        # Several broad staggered slate laps change the edge profile; no thin dark stripes.
        for row,fraction in enumerate((.16,.39,.62)):
            y=front_y+(ridge_y-front_y)*fraction
            z=front_z+(ridge_z-front_z)*fraction+.014
            span=half+(ridge_half-half)*fraction
            for index in range(3):
                x1=-span+index*span*2/3+.02
                x2=-span+(index+1)*span*2/3-.018
                dz=.035 if index == row%3 else .018
                mesh("broad-slate-lap",[(x1,y-.075,z-dz),(x2,y-.075,z-dz),(x2,y+.09,z+.075),(x1,y+.09,z+.075)],[(0,1,2,3)],"stone_dark" if row==1 else "slate",group)
    else:
        # A kicked-out lower pitch and slightly offset ridge replace the flat roof sheet.
        profile=[(front_y,front_z-.055),(front_y+.28,front_z+.075),(-.52,ridge_z-.58),(ridge_y,ridge_z),(back_y,back_z)]
        for segment in range(len(profile)-1):
            y1,z1=profile[segment]
            y2,z2=profile[segment+1]
            for index in range(3):
                x1=-half+index*width/3
                x2=-half+(index+1)*width/3
                mesh("bellcast-roof-pitch",[(x1,y1,z1),(x2,y1,z1),(x2,y2,z2),(x1,y2,z2)],[(0,1,2,3)],pitch,group)
        for side in (-1,1):
            x=side*half
            for index in range(len(profile)-1):
                y1,z1=profile[index]
                y2,z2=profile[index+1]
                beam("stepped-gable-bargeboard",(x,y1,z1+.01),(x,y2,z2+.01),.19,"wood_dark",group)
        beam("heavy-ridge-cap",(-half-.03,ridge_y,ridge_z+.025),(half+.03,ridge_y,ridge_z+.025),.2,"roof_dark",group)
        # Two restrained staggered repairs break perfect roof uniformity at a useful scale.
        lower_y,lower_z=profile[1]
        upper_y,upper_z=profile[2]
        slope=(upper_z-lower_z)/(upper_y-lower_y)
        for x,y in ((-.78,-.75),(.9,-1.22)):
            z=lower_z+(y-lower_y)*slope+.018
            mesh("settled-clay-roof-course",[(x-.28,y-.09,z-.09*slope),(x+.28,y-.09,z-.09*slope),(x+.28,y+.1,z+.1*slope),(x-.28,y+.1,z+.1*slope)],[(0,1,2,3)],"roof_light",group)
    # Wide fascia, underside and exposed rafter ends make a supported roof volume.
    for y,z in ((front_y,front_z-.1),(back_y,back_z-.1)):
        cube("thick-eave-fascia",(0,y,z),(width,.17,.2),"wood_dark",group)
        cube("eave-soffit",(0,y+(.12 if y<0 else -.12),z-.055),(width,.34,.075),"wood",group)
        for x in (-1.65,-.55,.55,1.65):
            cube("exposed-rafter-tail",(x,y+(.1 if y<0 else -.1),z-.13),(.13,.52,.16),"wood",group)
    if slate:
        # Side hips have thick angled edges rather than exposed single-sided sheets.
        for side in (-1,1):
            beam("side-eave-fascia",(side*half,front_y,front_z-.09),(side*half,back_y,back_z-.09),.19,"wood_dark",group)
    return group


def foundation(parent):
    cube("continuous-foundation", (0, 0, .07), (3.96, 2.96, .14), "stone_dark", parent)
    for x in (-1.5, -.5, .5, 1.5):
        cube("front-foundation-stone", (x, -1.43, .17), (.96, .18, .21), "stone", parent)
    for side in (-1, 1):
        for y in (-.94, 0, .94):
            cube("side-foundation-stone", (side*1.89, y, .17), (.18, .9, .2), "stone", parent)


def gold_coin(parent, x, y, z, radius=.105):
    coin = cylinder("gold-coin-emblem", (x, y, z), radius, .025, "gold", parent, vertices=10)
    coin.rotation_euler.x = math.pi/2
    inset = cylinder("coin-highlight", (x-.015, y-.016, z+.015), radius*.55, .012, "gold_light", parent, vertices=8)
    inset.rotation_euler.x = math.pi/2


def bank_asset():
    reset()
    root = empty("asset-bank")
    architecture = empty("Architecture", parent=root)
    facade = empty("facade", parent=root)
    props = empty("Props", parent=root)
    work = empty("WorkArea", parent=root)
    foundation(architecture)
    # Closed cream envelope. The service opening and door are physical recesses.
    cube("back-plaster-wall", (0, 1.34, 1.34), (3.8, .2, 2.3), "plaster", architecture)
    for side in (-1, 1):
        cube("side-plaster-wall", (side*1.88, 0, 1.34), (.2, 2.7, 2.3), "plaster_light" if side == 1 else "plaster", architecture)
        mesh("plaster-gable", [(side*1.885,-1.34,2.42), (side*1.885,1.34,2.61), (side*1.885,.22,3.5)], [(0,1,2)] if side == 1 else [(2,1,0)], "plaster", architecture)
    cube("service-bay-low-wall", (-.89, -1.34, .57), (1.92, .2, .82), "plaster_light", facade)
    cube("front-header-plaster", (0, -1.34, 2.14), (3.8, .2, .49), "plaster_light", facade)
    cube("door-window-mullion-wall", (.045, -1.34, 1.41), (.18, .2, .95), "plaster", facade)
    cube("door-right-wall", (1.43, -1.34, 1.19), (.9, .2, 2.04), "plaster_light", facade)
    cube("service-left-wall", (-1.76, -1.34, 1.42), (.26, .2, .97), "plaster", facade)
    for side in (-1, 1):
        for y in (-1.39, 1.36):
            cube("corner-timber", (side*1.85, y, 1.35), (.17,.18,2.4), "wood_dark", architecture)
        cube("side-timber-rail", (side*1.99, 0, .81), (.07,2.7,.12), "wood_dark", architecture)
        beam("side-timber-brace", (side*2,-1.16,1.03), (side*2,-.45,2.12), .1, "wood", architecture)
        beam("side-timber-brace", (side*2,1.14,1.03), (side*2,.45,2.12), .1, "wood", architecture)
    cube("front-cross-beam", (0,-1.46,2.08), (3.87,.17,.17), "wood_dark", facade)
    cube("front-low-rail", (-.88,-1.46,.83), (1.94,.1,.11), "wood", facade)
    # Deep service hatch, framed on all sides, with counter and dark rear interior.
    cube("service-hatch-dark-interior", (-.86,-.98,1.43), (1.51,.035,.93), "wood_dark", work)
    cube("service-counter", (-.86,-1.34,.96), (1.72,.58,.13), "wood_light", work)
    cube("service-counter-front-edge", (-.86,-1.64,.94), (1.77,.08,.16), "wood_dark", work)
    for x in (-1.66,-.06):
        cube("service-window-jamb", (x,-1.49,1.44), (.12,.18,1.0), "wood_dark", facade)
    cube("service-window-lintel", (-.86,-1.49,1.94), (1.77,.19,.15), "wood_dark", facade)
    for x in (-1.48, -.24):
        shutter=cube("open-service-shutter", (x,-1.16,1.45), (.23,.08,.78), "wood", work)
        shutter.rotation_euler.z=.18 if x<-.8 else -.18
    cube("bank-ledger", (-1.15,-1.4,1.052), (.32,.27,.045), "linen", work)
    for x, y, z in ((-.7,-1.4,1.07),(-.51,-1.34,1.1),(-.34,-1.42,1.07)):
        cylinder("counter-coin-stack", (x,y,z), .075, .065, "gold", work, vertices=8)
    # Actual closed service door, inset under a substantial lintel.
    cube("door-dark-recess", (.5,-1.34,1.04), (.86,.06,1.86), "black", facade)
    cube("oak-door-leaf", (.5,-1.385,1.04), (.68,.09,1.74), "wood", facade)
    for x in (.08,.93):
        cube("door-frame-post", (x,-1.46,1.06), (.12,.15,1.94), "wood_dark", facade)
    cube("door-frame-lintel", (.5,-1.46,2.02), (.98,.15,.16), "wood_dark", facade)
    for z in (.49,1.52):
        cube("door-strap", (.5,-1.445,z), (.6,.035,.055), "iron", facade)
    cube("door-handle", (.74,-1.475,1.05), (.055,.04,.13), "gold", facade)
    cube("front-bank-banner", (1.42,-1.46,1.34), (.48,.055,.88), "blue_dark", facade)
    cube("banner-gold-hem", (1.42,-1.5,.94), (.46,.025,.055), "gold", facade)
    cube("bank-scales-mast", (1.42,-1.5,1.37), (.055,.025,.43), "gold", facade)
    cube("bank-scales-crossbar", (1.42,-1.5,1.44), (.31,.025,.045), "gold", facade)
    # Small side window and blue heraldic hanging give the bank a recognisable silhouette.
    cube("side-window-recess", (1.994,.54,1.55), (.025,.65,.66), "wood_dark", architecture)
    cube("window-glass", (2.012,.54,1.55), (.026,.49,.5), "window", architecture)
    for y in (.3,.54,.78):
        cube("side-window-mullion", (2.029,y,1.55), (.025,.04,.52), "wood_dark", architecture)
    lamp_marker(root,"light-window",(2.16,.54,1.55),"window",5,4.5)
    cube("blue-bank-banner", (-1.955,-.18,1.61), (.055,.54,.88), "blue", architecture)
    cube("banner-gold-bottom", (-1.99,-.18,1.2), (.025,.52,.055), "gold", architecture)
    # A restrained hanging plaque reads as banking at game distance.
    beam("sign-wall-bracket", (1.77,-1.34,2.24), (1.77,-1.94,2.24), .095,"wood_dark",architecture)
    beam("sign-diagonal-support", (1.77,-1.35,1.99), (1.77,-1.78,2.24), .07,"wood",architecture)
    sign = empty("HangingBankSign", (1.77,-1.83,1.83), props)
    cube("sign-board", (0,0,0), (.64,.12,.63), "wood_dark", sign)
    cube("sign-inset", (0,-.071,0), (.51,.025,.49), "blue_dark", sign)
    for x,z in ((-.125,-.09),(.125,-.09),(0,.105)):
        gold_coin(sign,x,-.097,z,.11)
    lantern(props,-1.74,-1.59,1.59)
    crate(props,(-1.61,-.8,.19),.82)
    barrel(props,(1.62,.95,.17),.85)
    roof(root)
    finish("bank",root)


def anvil(parent, location):
    group = empty("Anvil",location,parent)
    cylinder("anvil-oak-stump",(0,0,.24),.27,.48,"wood_dark",group,vertices=8,top_radius=.245)
    cube("anvil-base",(0,0,.5),(.52,.4,.09),"iron",group)
    mesh("anvil-waist",[(-.19,-.15,.54),(.19,-.15,.54),(.19,.15,.54),(-.19,.15,.54),(-.13,-.11,.78),(.13,-.11,.78),(.13,.11,.78),(-.13,.11,.78)],[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],"iron",group)
    cube("anvil-face",(0,0,.825),(.63,.34,.12),"iron_light",group)
    mesh("anvil-horn",[(.3,-.13,.77),(.3,.13,.77),(.3,.13,.88),(.3,-.13,.88),(.68,0,.84)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],"iron",group)
    cube("hot-iron-stock",(-.05,-.02,.9),(.37,.085,.035),"ember",group)
    return group


def stacked_logs(parent, location):
    group=empty("StackedLogs",location,parent)
    for x,z in ((-.18,.14),(.15,.14),(0,.39)):
        log=cylinder("bark-log",(x,0,z),.145,.8,"bark",group,vertices=7)
        log.rotation_euler.x=math.pi/2
        end=cylinder("cut-log-end",(x,-.41,z),.125,.018,"wood_light",group,vertices=7)
        end.rotation_euler.x=math.pi/2
    return group


def forge_asset():
    reset()
    root=empty("asset-forge")
    architecture=empty("Architecture",parent=root)
    work=empty("WorkArea",parent=root)
    props=empty("Props",parent=root)
    foundation(architecture)
    cube("rear-masonry-wall",(0,1.33,1.25),(3.8,.2,2.25),"stone_dark",architecture)
    cube("left-plaster-return",(-1.85,.58,1.26),(.2,1.48,2.25),"plaster",architecture)
    cube("right-hearth-return",(1.85,.42,1.25),(.2,1.8,2.25),"stone",architecture)
    for x in (-1.82,1.82):
        for y in (-1.32,1.26):
            cube("massive-oak-column",(x,y,1.36),(.23,.24,2.45),"wood_dark",architecture)
            cube("column-stone-foot",(x,y,.28),(.33,.34,.35),"stone",architecture)
        beam("front-angle-brace",(x,-1.32,1.89),(x-math.copysign(.47,x),-1.32,2.43),.16,"wood",architecture)
    cube("deep-front-crossbeam",(0,-1.33,2.44),(3.9,.25,.23),"wood_dark",architecture)
    cube("rear-crossbeam",(0,1.3,2.43),(3.94,.24,.2),"wood_dark",architecture)
    for x in (-1.82,1.82):
        cube("side-roof-plate",(x,0,2.47),(.2,2.93,.19),"wood_dark",architecture)
    # Hearth aperture has real dark depth, chunky brick jambs and a stone lintel.
    hearth=empty("MasonryHearth",(.95,.55,.15),work)
    cube("hearth-base",(0,0,.2),(1.3,1.25,.4),"stone_dark",hearth)
    cube("firebox-rear",(0,.39,.84),(1.14,.36,1.22),"stone_dark",hearth)
    cube("firebox-darkness",(0,-.24,.81),(.78,.03,.56),"black",hearth)
    for side in (-1,1):
        for row in range(4):
            cube("hearth-jamb-brick",(side*.49,-.03,.49+row*.22),(.24,.79,.2),"roof_dark" if row%2 else "roof",hearth)
    cube("hearth-lintel",(0,-.035,1.37),(1.28,.83,.22),"stone",hearth)
    cube("hood-upper",(0,.15,1.58),(1.03,.77,.24),"stone_dark",hearth)
    cube("live-coals",(0,-.29,.48),(.75,.58,.075),"ember",hearth)
    for x,h in ((-.22,.28),(-.03,.47),(.19,.34)):
        mesh("live-coals",[(x-.12,-.28,.52),(x+.1,-.28,.52),(x+.07,-.27,.52+h*.58),(x-.035,-.27,.52+h)],[(0,1,2,3)],"flame" if x<0 else "ember",hearth)
    lamp_marker(root,"light-forge",(.95,-.06,1.04),"forge",17,6)
    # Leather bellows sits alongside the hearth, with a visible nozzle into the firebox.
    bellows=empty("Bellows",(-.04,.68,.96),work)
    vertices=[(-.48,-.2,0),(-.48,.2,0),(.25,.12,0),(.25,-.12,0),(-.48,-.2,.18),(-.48,.2,.18),(.25,.12,.075),(.25,-.12,.075)]
    mesh("bellows-leather",vertices,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],"leather",bellows)
    cube("bellows-upper-board",(-.15,0,.2),(.73,.43,.05),"wood",bellows)
    beam("bellows-nozzle",(.21,0,.05),(.57,0,.05),.085,"iron",bellows)
    for x in (-.46,.12):
        cube("bellows-foot",(x,0,-.32),(.09,.3,.65),"wood_dark",bellows)
    anvil(work,(-.24,-.94,.15))
    # Rack has distinct hammer, tongs and pick silhouettes instead of surface noise.
    rack=empty("ToolRack",(-.94,1.15,1.54),work)
    cube("rack-crossbar",(0,0,0),(1.18,.12,.13),"wood",rack)
    for x in (-.38,0,.38):
        beam("hanging-handle",(x,-.09,.12),(x,-.09,-.53),.055,"wood_light",rack)
    cube("hammer-head",(-.38,-.09,-.49),(.26,.12,.15),"iron",rack)
    for x in (-.055,.055):
        beam("tongs-jaw",(x,-.09,-.15),(x*1.4,-.09,-.5),.035,"iron",rack)
    cube("pick-head",(.38,-.09,-.48),(.36,.07,.07),"iron",rack)
    cube("side-workbench",(-1.3,.48,.88),(.72,1.06,.13),"wood",work)
    for y in (.1,.85):
        cube("bench-leg",(-1.3,y,.48),(.53,.11,.8),"wood_dark",work)
    stacked_logs(props,(-1.45,-.91,.17))
    barrel(props,(-1.43,.8,.15),.7)
    # Broad hanging anvil plaque is a second readable identifier beside the orange hearth.
    sign=empty("ForgeSign",(1.8,-1.49,1.73),props)
    cube("forge-sign-board",(0,0,0),(.53,.1,.58),"wood_light",sign)
    cube("anvil-sign-face",(-.035,-.06,.09),(.36,.025,.08),"black",sign)
    cube("anvil-sign-waist",(-.035,-.06,-.035),(.13,.025,.18),"black",sign)
    cube("anvil-sign-foot",(-.035,-.06,-.14),(.29,.025,.055),"black",sign)
    mesh("anvil-sign-horn",[(.14,-.078,.05),(.14,-.078,.13),(.25,-.078,.105)],[(0,1,2)],"black",sign)
    lantern(props,-1.63,-1.49,1.8)
    top=roof(root,front_z=2.57,back_z=2.7,ridge_z=3.52,slate=True)
    chimney=empty("Chimney",(1.03,.57,3.05),top)
    cube("chimney-shaft",(0,0,.36),(.64,.66,1.28),"stone_dark",chimney)
    for z in (-.08,.2,.48,.76):
        cube("chimney-front-brick-course",(0,-.345,z),(.66,.04,.045),"stone",chimney)
    cube("chimney-cap",(0,0,1.02),(.82,.82,.14),"stone",chimney)
    cube("chimney-dark-mouth",(0,0,1.1),(.5,.5,.025),"black",chimney)
    finish("forge",root)


def curved_branch(parent,name,points,radii):
    vertices=[]
    sides=7
    for index,(point,radius) in enumerate(zip(points,radii)):
        center=Vector(point)
        before=Vector(points[max(0,index-1)])
        after=Vector(points[min(len(points)-1,index+1)])
        tangent=(after-before).normalized()
        axis=tangent.cross(Vector((0,1,0))).normalized()
        other=tangent.cross(axis).normalized()
        for i in range(sides):
            angle=i*math.tau/sides+.12
            vertices.append(tuple(center+axis*math.cos(angle)*radius+other*math.sin(angle)*radius))
    faces=[tuple(reversed(range(sides)))]
    faces += [(ring*sides+i,ring*sides+(i+1)%sides,(ring+1)*sides+(i+1)%sides,(ring+1)*sides+i)
              for ring in range(len(points)-1) for i in range(sides)]
    faces.append(tuple(range((len(points)-1)*sides,len(points)*sides)))
    return mesh(name,vertices,faces,"bark",parent)


def foliage_lobe(parent,name,location,scale,offset=0):
    """Faceted rounded crown with sculpted rings and large directional colour planes."""
    group=empty(name,location,parent)
    sides=9
    rings=[(.12,-.62),(.65,-.43),(.96,-.12),(1,.2),(.76,.56),(.25,.78)]
    vertices=[]
    for ring,(radius,height) in enumerate(rings):
        for i in range(sides):
            angle=i*math.tau/sides+offset
            # Deliberate broad scallops, shared across rings; no random micro noise.
            shoulder=1+(.09 if i in (1,4,7) else -.045)
            vertices.append((math.cos(angle)*radius*scale[0]*shoulder,
                             math.sin(angle)*radius*scale[1]*shoulder,
                             height*scale[2]+(.025 if i in (0,4) else 0)))
    grouped={"leaf":[],"leaf_dark":[],"leaf_light":[]}
    grouped["leaf_dark"].append(tuple(reversed(range(sides))))
    grouped["leaf_light"].append(tuple(range((len(rings)-1)*sides,len(rings)*sides)))
    for ring in range(len(rings)-1):
        for i in range(sides):
            angle=(i+.5)*math.tau/sides+offset
            swatch="leaf_dark" if ring==0 else "leaf_light" if ring>=3 and math.cos(angle)<.3 else "leaf"
            grouped[swatch].append((ring*sides+i,ring*sides+(i+1)%sides,(ring+1)*sides+(i+1)%sides,(ring+1)*sides+i))
    for swatch,faces in grouped.items():
        mesh(f"{name}-{swatch}",vertices,faces,swatch,group)
    return group


def oak_crown(parent):
    """One connected canopy: dominant crown, broad scalloped shoulder, quiet underside.

    Outline lobes share a continuous skin instead of reading as independent balls.
    The asymmetric silhouette is intentional and repeats at a broad angular scale.
    """
    group=empty("DominantScallopedCrown",(-.02,-.02,2.45),parent)
    sides=18
    # Wide shoulders and a flattened, offset crown top. Two slight outward steps
    # form connected leafy shelves, rather than a lathed pear or separate balls.
    rings=[(.28,-.65),(.72,-.48),(.95,-.36),(.86,-.25),(1.04,-.04),
           (1.03,.24),(.91,.47),(.7,.66),(.42,.8)]
    shoulder=[1.06,1.15,1.02,.87,.82,.98,1.13,1.17,1.0,.86,.84,.99,1.06,1.1,.97,.81,.89,1.0]
    vertices=[]
    for ring,(radius,height) in enumerate(rings):
        for i in range(sides):
            angle=i*math.tau/sides+.17
            contour=shoulder[i]
            # Upper masses lean back-left, while the low front shelf hangs over the fork.
            lean=max(0,height)*.3
            x=math.cos(angle)*radius*.95*contour-lean
            y=math.sin(angle)*radius*.88*contour+.11*max(0,height)
            # Broad contour troughs break the surface at useful game-scale intervals.
            z=height+(.07*math.cos(angle*3-.4) if ring<7 else .025*math.cos(angle*2+.3))
            if ring in (2,3) and i in (4,10,16):
                z-=.075
            if ring in (4,5) and i in (3,9,15):
                x*=.91
                y*=.91
            vertices.append((x,y,z))
    grouped={"leaf":[],"leaf_dark":[],"leaf_light":[]}
    grouped["leaf_dark"].append(tuple(reversed(range(sides))))
    grouped["leaf_light"].append(tuple(range((len(rings)-1)*sides,len(rings)*sides)))
    for ring in range(len(rings)-1):
        for i in range(sides):
            angle=(i+.5)*math.tau/sides+.17
            swatch="leaf_dark" if ring==0 or ring<3 and math.cos(angle)>.45 else "leaf_light" if ring>=4 and math.cos(angle)<.2 else "leaf"
            grouped[swatch].append((ring*sides+i,ring*sides+(i+1)%sides,(ring+1)*sides+(i+1)%sides,(ring+1)*sides+i))
    for swatch,faces in grouped.items():
        mesh(f"continuous-oak-crown-{swatch}",vertices,faces,swatch,group)
    return group


def tree_asset():
    reset()
    root=empty("asset-tree")
    trunk=empty("TrunkAndBranches",parent=root)
    foliage=empty("Foliage",parent=root)
    curved_branch(trunk,"crooked-main-trunk",[(0,0,.03),(-.055,.025,.46),(.02,.02,1.02),(-.1,.035,1.47),(-.33,.05,1.99)], [.25,.19,.15,.115,.065])
    curved_branch(trunk,"east-fork",[(.01,.015,.97),(.23,.08,1.49),(.48,.13,1.99),(.57,.2,2.4)],[.13,.1,.073,.034])
    curved_branch(trunk,"west-fork",[(-.08,.03,1.37),(-.4,-.08,1.74),(-.64,-.07,2.12)],[.095,.069,.03])
    curved_branch(trunk,"front-bough",[(.01,.01,1.12),(-.08,-.32,1.53),(-.12,-.53,1.9)],[.1,.065,.03])
    for angle in (.2,1.6,2.8,4.2,5.4):
        curved_branch(trunk,"buttress-root",[(0,0,.2),(math.cos(angle)*.26,math.sin(angle)*.26,.08),(math.cos(angle)*.42,math.sin(angle)*.42,.025)],[.11,.078,.018])
    oak_crown(foliage)
    finish("tree",root)


def main():
    bank_asset()
    forge_asset()
    tree_asset()


if __name__ == "__main__":
    main()
