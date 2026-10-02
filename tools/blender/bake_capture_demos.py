"""Bake two visual capture demonstrations; no game rules or executable panel.

Run with Blender 4.2: --python bake_capture_demos.py -- --base-blend FILE
--outdir DIR [--render-stills] [--render-video]. The source blend is never saved.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

def square_location(square):
    if len(square) != 2 or square[0] not in "abcdefgh" or square[1] not in "12345678":
        raise ValueError("Case invalide : " + str(square))
    return Vector((-3.85 + 1.10 * (ord(square[0]) - 97), -3.85 + 1.10 * (int(square[1]) - 1), 1.56))

def _collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col

def _link_only(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)

def _key(obj, path, frame):
    obj.keyframe_insert(data_path=path, frame=frame)

def _material(name, color, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = 0.36 if metallic else 0.7
    bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = (*color, 1)
    return mat

def _effect(obj, name, mat, move_id):
    obj.name = "RF_VFX_" + name
    obj["rf_effect"] = True
    obj["rf_move_id"] = move_id
    _link_only(obj, _collection("RF_VFX"))
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
    return obj

def _sphere(name, center, radius, mat, move_id, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=center)
    obj = _effect(bpy.context.object, name, mat, move_id)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

def _ring(name, center, radius, mat, move_id, vertical=False):
    bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=6, location=center,
                                   major_radius=radius, minor_radius=0.022)
    obj = _effect(bpy.context.object, name, mat, move_id)
    if vertical:
        obj.rotation_euler.x = math.pi / 2
    return obj

def _line(name, points, bevel, mat, move_id):
    curve = bpy.data.curves.new("RF_VFX_curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    origin = Vector(points[0])
    for point, co in zip(spline.points, points):
        point.co = (*(Vector(co) - origin), 1)
    obj = bpy.data.objects.new("RF_VFX_curve", curve)
    obj.location = origin
    _collection("RF_VFX").objects.link(obj)
    return _effect(obj, name, mat, move_id)

def _life(obj, start, peak, end, maximum=1.0):
    """Scale keys make baked effects visible only in their actual time window."""
    for frame, scale in ((1, 0), (start - 1, 0), (start, 0.015), (peak, maximum), (end, 0), (end + 1, 0)):
        obj.scale = (scale,) * 3
        _key(obj, "scale", frame)

def _pose(rig, bone_name, frames, component="rotation_euler"):
    bone = rig.pose.bones.get(bone_name)
    if bone is None:
        return
    bone.rotation_mode = "XYZ"
    for frame, value in frames:
        setattr(bone, component, value)
        _key(bone, component, frame)

def _emitter(rig, fallback):
    bpy.context.view_layer.update()
    obj = bpy.data.objects.get(rig.get("rf_emitter", ""))
    return obj.matrix_world.translation.copy() if obj else Vector(fallback)

def _impact(center, mat, frame, move_id, style="magic"):
    center = Vector(center)
    rng = random.Random(move_id * 101 + frame)
    for idx in range(3):
        ring = _ring("impact_ring", center + Vector((0, 0, idx * 0.13)), 0.24, mat, move_id)
        _life(ring, frame + idx * 2, frame + 10 + idx * 2, frame + 26, 3.2 + idx)
    for idx in range(14):
        angle = rng.uniform(0, math.tau)
        direction = Vector((math.cos(angle), math.sin(angle), rng.uniform(0.2, 1.1)))
        obj = _sphere("impact_spark", center, rng.uniform(0.025, 0.065), mat, move_id, 1)
        obj.location = center
        _key(obj, "location", frame)
        obj.location = center + direction * rng.uniform(0.65, 1.5)
        _key(obj, "location", frame + 18)
        obj.location.z -= 0.3
        _key(obj, "location", frame + 28)
        _life(obj, frame, frame + 3, frame + 29)
    if style == "cannon":
        smoke = _material("RF FX Smoke", (0.14, 0.16, 0.19))
        for idx in range(8):
            obj = _sphere("impact_smoke", center, 0.12, smoke, move_id)
            obj.location = center + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0))
            _key(obj, "location", frame)
            obj.location += Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0.7))
            _key(obj, "location", frame + 27)
            _life(obj, frame, frame + 12, frame + 34, 2.3)

def _capture_effect(rig, victim, start, move_id, target):
    role, side = rig["rf_role"], rig["rf_side"]
    origin = rig.location.copy()
    target = Vector(target) + Vector((0, 0, 0.75))
    gold = _material("RF FX Solar Gold", (1.0, 0.42, 0.035), 0.45, 4)
    red = _material("RF FX Ruby Magic", (1.0, 0.035, 0.025), 0.1, 7)
    blue = _material("RF FX Azure Magic", (0.025, 0.45, 1.0), 0.1, 6)
    mat = red if side == "w" else blue
    impact_frame = start + 46
    facing = math.atan2(target.x - origin.x, -(target.y - origin.y))
    rest_yaw = math.pi if side == "w" else 0
    for frame, yaw in ((start, rest_yaw), (start + 14, facing), (start + 60, facing), (start + 85, rest_yaw)):
        rig.rotation_euler = (0, 0, yaw)
        _key(rig, "rotation_euler", frame)
    # Evaluate the aimed bone-parented emitter before constructing the projectile.
    old_frame = bpy.context.scene.frame_current
    bpy.context.scene.frame_set(start + 18)
    muzzle = _emitter(rig, origin + Vector((0, 0, 1.1)))
    bpy.context.scene.frame_set(old_frame)

    if role == "ROOK" and side == "b":
        iron = _material("RF FX Cannon Iron", (0.022, 0.028, 0.042), 0.85)
        _pose(rig, "Barrel", [(start, (0, 0, 0)), (start + 22, (0, 0, 0)),
                              (start + 25, (0, 0.15, 0)), (start + 38, (0, 0, 0))], "location")
        obj = _sphere("cannonball", muzzle, 0.145, iron, move_id, 3)
        for frame, point in ((start + 23, muzzle), (start + 34, muzzle.lerp(target, 0.5) + Vector((0, 0, 0.34))), (impact_frame, target)):
            obj.location = point
            _key(obj, "location", frame)
        _life(obj, start + 23, start + 24, impact_frame + 1)
        flash = _sphere("muzzle_flash", muzzle, 0.26, gold, move_id)
        _life(flash, start + 22, start + 24, start + 30)
        smoke = _material("RF FX Smoke", (0.14, 0.16, 0.19))
        for idx in range(7):
            puff = _sphere("muzzle_smoke", muzzle, 0.1, smoke, move_id)
            puff.location = muzzle
            _key(puff, "location", start + 24 + idx)
            puff.location = muzzle + Vector(((idx - 3) * 0.07, (idx % 2 - 0.5) * 0.3, 0.4 + idx * 0.07))
            _key(puff, "location", start + 49)
            _life(puff, start + 24 + idx, start + 37, start + 57, 1.7)
        _impact(target, gold, impact_frame, move_id, "cannon")
    elif role == "QUEEN":
        _pose(rig, "Arm.L", [(start, (0, 0, 0)), (start + 16, (0.0, -0.25, -0.34)),
                             (start + 31, (-0.15, -0.1, -0.18)), (start + 65, (0, 0, 0))])
        _pose(rig, "Weapon", [(start, (0, 0, 0)), (start + 18, (0.12, 0, -0.08)), (start + 59, (0, 0, 0))])
        orb = _sphere("queen_energy_orb", muzzle, 0.17, mat, move_id, 3)
        orb.location = muzzle
        _key(orb, "location", start + 26)
        orb.location = muzzle.lerp(target, 0.5) + Vector((0, 0, 0.45))
        _key(orb, "location", start + 36)
        orb.location = target
        _key(orb, "location", impact_frame)
        _life(orb, start + 12, start + 24, impact_frame + 2, 1.5)
        for idx in range(16):
            t = idx / 15
            point = muzzle.lerp(target, t) + Vector((0, 0, math.sin(t * math.pi) * 0.45))
            spark = _sphere("queen_comet_trail", point, 0.07, gold if idx % 3 == 0 else mat, move_id)
            frame = start + 27 + round(t * 19)
            _life(spark, frame, frame + 2, frame + 11)
        halo = _ring("queen_charge_halo", muzzle, 0.24, gold, move_id, True)
        _life(halo, start + 10, start + 22, start + 29, 1.5)
        _impact(target, mat, impact_frame, move_id)
    elif role == "BISHOP":
        _pose(rig, "Arm.L", [(start, (0, 0, 0)), (start + 19, (-0.38, 0, -0.22)), (start + 65, (0, 0, 0))])
        _pose(rig, "Arm.R", [(start, (0, 0, 0)), (start + 19, (-0.38, 0, 0.22)), (start + 65, (0, 0, 0))])
        for idx in range(3):
            halo = _ring("astrolabe" if side == "b" else "solar_seal", origin + Vector((0, 0, 1.0)), 0.30 + 0.09 * idx, gold if side == "w" else mat, move_id, idx % 2 == 0)
            _life(halo, start + 8 + idx * 3, start + 25, start + 42, 1.25)
            halo.rotation_euler.z = 0
            _key(halo, "rotation_euler", start + 8)
            halo.rotation_euler.z = math.pi * 1.4
            _key(halo, "rotation_euler", start + 42)
        for idx in range(4):
            offset = Vector((math.cos(idx * math.pi / 2) * 0.16, math.sin(idx * math.pi / 2) * 0.16, 0))
            ray = _line("bishop_rune_ray", [muzzle + offset, target + offset], 0.018, gold if side == "w" else mat, move_id)
            _life(ray, start + 34, start + 39, impact_frame + 5)
        _impact(target, gold if side == "w" else mat, impact_frame, move_id)
    elif role == "ROOK":
        # The red fortress projects a golden battering seal; blue uses ballistics.
        for idx in range(5):
            point = origin.lerp(target, idx / 4)
            point.z = 1.72
            seal = _ring("fortress_battering_seal", point, 0.42, gold, move_id)
            _life(seal, start + 24 + idx * 4, start + 29 + idx * 4, start + 40 + idx * 4, 1.2)
        _pose(rig, "Body", [(start, (0, 0, 0)), (start + 26, (0, 0, -0.07)), (start + 35, (0, 0, 0))], "location")
        _impact(target, gold, impact_frame, move_id)
    elif role == "KING":
        _pose(rig, "Arm.R", [(start, (0, 0, 0)), (start + 20, (-0.7, 0, 0.3)),
                             (start + 37, (0.2, 0, -0.6)), (start + 64, (0, 0, 0))])
        _pose(rig, "Weapon", [(start, (0, 0, 0)), (start + 20, (0, -0.7, 0)), (start + 42, (0, 0.9, 0)), (start + 66, (0, 0, 0))])
        for idx in range(3):
            pulse = _ring("royal_shockwave" if side == "w" else "admiral_cutlass_wave", origin + Vector((0, 0, 0.22 + idx * 0.14)), 0.33, gold if side == "w" else blue, move_id)
            _life(pulse, start + 24 + idx * 3, start + 39, start + 49, 3)
        _impact(target, gold if side == "w" else blue, impact_frame, move_id)
    elif role == "KNIGHT":
        _pose(rig, "Body", [(start, (0, 0, 0)), (start + 21, (-0.18, 0, 0)), (start + 48, (0, 0, 0))])
        for idx in range(8):
            t = idx / 7
            point = origin.lerp(target, t) + Vector((0, 0, math.sin(t * math.pi) * 0.8))
            spark = _sphere("knight_charge_trail", point, 0.06, gold if side == "w" else blue, move_id)
            _life(spark, start + 16 + idx * 4, start + 20 + idx * 4, start + 34 + idx * 4)
        _impact(target, gold if side == "w" else blue, impact_frame, move_id)
    else:
        _pose(rig, "Arm.R", [(start, (0, 0, 0)), (start + 21, (-0.45, 0, 0.25)),
                             (start + 35, (0.35, 0, -0.45)), (start + 65, (0, 0, 0))])
        _pose(rig, "Weapon", [(start, (0, 0, 0)), (start + 30, (0.2, 0, 0.4)), (start + 42, (-0.1, 0, -0.5)), (start + 65, (0, 0, 0))])
        arc_points = [target + Vector((math.cos(i * math.pi / 10) * 0.46, 0, math.sin(i * math.pi / 10) * 0.46)) for i in range(11)]
        slash = _line("guard_sword_slash" if side == "w" else "corsair_cutlass_slash", arc_points, 0.026, gold if side == "w" else blue, move_id)
        _life(slash, start + 34, start + 40, start + 50)
        _impact(target, gold if side == "w" else blue, impact_frame, move_id)
    return impact_frame

def _vanish(rig, frame):
    old = rig.location.copy()
    scale = Vector(rig.get("rf_rest_scale", (1, 1, 1)))
    for f, location, factor in ((frame - 1, old, 1), (frame + 8, old + Vector((0, 0, 0.24)), 0.85),
                                (frame + 24, old - Vector((0, 0, 0.7)), 0.1), (frame + 30, old - Vector((0, 0, 2.2)), 0)):
        rig.location = location
        rig.scale = scale * factor
        _key(rig, "location", f)
        _key(rig, "scale", f)
    rig["rf_active"] = False
    rig["rf_square"] = ""

def _travel(rig, origin, destination, start, capture=False):
    role = rig["rf_role"]
    if role == "KNIGHT":
        lift_start, land = start + 16, start + (48 if capture else 63)
        waypoints = [(start, origin), (lift_start, origin),
                     ((lift_start + land) // 2, origin.lerp(destination, 0.5) + Vector((0, 0, 1.1))),
                     (land, destination), (start + 90, destination)]
    elif role in {"KING", "PAWN"} and capture:
        approach = origin.lerp(destination, 0.67)
        waypoints = [(start, origin), (start + 28, approach), (start + 50, approach), (start + 84, destination)]
    else:
        depart = start + (60 if capture else 8)
        waypoints = [(start, origin), (depart, origin), (depart + 12, origin + Vector((0, 0, 0.07))),
                     (start + 86, destination), (start + 94, destination)]
    for frame, point in waypoints:
        rig.location = point
        _key(rig, "location", frame)
    # A restrained cape sway and breathing bob preserve the collectible silhouette.
    _pose(rig, "Cape", [(start, (0, 0, 0)), (start + 34, (0.10, 0, 0.06)), (start + 77, (-0.03, 0, -0.04)), (start + 94, (0, 0, 0))])
    _pose(rig, "Head", [(start, (0, 0, 0)), (start + 32, (0.03, 0, 0.08)), (start + 80, (0, 0, 0))])

def _linear_effects(move_id):
    # Constant visibility endpoints avoid negative or lingering scales from splines.
    for obj in bpy.data.objects:
        if obj.get("rf_effect") and obj.get("rf_move_id") == move_id and obj.animation_data and obj.animation_data.action:
            for fc in obj.animation_data.action.fcurves:
                for key in fc.keyframe_points:
                    key.interpolation = "LINEAR"


def bake_demo(base_blend, outdir, name, stills=False, video=False):
    bpy.ops.wm.open_mainfile(filepath=str(base_blend))
    scene = bpy.context.scene
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE" and obj.get("rf_piece") and not obj.get("rf_prototype")]
    if name == "canon":
        attacker_name, victim_name, origin, destination = "RF_B_ROOK_1", "RF_R_KNIGHT_1", "c6", "c3"
    else:
        attacker_name, victim_name, origin, destination = "RF_R_QUEEN_1", "RF_B_BISHOP_1", "d3", "d6"
    attacker, victim = bpy.data.objects[attacker_name], bpy.data.objects[victim_name]
    # Demonstrations deliberately use a light studio stage. The source board
    # stays untouched on disk; expensive surrounding architecture is unnecessary.
    squares = [obj for obj in bpy.data.objects if obj.name.startswith("Case ") and len(obj.name) == 7]
    ivory = _material("RF Demo Ivory", (0.65, 0.53, 0.33), 0.12)
    ebony = _material("RF Demo Ebony", (0.028, 0.040, 0.054), 0.25)
    for obj in squares:
        square = obj.name[5:].lower()
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(ebony if (ord(square[0]) - 97 + int(square[1]) - 1) % 2 == 0 else ivory)
    keep = {attacker, victim, *attacker.children_recursive, *victim.children_recursive, *squares}
    bpy.data.batch_remove(ids=tuple(obj for obj in bpy.data.objects if obj not in keep))
    rigs = [attacker, victim]
    for image in bpy.data.images:
        image.use_fake_user = False
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    scene.world = bpy.data.worlds.new("RF Demo Studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.022, 0.035, 0.065, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.4
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.27))
    plinth = bpy.context.object
    plinth.name = "RF Demo Board Foundation"
    plinth.scale = (9.0, 9.0, 0.35)
    plinth.data.materials.append(_material("RF Demo Brass", (0.5, 0.26, 0.07), 0.72))
    for label, location, energy, color in (("Key", (0, -4, 10), 1700, (1.0, 0.83, 0.6)),
                                             ("Fill", (-5, 0, 6), 950, (0.5, 0.7, 1.0)),
                                             ("Rim", (2, 5, 8), 1900, (0.6, 0.8, 1.0))):
        data = bpy.data.lights.new("RF Demo " + label, "AREA")
        data.energy, data.size, data.color = energy, 5, color
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0, 0, 2)) - light.location).to_track_quat("-Z", "Y").to_euler()
    for rig in rigs:
        rig.animation_data_clear()
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        for obj in [rig] + list(rig.children_recursive):
            obj.animation_data_clear()
            obj.hide_render = obj.hide_viewport = rig not in (attacker, victim)
            obj.hide_set(rig not in (attacker, victim))
    for rig, square in ((attacker, origin), (victim, destination)):
        rig.location = square_location(square)
        rig.rotation_euler = (0, 0, math.pi if rig["rf_side"] == "w" else 0)
        rig.scale = (1, 1, 1)
        rig["rf_rest_scale"] = [1, 1, 1]
        _key(rig, "location", 1)
        _key(rig, "rotation_euler", 1)
        _key(rig, "scale", 1)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    impact = _capture_effect(attacker, victim, 1, 1, square_location(destination))
    _vanish(victim, impact)
    _travel(attacker, square_location(origin), square_location(destination), 1, capture=True)
    _linear_effects(1)
    for label, frame in (("Préparation", 1), ("Tir / libération de l'orbe", 24), ("Impact", impact), ("Prise de position", 75), ("Fin", 105)):
        scene.timeline_markers.new(label, frame=frame)
    scene["rf_visual_demo"] = json.dumps({"name": name, "attacker": attacker_name, "victim": victim_name,
                                           "from": origin, "to": destination, "impact_frame": impact,
                                           "note": "Animation de capture uniquement. Les règles canoniques restent dans le jeu web."})
    for key in ("rf_fen", "rf_history", "rf_initial_fen"):
        if key in scene:
            del scene[key]
    for text_name in ("fleet_rules.py", "DEMARRER_ROYAL_FLEET.py"):
        text = bpy.data.texts.get(text_name)
        if text:
            bpy.data.texts.remove(text)
    note = bpy.data.texts.new("LIRE MOI • Démonstration de capture")
    note.write("Animation précalculée, sans script automatique ni moteur de règles.\nEspace pour lire la timeline, images 1–112 à 24 images/seconde.\nCanon : visée, recul, boulet, fumée et impact.\nMagie : canne, charge lumineuse, orbe, traînée et anneaux.\nToutes les courbes d'animation et tous les effets sont modifiables.\n")
    camera_data = bpy.data.cameras.new("RF demo camera")
    camera = bpy.data.objects.new("RF demo camera", camera_data)
    _collection("RF_controls").objects.link(camera)
    target = square_location(origin).lerp(square_location(destination), 0.5) + Vector((0, 0, 0.65))
    camera.location = target + Vector((6.0, -9.0, 9.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 7.3
    scene.camera = camera
    scene.frame_start, scene.frame_end, scene.render.fps = 1, 112, 24
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100
    scene.render.image_settings.file_format = "PNG"
    scene.frame_set(1)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.region_3d.view_camera_zoom = 12
    blend_path = outdir / ("royal-fleet-demo-" + name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    # Geometry, keyframe ranges and an evaluated projectile are checked before delivery.
    projectile_prefix = "RF_VFX_cannonball" if name == "canon" else "RF_VFX_queen_energy_orb"
    projectile = next(obj for obj in bpy.data.objects if obj.name.startswith(projectile_prefix))
    scene.frame_set(35)
    assert projectile.scale.length > 0.1
    assert attacker.animation_data and victim.animation_data
    print("DEMO_BLEND_READY", str(blend_path), "impact", impact, flush=True)
    if stills:
        scene.render.filepath = str(outdir / ("royal-fleet-demo-" + name + ".png"))
        bpy.ops.render.render(write_still=True)
    if video:
        scene.render.image_settings.file_format = "FFMPEG"
        scene.render.ffmpeg.format = "MPEG4"
        scene.render.ffmpeg.codec = "H264"
        scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
        scene.render.ffmpeg.ffmpeg_preset = "GOOD"
        scene.render.filepath = str(outdir / ("royal-fleet-demo-" + name + ".mp4"))
        bpy.ops.render.render(animation=True)


def main():
    parser = argparse.ArgumentParser(description="Bake editable cannon and magic capture demonstrations.")
    parser.add_argument("--base-blend", type=Path, required=True)
    parser.add_argument("--outdir", type=Path, required=True)
    parser.add_argument("--render-stills", action="store_true")
    parser.add_argument("--render-video", action="store_true")
    parser.add_argument("--demo", choices=("canon", "magie", "both"), default="both")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    outdir, base = args.outdir.resolve(), args.base_blend.resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    for name in ("canon", "magie") if args.demo == "both" else (args.demo,):
        bake_demo(base, outdir, name, args.render_stills, args.render_video)


if __name__ == "__main__":
    main()
