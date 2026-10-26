

## 秘境與符文等級

- `rift_info.csv`：七間秘境。`room` 編號、`rift` 曜日字（月火水木金土日，跟 monster_info 的 `rift` 欄對應）、`room_name`、`runes` 這間會掉的符文（`;` 分隔）、`color_1`／`color_2` 橫條顏色。每天開三間：週一＝月火水、週二＝火水木……
- `rune_level.csv`：每個符文 Lv1～10 的數值，一列一級。`value_1`～`value_4` 的意思看 rune_info 的 `label_1`～`label_4`（例如火炬之光 value_1 = 追加火焰傷害）。玩家資料 `rs.<符文>` 是累積碎片數，每級所需 1,2,3,5,8,12,18,25,35,50（累計 159 片 = Lv10）。
- 秘境首領 = monster_info 裡 `rift` 是這間、`boss` = 1 的那隻；開場帶 2 隻牠會召喚的幼龍。秘境 Lv 換算成主線總關數 ≈ Lv ÷ 3。

