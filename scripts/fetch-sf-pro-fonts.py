#!/usr/bin/env python3
"""
Fetches and prepares the official Apple SF Pro font suite (SF Pro Text, SF Pro Display,
and SF Pro Rounded across weights & italics) from Ahad00010/JaText-Essential-Stuff (main)
for the JaText Android APK (`android/app/src/main/res/font/`).

Each raw desktop `.otf` in JaText-Essential-Stuff (~6.3 MB) embeds ~5.5 MB of macOS-only
Private Use Area SF Symbols (U+E000..U+F8FF, U+F0000..U+10FFFF). Subsetting out ONLY
Private Use Area codepoints preserves 100% of real Unicode characters, OpenType GPOS/GSUB
kerning & ligatures, and CFF PostScript curves/hints while keeping the signed APK lean.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import os
import shutil
import sys
import urllib.request
from pathlib import Path

ESSENTIAL_RAW_BASE = (
    "https://media.githubusercontent.com/media/Ahad00010/JaText-Essential-Stuff/main"
)
ESSENTIAL_FALLBACK_BASE = (
    "https://github.com/Ahad00010/JaText-Essential-Stuff/raw/main"
)

# (android_res_basename, remote_filename_in_JaText_Essential_Stuff, expected_sha256, weight_int, is_italic)
SF_PRO_FONT_MANIFEST: list[tuple[str, str, str, int, bool]] = [
    # SF Pro Text (< 20sp UI, messages, inputs, buttons, labels, metadata)
    ("sf_pro_text_ultralight", "SF-Pro-Text-Ultralight.otf", "4fbff1fb48ce0887f54fa28f2d82efbb3148cbd8fd43184967a3601c735e0d55", 100, False),
    ("sf_pro_text_thin", "SF-Pro-Text-Thin.otf", "9b046de17ea950096cda1a122f5760bf042ff5fea0e3bd4b13d1c2813235fc81", 200, False),
    ("sf_pro_text_light", "SF-Pro-Text-Light.otf", "673c3613d006010a6114d2dae35649ce8702438ed41482e52e858e0d762960d4", 300, False),
    ("sf_pro_text_regular", "SF-Pro-Text-Regular.otf", "eabf0a67833bbe3c80c800e6ce3f36b65e92f3b6ac1d6226ba2981e5cb3a74a5", 400, False),
    ("sf_pro_text_regular_italic", "SF-Pro-Text-RegularItalic.otf", "ecef4504096d125490168eb9d9545a12d2d27c3dc1ee891ed8d24f16f7830833", 400, True),
    ("sf_pro_text_medium", "SF-Pro-Text-Medium.otf", "d239ef176b8c0c5cd7aaaefc94380d91a157a4a0972b718d9e0fd907bff2f950", 500, False),
    ("sf_pro_text_medium_italic", "SF-Pro-Text-MediumItalic.otf", "0872663842b338ae0ed4255e7448a634ce4ff5ebeab5b10f58309891706d887a", 500, True),
    ("sf_pro_text_semibold", "SF-Pro-Text-Semibold.otf", "047aaed48e041497c75ae39329dec6ee8456d8bfbbfad4f5b67ebcd5867a2024", 600, False),
    ("sf_pro_text_semibold_italic", "SF-Pro-Text-SemiboldItalic.otf", "a5364c578808b176e7f908ccf42df0b4ddb80965979c96989e960e15f22c9263", 600, True),
    ("sf_pro_text_bold", "SF-Pro-Text-Bold.otf", "f583819129aabfa2fdc7ca88f53011c610fc3325141d33e041abb8af912a6d46", 700, False),
    ("sf_pro_text_bold_italic", "SF-Pro-Text-BoldItalic.otf", "b60008700ecf3548a301d4fdc057be35c3a5daf6eb4cf5cacc17cc642b71d949", 700, True),
    ("sf_pro_text_heavy", "SF-Pro-Text-Heavy.otf", "2df9a6a6afe0fd1f4a6abfa49858b62d83f55f5d1cfd51e5d2ab03d94b33c8ed", 800, False),
    ("sf_pro_text_heavy_italic", "SF-Pro-Text-HeavyItalic.otf", "d007cea4ab1c5b586c9ebd3cddd319ded14464ef15e6e74052044979e05e7978", 800, True),
    ("sf_pro_text_black", "SF-Pro-Text-Black.otf", "b10adcc3fdea250c2c5debc41a8ae52ebf1834666cd629f137d2ee04704d8c5a", 900, False),
    # SF Pro Display (>= 20sp headlines, hero banners, screen titles, profile & call headers)
    ("sf_pro_display_light", "SF-Pro-Display-Light.otf", "b9f125dd23adb32e2d621c70d79c8e507def6fae7ecf869b94c1187909d753cc", 300, False),
    ("sf_pro_display_regular", "SF-Pro-Display-Regular.otf", "f1782b0e2b9be92a80d706926cda0cc36726853010a15a450e0d4aeaf5a319c8", 400, False),
    ("sf_pro_display_regular_italic", "SF-Pro-Display-RegularItalic.otf", "7d6ea83982e41ad912fcb637b3346640e779be03628ca23df3451064517f3750", 400, True),
    ("sf_pro_display_medium", "SF-Pro-Display-Medium.otf", "984687a2c53b36703c6a93fb20c2cf6a85df0f6a94da6b8e61401bc7b2085f65", 500, False),
    ("sf_pro_display_semibold", "SF-Pro-Display-Semibold.otf", "ff3e08c5c9086c10bd76aa822e8456804e6e920211ad573c3320784f9a87168b", 600, False),
    ("sf_pro_display_bold", "SF-Pro-Display-Bold.otf", "4572cbf9d57a279eb1b9e5cf02f556083352af102036067d7ed936ba2c237281", 700, False),
    ("sf_pro_display_bold_italic", "SF-Pro-Display-BoldItalic.otf", "18606b375c776bf712a0a00a0e224385126c09dc1c4a81c37ff4f40f1a766fa8", 700, True),
    ("sf_pro_display_heavy", "SF-Pro-Display-Heavy.otf", "cb402177c68d4ebc1349d814e262f4878ebd343577b65654edf27870ddb0005b", 800, False),
    ("sf_pro_display_black", "SF-Pro-Display-Black.otf", "c95a31e3c127fcc832b3ed9e4aa0290a261207e486d49a38543c9f53c0a14ea7", 900, False),
    # SF Pro Rounded (unread badges, numeric pills, counters, avatar initials, timers)
    ("sf_pro_rounded_regular", "SF-Pro-Rounded-Regular.otf", "86c58dce768ee5ef36d646425f1cea4e0a2b280bfaf767fc1c04af86d2195f97", 400, False),
    ("sf_pro_rounded_medium", "SF-Pro-Rounded-Medium.otf", "b771b2b38cc32d4f6c4c37115387133514151ca8b1cc5ac1867aa2ec04212995", 500, False),
    ("sf_pro_rounded_semibold", "SF-Pro-Rounded-Semibold.otf", "e6cafa76734967d8b5c885c5336fef73c31ee37341fd8226753c729396c75cc0", 600, False),
    ("sf_pro_rounded_bold", "SF-Pro-Rounded-Bold.otf", "1d401b5a88c9b34fc3e9ff50e417ef5001e2c8c478a322949fe190213d75425d", 700, False),
    ("sf_pro_rounded_heavy", "SF-Pro-Rounded-Heavy.otf", "7ac80cefecf89e3dbdde0c60311574e4599a815184212069b8f9e2b71dde05e3", 800, False),
    ("sf_pro_rounded_black", "SF-Pro-Rounded-Black.otf", "5188e0994505bd7eda73f37a6ba05a2828beb161f50dd2baffcfce05708fb322", 900, False),
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 256)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def download_one(entry: tuple[str, str, str, int, bool], raw_dir: Path) -> Path:
    res_name, remote_name, expected_sha, _, _ = entry
    dest = raw_dir / remote_name
    if dest.exists() and sha256_file(dest) == expected_sha:
        return dest

    last_err: Exception | None = None
    for base in (ESSENTIAL_RAW_BASE, ESSENTIAL_FALLBACK_BASE):
        url = f"{base}/{remote_name}"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "JaText-APK-Builder/3.9"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            actual_sha = hashlib.sha256(data).hexdigest()
            if actual_sha != expected_sha:
                raise RuntimeError(
                    f"SHA-256 mismatch for {remote_name} from {url}: "
                    f"expected {expected_sha}, got {actual_sha} ({len(data)} bytes)"
                )
            dest.write_bytes(data)
            return dest
        except Exception as exc:
            last_err = exc
    raise RuntimeError(f"Failed to download {remote_name}: {last_err}")


def subset_one_worker(args: tuple[str, str, str]) -> tuple[str, int, int]:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont

    res_name, raw_path_str, out_path_str = args
    raw_path = Path(raw_path_str)
    out_path = Path(out_path_str)

    font = TTFont(str(raw_path))
    cmap = font.getBestCmap() or {}
    # Keep 100% of real Unicode characters; strip ONLY Private Use Area (SF Symbols desktop icons)
    keep_unicodes = [
        cp for cp in cmap.keys() if not (0xE000 <= cp <= 0xF8FF or cp >= 0xF0000)
    ]
    if len(keep_unicodes) < 500:
        raise RuntimeError(
            f"Unexpectedly small non-PUA cmap ({len(keep_unicodes)}) in {raw_path.name}"
        )

    opts = Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.recommended_glyphs = True
    opts.hinting = True

    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=keep_unicodes)
    subsetter.subset(font)

    tmp_out = out_path.with_suffix(".tmp.otf")
    font.save(str(tmp_out))
    font.close()

    # Validate output font integrity
    verify = TTFont(str(tmp_out))
    glyph_count = len(verify.getGlyphOrder())
    verify.close()
    size_bytes = tmp_out.stat().st_size
    if size_bytes < 50_000 or glyph_count < 500:
        raise RuntimeError(
            f"Invalid subsetted font {res_name}: {size_bytes} bytes, {glyph_count} glyphs"
        )
    tmp_out.replace(out_path)
    return res_name, size_bytes, glyph_count


def generate_offline_stubs(out_dir: Path) -> None:
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.t2CharStringPen import T2CharStringPen

    out_dir.mkdir(parents=True, exist_ok=True)
    for res_name, remote_name, _, weight, is_italic in SF_PRO_FONT_MANIFEST:
        target = out_dir / f"{res_name}.otf"
        fb = FontBuilder(1000, isTTF=False)
        fb.setupGlyphOrder([".notdef", "space"])
        fb.setupCharacterMap({0x0020: "space"})

        charstrings = {}
        pen = T2CharStringPen(500, None)
        pen.moveTo((50, 0))
        pen.lineTo((450, 0))
        pen.lineTo((450, 700))
        pen.lineTo((50, 700))
        pen.closePath()
        charstrings[".notdef"] = pen.getCharString()

        sp_pen = T2CharStringPen(250, None)
        charstrings["space"] = sp_pen.getCharString()

        ps_name = remote_name.replace(".otf", "")
        family = ps_name.rsplit("-", 1)[0].replace("-", " ")
        style = ps_name.rsplit("-", 1)[1]
        names = {
            "familyName": family,
            "styleName": style,
            "uniqueFontIdentifier": ps_name,
            "fullName": f"{family} {style}",
            "psName": ps_name,
            "version": "Version 1.0 (offline stub)",
        }
        fb.setupCFF(
            ps_name,
            {"FullName": f"{family} {style}", "FamilyName": family},
            charstrings,
            {},
        )
        fb.setupHorizontalMetrics({".notdef": (500, 50), "space": (250, 0)})
        fb.setupHorizontalHeader(ascent=800, descent=-200)
        fb.setupNameTable(names)
        fb.setupOS2(
            sTypoAscender=800,
            sTypoDescender=-200,
            usWinAscent=950,
            usWinDescent=250,
            usWeightClass=weight,
            fsSelection=(0x01 if is_italic else 0x40),
        )
        fb.setupPost()
        fb.save(str(target))
    print(f"Generated {len(SF_PRO_FONT_MANIFEST)} valid OpenType offline stubs in {out_dir}")


def fetch_and_prepare(out_dir: Path, cache_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    subset_cache = cache_dir / "subset_v1"
    raw_cache = cache_dir / "raw_v1"
    subset_cache.mkdir(parents=True, exist_ok=True)
    raw_cache.mkdir(parents=True, exist_ok=True)

    # Fast path: all 29 subsetted fonts already cached!
    all_cached = all(
        (subset_cache / f"{res_name}.otf").exists()
        and (subset_cache / f"{res_name}.otf").stat().st_size >= 50_000
        for res_name, *_ in SF_PRO_FONT_MANIFEST
    )
    if not all_cached:
        print(
            f"Downloading {len(SF_PRO_FONT_MANIFEST)} SF Pro fonts from JaText-Essential-Stuff..."
        )
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as dl_pool:
            raw_paths = list(
                dl_pool.map(lambda e: download_one(e, raw_cache), SF_PRO_FONT_MANIFEST)
            )

        jobs = [
            (
                entry[0],
                str(raw_path),
                str(subset_cache / f"{entry[0]}.otf"),
            )
            for entry, raw_path in zip(SF_PRO_FONT_MANIFEST, raw_paths)
        ]
        print(f"Preparing {len(jobs)} SF Pro OpenType fonts for Android res/font/...")
        with concurrent.futures.ProcessPoolExecutor() as proc_pool:
            for res_name, sz, glyphs in proc_pool.map(subset_one_worker, jobs):
                print(f"  ✓ {res_name}.otf: {sz:,} bytes ({glyphs:,} glyphs)")
    else:
        print(f"Restored all {len(SF_PRO_FONT_MANIFEST)} SF Pro fonts from cache ({subset_cache})")

    total_bytes = 0
    for res_name, *_ in SF_PRO_FONT_MANIFEST:
        src = subset_cache / f"{res_name}.otf"
        dst = out_dir / f"{res_name}.otf"
        shutil.copy2(src, dst)
        total_bytes += dst.stat().st_size

    print(
        f"Installed {len(SF_PRO_FONT_MANIFEST)} SF Pro fonts into {out_dir} "
        f"({total_bytes / (1024 * 1024):.2f} MiB total)."
    )


def verify_apk_fonts(apk_path: Path) -> None:
    import zipfile

    with zipfile.ZipFile(apk_path, "r") as zf:
        otf_infos = [
            info
            for info in zf.infolist()
            if info.filename.startswith("res/") and info.filename.endswith(".otf")
        ]
        valid_otfs = []
        too_small = []
        for info in otf_infos:
            head = zf.read(info.filename)[:4]
            if head == b"OTTO" and info.file_size >= 50_000:
                valid_otfs.append(info)
            else:
                too_small.append(f"{info.filename} ({info.file_size} bytes, magic={head!r})")

        expected_count = len(SF_PRO_FONT_MANIFEST)
        if len(valid_otfs) < expected_count or too_small:
            raise SystemExit(
                f"SF Pro APK verification failed! Expected >= {expected_count} real OTFs, "
                f"found {len(valid_otfs)}; invalid/stub={too_small}"
            )
        arsc = zf.read("resources.arsc")
        for probe in (b"sf_pro_text_regular", b"sf_pro_display_bold", b"sf_pro_rounded_semibold"):
            if probe not in arsc:
                raise SystemExit(f"Missing font resource {probe!r} in resources.arsc!")
        total = sum(i.file_size for i in valid_otfs)
        print(
            f"Verified all {len(valid_otfs)} genuine Apple SF Pro OpenType fonts "
            f"inside {apk_path.name} ({total / (1024 * 1024):.2f} MiB uncompressed)."
        )


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    default_out = repo_root / "android" / "app" / "src" / "main" / "res" / "font"
    default_cache = Path.home() / ".cache" / "jatext-sf-pro-fonts"

    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Download & prepare real SF Pro fonts")
    parser.add_argument("--generate-stubs", action="store_true", help="Generate valid offline OTF stubs")
    parser.add_argument("--verify-apk", type=Path, default=None, help="Verify bundled SF Pro fonts in APK")
    parser.add_argument("--out-dir", type=Path, default=default_out)
    parser.add_argument("--cache-dir", type=Path, default=default_cache)
    args = parser.parse_args()

    if args.verify_apk is not None:
        verify_apk_fonts(args.verify_apk)
    elif args.generate_stubs:
        generate_offline_stubs(args.out_dir)
    elif args.fetch:
        fetch_and_prepare(args.out_dir, args.cache_dir)
    else:
        parser.error("Specify --fetch, --generate-stubs, or --verify-apk <path>")


if __name__ == "__main__":
    main()
