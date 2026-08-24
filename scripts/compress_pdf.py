#!/usr/bin/env python3
"""Reduce a PDF's file size, with the size/quality trade-off made explicitly.

Interactive (just run it, it asks):

    python scripts/compress_pdf.py

Or drive it directly:

    python scripts/compress_pdf.py in.pdf                  # level 1, lossless
    python scripts/compress_pdf.py in.pdf --level 2
    python scripts/compress_pdf.py in.pdf --level 3 -o small.pdf
    python scripts/compress_pdf.py *.pdf --level 1 --in-place

THE THREE LEVELS

    1  Lossless          Graphics untouched, byte for byte. A few percent.
    2  Balanced          Large photos reduced to 150 DPI. Crisp on any screen.
    3  Smallest          Large photos reduced to 96 DPI. Fine on screen and
                         projector; not for print.

LOGOS AND ICONS ARE NEVER RESAMPLED, AT ANY LEVEL. Anything under 64 KB, or
drawn smaller than two inches on the page, is carried across untouched. A logo
is small in bytes and precise in appearance: resampling one costs almost nothing
in file size and is immediately visible in its edges and lettering. Only large
photographs — banners, backgrounds, full-bleed images — are ever touched, and
only at levels 2 and 3.

WHY LEVEL 1 IS THE DEFAULT. Reducing a file and redesigning it are different
decisions. Level 1 recompresses streams, drops unreferenced objects, merges
duplicates and subsets fonts; the output renders identically, pixel for pixel.
It is honest about its ceiling: on an already-tight file it will find close to
nothing, and no lossless tool will do better.

IF A PDF IS FAR BIGGER THAN IT SHOULD BE, CHECK THE PAGE SIZE FIRST. A deck
exported at 1440x810pt instead of its designed 960x540pt carries four times the
pixels it needs in every image. That is a re-export, not a compression problem,
and no level here will recover it as cleanly.

Requires PyMuPDF (and Pillow for levels 2-3):  pip install pymupdf pillow
"""

# pylint: disable=broad-exception-caught,too-many-locals,too-many-branches
# pylint: disable=too-many-statements,too-many-arguments,invalid-name
#
# The broad excepts are load-bearing: a single malformed image inside an
# otherwise fine PDF must be skipped, not allowed to abort the document.

from __future__ import annotations

import argparse
import io
import os
import shutil
import sys
import tempfile

# Windows consoles default to cp1252 and cannot encode the symbols below. A
# crash while printing success would report failure for work that completed.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF is required:  pip install pymupdf")

try:
    from PIL import Image
    # Pillow 10 moved the filters onto Image.Resampling; the old alias still
    # resolves but is not in the typed stubs and may not survive Pillow 11.
    RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
except ImportError:
    Image = None
    RESAMPLE = None


# ── the size/quality levels ──────────────────────────────────────────────────

LEVELS = {
    1: {
        "name": "Lossless",
        "dpi": None,          # None = never touch an image
        "quality": None,
        "blurb": "Graphics untouched, byte for byte. Usually a few percent.",
    },
    2: {
        "name": "Balanced",
        "dpi": 150,
        "quality": 85,
        "blurb": "Large photos reduced to 150 DPI. Stays crisp on any screen.",
    },
    3: {
        "name": "Smallest",
        "dpi": 96,
        "quality": 78,
        "blurb": "Large photos reduced to 96 DPI. Fine on screen; not for print.",
    },
}

# Guards that apply at EVERY level. See the module docstring: these are what stop
# a logo being sacrificed for a rounding error's worth of bytes.
MIN_IMAGE_BYTES = 64 * 1024
MIN_DISPLAY_INCHES = 2.0


