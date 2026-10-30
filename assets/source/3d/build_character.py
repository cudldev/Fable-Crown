"""Editable Alden production sample, executed by the lead through Blender MCP.

This is the source recipe, not a generated mesh baked into game code. The
resulting alden.blend is the artist's editable source of truth after generation.
Blender uses Z up/front -Y; the shared exporter converts to glTF Y up/front +Z.
"""
import math
from pipeline import reset, empty, cube, mesh, cylinder, beam, finish, uv, SWATCHES, CELL, ATLAS_SIZE


# An eight-sided section gives a deliberate broad front, tapering side planes,
# and clean silhouettes without the rectangular placeholder anatomy.
SECTION = [(-.65,-1),(.65,-1),(1,-.55),(1,.55),(.65,1),(-.65,1),(-1,.55),(-1,-.55)]


def profile(name, rings, swatch, parent, center=(0, 0, 0)):
    """rings = [(z, half_width, half_depth, optional_y_shift), ...]."""
    rings = sorted(rings, key=lambda ring: ring[0])
    vertices = []
    for ring in rings:
        z, width, depth = ring[:3]
        shift = ring[3] if len(ring) > 3 else 0
        vertices.extend((x * width, y * depth + shift, z) for x, y in SECTION)
    count = len(SECTION)
    faces = [tuple(reversed(range(count))), tuple(range((len(rings)-1)*count, len(rings)*count))]
    for i in range(len(rings)-1):
        for j in range(count):
            faces.append((i*count+j, i*count+(j+1)%count, (i+1)*count+(j+1)%count, (i+1)*count+j))
    return mesh(name, vertices, faces, swatch, parent, center)


def patch(name, points, swatch, parent, thickness=.012):
    """A shaped front patch with actual thickness instead of overlapping planes."""
    vertices = list(points) + [(x, y + thickness, z) for x, y, z in points]
    count = len(points)
    faces = [tuple(reversed(range(count))), tuple(range(count, count*2))]
    faces += [(i, (i+1)%count, (i+1)%count+count, i+count) for i in range(count)]
    return mesh(name, vertices, faces, swatch, parent)


def hair_lock(name, base, tip, width, depth, parent, swatch="hair"):
    """An asymmetric wedge with a pointed end; clumps read at gameplay scale."""
    x, y, z = base
    tx, ty, tz = tip
    points = [(x-width,y-depth,z),(x+width,y-depth,z),(x+width*.8,y+depth,z),
              (x-width*.8,y+depth,z),(x,y,z+.075),(tx,ty,tz)]
    faces = [(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)]
    return mesh(name, points, faces, swatch, parent)


def face_swatch(obj, indices, swatch):
    """Cape edging uses the same atlas and material as the blue cloth."""
    index = SWATCHES.index(swatch)
    ox, oy = index % 8 * CELL, index // 8 * CELL
    coords = [(ox+5,oy+5),(ox+19,oy+5),(ox+19,oy+19),(ox+5,oy+19)]
    layer = obj.data.uv_layers.active
    for polygon_index in indices:
        polygon = obj.data.polygons[polygon_index]
        for j, loop in enumerate(polygon.loop_indices):
            a, b = coords[j % len(coords)]
            layer.data[loop].uv = (a / ATLAS_SIZE, b / ATLAS_SIZE)


def make_cape(body):
    # Local origin is at the shoulders so runtime flap animation stays grounded.
    # A bent, slightly asymmetric hem gives volume from oblique camera views.
    points = [(-.23,0,0),(.23,0,0),(.33,.085,-.30),(.405,.17,-.76),
              (.16,.215,-.83),(-.16,.195,-.81),(-.47,.15,-.74),(-.35,.07,-.30),
              (-.205,.012,-.025),(.205,.012,-.025),(.303,.094,-.30),(.375,.178,-.73),
              (.15,.223,-.797),(-.151,.203,-.779),(-.437,.158,-.71),(-.321,.078,-.30),
              (-.025,.105,-.36)]
    # Outline band + cloth interior fan; face order deliberately outward/back.
    faces = [(i,(i+1)%8,8+(i+1)%8,8+i) for i in range(8)]
    faces += [(8+i,8+(i+1)%8,16) for i in range(8)]
    cape = mesh("cape", points, faces, "blue", body, (0,.17,1.32))
    face_swatch(cape, range(8), "gold")
    # Give cape thickness and two-sided export without a separate material.
    solid = cape.modifiers.new("Cloth thickness", "SOLIDIFY")
    solid.thickness = .012
    cape["fc_part"] = "cape"
    cape["fc_runtime_animation"] = "shoulder flap"
    return cape


