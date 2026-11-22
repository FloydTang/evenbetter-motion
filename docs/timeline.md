# 时间线字段说明

每条片子在 `episodes/<名字>/` 下有：

```
episode.json     素材路径、保留哪几段（segs）、BGM
timeline.js      镜头和图层
spoken.txt       校对后的字幕原文，一行一句
sfx.json         音效事件
film.js          一行：export { Film } from '/engine/timeline.js'
raw/  assets/    素材（不进仓库）
build/           工具生成的中间文件
```

**所有时间都是口播原片的秒数（源时间），不是成片时间。** 这样剪辑表改了，图层不用跟着改。成片时间由 `segs` 自动换算。

## episode.json

| 字段 | 说明 |
|---|---|
| `source` | 口播视频，1080×1920，相对 episode 目录或绝对路径 |
| `recording` | 录屏（`rec_segment.py` 默认用它） |
| `speaker` | 画中画名字标签 |
| `segs` | 保留的源时间段 `[[开始, 结束], ...]`，按顺序拼成成片 |
| `wall` | 抠像时只有墙的区域 `y0:y1:x0:x1;...`（W/H 代表全宽全高）。人站位不同就要改 |
| `crop` | 抠像前先裁原片，默认 `1080:1920:0:0` |
| `hotwords` | 听写热词 |
| `sub_fix` | `{"字幕原文": [开始, 结束]}`：重说时听写对到了错误那一遍，手动指定 |
| `sub_trim` | `{"字幕原文": "保留的字"}`：一句被剪点切掉一半时只显示保留的部分 |
| `bgm` | `{file, bpm, beats_per_bar, intro_end, outro_start, level_lufs}`；循环接口落在小节线上 |

## shots（铺满全屏，按时间先后）

| kind | 字段 | 说明 |
|---|---|---|
| `talk` | `zoom` | 白墙口播。zoom 1.0 / 1.06 / 1.12 交替，遮剪接点 |
| `pane` | `zoom` | 蓝窗在人身后打开，窗里是下一个镜头的世界，最后镜头穿进去。时长 2–3 秒 |
| `dark` | — | 深色代码世界，图层画在上面 |
| `end` | `slogan` `typeAt` `logo` `logoAt` `logoWidth` `background` `noSubs` | 片尾：背景图、标语逐字打出、logo |

## layers（在 `at: [开始, 结束]` 期间显示）

通用字段：`at`、`fadeIn`、`fadeOut`；手写类还有 `draw`（开始画的时间）和 `dur`（画多久）。
在 `talk` 镜头里，手写类和大字默认画在**人身后**，加 `front: true` 可以放到人前面。

| type | 主要字段 | 用途 |
|---|---|---|
| `bigType` | `lines: [[['① ', 'blue'], ['注册难', 'ink']]]`，`y`，`size` | 大字定调，逐行落下 |
| `hand` | `text x y size rot font('hand'/'brush') color align draw` | 手写字，从左到右写出来 |
| `strike` | `x0 x1 y draw color` | 划掉 |
| `circle` | `x y rx ry draw color` | 手绘圈 |
| `arrow` | `from to bend width color draw` | 手绘箭头 |
| `people` | `n y x gap draw` | 一排小人（“5 个人”） |
| `bars` | `y gap bars: [{label fill color at grow note noteAt}]` | 额度条、进度条 |
| `pill` | `text x y blue size pop` | 标签落下 |
| `chip` | `text x y` | 左上段落角标 |
| `title` | `text sub y size` | 讲解画面标题 |
| `lines` | `sources: [{name sub at x}]`，`gate: {name sub at pos}`，`nodes: {n cols at keyAt y}`，`caption captionAt captionY marker static` | 线稿世界：来源 → 网关 → 每台电脑亮钥匙 |
| `screen` | `rec crop width y recStart` | 录屏作为主画面（圆角、光晕） |
| `evidence` | `rec` 或 `image`，`crop`，`box: [cx, cy, 宽]`，`label`，`highlights: [{at, y}]`，`recStart` | 真实录屏证据小窗；`highlights.y` 是原图里那一行的纵坐标 |
| `pip` | `box: [cx, cy, 宽, 高]`，`name` | 圆角画中画 |
| `term` | `title lines intro steps: [{at hi pop name}]` | 代码块，按步骤高亮并拎出放大 |
| `numbers` | `rows: [{label big unit note at}]`，`y`，`source` | 大数字逐行落下，`source` 标数据出处 |
| `image` | `image box radius` | 圆角图片窗 |

颜色可以写 `ink` `blue` `red` `white` `grey` `sky`，也可以直接写 `#hex`。

录屏帧来自 `build/rec/<名字>/`（`tools/rec_segment.py` 生成）。图层比录屏片段长时，会来回播放，不会黑屏。

## 新特效怎么加

需要库里没有的画面（比如这一条特有的数据图）：在 episode 目录写一个自己的 `film.js`，继承或改写 `engine/timeline.js` 的 `Film`，或者参考 `examples/codex-keys-v2.film.js`（第一条试点片的全部代码）。做好后如果以后还会用到，再提成 `engine/fxlib.js` 里的通用函数，并在本文件和风格规范里补一行规矩。
