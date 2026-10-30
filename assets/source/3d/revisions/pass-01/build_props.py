"""Editable Oakrest prop samples. Execute through BlenderMCP only.

One metre per tile, Blender Z-up, front -Y. Uses the environment sample's
shared atlas material; exports anvil/crate/lantern through pipeline.finish().
"""
import math
from pipeline import reset, empty, cube, mesh, cylinder, beam, finish


def anvil_asset():
    reset()
    root = empty("asset-anvil")
    stump = empty("OakStump", parent=root)
    iron = empty("ForgedAnvil", parent=root)
    sides = 9
    rings = [(.29,0),(.3,.15),(.265,.47),(.27,.55)]
    vertices = [(math.cos(i*math.tau/sides)*radius,
                 math.sin(i*math.tau/sides)*radius,z)
                for radius,z in rings for i in range(sides)]
    faces = [tuple(reversed(range(sides))), tuple(range((len(rings)-1)*sides,len(rings)*sides))]
    faces += [(ring*sides+i,ring*sides+(i+1)%sides,(ring+1)*sides+(i+1)%sides,(ring+1)*sides+i)
              for ring in range(len(rings)-1) for i in range(sides)]
    mesh("faceted-stump-bark",vertices,faces,"bark",stump)
    cylinder("cut-stump-top",(0,0,.56),.255,.025,"wood_light",stump,vertices=sides)
    for x,y in ((-.18,-.18),(.19,-.13),(-.15,.18)):
        beam("stump-fixing-staple",(x,y,.47),(x,y,.61),.035,"iron",stump)
    cube("anvil-foot",(-.065,0,.615),(.53,.4,.075),"iron",iron,bevel=.018)
    # Broad-to-narrow-to-broad profile makes the silhouette legible at gameplay scale.
    vertices = [(-.27,-.17,.65),(.14,-.17,.65),(.14,.17,.65),(-.27,.17,.65),
                (-.19,-.11,.77),(.07,-.11,.77),(.07,.11,.77),(-.19,.11,.77),
                (-.235,-.15,.91),(.145,-.15,.91),(.145,.15,.91),(-.235,.15,.91)]
    faces = [(0,3,2,1),(8,9,10,11)]
    faces += [(ring*4+i,ring*4+(i+1)%4,(ring+1)*4+(i+1)%4,(ring+1)*4+i)
              for ring in range(2) for i in range(4)]
    mesh("sculpted-anvil-waist",vertices,faces,"iron",iron)
    cube("anvil-flat-face",(-.06,0,.96),(.6,.34,.12),"iron_light",iron,bevel=.016)
    # Tapered, slightly rounded horn rather than a cube projection.
    vertices = [(.225,-.12,.915),(.225,.12,.915),(.225,.14,.985),(.225,.08,1.02),
                (.225,-.08,1.02),(.225,-.14,.985),(.49,0,.985)]
    faces = [(i,(i+1)%6,6) for i in range(6)] + [(5,4,3,2,1,0)]
    mesh("anvil-tapered-horn",vertices,faces,"iron",iron)
    cube("square-hardy-hole",(-.23,-.005,1.024),(.06,.065,.006),"black",iron)
    finish("anvil",root)


def crate_asset():
    reset()
    root = empty("asset-crate")
    boards = empty("PlankShell",parent=root)
    frame = empty("CornerFrame",parent=root)
    braces = empty("BracesAndFixings",parent=root)
    # Slightly proud corner posts and end grain keep the outline crafted, not perfect-cube.
    for x in (-.335,.335):
        for y in (-.3,.3):
            post = cube("corner-post",(x,y,.385),(.095,.095,.77),"wood_dark",frame,bevel=.012)
            post.rotation_euler.z = -.018 if x*y > 0 else .018
            cube("post-cut-end",(x,y,.774),(.075,.075,.012),"wood_light",frame)
    for y in (-.31,.31):
        for index in range(4):
            x=-.252+index*.168
            cube("front-back-plank",(x,y,.391),(.16,.06,.59),"wood" if index%2 else "wood_light",boards)
        for z in (.11,.665):
            cube("horizontal-end-rail",(0,y*1.13,z),(.735,.06,.085),"wood",frame)
    for x in (-.34,.34):
        for index in range(3):
            cube("side-plank",(x,0,.207+index*.184),(.06,.58,.175),"wood",boards)
    for index in range(4):
        cube("lid-plank",(-.252+index*.168,0,.731),(.16,.59,.055),"wood_light" if index==1 else "wood",boards)
    cube("crate-base",(0,0,.085),(.68,.6,.11),"wood_dark",boards)
    beam("front-diagonal-brace",(-.285,-.387,.16),(.285,-.387,.62),.075,"wood_light",braces)
    beam("rear-diagonal-brace",(.285,.387,.16),(-.285,.387,.62),.065,"wood",braces)
    for x,z in ((-.275,.17),(.275,.61)):
        nail = cylinder("square-iron-nail",(x,-.432,z),.018,.012,"iron",braces,vertices=4)
        nail.rotation_euler.x=math.pi/2
    finish("crate",root)


def lantern_asset():
    reset()
    root=empty("asset-lantern")
    stand=empty("HookStand",parent=root)
    body=empty("LanternFrame",(.18,0,.7),root)
    # Stand makes this sample immediately placeable at ground level; the lantern group
    # remains separately editable/reusable for a wall or a ceiling mounting.
    cube("stand-stone-foot",(-.2,0,.08),(.31,.3,.16),"stone_dark",stand,bevel=.02)
    beam("iron-upright",(-.2,0,.13),(-.2,0,1.2),.065,"iron",stand)
    beam("hook-upper-curve",(-.2,0,1.2),(-.09,0,1.29),.052,"iron",stand)
    beam("hook-bridge",(-.09,0,1.29),(.16,0,1.29),.052,"iron",stand)
    beam("hook-downturn",(.16,0,1.29),(.21,0,1.21),.052,"iron",stand)
    beam("lantern-hanger",(.18,0,1.2),(.18,0,1.06),.03,"iron",stand)
    cube("lower-iron-tray",(0,0,-.245),(.34,.33,.07),"iron",body,bevel=.012)
    cube("upper-iron-frame",(0,0,.205),(.34,.33,.06),"iron",body,bevel=.012)
    for x in (-.145,.145):
        for y in (-.14,.14):
            cube("corner-frame-post",(x,y,-.015),(.027,.027,.42),"iron",body)
    for y in (-.136,.136):
        cube("window-glass",(0,y,-.015),(.26,.012,.39),"window",body)
    for x in (-.141,.141):
        cube("window-glass",(x,0,-.015),(.012,.26,.39),"window",body)
    vertices=[(-.2,-.19,.235),(.2,-.19,.235),(.2,.19,.235),(-.2,.19,.235),
              (-.075,-.07,.36),(.075,-.07,.36),(.075,.07,.36),(-.075,.07,.36)]
    mesh("pitched-iron-cap",vertices,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],"iron",body)
    cube("vent-cap",(0,0,.38),(.18,.17,.055),"iron",body,bevel=.012)
    beam("front-pane-crossbar",(-.13,-.153,-.13),(.13,-.153,.11),.018,"iron",body)
    marker=empty("light-window",(.18,-.11,.69),root)
    marker["kind"]="lantern"
    marker["color"]="ffce8b"
    marker["intensity"]=4
    marker["distance"]=4
    marker["castShadow"]=False
    finish("lantern",root)


def main():
    anvil_asset()
    crate_asset()
    lantern_asset()


if __name__ == "__main__":
    main()
