# 怪物圖

所有怪物圖統一放在這個資料夾，檔名用 `monster_NN`：

| 編號 | 名稱 | 檔案 |
|---|---|---|
| monster_01 | 史萊姆 | `monster_01.png` |
| monster_02 | 骷髏士兵 | `monster_02.png`（睜眼）、`monster_02_blink.png`（閉眼）、`monster_02.json`（待機起伏、眨眼週期、陰影參數） |
| monster_03 | 哥布林雜兵 | `monster_03.png`（身體）、`monster_03_blink.png`（眼睛圖層，眨眼時隱藏） |

規則：
- 透明背景 PNG，面向左邊（朝向隊伍）。
- 腳底貼齊圖片最下緣，程式會自動對齊地面。
- 有眨眼的怪物多放一張 `monster_NN_blink.png`：可以是「閉眼的整張圖」（如骷髏）或「只有眼睛的圖層」（如哥布林，眨眼時把這層藏起來）；新怪物建議用眼睛圖層的做法，告訴我是哪一種即可；有特殊動作參數的放 `monster_NN.json`。
