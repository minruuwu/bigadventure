# 怪物圖

所有怪物圖統一放在這個資料夾，檔名用 `monster_NN`：

| 編號 | 名稱 | 檔案 |
|---|---|---|
| monster_01 | 史萊姆 | `monster_01.png` |
| monster_02 | 骷髏士兵 | `monster_02.png`（睜眼）、`monster_02_blink.png`（閉眼）、`monster_02.json`（待機起伏、眨眼週期、陰影參數） |

規則：
- 透明背景 PNG，面向左邊（朝向隊伍）。
- 腳底貼齊圖片最下緣，程式會自動對齊地面。
- 有眨眼的怪物多放一張 `monster_NN_blink.png`；有特殊動作參數的放 `monster_NN.json`。
