#!/usr/bin/env python3
"""Validate the UNMAEK visual-recovery runtime candidate package."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zipfile
from collections import defaultdict, deque
from pathlib import Path

from PIL import Image


PACKAGE_ID = "UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1"
DATE = "2026-08-05"
SPIDER_STATES = ["idle_front", "move_side", "alert_front", "deploy_side", "attack_side", "stunned_front", "retreat_side"]


def map_key_paths(key: str, manifest: dict) -> dict[str, str | None]:
    act, kind = key.split("_", 1)
    prefix = f"{act}_{kind}"
    base = f"maps/{act}/{kind}"
    overlay = f"{prefix}_spawn_territory_overlay_review.png" if kind == "boss" else f"{prefix}_spawn_overlay_review.png"
    return {
        "background": manifest[key]["candidateBackground"],
        "collision": manifest[key]["candidateCollision"],
        "hazard": manifest[key]["candidateHazard"],
        "overlay": f"{base}/{overlay}",
        "composite": f"{base}/{prefix}_gameplay_composite_960x540.png",
        "notes": f"{base}/{prefix}_recovery_notes.md",
    }


class Results:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, category: str, name: str, ok: bool, detail: str = "") -> None:
        self.checks.append({"category": category, "name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    @property
    def fail_count(self) -> int:
        return sum(c["status"] == "FAIL" for c in self.checks)

    @property
    def pass_count(self) -> int:
        return sum(c["status"] == "PASS" for c in self.checks)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def png_ihdr(path: Path) -> tuple[int, int, int, int]:
    data = path.read_bytes()[:33]
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("not a valid PNG IHDR")
    width, height = struct.unpack(">II", data[16:24])
    return width, height, data[24], data[25]


def required_files(root: Path, manifest: dict, include_generated_reports: bool) -> list[str]:
    req = [
        "README_VISUAL_RECOVERY_RUNTIME_EXPORT_v1.md",
        "ASSET_INVENTORY_VISUAL_RECOVERY_v1.md",
        "MAP_RECOVERY_SPEC_v1.json",
        "MAP_MANIFEST_PATCH_PROPOSAL_v1.json",
        "MINERAL_SPIDER_7STATE_CORRECTION_REPORT.md",
        "USAGE_NOTICE.txt",
        "tools/validate_visual_recovery_export.py",
        "previews/map_backgrounds_contact_sheet.png",
        "previews/map_masks_overlays_contact_sheet.png",
        "previews/map_composites_contact_sheet.png",
        "previews/mineral_spider_7state_review_strip.png",
        "previews/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_REVIEW_v1.pptx",
        "reports/visual_gate_metrics.json",
        "creatures/act1/mineral_spider/mineral_spider_7state_before_after_contact_sheet.png",
    ]
    if include_generated_reports:
        req += ["VISUAL_RECOVERY_VALIDATION_REPORT_v1.md", "reports/validation_results.json", "CHECKSUMS_SHA256.txt"]
    for key in manifest:
        req.extend(v for v in map_key_paths(key, manifest).values() if v)
    for state in SPIDER_STATES:
        req.append(f"creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_{state}_corrected_candidate_104x88.png")
    return sorted(set(req))


def check_png(path: Path, size: tuple[int, int], mode: str, results: Results, category: str, name: str) -> Image.Image | None:
    if not path.is_file():
        results.add(category, name, False, "missing")
        return None
    try:
        im = Image.open(path)
        im.load()
        width, height, bit_depth, _ = png_ihdr(path)
        ok = (width, height) == size and im.mode == mode and bit_depth == 8
        results.add(category, name, ok, f"{width}x{height}, mode={im.mode}, bitDepth={bit_depth}")
        return im
    except Exception as exc:
        results.add(category, name, False, str(exc))
        return None


def point_inside(point: list[int]) -> bool:
    return len(point) == 2 and 0 <= point[0] < 1280 and 0 <= point[1] < 720


def territory_inside(territory: dict | None) -> bool:
    if territory is None:
        return True
    if territory["type"] == "circle":
        x, y = territory["center"]
        r = territory["radius"]
        return r >= 0 and x - r >= 0 and y - r >= 0 and x + r < 1280 and y + r < 720
    x0, y0, x1, y1 = territory["bounds"]
    return 0 <= x0 < x1 < 1280 and 0 <= y0 < y1 < 720


def check_maps(root: Path, manifest: dict, spec: dict, results: Results) -> None:
    for key, values in manifest.items():
        paths = map_key_paths(key, manifest)
        bg = check_png(root / paths["background"], (1280, 720), "RGB", results, "image", f"{key} background")
        collision = check_png(root / paths["collision"], (1280, 720), "L", results, "image", f"{key} collision")
        hazard = None
        if paths["hazard"]:
            hazard = check_png(root / paths["hazard"], (1280, 720), "L", results, "image", f"{key} hazard")
        overlay = check_png(root / paths["overlay"], (1280, 720), "RGB", results, "image", f"{key} review overlay")
        composite = check_png(root / paths["composite"], (960, 540), "RGB", results, "image", f"{key} gameplay composite")
        del bg, overlay, composite

        if collision:
            values_used = set(collision.get_flattened_data())
            results.add("mask", f"{key} collision binary", values_used == {0, 255}, f"values={sorted(values_used)}")
            core = spec["maps"][key]["combatCore"]
            core_values = set(collision.crop(tuple(core)).get_flattened_data())
            results.add("mask", f"{key} combat core blocker islands", core_values == {255}, f"coreValues={sorted(core_values)}")
        if hazard:
            values_used = set(hazard.get_flattened_data())
            results.add("mask", f"{key} hazard binary", values_used == {0, 255}, f"values={sorted(values_used)}")

        all_spawns = [("player", values["playerSpawn"])]
        all_spawns += [(f"enemy{i+1}", p) for i, p in enumerate(values["enemySpawn"])]
        if values["bossSpawn"] is not None:
            all_spawns.append(("boss", values["bossSpawn"]))
        for label, point in all_spawns:
            in_bounds = point_inside(point)
            results.add("spawn", f"{key} {label} bounds", in_bounds, str(point))
            if in_bounds and collision:
                results.add("spawn", f"{key} {label} walkable", collision.getpixel(tuple(point)) == 255, str(point))
            if in_bounds and hazard:
                results.add("spawn", f"{key} {label} non-hazard", hazard.getpixel(tuple(point)) == 0, str(point))
        results.add("territory", f"{key} boss territory bounds", territory_inside(values["bossTerritory"]), json.dumps(values["bossTerritory"]))

        candidate_values = [values["candidateBackground"], values["candidateCollision"], values["candidateHazard"]]
        bad_runtime_path = any(p and any(x in p for x in ("previews/", "source_boards/", "overlay_review", "gameplay_composite")) for p in candidate_values)
        results.add("runtime-path", f"{key} candidate paths exclude review/source", not bad_runtime_path)


def check_spiders(root: Path, results: Results) -> None:
    base = root / "creatures/act1/mineral_spider/runtime_corrected"
    for state in SPIDER_STATES:
        path = base / f"act1_mineral_spider_{state}_corrected_candidate_104x88.png"
        im = check_png(path, (104, 88), "RGBA", results, "spider", state)
        if not im:
            continue
        corners = [im.getpixel((0, 0))[3], im.getpixel((103, 0))[3], im.getpixel((0, 87))[3], im.getpixel((103, 87))[3]]
        results.add("spider", f"{state} transparent corners", corners == [0, 0, 0, 0], str(corners))
        bbox = im.getchannel("A").getbbox()
        bottom = bbox[3] if bbox else 0
        results.add("spider", f"{state} Ground Point / crop", bool(bbox) and bottom <= 72, f"alphaBBox={bbox}, groundY=72")


def check_visual_gates(root: Path, results: Results) -> None:
    path = root / "reports/visual_gate_metrics.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        a2 = data["act2_boss"]
        results.add("visual-gate", "ACT2 boss mound lower edge", a2["fungal_mound_lower_edge_ratio"] <= a2["limit_ratio"], f"{a2['fungal_mound_lower_edge_ratio']:.4f} <= {a2['limit_ratio']:.4f}")
        results.add("visual-gate", "ACT2 boss telegraph inside territory", bool(a2["telegraph_bounds_inside_territory"]))
        results.add("visual-gate", "ACT2 boss spawn background complexity", a2["local_background_stddev"] < 35, f"stddev={a2['local_background_stddev']}")
        a3 = data["act3_general"]
        results.add("visual-gate", "ACT3 general center high-frequency reduction", a3["central_high_frequency_energy_after"] < a3["central_high_frequency_energy_before"], f"{a3['central_high_frequency_energy_before']} -> {a3['central_high_frequency_energy_after']}")
        results.add("visual-gate", "ACT3 boss current-line adjustment decision", data["act3_boss"]["current_line_adjustment"].startswith("none"), data["act3_boss"]["current_line_adjustment"])
    except Exception as exc:
        results.add("visual-gate", "visual metrics readable", False, str(exc))


def check_text_paths(root: Path, results: Results) -> None:
    bad: list[str] = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".md", ".txt", ".json"}:
            text = path.read_text(encoding="utf-8", errors="replace")
            if any(token in text for token in ("/workspace/", "scratch/1045", "\\workspace\\")):
                bad.append(path.relative_to(root).as_posix())
    results.add("hygiene", "temporary workspace paths absent from documents", not bad, ", ".join(bad))


def check_hygiene(root: Path, results: Results) -> None:
    files = [p for p in root.rglob("*") if p.is_file()]
    hidden = [p.relative_to(root).as_posix() for p in files if any(part.startswith(".") for part in p.relative_to(root).parts)]
    temp = [p.relative_to(root).as_posix() for p in files if p.name.endswith(("~", ".tmp", ".bak", ".swp")) or p.name in {"Thumbs.db", ".DS_Store"}]
    results.add("hygiene", "hidden files absent", not hidden, ", ".join(hidden))
    results.add("hygiene", "temporary files absent", not temp, ", ".join(temp))
    groups: dict[str, list[str]] = defaultdict(list)
    for p in files:
        rel = p.relative_to(root).as_posix()
        if rel == "CHECKSUMS_SHA256.txt":
            continue
        groups[sha256(p)].append(rel)
    dups = [names for names in groups.values() if len(names) > 1]
    results.add("hygiene", "duplicate files absent", not dups, json.dumps(dups, ensure_ascii=False))


def write_checksums(root: Path) -> None:
    output = root / "CHECKSUMS_SHA256.txt"
    lines = []
    for path in sorted(p for p in root.rglob("*") if p.is_file() and p != output):
        lines.append(f"{sha256(path)}  {path.relative_to(root).as_posix()}")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def check_checksums(root: Path, results: Results) -> None:
    path = root / "CHECKSUMS_SHA256.txt"
    if not path.is_file():
        results.add("checksum", "checksum file exists", False)
        return
    listed: dict[str, str] = {}
    malformed = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("  ", 1)
        if len(parts) != 2 or len(parts[0]) != 64:
            malformed.append(line)
        else:
            listed[parts[1]] = parts[0]
    actual_files = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p != path}
    results.add("checksum", "checksum syntax", not malformed, str(malformed))
    results.add("checksum", "checksum coverage", set(listed) == actual_files, f"listed={len(listed)}, files={len(actual_files)}")
    mismatches = [rel for rel, digest in listed.items() if not (root / rel).is_file() or sha256(root / rel) != digest]
    results.add("checksum", "checksum values", not mismatches, ", ".join(mismatches))


def check_zip(root: Path, zip_path: Path, results: Results) -> None:
    if not zip_path.is_file():
        results.add("zip", "ZIP exists", False, zip_path.name)
        return
    try:
        with zipfile.ZipFile(zip_path) as zf:
            bad_crc = zf.testzip()
            names = [n for n in zf.namelist() if not n.endswith("/")]
            tops = {n.split("/", 1)[0] for n in names}
            results.add("zip", "ZIP CRC integrity", bad_crc is None, str(bad_crc))
            results.add("zip", "ZIP single top-level folder", tops == {PACKAGE_ID}, str(sorted(tops)))
            zipped_rel = {n.split("/", 1)[1] for n in names if "/" in n}
            disk_rel = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
            results.add("zip", "ZIP file set matches package", zipped_rel == disk_rel, f"zip={len(zipped_rel)}, disk={len(disk_rel)}")
    except Exception as exc:
        results.add("zip", "ZIP readable", False, str(exc))


def write_reports(root: Path, results: Results, zip_name: str | None) -> None:
    summary = {"packageId": PACKAGE_ID, "date": DATE, "status": "PASS" if results.fail_count == 0 else "FAIL", "passCount": results.pass_count, "failCount": results.fail_count, "zipChecked": zip_name, "checks": results.checks}
    (root / "reports/validation_results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    by_category: dict[str, list[dict]] = defaultdict(list)
    for item in results.checks:
        by_category[item["category"]].append(item)
    lines = [
        "# VISUAL_RECOVERY_VALIDATION_REPORT_v1",
        "",
        f"- 결과: **{summary['status']}**",
        f"- PASS: {results.pass_count}",
        f"- FAIL: {results.fail_count}",
        f"- ZIP 검증: {zip_name or '별도 최종 게이트에서 실행'}",
        "",
    ]
    for category in sorted(by_category):
        lines += [f"## {category}", ""]
        for item in by_category[category]:
            detail = f" — {item['detail']}" if item["detail"] else ""
            lines.append(f"- {item['status']} · {item['name']}{detail}")
        lines.append("")
    if results.fail_count:
        lines += ["## 완료 판정", "", "FAIL이 존재하므로 구현 전달 PASS로 판정하지 않는다.", ""]
    else:
        lines += ["## 완료 판정", "", "자동 검증 FAIL 0. 후보 패키지는 staging 구현 전달 가능하다. 공식 저장소 반입 후 실제 960×540 플레이에서 layer order·anchor·fade를 다시 확인한다.", ""]
    (root / "VISUAL_RECOVERY_VALIDATION_REPORT_v1.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--zip", dest="zip_path", type=Path)
    parser.add_argument("--write-checksums", action="store_true")
    parser.add_argument("--no-write", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.write_checksums:
        write_checksums(root)

    results = Results()
    try:
        manifest = json.loads((root / "MAP_MANIFEST_PATCH_PROPOSAL_v1.json").read_text(encoding="utf-8"))
        spec = json.loads((root / "MAP_RECOVERY_SPEC_v1.json").read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"FAIL: cannot load specs: {exc}")
        return 1

    for rel in required_files(root, manifest, include_generated_reports=args.no_write or args.write_checksums):
        results.add("existence", rel, (root / rel).is_file())
    check_maps(root, manifest, spec, results)
    check_spiders(root, results)
    check_visual_gates(root, results)
    check_text_paths(root, results)
    check_hygiene(root, results)
    if (root / "CHECKSUMS_SHA256.txt").is_file():
        check_checksums(root, results)
    if args.zip_path:
        check_zip(root, args.zip_path.resolve(), results)
    if not args.no_write:
        write_reports(root, results, args.zip_path.name if args.zip_path else None)

    print(f"{PACKAGE_ID}: {'PASS' if results.fail_count == 0 else 'FAIL'} | PASS {results.pass_count} | FAIL {results.fail_count}")
    for item in results.checks:
        if item["status"] == "FAIL":
            print(f"FAIL [{item['category']}] {item['name']}: {item['detail']}")
    return 0 if results.fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
