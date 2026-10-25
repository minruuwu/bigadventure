# 怪物原始圖

- `dragon_base.png`：大龍的底圖（橘紅色、已去背、99×66 像素）。其他關的龍王從這張換色。
- `monster_boss_02_old.png`：舊版綠龍（2026-10-25 換掉前的版本）。

## 換色做新的王

```
python3 tools/recolor.py assets/monsters/_src/dragon_base.png 輸出.png 目標色相 [飽和倍率] [亮度倍率]
```

- 目前的綠龍（第一關 Boss）：`105 0.70 0.78`
- 色相參考：紅 0、橘 25、黃 50、綠 105、青 180、藍 220、紫 275
- 只換身體與翅膀的主色；米白／棕色肚子、灰色角、黑框、眼睛不會變。
- 新的王要在 battle/index.html 的 IMGF、ANI（leg 44、eye 位置 at:[41,12]）各加一行，並在 monster_info.csv 填 sprite 與 size。
