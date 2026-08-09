"""CutSteward's only admitted Blender driver.

This file intentionally creates its scene procedurally. It never opens a .blend
file, imports another Python module from a job, or executes user-authored code.
"""

import hashlib
import json
import math
import os
import platform
import struct
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector


ADAPTER_ID = "blender.local_compositor"
ADAPTER_VERSION = "1.0"
SCHEMA_VERSION = 1
LIMITS = {
    "minimum_dimension": 64,
    "maximum_dimension": 7680,
    "maximum_pixels": 33_177_600,
    "minimum_fps": 1,
    "maximum_fps": 60,
    "maximum_frames": 1_800,
    "minimum_timeout_ms": 5_000,
    "maximum_timeout_ms": 30 * 60 * 1_000,
    "maximum_samples": 256,
    "maximum_job_bytes": 256 * 1024,
    "maximum_input_bytes": 512 * 1024 * 1024,
}
SHA256_LENGTH = 64
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}


class ContractError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise ContractError(message)


def exact_keys(value, allowed, label):
    require(isinstance(value, dict), f"{label} must be an object")
    unknown = sorted(set(value.keys()) - set(allowed))
    if unknown:
        raise ContractError(f"{label}.{unknown[0]} is not admitted by the device-stage contract")


def bounded_integer(value, minimum, maximum, label):
    require(isinstance(value, int) and not isinstance(value, bool), f"{label} must be an integer")
    require(minimum <= value <= maximum, f"{label} is outside its admitted bound")
    return value


def expected_sha(value, label):
    require(isinstance(value, str) and len(value) == SHA256_LENGTH, f"{label} must be a SHA-256 digest")
    normalized = value.lower()
    require(all(character in "0123456789abcdef" for character in normalized), f"{label} must be a SHA-256 digest")
    return normalized


