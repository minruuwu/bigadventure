# 怪物圖

所有怪物圖統一放在這個資料夾，一般怪物檔名用 `monster_NN`，王用 `monster_boss_NN`：

| 編號 | 名稱 | 檔案 |
|---|---|---|
| monster_01 | 史萊姆 | `monster_01.png` |
| monster_02 | 骷髏士兵 | `monster_02.png`（睜眼）、`monster_02_blink.png`（閉眼）、`monster_02.json`（待機起伏、眨眼週期、陰影參數） |
| monster_03 | 哥布林雜兵 | `monster_03.png`（身體）、`monster_03_blink.png`（眼睛圖層，眨眼時隱藏） |
| monster_04 | 野豬（怪物森林） | `monster_04.png`（原圖縮 50%，喘氣＋鼻息） |
| monster_05 | 青蛇（怪物森林） | `monster_05.png`（原圖縮 50%，呼吸＋吐蛇信） |
| monster_06 | 灰狼（怪物森林） | `monster_06.png`（原圖縮約 63%，喘氣＋流口水） |
| monster_07 | 魔狼（怪物森林第 11 關起） | `monster_07.png`（舊尺寸灰狼改紫色，喘氣＋流口水） |
| monster_08 | 哥布林巫師（怪物森林第 6 關起） | `monster_08.png`（身體）、`monster_08_blink.png`（眼睛圖層）；法杖寶珠的藍色光暈由程式畫 |
| monster_09 | 綠幼龍（怪物森林第 15 關起） | `monster_09.png`（46×48，原圖左右翻轉、去背、縮回原像素大小；上半身呼吸） |
| monster_10 | 暗影魔蝠（魔晶礦洞，目前只在 `?vfx=1` 測試） | `monster_10_a.png`（翅膀張開）、`monster_10_b.png`（翅膀收下），42×50，兩張以眼睛位置對齊；兩張輪播當拍翅＋懸空上下浮動，不眨眼；原截圖在 `src/` |
| monster_11 | 石魔像（魔晶礦洞，目前只在 `?vfx=1` 測試） | `monster_11.png`（48×48 身體）、`monster_11_blink.png`（眼睛圖層）；膝蓋以上起伏，下面 7 格不動 |
| monster_boss_01 | 半獸人戰酋（怪物森林 Boss，只在王關出現） | `monster_boss_01.png`（48×48 身體）、`monster_boss_01_blink.png`（眼睛圖層） |
| monster_boss_02 | 綠龍（怪物森林第 20 關 Boss） | `monster_boss_02.png`（79×66，原圖去背、左右翻轉、綠色壓暗後縮小；身體上半慢慢起伏，眼睛發紅光由程式畫） |

規則：
- 透明背景 PNG，面向左邊（朝向隊伍）。
- 腳底貼齊圖片最下緣，程式會自動對齊地面。
- 有眨眼的怪物多放一張 `monster_NN_blink.png`：可以是「閉眼的整張圖」（如骷髏）或「只有眼睛的圖層」（如哥布林，眨眼時把這層藏起來）；新怪物建議用眼睛圖層的做法，告訴我是哪一種即可；有特殊動作參數的放 `monster_NN.json`。

原尺寸的去背圖放在 `src/`（monster_NN_full.png），之後要重新縮放可以從這裡來。
- 會飛的怪物用兩張圖（`_a`、`_b`）輪播拍翅，畫在同一個畫布、身體對齊；懸空高度、浮動幅度在 `battle/index.html` 的 `FLY` 調。
- 新圖要在 `battle/index.html` 的 `IMGF` 清單加一行（檔名當 key），不用再算 r[] 的位置。