def mb(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB"


def fingerprint(path: str) -> tuple[int, int, int]:
    """(pages, words, images) — what must survive any level."""
    with fitz.open(path) as doc:
        return (
            doc.page_count,
            sum(len(p.get_text().split()) for p in doc),
            sum(len(p.get_images(full=True)) for p in doc),
        )


def lossless(src: str, dst: str, subset: bool = True) -> None:
    doc = fitz.open(src)
    if subset:
        try:
            doc.subset_fonts()
        except Exception:
            pass  # a font it cannot rewrite is no reason to abandon the pass
    doc.save(dst, garbage=4, deflate=True, deflate_images=True,
             deflate_fonts=True, clean=True, pretty=False)
    doc.close()


def downsample_photos(path: str, target_dpi: int, quality: int, verbose: bool) -> tuple[int, int]:
    """Reduce over-resolution PHOTOS only. Returns (changed, protected)."""
    if Image is None:
        print("   Pillow not installed — photos left untouched.")
        return 0, 0

    doc = fitz.open(path)
    changed = protected = 0

    for pno in range(doc.page_count):
        page = doc[pno]
        for info in page.get_images(full=True):
            xref = info[0]
            try:
                rects = page.get_image_rects(xref)
                if not rects:
                    continue
                # Largest placement decides. The same image may appear twice, and
                # shrinking it for a thumbnail would blur the full-bleed copy.
                rect = max(rects, key=lambda r: r.width * r.height)
                raw = doc.extract_image(xref)
            except Exception:
                continue

            data = raw.get("image")
            width, height = raw.get("width", 0), raw.get("height", 0)
            if not data or not width or not height:
                continue

            # ── the logo guards, before DPI is even considered ──
            if len(data) < MIN_IMAGE_BYTES:
                protected += 1
                continue
            if (rect.width / 72.0 < MIN_DISPLAY_INCHES
                    and rect.height / 72.0 < MIN_DISPLAY_INCHES):
                protected += 1
                continue

            # Display DPI, not stored resolution: an image is only as good as the
            # box it is drawn into.
            dpi = max(width / max(rect.width / 72.0, 0.01),
                      height / max(rect.height / 72.0, 0.01))
            if dpi <= target_dpi * 1.1:
                continue

            scale = target_dpi / dpi
            new_w, new_h = max(1, int(width * scale)), max(1, int(height * scale))
            try:
                img = Image.open(io.BytesIO(data))
                alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
                img = img.resize((new_w, new_h), RESAMPLE)
                buf = io.BytesIO()
                if alpha:
                    # Transparency must survive. Flattening onto white puts a hard
                    # rectangle behind anything sitting on a tinted background.
                    img.save(buf, format="PNG", optimize=True)
                else:
                    img.convert("RGB").save(buf, format="JPEG", quality=quality, optimize=True)
                new = buf.getvalue()
            except Exception:
                continue

            # Re-encoding an already-optimal image can inflate it.
            if len(new) >= len(data):
                continue
            try:
                page.replace_image(xref, stream=new)
            except Exception:
                continue

            changed += 1
            if verbose:
                print(f"      p{pno + 1}  {width}x{height} @{dpi:.0f}dpi -> {new_w}x{new_h}   "
                      f"{mb(len(data))} -> {mb(len(new))}")

    if changed:
        tmp = path + ".tmp"
        doc.save(tmp, garbage=4, deflate=True, clean=True)
        doc.close()
        os.replace(tmp, path)
    else:
        doc.close()
    return changed, protected


# ── interactive prompts ──────────────────────────────────────────────────────

def ask_file() -> str | None:
    print("\nWhich PDF? (drag the file into this window, or paste its path)")
    while True:
        try:
            raw = input("  file> ").strip()
        except (EOFError, KeyboardInterrupt):
            return None
        if not raw:
            return None
        # Windows "Copy as path" wraps in quotes; drag-and-drop may too.
        path = raw.strip('"').strip("'").strip()
        if os.path.isfile(path) and path.lower().endswith(".pdf"):
            return path
        if os.path.isfile(path):
            print("  That is not a .pdf")
        else:
            print("  No file at that path — try again, or press Enter to quit.")


def ask_level() -> int | None:
    print("\nHow far should it go?\n")
    for n, cfg in LEVELS.items():
        print(f"  {n}  {cfg['name']:<10} {cfg['blurb']}")
    print("\n  Logos and icons are never resampled, at any level.")
    while True:
        try:
            raw = input("\n  level [1]> ").strip()
        except (EOFError, KeyboardInterrupt):
            return None
        if raw == "":
            return 1
        if raw in ("1", "2", "3"):
            return int(raw)
        print("  Enter 1, 2 or 3.")


def ask_yes(question: str) -> bool:
    try:
        return input(f"  {question} [y/N]> ").strip().lower().startswith("y")
    except (EOFError, KeyboardInterrupt):
        return False


# ── the work ─────────────────────────────────────────────────────────────────

def process(src: str, out: str | None, level: int, in_place: bool,
            verbose: bool, confirm: bool) -> bool:
    cfg = LEVELS[level]
    before = os.path.getsize(src)
    fp_in = fingerprint(src)

    target = src if in_place else (out or os.path.splitext(src)[0] + ".min.pdf")
    if not in_place and os.path.abspath(target) == os.path.abspath(src):
        print("  Refusing to overwrite the source. Use --in-place, or -o.")
        return False

    print(f"\n  {os.path.basename(src)}")
    print(f"     in:    {mb(before)} · {fp_in[0]} pages · {fp_in[2]} images")
    print(f"     level: {level} — {cfg['name']}")

    fd, tmp = tempfile.mkstemp(suffix=".pdf",
                               dir=os.path.dirname(os.path.abspath(target)) or ".")
    os.close(fd)
    try:
        lossless(src, tmp)
        if cfg["dpi"] is not None:
            count, protected = downsample_photos(tmp, cfg["dpi"], cfg["quality"], verbose)
            print(f"     photos: {count} reduced, {protected} logo/icon(s) protected")
            tmp2 = tmp + ".2"
            lossless(tmp, tmp2, subset=False)
            if os.path.getsize(tmp2) < os.path.getsize(tmp):
                os.replace(tmp2, tmp)
            elif os.path.exists(tmp2):
                os.remove(tmp2)
        else:
            print("     photos: untouched (lossless)")

        fp_out = fingerprint(tmp)
        # Image COUNT must match even at levels 2-3: photos may be re-encoded,
        # never dropped. Page and word counts must match at every level.
        if fp_out != fp_in:
            names = ("pages", "words", "images")
            diffs = [f"{n}: {a} -> {b}" for n, a, b in zip(names, fp_in, fp_out) if a != b]
            print(f"     ✗ REFUSED — {', '.join(diffs)}. Nothing written.")
            return False

        after = os.path.getsize(tmp)
        if after >= before:
            print("     already optimal at this level — original left alone")
            return True

        pct = 100 * (1 - after / before)
        print(f"     out:   {mb(after)}   ({pct:.1f}% smaller)")

        if confirm and in_place and not ask_yes(f"Overwrite {os.path.basename(src)}?"):
            print("     cancelled — original untouched")
            return True

        shutil.move(tmp, target)
        tmp = None
        print(f"     wrote: {target}")
        return True
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Reduce PDF file size. Logos and icons are never resampled.")
    ap.add_argument("files", nargs="*", help="PDF file(s); omit to be asked")
    ap.add_argument("-o", "--out", help="output path (single input only)")
    ap.add_argument("--level", type=int, choices=[1, 2, 3],
                    help="1 lossless (default) · 2 balanced · 3 smallest")
    ap.add_argument("--in-place", action="store_true",
                    help="overwrite the original, after verification")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    interactive = not args.files
    files = args.files
    level = args.level

    if interactive:
        print("─" * 62)
        print(" PDF compressor — logos and icons are never resampled")
        print("─" * 62)
        f = ask_file()
        if not f:
            print("\nNothing to do.\n")
            return 0
        files = [f]

    if level is None:
        level = ask_level() if interactive else 1
        if level is None:
            print("\nNothing to do.\n")
            return 0

    if args.out and len(files) > 1:
        return print("-o takes a single input file.") or 2
    missing = [f for f in files if not os.path.isfile(f)]
    if missing:
        return print("Not found: " + ", ".join(missing)) or 2

    ok = True
    for f in files:
        ok = process(f, args.out, level, args.in_place, args.verbose, interactive) and ok

    print()
    if ok:
        print("✅ Verified: pages, text and image count unchanged.\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
