"""把怪物圖的「主色」換成別的顏色（去背後的底圖 → 各關王的配色）。
用法：python3 tools/recolor.py 來源.png 輸出.png 目標色相 [飽和倍率] [亮度倍率] [來源主色色相]
  例：綠龍  python3 tools/recolor.py assets/monsters/_src/dragon_base.png assets/monsters/monster_boss_02.png 105 0.72 0.82
  只動「有顏色」的像素（飽和度高、色相在來源主色附近）；米白肚子、灰角、黑框、藍眼睛不會變。"""
import sys, colorsys
from PIL import Image
src, out, hue = sys.argv[1], sys.argv[2], float(sys.argv[3])
sm = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
vm = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
base = float(sys.argv[6]) if len(sys.argv) > 6 else 18.0   # 底圖（橘紅龍）主色色相
im = Image.open(src).convert('RGBA'); px = im.load()
def ss(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        if not a: continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        dh = min(abs(h * 360 - base), 360 - abs(h * 360 - base))          # 跟主色差幾度
        w = ss(0.50, 0.62, s) * (1 - ss(45, 70, dh))                        # 越像主色、越飽和 → 換得越多
        if w <= 0: continue
        h2 = (h * 360 + (hue - base) * w) % 360 / 360
        s2 = s * (1 - w * (1 - sm)); v2 = v * (1 - w * (1 - vm))
        r2, g2, b2 = colorsys.hsv_to_rgb(h2, min(1, s2), min(1, v2))
        px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
im.save(out)