def sha256_path(file_path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def contained(root, candidate, label, allow_root=False):
    try:
        common = os.path.commonpath([str(root), str(candidate)])
    except ValueError as error:
        raise ContractError(f"{label} escapes projectRoot") from error
    require(common == str(root), f"{label} escapes projectRoot")
    if not allow_root:
        require(str(candidate) != str(root), f"{label} must be below projectRoot")


def reject_symlink_components(root, candidate, label):
    relative = os.path.relpath(str(candidate), str(root))
    if relative == ".":
        return
    current = root
    for component in Path(relative).parts:
        current = current / component
        require(current.exists(), f"{label} does not exist")
        require(not current.is_symlink(), f"{label} contains a symbolic link")


def resolve_existing_file(root, raw_path, label, suffixes=None):
    require(isinstance(raw_path, str) and raw_path and "\x00" not in raw_path, f"{label} must be a local path")
    lexical = Path(raw_path) if os.path.isabs(raw_path) else root / raw_path
    lexical = Path(os.path.abspath(os.path.normpath(str(lexical))))
    contained(root, lexical, label)
    reject_symlink_components(root, lexical, label)
    require(lexical.is_file() and not lexical.is_symlink(), f"{label} must be a regular file")
    require(lexical.stat().st_size <= LIMITS["maximum_input_bytes"], f"{label} exceeds its byte bound")
    if suffixes is not None:
        require(lexical.suffix.lower() in suffixes, f"{label} is not an admitted image")
    actual = Path(os.path.realpath(lexical))
    contained(root, actual, label)
    return actual


def resolve_output_directory(root, raw_path):
    require(isinstance(raw_path, str) and raw_path and "\x00" not in raw_path, "output.directory must be a local path")
    lexical = Path(raw_path) if os.path.isabs(raw_path) else root / raw_path
    lexical = Path(os.path.abspath(os.path.normpath(str(lexical))))
    contained(root, lexical, "output.directory")
    reject_symlink_components(root, lexical, "output.directory")
    require(lexical.is_dir() and not lexical.is_symlink(), "output.directory must already be a real directory")
    actual = Path(os.path.realpath(lexical))
    contained(root, actual, "output.directory")
    return actual


def parse_arguments(argv):
    require("--" in argv, "trusted driver requires Blender's -- separator")
    arguments = argv[argv.index("--") + 1 :]
    require(len(arguments) == 2 and arguments[0] == "--job", "trusted driver accepts exactly --job ABSOLUTE_JSON")
    job_path = arguments[1]
    require(os.path.isabs(job_path), "--job must be absolute")
    require(Path(job_path).suffix.lower() == ".json", ".blend files and arbitrary Python are forbidden")
    return Path(os.path.normpath(job_path))


def normalize_job(document):
    exact_keys(document, ["schemaVersion", "projectRoot", "jobId", "screen", "output", "render", "scene"], "job")
    require(document.get("schemaVersion") == SCHEMA_VERSION, f"schemaVersion must be {SCHEMA_VERSION}")
    require(isinstance(document.get("projectRoot"), str) and os.path.isabs(document["projectRoot"]), "projectRoot must be absolute")
    require(isinstance(document.get("jobId"), str) and 1 <= len(document["jobId"]) <= 64, "jobId is invalid")
    require(all(character.isalnum() or character in "._-" for character in document["jobId"]), "jobId is invalid")

    render = document.get("render")
    exact_keys(render, ["width", "height", "fps", "startFrame", "endFrame", "timeoutMs", "samples"], "render")
    bounded_integer(render.get("width"), LIMITS["minimum_dimension"], LIMITS["maximum_dimension"], "render.width")
    bounded_integer(render.get("height"), LIMITS["minimum_dimension"], LIMITS["maximum_dimension"], "render.height")
    require(render["width"] * render["height"] <= LIMITS["maximum_pixels"], "render pixel count exceeds its bound")
    bounded_integer(render.get("fps"), LIMITS["minimum_fps"], LIMITS["maximum_fps"], "render.fps")
    bounded_integer(render.get("startFrame"), 1, 999_999, "render.startFrame")
    bounded_integer(render.get("endFrame"), render["startFrame"], 999_999, "render.endFrame")
    frame_count = render["endFrame"] - render["startFrame"] + 1
    require(frame_count <= LIMITS["maximum_frames"], "render frame count exceeds its bound")
    bounded_integer(render.get("timeoutMs"), LIMITS["minimum_timeout_ms"], LIMITS["maximum_timeout_ms"], "render.timeoutMs")
    render["samples"] = bounded_integer(render.get("samples", 32), 1, LIMITS["maximum_samples"], "render.samples")

    output = document.get("output")
    exact_keys(output, ["directory"], "output")

    screen = document.get("screen")
    require(isinstance(screen, dict), "screen must be an object")
    if screen.get("kind") == "image":
        exact_keys(screen, ["kind", "path", "sha256"], "screen")
        screen["sha256"] = expected_sha(screen.get("sha256"), "screen.sha256")
    elif screen.get("kind") == "image-sequence":
        exact_keys(screen, ["kind", "frames"], "screen")
        require(isinstance(screen.get("frames"), list) and len(screen["frames"]) == frame_count, "screen.frames must exactly map rendered frames")
        for index, frame in enumerate(screen["frames"]):
            exact_keys(frame, ["path", "sha256"], f"screen.frames[{index}]")
            require(isinstance(frame.get("path"), str) and Path(frame["path"]).suffix.lower() == ".png", f"screen.frames[{index}] must be a normalized PNG")
            frame["sha256"] = expected_sha(frame.get("sha256"), f"screen.frames[{index}].sha256")
    else:
        raise ContractError("screen.kind must be image or image-sequence")

    scene = document.get("scene") or {}
    exact_keys(scene, ["devicePreset", "cameraPreset", "cameraMotion", "lightingPreset", "screenFit"], "scene")
    defaults = {
        "devicePreset": "phone-rounded-v1",
        "cameraPreset": "three-quarter-left",
        "cameraMotion": "settle",
        "lightingPreset": "soft-studio-v1",
        "screenFit": "contain",
    }
    admitted = {
        "devicePreset": {"phone-rounded-v1"},
        "cameraPreset": {"hero-front", "three-quarter-left", "three-quarter-right"},
        "cameraMotion": {"locked", "settle"},
        "lightingPreset": {"soft-studio-v1"},
        "screenFit": {"contain"},
    }
    for key, fallback in defaults.items():
        scene[key] = scene.get(key, fallback)
        require(scene[key] in admitted[key], f"scene.{key} is not admitted")
    document["scene"] = scene
    return document


def load_job(job_path):
    require(job_path.exists() and job_path.is_file() and not job_path.is_symlink(), "job file must be a real JSON file")
    require(job_path.stat().st_size <= LIMITS["maximum_job_bytes"], "job file exceeds its byte bound")
    raw = job_path.read_bytes()
    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError("job file is not valid UTF-8 JSON") from error
    job = normalize_job(document)
    root_lexical = Path(os.path.abspath(os.path.normpath(job["projectRoot"])))
    require(root_lexical.exists() and root_lexical.is_dir() and not root_lexical.is_symlink(), "projectRoot must be a real directory")
    root = Path(os.path.realpath(root_lexical))
    job_lexical = Path(os.path.abspath(os.path.normpath(job_path)))
    contained(root, job_lexical, "job file")
    reject_symlink_components(root, job_lexical, "job file")
    require(Path(os.path.realpath(job_lexical)) == job_lexical, "job file realpath changed")

    references = (
        [("screen.path", job["screen"]["path"], job["screen"]["sha256"])]
        if job["screen"]["kind"] == "image"
        else [
            (f"screen.frames[{index}].path", frame["path"], frame["sha256"])
            for index, frame in enumerate(job["screen"]["frames"])
        ]
    )
    inputs = []
    for label, raw_path, digest in references:
        file_path = resolve_existing_file(root, raw_path, label, IMAGE_SUFFIXES)
        actual = sha256_path(file_path)
        require(actual == digest, f"{label} SHA-256 does not match")
        inputs.append({"label": label, "path": file_path, "sha256": actual})

    output = resolve_output_directory(root, job["output"]["directory"])
    intended = [output / "DEVICE_STAGE_MANIFEST.json"] + [
        output / f"frame_{frame:06d}.png"
        for frame in range(job["render"]["startFrame"], job["render"]["endFrame"] + 1)
    ]
    require(not any(candidate.exists() for candidate in intended), "an output target already exists")
    return {
        "job": job,
        "job_path": job_lexical,
        "job_sha256": hashlib.sha256(raw).hexdigest(),
        "root": root,
        "inputs": inputs,
        "output": output,
    }


def clear_factory_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            collection.remove(block)


def make_principled_material(name, base_color, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = base_color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return material


def rounded_box(name, dimensions, location, material, bevel):
    bpy.ops.mesh.primitive_cube_add(location=location)
    object_ = bpy.context.object
    object_.name = name
    object_.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = object_.modifiers.new(name="Trusted rounded shell", type="BEVEL")
    modifier.width = bevel
    modifier.segments = 8
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = object_
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    object_.data.materials.append(material)
    return object_


def image_dimensions(image_path):
    image = bpy.data.images.load(str(image_path), check_existing=False)
    try:
        width, height = int(image.size[0]), int(image.size[1])
        require(width > 0 and height > 0, "screen image has invalid dimensions")
        return width, height
    finally:
        bpy.data.images.remove(image)


def make_screen_plane(first_image_path):
    aperture_width = 2.72
    aperture_height = 5.92
    width, height = image_dimensions(first_image_path)
    source_aspect = width / height
    aperture_aspect = aperture_width / aperture_height
    if source_aspect >= aperture_aspect:
        screen_width = aperture_width
        screen_height = aperture_width / source_aspect
    else:
        screen_height = aperture_height
        screen_width = aperture_height * source_aspect

    black = make_principled_material("Trusted bezel", (0.003, 0.003, 0.004, 1.0), 0.0, 0.24)
    bpy.ops.mesh.primitive_plane_add(location=(0.0, -0.186, 0.0), rotation=(math.pi / 2.0, 0.0, 0.0))
    backing = bpy.context.object
    backing.name = "Trusted screen aperture"
    backing.dimensions = (aperture_width, aperture_height, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    backing.data.materials.append(black)

    bpy.ops.mesh.primitive_plane_add(location=(0.0, -0.190, 0.0), rotation=(math.pi / 2.0, 0.0, 0.0))
    plane = bpy.context.object
    plane.name = "Authentic screen texture"
    plane.dimensions = (screen_width, screen_height, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    material = bpy.data.materials.new("Immutable authentic UI texture")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.interpolation = "Linear"
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    plane.data.materials.append(material)
    return texture, (width, height)


def look_at(object_, target=(0.0, 0.0, 0.0)):
    direction = Vector(target) - object_.location
    object_.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def camera_position(preset, progress, motion):
    positions = {
        "hero-front": Vector((0.0, -11.4, 0.15)),
        "three-quarter-left": Vector((-4.1, -10.8, 1.15)),
        "three-quarter-right": Vector((4.1, -10.8, 1.15)),
    }
    finish = positions[preset]
    if motion == "locked":
        return finish
    if preset == "hero-front":
        start = Vector((-0.65, -12.0, 0.45))
    else:
        start = Vector((finish.x * 1.13, finish.y * 1.08, finish.z + 0.35))
    eased = 1.0 - (1.0 - progress) ** 3
    return start.lerp(finish, eased)


def add_area_light(name, location, energy, size, color):
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    object_ = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(object_)
    object_.location = location
    look_at(object_)
    return object_


def build_scene(context):
    job = context["job"]
    scene = bpy.context.scene
    clear_factory_scene()
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = job["render"]["width"]
    scene.render.resolution_y = job["render"]["height"]
    scene.render.resolution_percentage = 100
    scene.render.fps = job["render"]["fps"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.frame_start = job["render"]["startFrame"]
    scene.frame_end = job["render"]["endFrame"]
    try:
        scene.render.image_settings.color_management = "FOLLOW_SCENE"
    except (AttributeError, TypeError):
        pass
    try:
        scene.view_settings.view_transform = "Standard"
    except (AttributeError, TypeError):
        pass
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = job["render"]["samples"]
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "use_gtao"):
        scene.eevee.use_gtao = True
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "gtao_distance"):
        scene.eevee.gtao_distance = 3
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "gtao_factor"):
        scene.eevee.gtao_factor = 1.2

    body_material = make_principled_material("Trusted graphite shell", (0.018, 0.022, 0.029, 1.0), 0.72, 0.2)
    rounded_box("Trusted procedural phone", (3.1, 0.36, 6.45), (0.0, 0.0, 0.0), body_material, 0.19)
    first_input = context["inputs"][0]["path"]
    texture_node, source_dimensions = make_screen_plane(first_input)

    camera_data = bpy.data.cameras.new("Trusted device camera")
    camera_data.lens = 58
    camera_data.sensor_width = 36
    camera = bpy.data.objects.new("Trusted device camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    add_area_light("Trusted soft key", (-4.2, -5.5, 6.5), 900, 5.0, (1.0, 0.91, 0.82))
    add_area_light("Trusted fill", (4.5, -3.0, 1.0), 620, 4.0, (0.68, 0.81, 1.0))
    add_area_light("Trusted rim", (2.0, 2.8, 5.5), 1100, 3.0, (0.72, 0.84, 1.0))
    scene.world.color = (0.008, 0.008, 0.012)
    return scene, camera, texture_node, source_dimensions


def png_header(file_path):
    with open(file_path, "rb") as stream:
        header = stream.read(29)
    require(len(header) >= 29 and header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR", "rendered output is not PNG")
    width, height = struct.unpack(">II", header[16:24])
    return {"width": width, "height": height, "bitDepth": header[24], "colorType": header[25]}


def relative_posix(root, candidate):
    return Path(os.path.relpath(str(candidate), str(root))).as_posix()


def render(context):
    job = context["job"]
    scene, camera, texture_node, source_dimensions = build_scene(context)
    started = time.monotonic()
    timeout_seconds = job["render"]["timeoutMs"] / 1000.0
    start_frame = job["render"]["startFrame"]
    end_frame = job["render"]["endFrame"]
    frame_count = end_frame - start_frame + 1
    output_frames = []
    input_manifest = []
    previous_image = None

    for index, frame_number in enumerate(range(start_frame, end_frame + 1)):
        require(time.monotonic() - started <= timeout_seconds, "render exceeded its timeout bound")
        input_entry = context["inputs"][0 if job["screen"]["kind"] == "image" else index]
        image = bpy.data.images.load(str(input_entry["path"]), check_existing=False)
        try:
            actual_dimensions = (int(image.size[0]), int(image.size[1]))
            require(actual_dimensions == source_dimensions, "normalized screen frames changed dimensions")
            try:
                image.colorspace_settings.name = "sRGB"
            except (AttributeError, TypeError):
                pass
            texture_node.image = image
            if previous_image is not None and previous_image != image:
                bpy.data.images.remove(previous_image)
            previous_image = image

            progress = 1.0 if frame_count == 1 else index / (frame_count - 1)
            camera.location = camera_position(job["scene"]["cameraPreset"], progress, job["scene"]["cameraMotion"])
            look_at(camera)
            scene.frame_set(frame_number)
            output_path = context["output"] / f"frame_{frame_number:06d}.png"
            scene.render.filepath = str(output_path)
            bpy.ops.render.render(write_still=True)
            require(output_path.is_file() and not output_path.is_symlink(), "Blender did not produce the expected output frame")
            header = png_header(output_path)
            require(header["width"] == job["render"]["width"] and header["height"] == job["render"]["height"], "output dimensions changed")
            require(header["colorType"] == 6, "output is not RGBA PNG")
            output_frames.append({
                "frame": frame_number,
                "relativePath": relative_posix(context["root"], output_path),
                "sha256": sha256_path(output_path),
                "bytes": output_path.stat().st_size,
                **header,
            })
            input_manifest.append({
                "frame": frame_number,
                "relativePath": relative_posix(context["root"], input_entry["path"]),
                "sha256": input_entry["sha256"],
                "width": actual_dimensions[0],
                "height": actual_dimensions[1],
            })
        except Exception:
            if image.name in bpy.data.images:
                bpy.data.images.remove(image)
            previous_image = None
            raise

    if previous_image is not None and previous_image.name in bpy.data.images:
        bpy.data.images.remove(previous_image)

    for input_entry in context["inputs"]:
        require(sha256_path(input_entry["path"]) == input_entry["sha256"], f"{input_entry['label']} changed during render")

    elapsed_ms = int((time.monotonic() - started) * 1000)
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "adapterId": ADAPTER_ID,
        "adapterVersion": ADAPTER_VERSION,
        "status": "complete",
        "jobId": job["jobId"],
        "job": {
            "relativePath": relative_posix(context["root"], context["job_path"]),
            "sha256": context["job_sha256"],
        },
        "runtime": {
            "blenderVersion": bpy.app.version_string,
            "pythonVersion": platform.python_version(),
            "platform": sys.platform,
            "background": bool(bpy.app.background),
            "autoexecDisabled": True,
        },
        "policy": {
            "deviceSource": "trusted-procedural-phone-rounded-v1",
            "screenMedia": "immutable-authentic-texture",
            "screenFit": "contain",
            "untrustedBlendLoaded": False,
            "arbitraryPythonLoaded": False,
        },
        "scene": dict(job["scene"]),
        "inputs": input_manifest,
        "render": {
            "width": job["render"]["width"],
            "height": job["render"]["height"],
            "fps": job["render"]["fps"],
            "startFrame": start_frame,
            "endFrame": end_frame,
            "samples": job["render"]["samples"],
            "format": "PNG",
            "colorMode": "RGBA",
            "transparentBackground": True,
            "elapsedMs": elapsed_ms,
        },
        "outputs": {
            "directoryRelativePath": relative_posix(context["root"], context["output"]),
            "frames": output_frames,
        },
    }
    manifest_path = context["output"] / "DEVICE_STAGE_MANIFEST.json"
    temporary_path = context["output"] / ".DEVICE_STAGE_MANIFEST.json.tmp"
    require(not manifest_path.exists() and not temporary_path.exists(), "device manifest target already exists")
    serialized = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with open(temporary_path, "xb") as stream:
        stream.write(serialized)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary_path, manifest_path)
    return manifest


def main(argv=None):
    require(sys.platform in {"darwin", "win32"}, f"CutSteward supports macOS and Windows only (detected {sys.platform})")
    require(bool(bpy.app.background), "trusted device stage must run in Blender background mode")
    job_path = parse_arguments(list(sys.argv if argv is None else argv))
    context = load_job(job_path)
    render(context)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"CutSteward trusted Blender driver: {error}", file=sys.stderr)
        raise SystemExit(1)
