#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从猫咪头像生成 PWA 图标：192/512 PNG + 内嵌 base64 PNG 的 SVG。"""
import pathlib
import base64
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent
SRC = pathlib.Path("/Users/mianmian/Desktop/6956a0ac97de8e6bff8e7a16e0f421c6.png")


def square_thumb(img, size, corner_radius_ratio=0.22):
    """居中裁剪正方形 + 圆角 + 白色衬底（iOS 图标风格）。"""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = img.crop((left, top, left + side, top + side))
    cropped = cropped.resize((size, size), Image.LANCZOS).convert("RGBA")

    # 白色背景圆角底板
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * corner_radius_ratio)
    draw.rounded_rectangle((0, 0, size, size), radius=r, fill=255)

    rounded = Image.composite(cropped, bg, mask)
    return rounded.convert("RGB")


def main():
    if not SRC.exists():
        raise SystemExit(f"[FAIL] 源图不存在: {SRC}")

    img = Image.open(SRC)

    # 192 / 512 PNG
    for size in (192, 512):
        out = ROOT / f"icon-{size}.png"
        square_thumb(img, size).save(out, "PNG", optimize=True)
        print(f"[OK] {out} ({size}x{size})")

    # SVG：内嵌 512 PNG base64，浏览器作为主屏图标可用
    png512 = ROOT / "icon-512.png"
    b64 = base64.b64encode(png512.read_bytes()).decode("ascii")
    svg = ROOT / "icon.svg"
    svg.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n'
        f'  <image href="data:image/png;base64,{b64}" width="512" height="512"/>\n'
        f'</svg>\n',
        encoding="utf-8",
    )
    print(f"[OK] {svg} (embedded 512 PNG)")


if __name__ == "__main__":
    main()
