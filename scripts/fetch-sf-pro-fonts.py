#!/usr/bin/env python3
"""
Fetches and prepares the official Apple SF Pro font suite (SF Pro Text, SF Pro Display,
and SF Pro Rounded across weights & italics) AND the Apple iOS 26.4 Unicode 17.0 Color
Emoji font (`jatext_ios_emoji.ttf`, CBDT + CBLC + GSUB ligatures) from
JaText-Essential-Stuff (default imzachie/JaText-Essential-Stuff, main, override
with ESSENTIAL_STUFF_REPO / ESSENTIAL_STUFF_BRANCH / ESSENTIAL_STUFF_TOKEN) for
the JaText Android APK
(`android/app/src/main/res/font/`).

Each raw desktop `.otf` in JaText-Essential-Stuff (~6.3 MB) embeds ~5.5 MB of macOS-only
Private Use Area SF Symbols (U+E000..U+F8FF, U+F0000..U+10FFFF). Subsetting out ONLY
Private Use Area codepoints AND Apple color emoji codepoints (>= U+203C) preserves 100%
of real Unicode text characters, OpenType GPOS/GSUB kerning & ligatures, and CFF
PostScript curves/hints while ensuring all emojis & dingbats (including ❤️, ✨, ✅, ⚠️, ☀️)
fall straight through to `jatext_ios_emoji.ttf`.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import shutil
import urllib.request
from pathlib import Path

# Where the font suite lives. It used to be hardcoded to one account, and the
# moment that account was renamed every download in CI started answering 404,
# which takes the APK build down with it. Both the owner and the branch are
# configurable, and a token makes a private repo work.
ESSENTIAL_STUFF_REPO = (
    os.environ.get("ESSENTIAL_STUFF_REPO") or "imzachie/JaText-Essential-Stuff"
).strip().strip("/")
ESSENTIAL_STUFF_BRANCH = (
    os.environ.get("ESSENTIAL_STUFF_BRANCH") or "main"
).strip()
ESSENTIAL_STUFF_TOKEN = (
    os.environ.get("ESSENTIAL_STUFF_TOKEN")
    or os.environ.get("JATEXT_ASSET_TOKEN")
    or os.environ.get("GITHUB_TOKEN")
    or ""
).strip()


def asset_bases() -> list[str]:
    """Every URL worth trying for one file, most specific first.

    raw.githubusercontent.com is the only host that accepts a token for a
    private repo, so it leads when a token is configured. The media host serves
    LFS pointers as real bytes, which is what the fonts are stored as.
    """
    repo = ESSENTIAL_STUFF_REPO
    branch = ESSENTIAL_STUFF_BRANCH
    bases: list[str] = []
    if ESSENTIAL_STUFF_TOKEN:
        bases.append(f"https://raw.githubusercontent.com/{repo}/{branch}")
    bases.append(f"https://media.githubusercontent.com/media/{repo}/{branch}")
    bases.append(f"https://github.com/{repo}/raw/{branch}")
    return bases

IOS_EMOJI_SHEET_REMOTE = "ios_26.4-emoji-unicode-17.0.png"
IOS_EMOJI_SHEET_SHA256 = "41d18ec0793a7cfde47c06b994e9848de39ad50bf0abb453cb2fe9d845eea543"
IOS_EMOJI_RES_NAME = "jatext_ios_emoji"

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
    ("sf_pro_text_semibold_italic", "SF-Pro-Text-SemiboldItalic.otf", "a5364c578808b176e7f908ccf42df0b4ddb80965979c96989e05708fb322", 600, True),
    ("sf_pro_text_bold", "SF-Pro-Text-Bold.otf", "f583819129aabfa2fdc7ca88f53011c610fc3325141d33e041abb8af912a6d46", 700, False),
    ("sf_pro_text_bold_italic", "SF-Pro-Text-BoldItalic.otf", "b60008700ecf3548a301d4fdc057be35c3a5daf6eb4cf5cacc17cc642b71d949", 700, True),
    ("sf_pro_text_heavy", "SF-Pro-Text-Heavy.otf", "2df9a6a6afe0fd1f4a6abfa49858b62d83f55f5d1cfd51e5d2ab03d94b33c8ed", 800, False),
    ("sf_pro_text_heavy_italic", "SF-Pro-Text-HeavyItalic.otf", "d007cea4ab1c5b586c9ebd3cddd319ded14464ef15e6e74052044979e05e7978", 800, True),
    ("sf_pro_text_black", "SF-Pro-Text-Black.otf", "b10adcc3fdea250c2c5debc41a8ae52ebf1834666cd629f137d2ee04704d8c5a", 900, False),
    # SF Pro Display (>= 20sp headlines, hero banners, screen titles, profile & call headers)
    ("sf_pro_display_light", "SF-Pro-Display-Light.otf", "b9f125dd23adb32e2d621c70d79c8e507def6fae7ecf869b94c1187909d753cc", 300, False),
    ("sf_pro_display_regular", "SF-Pro-Display-Regular.otf", "f1782b0e2b9be92a80d706926cda0cc36726853010a15a450e0d4aeaf5a319c8", 400, True if False else False),
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
# Fix exact SHA-256 of sf_pro_text_semibold_italic
SF_PRO_FONT_MANIFEST[8] = (
    "sf_pro_text_semibold_italic",
    "SF-Pro-Text-SemiboldItalic.otf",
    "a5364c578808b176e7f908ccf42df0b4ddb80965979c96989e960e15f22c9263",
    600,
    True,
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 256)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def download_remote_asset(remote_name: str, expected_sha: str, raw_dir: Path) -> Path:
    dest = raw_dir / remote_name
    if dest.exists() and sha256_file(dest) == expected_sha:
        return dest

    last_err: Exception | None = None
    for base in asset_bases():
        url = f"{base}/{remote_name}"
        try:
            headers = {"User-Agent": "JaText-APK-Builder/4.1"}
            if ESSENTIAL_STUFF_TOKEN and "raw.githubusercontent.com" in base:
                headers["Authorization"] = f"Bearer {ESSENTIAL_STUFF_TOKEN}"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
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
    hint = (
        "Add a repo secret named ESSENTIAL_STUFF_TOKEN with a fine grained "
        "pat that can read it"
        if not ESSENTIAL_STUFF_TOKEN
        else "the configured ESSENTIAL_STUFF_TOKEN cannot read it"
    )
    raise RuntimeError(
        f"Failed to download {remote_name} from {ESSENTIAL_STUFF_REPO}: "
        f"{last_err}. The repo is probably private or was renamed; {hint}."
    )


def download_one(entry: tuple[str, str, str, int, bool], raw_dir: Path) -> Path:
    _, remote_name, expected_sha, _, _ = entry
    return download_remote_asset(remote_name, expected_sha, raw_dir)


def load_emoji_grid() -> tuple[list[list[int]], dict[str, int]]:
    grid_path = Path(__file__).resolve().parent / "ios-emoji-grid.json"
    grid = json.loads(grid_path.read_text(encoding="utf-8"))
    return grid["cells"], grid["seqs"]


def get_emoji_exclude_codepoints(seqs: dict[str, int]) -> set[int]:
    excluded: set[int] = set()
    for hex_key in seqs.keys():
        parts = [int(p, 16) for p in hex_key.split("-")]
        if len(parts) == 1 and parts[0] >= 0x203C:
            excluded.add(parts[0])
    return excluded


def subset_one_worker(args: tuple[str, str, str, set[int]]) -> tuple[str, int, int]:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont

    res_name, raw_path_str, out_path_str, emoji_cps = args
    raw_path = Path(raw_path_str)
    out_path = Path(out_path_str)

    font = TTFont(str(raw_path))
    cmap = font.getBestCmap() or {}
    # Keep 100% of real Unicode text characters; strip Private Use Area (SF Symbols)
    # and Apple color emoji codepoints (>= U+203C) so emojis always hit jatext_ios_emoji.ttf!
    keep_unicodes = [
        cp
        for cp in cmap.keys()
        if not (0xE000 <= cp <= 0xF8FF or cp >= 0xF0000) and cp not in emoji_cps
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


def _encode_emoji_cell_worker(args: tuple[int, bytes, int]) -> tuple[int, bytes]:
    from PIL import Image

    idx, raw_rgba, px_size = args
    im = Image.frombytes("RGBA", (64, 64), raw_rgba)
    if px_size != 64:
        im = im.resize((px_size, px_size), Image.Resampling.LANCZOS)
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, format="PNG", optimize=True)
    return idx, buf.getvalue()


def build_ios_emoji_ttf(
    sheet_path: Path,
    cells: list[list[int]],
    seqs: dict[str, int],
    out_ttf: Path,
    px_size: int = 56,
) -> tuple[int, int]:
    from PIL import Image
    from fontTools.fontBuilder import FontBuilder
    from fontTools.ttLib import TTFont, newTable
    from fontTools.ttLib.tables import C_B_D_T_, C_B_L_C_, E_B_D_T_, E_B_L_C_, otTables

    sheet = Image.open(str(sheet_path)).convert("RGBA")
    ppem = max(32, round(px_size * 54 / 64))
    advance_px = px_size + 2
    bearing_x = 1
    bearing_y = round(px_size * 50 / 64)
    asc_px = bearing_y + 2
    desc_px = -(px_size - bearing_y + 2)
    unit_scale = 20
    upem = ppem * unit_scale

    raw_crops = [
        (idx, sheet.crop((sx * 66 + 1, sy * 66 + 1, sx * 66 + 65, sy * 66 + 65)).tobytes(), px_size)
        for idx, (sx, sy) in enumerate(cells)
    ]
    png_by_idx: dict[int, bytes] = {}
    with concurrent.futures.ProcessPoolExecutor() as pool:
        for idx, png_bytes in pool.map(_encode_emoji_cell_worker, raw_crops, chunksize=64):
            png_by_idx[idx] = png_bytes

    tiny_buf = io.BytesIO()
    Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(tiny_buf, format="PNG")
    tiny_png = tiny_buf.getvalue()

    glyph_order = [".notdef", "space"]
    metrics: dict[str, tuple[int, int]] = {
        ".notdef": (advance_px * unit_scale, 0),
        "space": (round(ppem * 0.5) * unit_scale, 0),
    }
    bitmap_data: dict[str, C_B_D_T_.cbdt_bitmap_format_17] = {}

    for idx in range(len(cells)):
        gname = f"e_{idx}"
        glyph_order.append(gname)
        metrics[gname] = (advance_px * unit_scale, bearing_x * unit_scale)
        m = E_B_D_T_.SmallGlyphMetrics()
        m.height = px_size
        m.width = px_size
        m.BearingX = bearing_x
        m.BearingY = bearing_y
        m.Advance = advance_px
        bmp = C_B_D_T_.cbdt_bitmap_format_17(b"", None)
        bmp.metrics = m
        bmp.imageData = png_by_idx[idx]
        bitmap_data[gname] = bmp

    parsed_seqs: list[tuple[tuple[int, ...], str]] = []
    single_cmap: dict[int, str] = {}
    needed_cps: set[int] = set()

    for hex_key, cell_idx in seqs.items():
        seq = tuple(int(p, 16) for p in hex_key.split("-"))
        if any(cp < 0x80 for cp in seq):
            continue
        if len(seq) == 1 and seq[0] < 0x203C:
            continue
        target_glyph = f"e_{cell_idx}"
        if len(seq) == 1:
            single_cmap[seq[0]] = target_glyph
        else:
            parsed_seqs.append((seq, target_glyph))
            for cp in seq:
                needed_cps.add(cp)

    cmap: dict[int, str] = dict(single_cmap)
    for cp in sorted(needed_cps | {0x200D, 0xFE0F}):
        if cp in cmap:
            continue
        hname = f"u_{cp:x}"
        glyph_order.append(hname)
        cmap[cp] = hname
        metrics[hname] = (0, 0)
        hm = E_B_D_T_.SmallGlyphMetrics()
        hm.height = 1
        hm.width = 1
        hm.BearingX = 0
        hm.BearingY = 1
        hm.Advance = 0
        hbmp = C_B_D_T_.cbdt_bitmap_format_17(b"", None)
        hbmp.metrics = hm
        hbmp.imageData = tiny_png
        bitmap_data[hname] = hbmp

    fb = FontBuilder(upem, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=asc_px * unit_scale, descent=desc_px * unit_scale)
    fb.setupNameTable({
        "familyName": "JaText iOS Emoji",
        "styleName": "Regular",
        "uniqueFontIdentifier": "JaText-iOS-26.4-Emoji-Unicode-17.0",
        "fullName": "JaText iOS Emoji Regular",
        "psName": "JaTextIosEmoji-Regular",
        "version": "Version 4.1.0",
    })
    fb.setupOS2(
        sTypoAscender=asc_px * unit_scale,
        sTypoDescender=desc_px * unit_scale,
        sTypoLineGap=0,
        usWinAscent=asc_px * unit_scale,
        usWinDescent=abs(desc_px * unit_scale),
    )
    fb.setupPost()

    font = fb.font
    maxp = newTable("maxp")
    maxp.tableVersion = 0x00005000
    maxp.numGlyphs = len(glyph_order)
    font["maxp"] = maxp

    ligs_by_first: dict[str, dict[tuple[str, ...], str]] = {}
    for seq, target_glyph in parsed_seqs:
        g_seq = tuple(cmap[cp] for cp in seq)
        if len(g_seq) >= 2:
            ligs_by_first.setdefault(g_seq[0], {})[g_seq[1:]] = target_glyph

    gsub = newTable("GSUB")
    gsub_tbl = otTables.GSUB()
    gsub_tbl.Version = 0x00010000

    lig_sub = otTables.LigatureSubst()
    lig_sub.Format = 1
    lig_map: dict[str, list[otTables.Ligature]] = {}
    for first_g, rest_dict in sorted(ligs_by_first.items(), key=lambda kv: font.getGlyphID(kv[0])):
        sorted_items = sorted(
            rest_dict.items(),
            key=lambda kv: (-len(kv[0]), [font.getGlyphID(x) for x in kv[0]]),
        )
        lig_list = []
        for rest_g, target_g in sorted_items:
            lig = otTables.Ligature()
            lig.CompCount = len(rest_g) + 1
            lig.Component = list(rest_g)
            lig.LigGlyph = target_g
            lig_list.append(lig)
        lig_map[first_g] = lig_list
    lig_sub.ligatures = lig_map

    lookup = otTables.Lookup()
    lookup.LookupType = 4
    lookup.LookupFlag = 0
    lookup.SubTable = [lig_sub]
    lookup.SubTableCount = 1

    gsub_tbl.LookupList = otTables.LookupList()
    gsub_tbl.LookupList.Lookup = [lookup]
    gsub_tbl.LookupList.LookupCount = 1

    gsub_tbl.FeatureList = otTables.FeatureList()
    gsub_tbl.FeatureList.FeatureRecord = []
    for feat_tag in ("ccmp", "liga", "rlig"):
        fr = otTables.FeatureRecord()
        fr.FeatureTag = feat_tag
        fr.Feature = otTables.Feature()
        fr.Feature.FeatureParams = None
        fr.Feature.LookupCount = 1
        fr.Feature.LookupListIndex = [0]
        gsub_tbl.FeatureList.FeatureRecord.append(fr)
    gsub_tbl.FeatureList.FeatureCount = len(gsub_tbl.FeatureList.FeatureRecord)

    lang_sys = otTables.LangSys()
    lang_sys.LookupOrder = None
    lang_sys.ReqFeatureIndex = 0xFFFF
    lang_sys.FeatureIndex = [0, 1, 2]
    lang_sys.FeatureCount = 3

    gsub_tbl.ScriptList = otTables.ScriptList()
    gsub_tbl.ScriptList.ScriptRecord = []
    for script_tag in ("DFLT", "latn"):
        sr = otTables.ScriptRecord()
        sr.ScriptTag = script_tag
        sr.Script = otTables.Script()
        sr.Script.DefaultLangSys = lang_sys
        sr.Script.LangSysRecord = []
        sr.Script.LangSysCount = 0
        gsub_tbl.ScriptList.ScriptRecord.append(sr)
    gsub_tbl.ScriptList.ScriptCount = len(gsub_tbl.ScriptList.ScriptRecord)
    gsub.table = gsub_tbl
    font["GSUB"] = gsub

    cbdt = newTable("CBDT")
    cbdt.version = 3.0
    cbdt.strikeData = [bitmap_data]
    font["CBDT"] = cbdt

    cblc = newTable("CBLC")
    cblc.version = 3.0
    strike = E_B_L_C_.Strike()
    bst = strike.bitmapSizeTable
    bst.hori = E_B_L_C_.SbitLineMetrics()
    bst.vert = E_B_L_C_.SbitLineMetrics()
    bst.ppemX = ppem
    bst.ppemY = ppem
    bst.bitDepth = 32
    bst.flags = 1
    bst.colorRef = 0
    color_glyph_names = glyph_order[2:]
    first_gid = font.getGlyphID(color_glyph_names[0])
    last_gid = font.getGlyphID(color_glyph_names[-1])
    bst.startGlyphIndex = first_gid
    bst.endGlyphIndex = last_gid
    for line_m in (bst.hori, bst.vert):
        line_m.ascender = asc_px
        line_m.descender = desc_px
        line_m.widthMax = advance_px
        line_m.caretSlopeNumerator = 0
        line_m.caretSlopeDenominator = 0
        line_m.caretOffset = 0
        line_m.minOriginSB = 0
        line_m.minAdvanceSB = 0
        line_m.maxBeforeBL = asc_px
        line_m.minAfterBL = desc_px
        line_m.pad1 = 0
        line_m.pad2 = 0

    bst_sub = E_B_L_C_.eblc_index_sub_table_1(b"", font)
    bst_sub.indexFormat = 1
    bst_sub.firstGlyphIndex = first_gid
    bst_sub.lastGlyphIndex = last_gid
    bst_sub.imageFormat = 17
    bst_sub.names = color_glyph_names
    strike.indexSubTables = [bst_sub]
    cblc.strikes = [strike]
    font["CBLC"] = cblc

    tmp_out = out_ttf.with_suffix(".tmp.ttf")
    out_ttf.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(tmp_out))

    verify = TTFont(str(tmp_out))
    num_glyphs = verify["maxp"].numGlyphs
    if "CBDT" not in verify or "CBLC" not in verify or "GSUB" not in verify or num_glyphs < 3900:
        raise RuntimeError(f"Invalid iOS emoji font generated ({num_glyphs} glyphs)")
    verify.close()
    tmp_out.replace(out_ttf)
    return out_ttf.stat().st_size, num_glyphs


def generate_offline_stubs(out_dir: Path) -> None:
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen

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

    # Generate valid offline TTF stub for jatext_ios_emoji.ttf
    emoji_stub = out_dir / f"{IOS_EMOJI_RES_NAME}.ttf"
    efb = FontBuilder(1000, isTTF=True)
    efb.setupGlyphOrder([".notdef", "space"])
    efb.setupCharacterMap({0x0020: "space"})
    nd_pen = TTGlyphPen(None)
    nd_pen.moveTo((50, 0))
    nd_pen.lineTo((450, 0))
    nd_pen.lineTo((450, 700))
    nd_pen.lineTo((50, 700))
    nd_pen.closePath()
    sp_tt_pen = TTGlyphPen(None)
    efb.setupGlyf({".notdef": nd_pen.glyph(), "space": sp_tt_pen.glyph()})
    efb.setupHorizontalMetrics({".notdef": (500, 50), "space": (250, 0)})
    efb.setupHorizontalHeader(ascent=800, descent=-200)
    efb.setupNameTable({
        "familyName": "JaText iOS Emoji",
        "styleName": "Regular",
        "uniqueFontIdentifier": "JaTextIosEmoji-Stub",
        "fullName": "JaText iOS Emoji Regular",
        "psName": "JaTextIosEmoji-Regular",
        "version": "Version 1.0 (offline stub)",
    })
    efb.setupOS2(
        sTypoAscender=800,
        sTypoDescender=-200,
        usWinAscent=950,
        usWinDescent=250,
    )
    efb.setupPost()
    efb.save(str(emoji_stub))

    print(
        f"Generated {len(SF_PRO_FONT_MANIFEST)} SF Pro OTF stubs + "
        f"{IOS_EMOJI_RES_NAME}.ttf stub in {out_dir}"
    )


def fetch_and_prepare(out_dir: Path, cache_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    subset_cache = cache_dir / "subset_v2"
    raw_cache = cache_dir / "raw_v1"
    subset_cache.mkdir(parents=True, exist_ok=True)
    raw_cache.mkdir(parents=True, exist_ok=True)

    cells, seqs = load_emoji_grid()
    emoji_exclude_cps = get_emoji_exclude_codepoints(seqs)

    all_sf_cached = all(
        (subset_cache / f"{res_name}.otf").exists()
        and (subset_cache / f"{res_name}.otf").stat().st_size >= 50_000
        for res_name, *_ in SF_PRO_FONT_MANIFEST
    )
    if not all_sf_cached:
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
                emoji_exclude_cps,
            )
            for entry, raw_path in zip(SF_PRO_FONT_MANIFEST, raw_paths)
        ]
        print(f"Preparing {len(jobs)} SF Pro OpenType fonts for Android res/font/...")
        with concurrent.futures.ProcessPoolExecutor() as proc_pool:
            for res_name, sz, glyphs in proc_pool.map(subset_one_worker, jobs):
                print(f"  ✓ {res_name}.otf: {sz:,} bytes ({glyphs:,} glyphs)")
    else:
        print(f"Restored all {len(SF_PRO_FONT_MANIFEST)} SF Pro fonts from cache ({subset_cache})")

    emoji_cached_ttf = subset_cache / f"{IOS_EMOJI_RES_NAME}.ttf"
    if not (emoji_cached_ttf.exists() and emoji_cached_ttf.stat().st_size >= 4_000_000):
        print(f"Downloading {IOS_EMOJI_SHEET_REMOTE} from JaText-Essential-Stuff...")
        raw_sheet = download_remote_asset(
            IOS_EMOJI_SHEET_REMOTE, IOS_EMOJI_SHEET_SHA256, raw_cache
        )
        print("Building iOS 26.4 Unicode 17.0 CBDT+CBLC+GSUB color emoji font...")
        esz, eglyphs = build_ios_emoji_ttf(raw_sheet, cells, seqs, emoji_cached_ttf, px_size=56)
        print(f"  ✓ {IOS_EMOJI_RES_NAME}.ttf: {esz:,} bytes ({eglyphs:,} glyphs)")
    else:
        print(f"Restored {IOS_EMOJI_RES_NAME}.ttf from cache ({emoji_cached_ttf})")

    total_bytes = 0
    for res_name, *_ in SF_PRO_FONT_MANIFEST:
        src = subset_cache / f"{res_name}.otf"
        dst = out_dir / f"{res_name}.otf"
        shutil.copy2(src, dst)
        total_bytes += dst.stat().st_size

    emoji_dst = out_dir / f"{IOS_EMOJI_RES_NAME}.ttf"
    shutil.copy2(emoji_cached_ttf, emoji_dst)
    total_bytes += emoji_dst.stat().st_size

    print(
        f"Installed {len(SF_PRO_FONT_MANIFEST)} SF Pro fonts + {IOS_EMOJI_RES_NAME}.ttf "
        f"into {out_dir} ({total_bytes / (1024 * 1024):.2f} MiB total)."
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

        ttf_infos = [
            info
            for info in zf.infolist()
            if info.filename.startswith("res/")
            and info.filename.endswith(".ttf")
            and info.file_size >= 4_000_000
        ]
        valid_emoji_ttfs = []
        for info in ttf_infos:
            blob = zf.read(info.filename)
            if blob[:4] == b"\x00\x01\x00\x00" and b"CBDT" in blob[:512] and b"CBLC" in blob[:512] and b"GSUB" in blob[:512]:
                valid_emoji_ttfs.append(info)
        if not valid_emoji_ttfs:
            raise SystemExit(
                "iOS 26.4 Emoji TTF verification failed! Missing >=4 MB CBDT+CBLC+GSUB .ttf in APK res/!"
            )

        arsc = zf.read("resources.arsc")
        for probe in (
            b"sf_pro_text_regular",
            b"sf_pro_display_bold",
            b"sf_pro_rounded_semibold",
            b"jatext_ios_emoji",
        ):
            if probe not in arsc:
                raise SystemExit(f"Missing font resource {probe!r} in resources.arsc!")
        total = sum(i.file_size for i in valid_otfs) + sum(i.file_size for i in valid_emoji_ttfs)
        print(
            f"Verified all {len(valid_otfs)} Apple SF Pro OTFs + iOS 26.4 Unicode 17.0 Color Emoji TTF "
            f"inside {apk_path.name} ({total / (1024 * 1024):.2f} MiB uncompressed)."
        )


def installed_fonts_are_real(out_dir: Path) -> bool:
    """Whether res/font already holds the real subsets rather than placeholders.

    The build used to fail outright when the asset repo could not be reached,
    even though the APK in the repo already ships the same fonts. If the real
    files are present, generating them again from the network is pointless.
    """
    for res_name, *_ in SF_PRO_FONT_MANIFEST:
        otf = out_dir / f"{res_name}.otf"
        if not otf.exists() or otf.stat().st_size < 50_000:
            return False
    emoji = out_dir / f"{IOS_EMOJI_RES_NAME}.ttf"
    return emoji.exists() and emoji.stat().st_size >= 4_000_000


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    default_out = repo_root / "android" / "app" / "src" / "main" / "res" / "font"
    default_cache = Path.home() / ".cache" / "jatext-sf-pro-fonts"

    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Download & prepare real SF Pro + iOS Emoji fonts")
    parser.add_argument("--force", action="store_true", help="Regenerate even when res/font already has real fonts")
    parser.add_argument("--generate-stubs", action="store_true", help="Generate valid offline OTF/TTF stubs")
    parser.add_argument("--verify-apk", type=Path, default=None, help="Verify bundled SF Pro + iOS Emoji fonts in APK")
    parser.add_argument("--out-dir", type=Path, default=default_out)
    parser.add_argument("--cache-dir", type=Path, default=default_cache)
    args = parser.parse_args()

    if args.verify_apk is not None:
        verify_apk_fonts(args.verify_apk)
    elif args.generate_stubs:
        generate_offline_stubs(args.out_dir)
    elif args.fetch:
        if not args.force and installed_fonts_are_real(args.out_dir):
            print(
                f"res/font already holds all {len(SF_PRO_FONT_MANIFEST)} SF Pro subsets "
                f"+ {IOS_EMOJI_RES_NAME}.ttf, skipping the download. "
                "Pass --force to rebuild them from JaText-Essential-Stuff."
            )
            return
        fetch_and_prepare(args.out_dir, args.cache_dir)
    else:
        parser.error("Specify --fetch, --generate-stubs, or --verify-apk <path>")


if __name__ == "__main__":
    main()
