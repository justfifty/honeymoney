#!/usr/bin/env python3
"""Shrink a PDF, and be honest about what that costs.

    python scripts/shrink_pdf.py in.pdf                 # -> in.min.pdf
    python scripts/shrink_pdf.py in.pdf -o out.pdf
    python scripts/shrink_pdf.py in.pdf --lossless      # never touch an image
    python scripts/shrink_pdf.py in.pdf --dpi 120 -q 80 # push harder
    python scripts/shrink_pdf.py in.pdf --target 50     # stop once 50% smaller

WHAT "WITHOUT LOSING QUALITY" ACTUALLY MEANS
--------------------------------------------
A guaranteed 50% reduction with literally zero information loss is not
achievable in general. It is worth being precise about why, because the honest
answer changes what you should ask for:

  TRULY LOSSLESS -- nothing is discarded, output renders identically:
    * recompress streams, drop dead objects, deduplicate, subset fonts
    * typically 5-20%, occasionally more on a bloated file, sometimes ~0% on a
      file that is already tight

  VISUALLY LOSSLESS -- information IS discarded, at a scale nobody can see:
    * downsample images that carry more pixels than the page can ever show
    * this is where a 50% cut normally comes from

A 3000px-wide photo placed in a 13-inch-wide box is being displayed at ~230 DPI.
Print work wants 300. A deck read on a laptop or thrown at a projector resolves
nowhere near 150. Those extra pixels are not quality; they are bytes nobody will
ever look at. Removing them is lossy in the strict sense and invisible in the
practical one -- so this script does the lossless pass FIRST, tells you what it
achieved on its own, and only touches images if you still need more.

WHAT IT REFUSES TO DO
---------------------
Verification is not optional. After writing, it checks the output has the same
page count and has not lost extractable text, and it deletes the output and
exits non-zero if either fails. A smaller file that dropped a page or turned
text into pictures is not a smaller file, it is a different document -- and both
have happened to this repo's deck through hand exports.

Requires PyMuPDF and Pillow.
"""

from __future__ import annotations

import argparse
import io
import os
import sys

# Windows consoles default to cp1252, which cannot encode the tick and cross
# below — and a UnicodeEncodeError AFTER a successful shrink is a crash that
# reports failure for work that actually completed.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF is required:  pip install pymupdf")

try:
    from PIL import Image
except ImportError:
    Image = None  # only needed for the image pass


