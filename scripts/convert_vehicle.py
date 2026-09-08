import bpy
import os
import sys


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.meshes, bpy.data.images):
        for item in list(collection):
            collection.remove(item)


def import_source(source):
    if source.lower().endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=source)
    elif source.lower().endswith(".obj"):
        reset_scene()
        bpy.ops.wm.obj_import(filepath=source)
    elif source.lower().endswith(".fbx"):
        reset_scene()
        bpy.ops.import_scene.fbx(filepath=source)
    elif source.lower().endswith((".glb", ".gltf")):
        reset_scene()
        bpy.ops.import_scene.gltf(filepath=source)
    else:
        raise RuntimeError(f"Unsupported source format: {source}")


def simplify_meshes(target_faces):
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    total_faces = sum(len(obj.data.polygons) for obj in meshes)
    if total_faces <= target_faces:
        return total_faces

    ratio = max(0.01, min(1.0, target_faces / total_faces))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        if len(obj.data.polygons) < 200:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new(name="GameDecimate", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    return sum(len(obj.data.polygons) for obj in meshes)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError("Usage: convert_vehicle.py -- <source> <destination> <target_faces>")

    source, destination, target_faces = arguments
    import_source(source)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    face_count = simplify_meshes(int(target_faces))
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath) if False else None
    bpy.ops.export_scene.gltf(
        filepath=destination,
        export_format="GLB",
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_yup=True,
    )
    print(f"Exported {destination} with {face_count} faces")


if __name__ == "__main__":
    main()
