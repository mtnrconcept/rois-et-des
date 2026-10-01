"""Export Royal Fleet as twelve compact, rigid-skinned animated GLBs.

Run on outputs/royal-fleet-jeu.blend after build_fleet.py. All original bone-
parented miniatures remain untouched; the web mesh weights every vertex to its
original bone with weight 1. Curves and modifiers are evaluated into geometry.
"""

import bpy
import json
import math
import struct
import sys
import argparse
from pathlib import Path
from mathutils import Matrix, Vector

DEST = None
OUT = None
ROLE_CODE = {"KING": "K", "QUEEN": "Q", "ROOK": "R", "BISHOP": "B", "KNIGHT": "N", "PAWN": "P"}
CLIPS = ("IDLE", "MOVE", "ATTACK", "HIT", "DEFEAT", "VICTORY")


def parse_glb(path):
    with path.open("rb") as stream:
        magic, version, size = struct.unpack("<4sII", stream.read(12))
        assert magic == b"glTF" and version == 2 and size == path.stat().st_size
        length, kind = struct.unpack("<II", stream.read(8))
        assert kind == 0x4E4F534A
        return json.loads(stream.read(length))


def clone_as_skin(source, collection):
    source.animation_data_clear()
    for bone in source.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    rig = bpy.data.objects.new("Fleet_" + source["rf_side"] + ROLE_CODE[source["rf_role"]], source.data.copy())
    collection.objects.link(rig)
    bpy.context.view_layer.update()
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    rig["rf_side"] = source["rf_side"]
    rig["rf_role"] = source["rf_role"]
    rig["rf_height"] = source["rf_height"]
    vertices, faces, face_materials, smoothing = [], [], [], []
    materials, material_indices, bone_vertices = [], {}, {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for child in source.children_recursive:
        if child.type not in {"MESH", "CURVE", "SURFACE", "FONT"}:
            continue
        evaluated = child.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        if mesh is None:
            continue
        transform = source.matrix_world.inverted() @ child.matrix_world
        start = len(vertices)
        vertices.extend(tuple(transform @ vertex.co) for vertex in mesh.vertices)
        bone = child.parent_bone or "Root"
        bone_vertices.setdefault(bone, []).extend(range(start, len(vertices)))
        local_materials = list(mesh.materials)
        for polygon in mesh.polygons:
            faces.append(tuple(start + index for index in polygon.vertices))
            evaluated_material = local_materials[polygon.material_index] if local_materials else None
            # Evaluated IDs belong to the depsgraph and must never be attached
            # to persistent meshes (that can leave dangling native pointers).
            material = bpy.data.materials.get(evaluated_material.name) if evaluated_material else None
            material_key = material.name if material else "None"
            if material_key not in material_indices:
                material_indices[material_key] = len(materials)
                materials.append(material)
            face_materials.append(material_indices[material_key])
            smoothing.append(polygon.use_smooth)
        evaluated.to_mesh_clear()
    mesh = bpy.data.meshes.new(rig.name + "_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    body = bpy.data.objects.new(rig.name + "_Mesh", mesh)
    collection.objects.link(body)
    body.parent = rig
    for material in materials:
        if material:
            mesh.materials.append(material)
    for polygon, material_index, smooth in zip(mesh.polygons, face_materials, smoothing):
        polygon.material_index = material_index
        polygon.use_smooth = smooth
    for bone, indices in bone_vertices.items():
        group = body.vertex_groups.new(name=bone)
        group.add(indices, 1.0, "REPLACE")
    modifier = body.modifiers.new("Rigid bone animation", "ARMATURE")
    modifier.object = rig
    rig.animation_data_create()
    library = json.loads(source["rf_actions"])
    for name in CLIPS:
        action = bpy.data.actions[library[name]].copy()
        action.name = "WEB_" + rig.name + "_" + name
        action.use_fake_user = False
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.name = name
        strip.extrapolation = "NOTHING"
        track.mute = True
    rig["rf_actions"] = json.dumps({track.name: track.strips[0].action.name for track in rig.animation_data.nla_tracks})
    # A named muzzle/staff socket remains available to Three.js effects.
    original_emitter = bpy.data.objects.get(source.get("rf_emitter", ""))
    emitter = None
    if original_emitter:
        emitter = original_emitter.copy()
        collection.objects.link(emitter)
        emitter.name = "Emitter"
        emitter.parent = rig
        emitter.matrix_parent_inverse = original_emitter.matrix_parent_inverse.copy()
        emitter.matrix_basis = original_emitter.matrix_basis.copy()
        emitter.hide_render = emitter.hide_viewport = False
        emitter.hide_set(False)
        rig["rf_emitter"] = emitter.name
    min_bounds = [min(vertex[index] for vertex in vertices) for index in range(3)]
    max_bounds = [max(vertex[index] for vertex in vertices) for index in range(3)]
    assert abs(min_bounds[2]) < 0.025, (source.name, min_bounds)
    assert max_bounds[2] > 0.95 and max_bounds[2] < 2.1, (source.name, max_bounds)
    return rig, body, emitter, {"vertices": len(vertices), "polygons": len(faces), "materials": len(materials), "bounds_min": min_bounds, "bounds_max": max_bounds}


def main():
    global DEST, OUT
    parser = argparse.ArgumentParser(description="Export the twelve articulated Royal Fleet pieces.")
    parser.add_argument("--base-blend", type=Path, required=True)
    parser.add_argument("--outdir", type=Path, required=True)
    parser.add_argument("--preview-dir", type=Path)
    parser.add_argument("--only-rooks", action="store_true")
    parser.add_argument("--only", help="Comma-separated piece codes, e.g. wB,wN,wP,bK,bQ,bR,bB,bN,bP")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    DEST = args.outdir.resolve()
    OUT = args.preview_dir.resolve() if args.preview_dir else None
    bpy.ops.wm.open_mainfile(filepath=str(args.base_blend.resolve()))
    DEST.mkdir(parents=True, exist_ok=True)
    source_scene = bpy.context.scene
    assets = bpy.data.collections["RF_assets"]
    assets.hide_render = assets.hide_viewport = False
    # The board and 32 instances are irrelevant to this process. Keeping them
    # alive during every animation sample wastes memory and dependency updates.
    # This is only an in-memory reduction; the input .blend is never saved.
    keep = set(assets.all_objects)
    bpy.data.batch_remove(ids=tuple(obj for obj in bpy.data.objects if obj not in keep))
    for image in bpy.data.images:
        image.use_fake_user = False
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    source_scene.frame_set(1)
    export_collection = bpy.data.collections.new("RF_web_exports")
    source_scene.collection.children.link(export_collection)
    manifest_path = DEST / "manifest.json"
    requested = set(args.only.split(",")) if args.only else set()
    valid = {side + code for side in ("w", "b") for code in ROLE_CODE.values()}
    if requested - valid:
        raise ValueError("Unknown piece codes: " + ", ".join(sorted(requested - valid)))
    partial = args.only_rooks or bool(requested)
    manifest = json.loads(manifest_path.read_text(encoding="utf8")) if partial and manifest_path.exists() else {}
    models = []
    for side in ("w", "b"):
        for role, code in ROLE_CODE.items():
            if args.only_rooks and role != "ROOK":
                continue
            if requested and side + code not in requested:
                continue
            source = bpy.data.objects["RF_ASSET_" + ("R" if side == "w" else "B") + "_" + role]
            rig, body, emitter, stats = clone_as_skin(source, export_collection)
            models.append((side, role, rig, body, emitter))
            for obj in bpy.context.view_layer.objects:
                obj.select_set(False)
            rig.select_set(True)
            body.select_set(True)
            if emitter:
                emitter.select_set(True)
            bpy.context.view_layer.objects.active = rig
            # Each NLA track is exported independently; tracks stay muted at rest.
            path = DEST / (side + code + ".glb")
            bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                     export_animations=True, export_animation_mode="ACTIONS",
                                     export_force_sampling=True, export_frame_range=False,
                                     export_reset_pose_bones=True, export_extras=True,
                                     export_anim_single_armature=False,
                                     export_draco_mesh_compression_enable=True,
                                     export_draco_mesh_compression_level=6,
                                     export_optimize_animation_keep_anim_armature=True)
            document = parse_glb(path)
            names = [animation.get("name") for animation in document.get("animations", [])]
            assert set(names) == set(CLIPS), (path, names)
            assert document.get("skins"), "The optimized mesh must remain skinned."
            assert len(document.get("meshes", [])) == 1
            stats.update({"bytes": path.stat().st_size, "animations": names,
                          "primitives": len(document["meshes"][0]["primitives"]), "file": path.name})
            manifest[side + code] = stats
            # Persist after each successful export so interrupted runs can resume.
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf8")
            print("GLB_READY", side + code, json.dumps(stats), flush=True)
            if not OUT:
                bpy.data.batch_remove(ids=tuple(obj for obj in (emitter, body, rig) if obj))
                bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    for key, stats in manifest.items():
        path = DEST / (key + ".glb")
        document = parse_glb(path)
        stats.update({"bytes": path.stat().st_size,
                      "animations": [a["name"] for a in document.get("animations", [])],
                      "draco": all("KHR_draco_mesh_compression" in p.get("extensions", {}) for p in document["meshes"][0]["primitives"])})
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf8")
    if not partial and OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        render_proof(models)
    print("FLEET_EXPORT_COMPLETE", len(manifest), sum(item["bytes"] for item in manifest.values()), flush=True)


def render_proof(models):
    proof = bpy.data.scenes.new("Royal Fleet · vérification des figurines")
    proof.render.engine = "BLENDER_EEVEE_NEXT"
    proof.render.resolution_x = 2100
    proof.render.resolution_y = 1200
    proof.render.resolution_percentage = 100
    proof.render.image_settings.file_format = "PNG"
    proof.world = bpy.data.worlds.new("RF proof world")
    proof.world.use_nodes = True
    proof.world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.04, 0.065, 1)
    proof.world.node_tree.nodes["Background"].inputs[1].default_value = 0.45
    for index, (side, role, rig, body, emitter) in enumerate(models):
        for obj in [rig, body] + ([emitter] if emitter else []):
            proof.collection.objects.link(obj)
        rig.location = ((index % 6 - 2.5) * 1.20, 0 if side == "w" else 2.0, 0)
        rig.rotation_euler.z = 0
        rig.animation_data.action = None
        for track in rig.animation_data.nla_tracks:
            track.mute = True
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
    camera_data = bpy.data.cameras.new("RF proof camera")
    camera = bpy.data.objects.new("RF proof camera", camera_data)
    proof.collection.objects.link(camera)
    camera.location = (4.4, -12.5, 7.3)
    camera.rotation_euler = (Vector((0, 1, 0.65)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 9.5
    proof.camera = camera
    for name, location, power, size, color in (
        ("Key", (1, -4, 7), 1800, 5, (1, 0.82, 0.58)),
        ("Fill", (-5, -1, 3), 1100, 4, (0.55, 0.75, 1)),
        ("Rim", (1, 6, 6), 2100, 4, (0.5, 0.75, 1)),
    ):
        data = bpy.data.lights.new("RF proof " + name, "AREA")
        data.energy, data.shape, data.size, data.color = power, "DISK", size, color
        light = bpy.data.objects.new(data.name, data)
        proof.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0, 1, 0.8)) - light.location).to_track_quat("-Z", "Y").to_euler()
    proof.render.filepath = str(OUT / "royal-fleet-12-figurines.png")
    proof.view_settings.view_transform = "AgX"
    bpy.ops.render.render(write_still=True, scene=proof.name)


if __name__ == "__main__":
    main()