def mb(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB"


def stats(path: str) -> tuple[int, int]:
    """(pages, words) — the two things that must survive."""
    with fitz.open(path) as doc:
        pages = doc.page_count
        words = sum(len(p.get_text().split()) for p in doc)
    return pages, words


def lossless_pass(src: str, dst: str, subset_fonts: bool = True) -> None:
    """Rewrite with maximum compression. Nothing is discarded."""
    doc = fitz.open(src)
    if subset_fonts:
        try:
            doc.subset_fonts()
        except Exception:
            # Subsetting is a bonus, not the point. A font it cannot rewrite is
            # not a reason to abandon the whole pass.
            pass
    doc.save(
        dst,
        garbage=4,        # drop unreferenced objects and merge duplicates
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        clean=True,       # sanitise content streams
        pretty=False,
    )
    doc.close()


def effective_dpi(pix_w: int, pix_h: int, rect) -> float:
    """How many pixels per inch this image is ACTUALLY displayed at.

    PDF units are 1/72 inch. An image is only as good as the box it is drawn
    into, so a 3000px image in a 200pt box is a 1080 DPI image — which is 1000
    DPI of bytes nobody can see.
    """
    w_in = max(rect.width, 1) / 72.0
    h_in = max(rect.height, 1) / 72.0
    return max(pix_w / w_in, pix_h / h_in)


# Below this, downsampling cannot meaningfully help the file and can visibly
# hurt it. Logos and icons are small in bytes and precise in appearance: their
# edges and lettering are the first thing resampling destroys. The first version
# of this script shrank ten of them on a 7 MB deck, saved about 0.1 MB, and blurred
# every logo on the page -- all of the cost, none of the benefit.
MIN_IMAGE_BYTES = 64 * 1024

# An image drawn smaller than this on the page is furniture -- a logo, an icon, a
# bullet. Extra pixels in a small box are what keep its edges crisp on a retina
# screen and in print, so they are not waste.
MIN_DISPLAY_INCHES = 2.0


def image_pass(path: str, target_dpi: int, quality: int, verbose: bool) -> int:
    """Downsample over-resolution images in place. Returns images changed."""
    if Image is None:
        print("   Pillow not installed — skipping the image pass.")
        return 0

    doc = fitz.open(path)
    changed = 0
    skipped_small = 0

    for pno in range(doc.page_count):
        page = doc[pno]
        for info in page.get_images(full=True):
            xref = info[0]
            try:
                rects = page.get_image_rects(xref)
            except Exception:
                continue
            if not rects:
                continue
            # Largest placement wins: the same image may appear more than once,
            # and shrinking it for the small instance would blur the big one.
            rect = max(rects, key=lambda r: r.width * r.height)

            try:
                raw = doc.extract_image(xref)
            except Exception:
                continue
            data, w, h = raw.get("image"), raw.get("width", 0), raw.get("height", 0)
            if not data or not w or not h:
                continue

            # Two guards before DPI is even considered, because a high DPI on a
            # small graphic is a FEATURE, not slack to reclaim.
            if len(data) < MIN_IMAGE_BYTES:
                skipped_small += 1
                continue
            if rect.width / 72.0 < MIN_DISPLAY_INCHES and rect.height / 72.0 < MIN_DISPLAY_INCHES:
                skipped_small += 1
                continue

            dpi = effective_dpi(w, h, rect)
            if dpi <= target_dpi * 1.1:  # 10% slack, so near-target images are left alone
                continue

            scale = target_dpi / dpi
            new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))

            try:
                img = Image.open(io.BytesIO(data))
                has_alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
                img = img.resize((new_w, new_h), Image.LANCZOS)

                buf = io.BytesIO()
                if has_alpha:
                    # Transparency must survive. Flattening a logo onto white
                    # puts a hard rectangle behind it on any tinted background.
                    img.save(buf, format="PNG", optimize=True)
                else:
                    img.convert("RGB").save(buf, format="JPEG", quality=quality, optimize=True)
                new_data = buf.getvalue()
            except Exception:
                continue

            # Only accept a replacement that is actually smaller. Re-encoding can
            # inflate an image that was already optimally compressed.
            if len(new_data) >= len(data):
                continue

            try:
                page.replace_image(xref, stream=new_data)
            except Exception:
                continue

            changed += 1
            if verbose:
                print(f"   p{pno + 1}  {w}x{h} @{dpi:.0f}dpi -> {new_w}x{new_h}  "
                      f"{mb(len(data))} -> {mb(len(new_data))}")

    if verbose and skipped_small:
        print(f"   {skipped_small} logo/icon(s) left untouched")

    if changed:
        doc.saveIncr() if doc.can_save_incrementally() else doc.save(path + ".tmp")
        if not doc.can_save_incrementally():
            doc.close()
            os.replace(path + ".tmp", path)
            return changed
    doc.close()
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description="Shrink a PDF safely.")
    ap.add_argument("src")
    ap.add_argument("-o", "--out", help="output path (default: <name>.min.pdf)")
    ap.add_argument("--lossless", action="store_true", help="never touch an image")
    ap.add_argument("--dpi", type=int, default=150,
                    help="target display DPI for images (default 150)")
    ap.add_argument("-q", "--quality", type=int, default=82,
                    help="JPEG quality for re-encoded images (default 82)")
    ap.add_argument("--target", type=int, default=0,
                    help="stop once the file is this %% smaller (0 = shrink as much as possible)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not os.path.isfile(args.src):
        return print(f"No such file: {args.src}") or 2

    out = args.out or os.path.splitext(args.src)[0] + ".min.pdf"
    if os.path.abspath(out) == os.path.abspath(args.src):
        return print("Refusing to overwrite the source. Use -o for a different path.") or 2

    before = os.path.getsize(args.src)
    pages_in, words_in = stats(args.src)
    print(f"\nShrinking {os.path.basename(args.src)}")
    print(f"   in:  {mb(before)} · {pages_in} pages · {words_in} words\n")

    print("1. Lossless pass (recompress, dedupe, drop dead objects, subset fonts)")
    lossless_pass(args.src, out)
    after_lossless = os.path.getsize(out)
    saved = 100 * (1 - after_lossless / before) if before else 0
    print(f"   {mb(before)} -> {mb(after_lossless)}   ({saved:.1f}% smaller)\n")

    enough = args.target and saved >= args.target
    if args.lossless:
        print("2. Image pass skipped (--lossless)\n")
    elif enough:
        print(f"2. Image pass skipped — already past the {args.target}% target\n")
    else:
        print(f"2. Image pass (downsample anything above {args.dpi} DPI, JPEG q{args.quality})")
        n = image_pass(out, args.dpi, args.quality, args.verbose)
        print(f"   {n} image(s) downsampled\n" if n else "   nothing above the threshold\n")
        # A second lossless pass reclaims the space the replaced streams left.
        tmp = out + ".pass2"
        lossless_pass(out, tmp, subset_fonts=False)
        if os.path.getsize(tmp) < os.path.getsize(out):
            os.replace(tmp, out)
        else:
            os.remove(tmp)

    after = os.path.getsize(out)
    pages_out, words_out = stats(out)

    print("3. Verify")
    print(f"   pages: {pages_in} -> {pages_out}")
    print(f"   words: {words_in} -> {words_out}")

    problems = []
    if pages_out != pages_in:
        problems.append(f"page count changed ({pages_in} -> {pages_out})")
    # A little drift is normal — extraction order can shift. A collapse is not.
    if words_in and words_out < words_in * 0.98:
        problems.append(f"text lost ({words_in} -> {words_out} words)")
    if problems:
        os.remove(out)
        print("\n" + "\n".join("✗ " + p for p in problems))
        print("Output deleted — the source is untouched.")
        return 1

    total = 100 * (1 - after / before) if before else 0
    print(f"\n✅ {mb(before)} -> {mb(after)}   ({total:.1f}% smaller)")
    print(f"   {out}\n")
    if args.target and total < args.target:
        print(f"   Short of the {args.target}% target. Try --dpi 120 or -q 75;")
        print(f"   if the file has few images, there may simply be no slack left.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