def make_head(body):
    head = profile("Head_chin_and_cheeks", [
        (1.405,.105,.105,-.006),(1.455,.187,.158,-.004),
        (1.625,.216,.181,0),(1.755,.187,.16,.006),
    ], "skin", body)
    # Broad shadow planes on sides are much quieter than freckled texture noise.
    for side in (-1, 1):
        profile("Ear_" + ("L" if side < 0 else "R"), [
            (-.06,.04,.03),(0,.055,.04),(.065,.035,.032),
        ], "skin_shadow", body, (side*.22,.008,1.565))
        cube("Eye_pixel_" + ("L" if side < 0 else "R"), (side*.078,-.186,1.595), (.027,.009,.034), "black", body)
        brow = cube("Eyebrow_" + ("L" if side < 0 else "R"), (side*.079,-.181,1.635), (.047,.009,.012), "hair_dark", body)
        brow.rotation_euler.y = side * -.08
    mesh("Nose_shaped", [(-.021,-.178,1.58),(.021,-.178,1.58),(.024,-.178,1.525),
         (-.024,-.178,1.525),(0,-.218,1.538)], [(0,1,4),(1,2,4),(2,3,4),(3,0,4)], "skin", body)
    cube("Mouth_pixel", (0,-.164,1.478), (.043,.008,.011), "skin_shadow", body)
    # One deliberately swept shell replaces the repeated triangular fringe pieces.
    # The irregular lower edge follows forehead, temple and nape as one hairstyle.
    rim = [(-.17,-.175,1.685),(-.045,-.204,1.72),(.112,-.184,1.687),
           (.207,-.12,1.625),(.226,.025,1.635),(.158,.205,1.53),
           (.015,.225,1.505),(-.151,.205,1.535),(-.226,.027,1.64),(-.215,-.11,1.66)]
    upper = [(-.182,-.13,1.817),(-.066,-.164,1.861),(.09,-.141,1.85),
             (.184,-.08,1.802),(.192,.043,1.795),(.137,.185,1.79),
             (.005,.205,1.798),(-.126,.185,1.819),(-.198,.025,1.828),(-.19,-.08,1.828)]
    ridge = (-.053,.025,1.91)
    vertices = rim + upper + [ridge]
    faces = [(i,(i+1)%10,10+(i+1)%10,10+i) for i in range(10)]
    faces += [(10+i,10+(i+1)%10,20) for i in range(10)]
    hair = mesh("Hair_dominant_swept_mass", vertices, faces, "hair", body)
    face_swatch(hair, [4,5,6,7], "hair_dark")
    face_swatch(hair, [10,11,18,19], "hair_light")
    # Two supporting forms break the outline without a sawtooth crown of wedges.
    hair_lock("Swept_fringe_lock", (-.09,-.177,1.795), (.07,-.214,1.673), .115,.034,body)
    hair_lock("Temple_lock", (-.201,-.027,1.739), (-.217,-.055,1.592), .035,.049,body,"hair_dark")
    return head


def make_leg(body, side):
    name = "leftLeg" if side < 0 else "rightLeg"
    joint = empty(name, (side*.145,0,.76), body)
    joint["fc_joint"] = "hip"
    profile(name + "_trousers", [
        (-.02,.117,.124),(-.23,.108,.11),(-.35,.096,.10),(-.49,.081,.089),
    ], "slate", joint)
    # A cuff, tapered ankle, rounded polygon toe and visibly thicker sole.
    profile(name + "_boot", [
        (-.43,.094,.10,0),(-.51,.097,.105,-.004),
        (-.65,.112,.13,-.025),(-.715,.119,.165,-.055),
    ], "leather", joint)
    profile(name + "_sole", [
        (-.715,.122,.169,-.054),(-.76,.125,.172,-.054),
    ], "leather_dark", joint)
    profile(name + "_cuff", [(-.435,.101,.107),(-.48,.101,.107)], "leather_dark", joint)
    return joint


def make_arm(body, side):
    name = "leftArm" if side < 0 else "rightArm"
    joint = empty(name, (side*.295,0,1.285), body)
    joint["fc_joint"] = "shoulder"
    profile(name + "_linen_sleeve", [
        (.034,.048,.061),(.008,.083,.10),(-.085,.108,.111),(-.235,.088,.099),
    ], "linen", joint)
    profile(name + "_sleeve_cuff", [(-.22,.094,.104),(-.263,.094,.104)], "linen_shadow", joint)
    profile(name + "_forearm", [(-.263,.073,.078),(-.445,.064,.07)], "skin", joint)
    profile(name + "_glove", [(-.425,.07,.074),(-.477,.076,.079),(-.535,.065,.072)], "leather", joint)
    return joint


