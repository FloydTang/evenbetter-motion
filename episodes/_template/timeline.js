// Timeline for one episode. Times are SOURCE seconds of the talk video (what the ASR tokens say), not film time.
// shots fill the frame one after another; layers draw on top while `at` is active. Field reference: docs/timeline.md
export default {
  shots: [
    { kind: 'talk', from: 0, to: 15, zoom: 1 },          // white-wall talk; zoom 1.06–1.12 hides jump cuts
    { kind: 'pane', from: 15, to: 18 },                  // blue pane opens behind the speaker, camera goes through
    { kind: 'dark', from: 18, to: 40 },                  // code-drawn world: line art, data, terminal
    { kind: 'end', from: 40, to: 999, slogan: '把重复交给 AI，把时间还给真实世界', logo: 'assets/logo.png', noSubs: false },
  ],
  layers: [
    // hook: big word behind the person, a handwritten reaction
    { type: 'bigType', at: [5.9, 8.3], y: 470, lines: [[['Codex', 'ink']]], size: 230, en: 'ONE TOOL, FIVE JOBS' },
    { type: 'hand', at: [7.4, 8.3], text: '真香！', x: 830, y: 250, size: 150, rot: .12, font: 'brush', color: 'red', draw: 7.5 },
    // a problem: section chip + crossed-out list
    { type: 'chip', at: [9, 14], text: '① 注册难', en: 'Sign-up' },
    { type: 'hand', at: [9, 14], text: '网络环境有要求', x: 120, y: 270, size: 72, align: 'left', draw: 9.2 },
    { type: 'strike', at: [9, 14], x0: 110, x1: 600, y: 270, draw: 12 },
    // principle: sources -> gateway -> partners, each gets a key
    { type: 'lines', at: [18, 30], caption: '流量 · 模型 · 合在一起',
      sources: [{ name: 'GPT', sub: '订阅', at: 19 }, { name: 'Grok', sub: '订阅', at: 20 }, { name: 'DeepSeek', sub: 'API', at: 21 }],
      gate: { name: '公司网关', sub: '一个入口 · 统一记账', at: 22 }, nodes: { n: 8, cols: 4, at: 24, keyAt: 26 } },
    // proof: the real recording in a rounded window (frames from tools/rec_segment.py -> build/rec/ov)
    { type: 'evidence', at: [18, 30], rec: 'ov', crop: [0, 0, 1415, 500], box: [850, 168, 380], label: '真实后台录屏' },
    // the speaker stays on screen in code shots
    { type: 'pip', at: [30, 40], box: [850, 1190, 290, 350] },
    // steps lit one by one on real text
    { type: 'term', at: [30, 40], title: '代码块', intro: '总共就干了四件事',
      lines: ['第一行', '   ↑', '第二行'], steps: [{ at: 31, hi: [2], name: '第一步' }, { at: 34, hi: [0], name: '第二步' }] },
    { type: 'pill', at: [30, 40], text: '加助教伙伴', en: 'Talk to our assistant', y: 260, blue: true, size: 56 },
  ],
};
