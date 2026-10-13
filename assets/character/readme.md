

## 額外外觀命名與解鎖（2026-10）

檔名就是代碼：`類別_名稱.png`，全小寫英文、不要空格、不要中文。

| 類別 | 檔名 | 說明 |
|---|---|---|
| 衣服 | `jobNN.png`（職業）、`outfit_名稱.png`（非職業） | 背面圖層加 `_b`，例如 `outfit_xmas01_b.png` |
| 髮型 | `hair_NN.png`（自動偵測）、`hair_名稱.png` | 髮色另外選 |
| 眼睛 | `eyes_N.png`（1~8）、`eyes_名稱.png` | |
| 膚色 | `body_a/b/c.png`、`body_名稱.png` | |

非數字的額外外觀要登記在 `assets/data/look_info.csv`（`code,name,locked`），存檔請選 UTF-8。
`locked` 填 1 表示要發給才有；沒有擁有的人選單裡看不到（數字編號的髮型／眼睛／膚色也可以登記 `locked=1`）。
擁有方式（三者取聯集）：
1. 玩家資料（Firebase `players/{uid}`）的 `unlocks`（字串陣列）裡有該代碼；
2. `assets/data/look_grants.csv`（`name,code`，用玩家名字）裡有他的名字與該代碼；
3. 衣服：職業外觀在能轉職／已有等級時自動解鎖。
