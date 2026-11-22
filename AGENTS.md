# 给编程助手（Codex 等）的说明

这个仓库是一套剪口播视频的工作方法和代码，不是普通的模板库。

1. 先读 `SKILL.md`（成片标准和流程），再读 `docs/style-guide.md` 和 `docs/timeline.md`。
2. 新片子从 `episodes/_template` 复制。只改 `episode.json`、`timeline.js`、`spoken.txt`、`sfx.json`；不要为一条片子去改 `engine/`。
3. 时间线里的时间都是口播原片的秒数；成片时间由 `episode.json` 的 `segs` 自动换算。
4. 先出剪辑表和样张给人确认，再渲整片。
5. 素材（口播、录屏、客户画面、logo、BGM）只放在 `episodes/<名字>/raw|assets`，不要提交到仓库（`.gitignore` 已经排除）。
