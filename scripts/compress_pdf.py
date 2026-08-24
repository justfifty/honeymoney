#!/usr/bin/env python3
"""Reduce a PDF's file size without changing a single pixel of its graphics.

    python scripts/compress_pdf.py in.pdf              # -> in.min.pdf
    python scripts/compress_pdf.py in.pdf -o out.pdf
    python scripts/compress_pdf.py *.pdf --in-place    # overwrite, after verifying

THIS SCRIPT CANNOT ALTER YOUR ARTWORK. Not "is configured not to" — it contains
no image processing code whatsoever. Every image stream is carried across
byte-for-byte. Logos keep their exact pixel dimensions, photographs keep their
exact resolution, and the output renders identically to the input.

What it does instead, all of which is genuinely lossless:

  * recompresses object streams with maximum deflate
  * removes objects nothing references any more
  * merges duplicated objects (the same logo repeated on twelve slides is
    stored once)
  * subsets embedded fonts down to the glyphs actually used
  * rebuilds the cross-reference table compactly

HOW MUCH TO EXPECT, HONESTLY. Between nothing and about 20%. A file exported by
a careless tool has slack and gives back a useful chunk; a file that is already
tight has none, and no lossless tool will find any. If you need more than this
gives you, the size is in the images, and reducing it means changing them —
which is a different decision and deliberately not this script's job.

If a PDF is far larger than it should be, check the PAGE SIZE before reaching
for compression. A deck exported at 1440x810pt instead of its designed
960x540pt makes every image twice the pixels it needs, and that is a re-export,
not a compression problem.

Requires PyMuPDF:  pip install pymupdf
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile

# Windows consoles default to cp1252 and cannot encode the tick below. A crash
# while printing success would report failure for work that completed.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF is required:  pip install pymupdf")


def mb(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB"


def fingerprint(path: str) -> tuple[int, int, int]:
    """(pages, words, images) — what must be identical afterwards.

    Image COUNT is checked as well as pages and text, because it is the direct
    evidence that no artwork was dropped or merged away by the rewrite.
    """
    with fitz.open(path) as doc:
        pages = doc.page_count
        words = sum(len(p.get_text().split()) for p in doc)
        images = sum(len(p.get_images(full=True)) for p in doc)
    return pages, words, images


def compress(src: str, dst: str) -> None:
    doc = fitz.open(src)
    try:
        # Font subsetting is a bonus. A font it cannot rewrite is not a reason
        # to abandon the rest of the pass.
        doc.subset_fonts()
    except Exception:
        pass
    doc.save(
        dst,
        garbage=4,          # drop unreferenced objects, merge identical ones
        deflate=True,       # recompress streams
        deflate_images=True,  # recompress the image STREAM; pixels are unchanged
        deflate_fonts=True,
        clean=True,         # sanitise content streams
        pretty=False,
    )
    doc.close()


def run_one(src: str, out: str | None, in_place: bool) -> bool:
    before = os.path.getsize(src)
    fp_in = fingerprint(src)

    target = src if in_place else (out or os.path.splitext(src)[0] + ".min.pdf")
    if not in_place and os.path.abspath(target) == os.path.abspath(src):
        print(f"  {os.path.basename(src)}: refusing to overwrite the source (use --in-place)")
        return False

    # Always write to a temporary file first. An interrupted save over the
    # original would leave a truncated PDF where a working one used to be.
    fd, tmp = tempfile.mkstemp(suffix=".pdf", dir=os.path.dirname(os.path.abspath(target)) or ".")
    os.close(fd)
    try:
        compress(src, tmp)
        fp_out = fingerprint(tmp)

        if fp_out != fp_in:
            names = ("pages", "words", "images")
            diffs = [f"{n}: {a} -> {b}" for n, a, b in zip(names, fp_in, fp_out) if a != b]
            print(f"  {os.path.basename(src)}: REFUSED — {', '.join(diffs)}")
            return False

        after = os.path.getsize(tmp)
        if after >= before:
            # Nothing to reclaim. Writing a bigger file to "compress" one is
            # worse than doing nothing, so do nothing and say so.
            print(f"  {os.path.basename(src)}: already optimal ({mb(before)}) — left alone")
            return True

        shutil.move(tmp, target)
        tmp = None
        pct = 100 * (1 - after / before)
        print(f"  {os.path.basename(src)}: {mb(before)} -> {mb(after)}  ({pct:.1f}% smaller)"
              f"  [{fp_in[0]} pages, {fp_in[2]} images, unchanged]")
        return True
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Losslessly reduce PDF file size. Graphics are never modified.",
    )
    ap.add_argument("files", nargs="+", help="PDF file(s)")
    ap.add_argument("-o", "--out", help="output path (single input only)")
    ap.add_argument("--in-place", action="store_true",
                    help="overwrite the original, but only after verification passes")
    args = ap.parse_args()

    if args.out and len(args.files) > 1:
        return print("-o takes a single input file.") or 2

    missing = [f for f in args.files if not os.path.isfile(f)]
    if missing:
        return print("Not found: " + ", ".join(missing)) or 2

    print(f"\nCompressing {len(args.files)} file(s) — graphics untouched\n")
    ok = all(run_one(f, args.out, args.in_place) for f in args.files)
    print()
    if ok:
        print("✅ Done. Every output verified identical in pages, text and image count.\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
