#!/usr/bin/env node
// Renders an episode: the page draws each frame on the GPU and POSTs raw pixels back here.
//   render.mjs <episode> --range 11.5-24.8 --out out.mp4 [--audio a.wav] [--fps 30]
//   render.mjs <episode> --stills 22.6,61.8 --still-dir dir
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// ffmpeg: $FFMPEG, else ~/.local/bin/ffmpeg, else PATH. Chrome: $CHROME, else the usual install path for this OS.
const localFF = path.join(os.homedir(), '.local/bin/ffmpeg');
const FF = process.env.FFMPEG || (fs.existsSync(localFF) ? localFF : 'ffmpeg');
const CHROME = process.env.CHROME || ({ darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }[process.platform] || 'google-chrome');
// macOS renders through Metal; elsewhere let Chrome pick its GL backend.
const ANGLE = process.platform === 'darwin' ? ['--use-angle=metal'] : [];
const W = 1080, H = 1920;

const argv = process.argv.slice(2);
const episode = argv.shift();
const opt = {};
while (argv.length) { const k = argv.shift().replace(/^--/, ''); opt[k] = argv.shift(); }
const fps = Number(opt.fps || 30);

let job;
if (opt.stills) {
  job = { times: opt.stills.split(',').map(Number), source: opt.source === '1' };
  fs.mkdirSync(opt['still-dir'], { recursive: true });
} else {
  const [a, b] = opt.range.split('-').map(Number);
  const first = Math.round(a * fps), last = Math.round(b * fps);
  job = { times: Array.from({ length: last - first }, (_, i) => (first + i) / fps) };
}
job.fps = fps;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };

let encoder = null;
if (!opt.stills) {
  fs.mkdirSync(path.dirname(opt.out), { recursive: true });
  const inputs = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-'];
  const [start] = opt.range.split('-').map(Number);
  if (opt.audio) inputs.push('-ss', String(start), '-i', opt.audio);
  encoder = spawn(FF, ['-nostdin', '-v', 'error', '-y', ...inputs, '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    ...(opt.audio ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []), '-movflags', '+faststart', opt.out], { stdio: ['pipe', 'inherit', 'inherit'] });
}

function saveStill(t, body) {
  const out = path.join(opt['still-dir'], `t${t.toFixed(2).padStart(7, '0')}.png`);
  return new Promise((res, rej) => {
    const p = spawn(FF, ['-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-frames:v', '1', '-vf', 'vflip', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    p.on('close', (c) => (c ? rej(new Error(`still ${c}`)) : res()));
    p.stdin.end(body);
  });
}

const t0 = Date.now();
let done = 0, chrome = null, finished = false;

function finish(code, msg) {
  if (finished) return; finished = true;
  if (msg) console.error(msg);
  if (chrome) chrome.kill('SIGKILL');
  const end = () => { server.close(); fs.rmSync(profile, { recursive: true, force: true }); process.exit(code); };
  if (encoder) { encoder.on('close', end); encoder.stdin.end(); } else end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      if (url.pathname === '/frame') {
        const i = Number(url.searchParams.get('i'));
        if (encoder) { if (!encoder.stdin.write(body)) await new Promise((r) => encoder.stdin.once('drain', r)); }
        else await saveStill(job.times[i], body);
        done++;
        if (done % 30 === 0 || !encoder) console.log(`${done}/${job.times.length}  ${(done / ((Date.now() - t0) / 1000)).toFixed(1)} fps`);
      } else if (url.pathname === '/events') {
        fs.writeFileSync(path.join(ROOT, 'episodes', episode, 'build', 'events.json'), body);
      } else if (url.pathname === '/log') {
        console.log('[page]', body.toString());
      } else if (url.pathname === '/done') {
        res.end('ok'); finish(0); return;
      } else if (url.pathname === '/fail') {
        res.end('ok'); finish(1, `[page error] ${body.toString()}`); return;
      }
      res.end('ok');
    });
    return;
  }
  if (url.pathname === '/job.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ...job, episode })); return; }
  const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'house-motion-'));
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  chrome = spawn(CHROME, ['--headless=new', ...ANGLE, '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run',
    '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb', `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, `http://127.0.0.1:${port}/engine/page.html`], { stdio: 'ignore' });
  chrome.on('exit', (c) => finish(c ? 1 : 0, c ? `chrome exited ${c}` : null));
});
process.on('SIGINT', () => finish(130));