def make_satchel_strap(body):
    """A ribbon follows the actual tapered front/corner planes into the pouch."""
    torso_sections = [(.755,.227,.15),(.915,.205,.14),(1.17,.263,.16),(1.285,.239,.14)]

    def surface_y(x, z):
        low, high = torso_sections[0], torso_sections[-1]
        for a, b in zip(torso_sections, torso_sections[1:]):
            if a[0] <= z <= b[0]:
                low, high = a, b
                break
        t = max(0, min(1, (z-low[0]) / (high[0]-low[0])))
        width = low[1] + (high[1]-low[1])*t
        depth = low[2] + (high[2]-low[2])*t
        corner = max(0, min(1, (abs(x)/width-.65)/.35))
        return -depth*(1-.45*corner)-.004

    path = [(.188,1.25),(.137,1.205),(.055,1.145),(-.03,1.083),
            (-.115,1.023),(-.185,.97),(-.232,.94),(-.275,.918)]
    vertices = []
    for index, (x, z) in enumerate(path):
        before, after = path[max(0,index-1)], path[min(len(path)-1,index+1)]
        dx, dz = after[0]-before[0], after[1]-before[1]
        length = math.hypot(dx,dz)
        ox, oz = -dz/length*.014, dx/length*.014
        for sign in (1,-1):
            px, pz = x+ox*sign, z+oz*sign
            y = surface_y(px,pz) if index < len(path)-2 else -.089
            vertices.append((px,y,pz))
    faces = [(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(path)-1)]
    strap = mesh("Satchel_strap_front", vertices, faces, "leather", body)
    solid = strap.modifiers.new("Leather strap thickness", "SOLIDIFY")
    solid.thickness = .004
    return strap


def main():
    reset()
    root = empty("asset-alden")
    root["fc_asset_category"] = "character"
    root["fc_character"] = "Alden"
    root["fc_height_target"] = 1.92
    root["fc_role"] = "young prince / autonomous adventurer"
    root["fc_lod"] = 0
    body = empty("body", parent=root)
    # Tailored tapered silhouette with tunic flare, shoulders and a cream inset.
    torso = profile("Blue_vest_with_linen_front", [(.755,.227,.15),(.915,.205,.14),
            (1.17,.263,.16),(1.285,.239,.14)], "blue", body)
    # The cream shirt belongs to the torso surface, not floating lapel plates.
    face_swatch(torso, [2,10,18], "linen")
    face_swatch(torso, [4,12,20,8,16,24], "blue_dark")
    profile("Tunic_lower_hem", [(.76,.235,.157),(.845,.23,.151)], "blue_dark", body)
    profile("Belt", [(.833,.237,.158),(.899,.237,.158)], "leather_dark", body)
    cube("Belt_buckle", (.015,-.174,.868), (.10,.027,.078), "gold", body)
    cube("Buckle_inset", (.015,-.191,.868), (.052,.012,.039), "leather_dark", body)
    profile("Neck", [(1.27,.088,.08),(1.385,.088,.08)], "skin_shadow", body)
    patch("Collar_L", [(-.117,-.139,1.277),(-.033,-.15,1.25),(-.009,-.13,1.327)], "cream", body, .005)
    patch("Collar_R", [(.033,-.15,1.25),(.117,-.139,1.277),(.009,-.13,1.327)], "cream", body, .005)
    make_head(body)
    make_leg(body, -1)
    make_leg(body, 1)
    left_arm, right_arm = make_arm(body, -1), make_arm(body, 1)
    make_cape(body)
    # Shoulder clasps and asymmetric satchel distinguish the protagonist at scale.
    for side in (-1, 1):
        cube("Cape_shoulder_trim_" + str(side), (side*.224,.015,1.282), (.055,.25,.026), "gold", body)
    clasp = cylinder("Cape_clasp", (0,-.187,1.254), .053,.018,"gold_light",body,vertices=8)
    clasp.rotation_euler.x = math.pi / 2
    make_satchel_strap(body)
    profile("Satchel_pouch", [(-.105,.123,.083),(.075,.14,.096),(.12,.125,.081)], "leather", body, (-.292,.015,.84))
    patch("Satchel_flap", [(-.421,-.085,.93),(-.161,-.085,.93),
          (-.18,-.09,.815),(-.402,-.09,.815)], "wood_light", body)
    cube("Satchel_buckle", (-.292,-.106,.845),(.04,.025,.055),"gold",body)
    tool = empty("tool", (0,-.02,-.51), right_arm)
    tool["fc_socket"] = "right_hand_action_tool"
    # Semantic notes travel with GLB extras; no authoritative inventory is encoded.
    root["fc_required_nodes"] = "body,leftArm,rightArm,leftLeg,rightLeg,tool,cape"
    root["fc_animation_contract"] = "runtime-driven local X limb rotations; feet at ground"
    finish("alden", root)


if __name__ == "__main__":
    main()
