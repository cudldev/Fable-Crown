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
    points = [(-.245,0,0),(.245,0,0),(.34,.085,-.30),(.405,.17,-.73),
              (.18,.205,-.79),(-.12,.185,-.76),(-.39,.15,-.71),(-.33,.07,-.30),
              (-.215,.012,-.025),(.215,.012,-.025),(.306,.094,-.30),(.365,.178,-.695),
              (.166,.213,-.745),(-.11,.193,-.716),(-.35,.158,-.676),(-.296,.078,-.30),
              (0,.105,-.34)]
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
        (1.405,.115,.112,-.008),(1.455,.197,.169,-.004),
        (1.63,.224,.187,0),(1.745,.192,.163,.006),
    ], "skin", body)
    # Broad shadow planes on sides are much quieter than freckled texture noise.
    for side in (-1, 1):
        profile("Ear_" + ("L" if side < 0 else "R"), [
            (-.06,.04,.03),(0,.055,.04),(.065,.035,.032),
        ], "skin_shadow", body, (side*.228,.004,1.565))
        cube("Eye_pixel_" + ("L" if side < 0 else "R"), (side*.084,-.193,1.598), (.038,.014,.045), "black", body)
        cube("Eyebrow_" + ("L" if side < 0 else "R"), (side*.087,-.191,1.646), (.075,.018,.023), "hair_dark", body)
    mesh("Nose_shaped", [(-.025,-.185,1.59),(.025,-.185,1.59),(.03,-.187,1.52),
         (-.03,-.187,1.52),(0,-.248,1.535)], [(0,1,4),(1,2,4),(2,3,4),(3,0,4)], "skin", body)
    cube("Mouth_pixel", (0,-.179,1.478), (.065,.012,.015), "skin_shadow", body)
    # Sculpted crown: side/back volume with a swept high point, not a box cap.
    profile("Hair_crown", [
        (1.66,.226,.19,.018),(1.78,.25,.201,.015),
        (1.865,.181,.163,.036),(1.90,.07,.075,.047),
    ], "hair", body)
    profile("Hair_nape", [
        (1.51,.188,.062),(1.68,.226,.07),(1.78,.19,.06),
    ], "hair_dark", body, (0,.155,0))
    # Front fringe flows in one direction; highlights form broad locks.
    hair_lock("Fringe_left", (-.17,-.151,1.80), (-.225,-.208,1.57), .071,.055,body)
    hair_lock("Fringe_swept_1", (-.102,-.18,1.835), (-.143,-.225,1.67), .082,.052,body,"hair_light")
    hair_lock("Fringe_swept_2", (.025,-.179,1.85), (-.049,-.225,1.69), .083,.055,body)
    hair_lock("Fringe_swept_3", (.14,-.156,1.82), (.074,-.227,1.675), .079,.057,body,"hair_light")
    hair_lock("Side_lock_R", (.198,.004,1.785), (.258,-.013,1.60), .055,.082,body)
    hair_lock("Side_lock_L", (-.198,.026,1.785), (-.25,.0,1.61), .056,.083,body)
    hair_lock("Crown_wisp_1", (.078,.073,1.86), (.208,.078,1.915), .086,.066,body,"hair_light")
    hair_lock("Crown_wisp_2", (-.076,.12,1.82), (-.17,.235,1.86), .09,.063,body)
    return head


def make_leg(body, side):
    name = "leftLeg" if side < 0 else "rightLeg"
    joint = empty(name, (side*.145,0,.76), body)
    joint["fc_joint"] = "hip"
    profile(name + "_trousers", [
        (-.02,.126,.132),(-.22,.112,.116),(-.4,.093,.104),(-.49,.083,.092),
    ], "slate", joint)
    # A cuff, tapered ankle, rounded polygon toe and visibly thicker sole.
    profile(name + "_boot", [
        (-.43,.10,.106,0),(-.51,.101,.112,-.005),
        (-.65,.118,.146,-.035),(-.715,.127,.189,-.069),
    ], "leather", joint)
    profile(name + "_sole", [
        (-.715,.131,.192,-.068),(-.76,.133,.195,-.068),
    ], "leather_dark", joint)
    profile(name + "_cuff", [(-.435,.109,.117),(-.49,.109,.117)], "leather_dark", joint)
    patch(name + "_boot_front_panel", [(-.057,-.152,-.55),(.057,-.152,-.55),
          (.071,-.237,-.684),(-.071,-.237,-.684)], "wood_light", joint, .006)
    return joint


def make_arm(body, side):
    name = "leftArm" if side < 0 else "rightArm"
    joint = empty(name, (side*.335,0,1.285), body)
    joint["fc_joint"] = "shoulder"
    profile(name + "_linen_sleeve", [
        (.028,.116,.132),(-.095,.122,.125),(-.235,.094,.106),
    ], "linen", joint)
    profile(name + "_sleeve_cuff", [(-.22,.102,.112),(-.268,.102,.112)], "linen_shadow", joint)
    profile(name + "_forearm", [(-.267,.078,.085),(-.445,.068,.073)], "skin", joint)
    profile(name + "_glove", [(-.425,.075,.08),(-.475,.082,.085),(-.535,.069,.077)], "leather", joint)
    cube(name + "_glove_knuckles", (0,-.073,-.49), (.11,.03,.06), "leather_dark", joint)
    return joint


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
    profile("Blue_vest_tailored", [(.755,.235,.153),(.9,.23,.145),
            (1.17,.286,.168),(1.285,.259,.151)], "blue", body)
    patch("Linen_front_inset", [(-.108,-.157,1.252),(.108,-.157,1.252),
          (.104,-.17,.907),(-.104,-.17,.907)], "linen", body)
    patch("Vest_lapel_L", [(-.235,-.15,1.246),(-.112,-.17,1.25),
          (-.027,-.185,1.12),(-.112,-.18,1.065)], "blue_light", body)
    patch("Vest_lapel_R", [(.112,-.17,1.25),(.235,-.15,1.246),
          (.112,-.18,1.065),(.027,-.185,1.12)], "blue_light", body)
    profile("Tunic_lower_hem", [(.76,.244,.16),(.86,.24,.157)], "blue_dark", body)
    profile("Belt", [(.833,.247,.165),(.906,.247,.165)], "leather_dark", body)
    cube("Belt_buckle", (.015,-.174,.868), (.10,.027,.078), "gold", body)
    cube("Buckle_inset", (.015,-.191,.868), (.052,.012,.039), "leather_dark", body)
    profile("Neck", [(1.27,.088,.08),(1.385,.088,.08)], "skin_shadow", body)
    patch("Collar_L", [(-.13,-.145,1.28),(-.038,-.164,1.235),(-.012,-.14,1.335)], "cream", body)
    patch("Collar_R", [(.038,-.164,1.235),(.13,-.145,1.28),(.012,-.14,1.335)], "cream", body)
    make_head(body)
    make_leg(body, -1)
    make_leg(body, 1)
    left_arm, right_arm = make_arm(body, -1), make_arm(body, 1)
    make_cape(body)
    # Shoulder clasps and asymmetric satchel distinguish the protagonist at scale.
    for side in (-1, 1):
        cube("Cape_shoulder_trim_" + str(side), (side*.245,.012,1.282), (.095,.29,.04), "gold", body)
    clasp = cylinder("Cape_clasp", (0,-.187,1.254), .053,.018,"gold_light",body,vertices=8)
    clasp.rotation_euler.x = math.pi / 2
    beam("Satchel_strap_front", (.21,-.184,1.23),(-.235,-.175,.89),.04,"leather",body)
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
