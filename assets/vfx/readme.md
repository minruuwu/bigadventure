# 戰鬥特效圖

| 檔案 | 用途 |
|---|---|
| `slash_none.png` | 斬擊：普通攻擊、無屬性技能 |
| `slash_fire.png` | 斬擊：火焰 |
| `slash_frost.png` | 斬擊：冰霜 |
| `slash_wind.png` | 斬擊：疾風 |
| `slash_lightning.png` | 斬擊：雷電 |
| `slash_nature.png` | 斬擊：自然 |
| `slash_light.png` | 斬擊：光明 |
| `slash_dark.png` | 斬擊：黑暗 |

- 48×48 單張圖，透明背景，戰鬥中縮成約 24×24 顯示，中心對準被打的怪物。
- 動畫由程式處理：由上往下劃出（約 0.15 秒），再放大 15% 淡出（約 0.2 秒）。
- 劍、斧和 vfx=slash 的技能都用這組；還沒有圖的屬性會改用 `slash_none.png`。
