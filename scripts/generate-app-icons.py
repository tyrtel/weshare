#!/usr/bin/env python3
"""Generate iOS / Android / web / Play Store icons from one square master image.

Usage:
    python3 scripts/generate-app-icons.py path/to/master.png
    python3 scripts/generate-app-icons.py path/to/master.png --no-autocenter

Master image should be full-bleed (no pre-baked rounded badge/shape) and at
least 1536x1536. The script does NOT redesign artwork — it only recenters,
resizes, and exports to the formats each platform expects.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

DEFAULT_BG = "#1a1a2e"


def hex_to_rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def load_master(path):
    im = Image.open(path).convert("RGBA")
    if im.width != im.height:
        raise SystemExit(f"Source must be square, got {im.size}")
    return im


def content_bbox(im, bg_rgb, threshold=24):
    alpha = im.split()[-1]
    if alpha.getextrema()[0] < 250:
        return alpha.point(lambda p: 255 if p > 10 else 0).getbbox()
    bg = Image.new("RGB", im.size, bg_rgb)
    diff = ImageChops.difference(im.convert("RGB"), bg).convert("L")
    return diff.point(lambda p: 255 if p > threshold else 0).getbbox()


def autocenter(im, bg_rgb, margin):
    bbox = content_bbox(im, bg_rgb)
    if bbox is None:
        return im
    cropped = im.crop(bbox)
    side = round(max(cropped.size) / (1 - 2 * margin))
    canvas = Image.new("RGBA", (side, side), bg_rgb + (255,))
    offset = ((side - cropped.width) // 2, (side - cropped.height) // 2)
    canvas.paste(cropped, offset, cropped)
    return canvas


def flatten(im, bg_rgb, size):
    resized = im.resize((size, size), Image.LANCZOS)
    flat = Image.new("RGB", (size, size), bg_rgb)
    flat.paste(resized, (0, 0), resized)
    return flat


def adaptive_foreground(im, size, safe_zone_ratio):
    content_size = round(size * safe_zone_ratio)
    resized = im.resize((content_size, content_size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - content_size) // 2, (size - content_size) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def rounded_mask(size, radius_ratio):
    mask = Image.new("L", (size, size), 0)
    radius = round(size * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def circle_mask(size):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def mask_preview(adaptive_fg, bg_rgb, size=512):
    fg = adaptive_fg.resize((size, size), Image.LANCZOS)
    shapes = {
        "circle": circle_mask(size),
        "squircle": rounded_mask(size, 0.5),
        "rounded_square": rounded_mask(size, 0.16),
    }
    tiles = []
    for mask in shapes.values():
        bg = Image.new("RGBA", (size, size), bg_rgb + (255,))
        composed = Image.alpha_composite(bg, fg)
        tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        tile.paste(composed, (0, 0), mask)
        tiles.append(tile)
    sheet = Image.new("RGBA", (size * len(tiles), size), (0, 0, 0, 0))
    for i, tile in enumerate(tiles):
        sheet.paste(tile, (i * size, 0), tile)
    return sheet


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="Path to square master artwork")
    parser.add_argument("--output-dir", default="assets")
    parser.add_argument("--store-dir", default="store-assets")
    parser.add_argument("--background", default=DEFAULT_BG, help="Fallback fill colour, hex (default: %(default)s)")
    parser.add_argument("--safe-zone", type=float, default=0.66, help="Android adaptive icon content ratio (default: %(default)s)")
    parser.add_argument("--no-autocenter", action="store_true", help="Skip bounding-box recenter step")
    parser.add_argument("--margin", type=float, default=0.08, help="Padding added around content when autocentering (default: %(default)s)")
    args = parser.parse_args()

    bg_rgb = hex_to_rgb(args.background)
    master = load_master(args.source)

    if not args.no_autocenter:
        master = autocenter(master, bg_rgb, args.margin)

    out_dir = Path(args.output_dir)
    store_dir = Path(args.store_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    store_dir.mkdir(parents=True, exist_ok=True)

    flatten(master, bg_rgb, 1024).save(out_dir / "icon.png")
    adaptive_fg = adaptive_foreground(master, 1024, args.safe_zone)
    adaptive_fg.save(out_dir / "adaptive-icon.png")
    flatten(master, bg_rgb, 196).save(out_dir / "favicon.png")
    flatten(master, bg_rgb, 512).save(store_dir / "play-store-icon.png")

    preview_path = out_dir / "icon-mask-preview.png"
    mask_preview(adaptive_fg, bg_rgb).save(preview_path)

    print(f"wrote {out_dir/'icon.png'} (iOS, 1024x1024, flattened, no alpha)")
    print(f"wrote {out_dir/'adaptive-icon.png'} (Android foreground, {args.safe_zone:.0%} safe zone)")
    print(f"wrote {out_dir/'favicon.png'} (196x196)")
    print(f"wrote {store_dir/'play-store-icon.png'} (512x512, no alpha)")
    print(f"wrote {preview_path} — inspect for clipping under circle/squircle/rounded-square masks")


if __name__ == "__main__":
    main()
