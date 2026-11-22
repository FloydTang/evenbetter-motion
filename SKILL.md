---
name: evenbetter-motion
description: 半斤九两动效系统：把一条竖屏口播（白墙真人 + 录屏）剪成 2–3 分钟、带代码动效、真实录屏证据小窗、圆角画中画、字幕、音效和 BGM 的成片。用户要剪口播、做“代码风格特效”、做知识分享短视频、或提到半斤九两 / 汤九两的视频风格时使用。
---

# 半斤九两动效系统

一条片子 = 一段口播视频 + 一份 `episode.json`（保留哪几段）+ 一份 `timeline.js`（什么时候出现什么画面）。
画面全部由代码按时间算出来（three.js + Chrome 无头渲染），同样的输入永远得到同样的画面，所以可以反复改、反复渲。

先读 `docs/style-guide.md`（风格规矩），再读 `docs/timeline.md`（时间线字段）。踩过的坑在 `docs/lessons.md`。

## 成片标准（用户定的，不要自行放宽）

1. **长度 2–3 分钟。** 口播是自然发挥，常常 5 分钟以上，必须剪到 2 分半左右，最长不超过 3 分钟。只用原话的整句，不改说的话。
2. **代码动效是主画面，真实录屏是证据。** 讲到后台、工具、数据时，主画面用代码重画（按录屏里的真实数字），同时放一个圆角小窗播真实录屏，挂“真实后台录屏 / 真实教程录屏”标签。录屏不能省：它证明内容不是凭空来的。
3. **画中画是圆角竖向窗口**，不是方块；跟着人头移动，下面有随声音跳动的音量条。
4. **所有窗口有阴影、细亮边和淡蓝光晕。**
5. **必须有 BGM**，压在人声下面，人说话时自动再压低。
6. **音效只给看得见的动作**，低频重击全片最多 2 次。
7. **每个特效都要讲清一件具体的事**，不做纯装饰。大转场（蓝窗）每条最多 1–2 次。
8. **文案中英双语。** 内容同时发国内和海外：字幕一律中文在上、英文在下；大字、标签、段落角标、标题都配英文（`en` 字段）；另外导出中文、英文、双语三份 SRT。英文要自然地道，意译不直译，按海外观众能懂的方式说。
9. **隐私**：真名、余额、密钥、对话框、客户名一律打码或裁掉；录屏里看不清是否敏感的，先问。

## 流程

先出方案，用户确认后再做；每一步交付都先自己抽查画面。

```
0. 准备    npm ci；装 ffmpeg、Google Chrome、Python 3.10+（numpy scipy funasr）
1. 新建    cp -r episodes/_template episodes/<日期-名字>；素材放 raw/；改 episode.json 的 source / recording
2. 听写    ffmpeg -i raw/talk.mp4 -ac 1 -ar 16000 build/a16k.wav
           python tools/asr_chunks.py build/a16k.wav build/tokens.json "热词 热词"
3. 校字    写 spoken.txt：一行一句字幕，按录音逐字（只改错字，不改说法），
           每行后面接 ` | ` 和英文：`过去八十四天 | Over the past 84 days`
           python tools/align_subs.py spoken.txt build/tokens.json build/subs_src.json
4. 剪辑表  在 episode.json 写 segs（保留的源时间段）。剪点落在词与词之间（看 tokens 的 s/e），
           删口误、重说、长停顿；目标 2 分半。先把剪辑表给用户确认。
           python tools/make_subs.py episodes/<ep>
5. 抠像    python tools/prep_talk.py episodes/<ep>     # 原画帧、人像抠像、音量、头部跟踪
6. 录屏    python tools/rec_segment.py episodes/<ep> ov 0 10 --crop W:H:X:Y --blur X:Y:W:H ...
           每个要用的录屏片段切一次；敏感区域用 --blur 烤进画面
7. 时间线  写 timeline.js：shots（talk / pane / dark / end）+ layers（见 docs/timeline.md）
8. 样张    node tools/render.mjs <ep> --stills 12.5,48.0,... --still-dir /tmp/stills   # 时间是成片时间
           拼成一张总览图自己先看：字有没有压脸、录屏有没有露隐私、手写字有没有被画中画挡住
9. 声音    写 sfx.json（源时间），python tools/make_audio.py episodes/<ep>
10. 成片   bash tools/render_film.sh <ep> 0 <成片秒数> episodes/<ep>/out/film.mp4 8
           python tools/make_srt.py episodes/<ep>      # 中文 / 英文 / 双语三份 SRT
11. 检查   1 秒一格的总览图 + 响度（目标约 -16 LUFS，峰值 ≤ -1.5 dB）+ 隐私逐屏复查，再交付
```

## 交付时要告诉用户的

- 成片时长、删了哪些段落（原片时间 + 原因）
- 英文字幕里意译较多、需要本人确认的句子
- 哪些数字、说法没核实（听不清的数字、录屏里没有的数据）
- 隐私怎么处理的
- 文件在哪

## 不要做的

- 不用第三方模板和卡片库凑画面（用户明确拒绝过，嫌重复）
- 不用来源不明的音乐和音效：音效只用 `audio/cues`（CC0，见 `audio/CREDITS.json`），BGM 用用户给的
- 不把录屏里的敏感信息留在画面里，哪怕只有几帧
- 不在用户确认方案前直接做成片
