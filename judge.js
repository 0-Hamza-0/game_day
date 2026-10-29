/* Family AI Game Day - ON-DEVICE AI judge (Team 468 | Code: JLWEO)
 * Runs entirely in the phone's browser: no server, no upload.
 * Video: frames are sampled from the clip and analysed with colour and motion
 * vision. Audio: the clip's sound is decoded and analysed (speech start, whistle). */
(function (root) {
  "use strict";
  const TEAM_ID = "468", TEAM_CODE = "JLWEO", VERSION = "2.1.0", SCHEMA = "fagd-report/2";

  const GAMES = {
    football: { name: "Football", fps: 10, width: 480 },
    proverb: { name: "Al-Sana'a & Majlis Proverb Duel", fps: 0, width: 0 },
    pearl_balance: { name: "Pearl Diver's Balance Hold", fps: 10, width: 320 },
    souq_hunt: { name: "Souq Treasure Scavenger Sprint", fps: 10, width: 320 },
    falcon_reflex: { name: "Falcon Reflex & Call Challenge", fps: 20, width: 320 }
  };
  // OpenCV-style HSV: H 0-179, S 0-255, V 0-255. lo > hi wraps around red.
  const COLOR_PRESETS = {
    red: { h: [170, 8], s: [120, 255], v: [90, 255] },
    orange: { h: [9, 20], s: [150, 255], v: [140, 255] },
    yellow: { h: [21, 34], s: [110, 255], v: [120, 255] },
    green: { h: [35, 85], s: [90, 255], v: [60, 255] },
    cyan: { h: [86, 100], s: [100, 255], v: [90, 255] },
    blue: { h: [101, 128], s: [120, 255], v: [60, 255] },
    purple: { h: [129, 139], s: [80, 255], v: [60, 255] },
    magenta: { h: [140, 169], s: [100, 255], v: [80, 255] },
    white: { h: [0, 179], s: [0, 40], v: [200, 255] }
  };
  const DRAW = { red: "#e53935", orange: "#ff8c00", yellow: "#fbc02d", green: "#43a047", cyan: "#00bcd4", blue: "#1e5ae6", purple: "#7b1fa2", magenta: "#d81bd8", white: "#f2f2f2" };
  const r2 = (n) => Math.round(n * 100) / 100;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  class JudgeError extends Error {}

  // ------------------------------------------------------------ colours
  function resolveColor(spec, fallback) {
    if (spec == null || spec === "") spec = fallback;
    if (typeof spec === "string") {
      const c = COLOR_PRESETS[spec.toLowerCase()];
      if (!c) throw new JudgeError(`Unknown colour '${spec}'.`);
      return { ...c, name: spec.toLowerCase(), draw: DRAW[spec.toLowerCase()] };
    }
    if (spec && spec.hsv) {
      const [h, s, v] = spec.hsv.map(Number), tol = 10;
      const draw = spec.hex || "#ffffff";
      if (s < 50) return { h: [0, 179], s: [0, Math.min(255, s + 45)], v: [Math.max(0, v - 55), 255], name: spec.name || "picked", draw };
      return { h: [((Math.round(h - tol) % 180) + 180) % 180, Math.round(h + tol) % 180], s: [Math.max(50, s - 90), 255], v: [Math.max(40, v - 100), 255], name: spec.name || "picked", draw };
    }
    throw new JudgeError("Colour setting not understood.");
  }

  // ------------------------------------------------------------ pixels
  let bufCache = null;
  function buffers(n) {
    if (!bufCache || bufCache.n !== n) bufCache = { n, H: new Uint8Array(n), S: new Uint8Array(n), V: new Uint8Array(n), lab: new Int32Array(n), q: new Int32Array(n), m: new Uint8Array(n), g: new Uint8Array(n) };
    return bufCache;
  }
  function toHSV(data, n) {
    const B = buffers(n), H = B.H, S = B.S, V = B.V;
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const d = mx - mn;
      V[p] = mx; S[p] = mx ? ((d * 255) / mx) | 0 : 0;
      let h = 0;
      if (d) {
        if (mx === r) h = (60 * (g - b)) / d; else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
        if (h < 0) h += 360;
      }
      H[p] = (h / 2) | 0;
    }
    return B;
  }
  function colorMask(B, c, n, out) {
    const m = out || new Uint8Array(n), H = B.H, S = B.S, V = B.V;
    const lo = c.h[0], hi = c.h[1], s0 = c.s[0], s1 = c.s[1], v0 = c.v[0], v1 = c.v[1], wrap = lo > hi;
    for (let p = 0; p < n; p++) {
      const s = S[p], v = V[p], h = H[p];
      m[p] = (s >= s0 && s <= s1 && v >= v0 && v <= v1 && (wrap ? (h >= lo || h <= hi) : (h >= lo && h <= hi))) ? 1 : 0;
    }
    return m;
  }
  function components(m, w, h, minArea, maxArea) {
    const n = w * h, B = buffers(n), lab = B.lab, q = B.q, out = [];
    lab.fill(0);
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (!m[s] || lab[s]) continue;
      id++;
      let head = 0, tail = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      q[tail++] = s; lab[s] = id;
      while (head < tail) {
        const p = q[head++], x = p % w, y = (p - x) / w;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = id; q[tail++] = p - 1; }
        if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = id; q[tail++] = p + 1; }
        if (y > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = id; q[tail++] = p - w; }
        if (y < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = id; q[tail++] = p + w; }
      }
      if (area >= minArea && (!maxArea || area <= maxArea)) out.push({ area, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 });
    }
    return out;
  }
  function toGray(data, n, out) {
    for (let p = 0, i = 0; p < n; p++, i += 4) out[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    return out;
  }
  function laneMotion(g, prev, w, h, x0, x1, thr) {
    if (!prev) return 0;
    let c = 0;
    for (let y = 0; y < h; y++) { const row = y * w; for (let x = x0; x < x1; x++) { const d = g[row + x] - prev[row + x]; if (d > thr || d < -thr) c++; } }
    return c / ((x1 - x0) * h);
  }
  function lanes(w, n) { const out = []; for (let k = 0; k < n; k++) out.push([Math.round((k * w) / n), Math.round(((k + 1) * w) / n)]); return out; }

  // ------------------------------------------------------------ media
  function once(el, ev, ms) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { el.removeEventListener(ev, h); res(false); }, ms || 4000);
      function h() { clearTimeout(t); el.removeEventListener(ev, h); res(true); }
      el.addEventListener(ev, h);
    });
  }
  async function openVideo(url) {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
    v.src = url;
    const ok = await Promise.race([once(v, "loadeddata", 20000), new Promise((r) => v.addEventListener("error", () => r("err"), { once: true }))]);
    if (ok !== true || !v.videoWidth) return null;
    if (!isFinite(v.duration)) { // MediaRecorder WebM files often have no duration until the end is read
      v.currentTime = 1e7; await once(v, "seeked", 8000); v.currentTime = 0; await once(v, "seeked", 4000);
    }
    return isFinite(v.duration) && v.duration > 0 ? v : null;
  }
  async function seekTo(v, t) {
    if (Math.abs(v.currentTime - t) < 1e-4) return;
    const p = once(v, "seeked", 3000);
    v.currentTime = t;
    await p;
  }
  async function decodeAudio(buf) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !buf) return null;
    const ac = new AC();
    try {
      const ab = await new Promise((res, rej) => { const p = ac.decodeAudioData(buf.slice(0), res, rej); if (p && p.then) p.then(res, rej); });
      const n = ab.length, x = new Float32Array(n);
      for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ab.numberOfChannels; }
      return { x, sr: ab.sampleRate };
    } catch (e) { return null; } finally { try { ac.close(); } catch (e) { /* ignore */ } }
  }
  function frameCanvas(v, width) {
    const w = Math.min(width, v.videoWidth), h = Math.max(2, Math.round((w * v.videoHeight) / v.videoWidth));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    return { c, ctx: c.getContext("2d", { willReadFrequently: true }), w, h };
  }
  async function* sampleFrames(v, fps, width, onProgress) {
    const fc = frameCanvas(v, width), n = Math.max(1, Math.floor(v.duration * fps));
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      await seekTo(v, Math.min(t + 0.001, Math.max(0, v.duration - 0.02)));
      fc.ctx.drawImage(v, 0, 0, fc.w, fc.h);
      if (onProgress && i % 5 === 0) onProgress(i / n);
      yield { i, t, n, w: fc.w, h: fc.h, data: fc.ctx.getImageData(0, 0, fc.w, fc.h).data, fc };
    }
  }
  function snapshot(fc, draw) {
    const c = document.createElement("canvas"); c.width = fc.w; c.height = fc.h;
    const x = c.getContext("2d"); x.drawImage(fc.c, 0, 0);
    if (draw) draw(x, fc.w, fc.h);
    return c.toDataURL("image/jpeg", 0.75);
  }
  function banner(x, w, h, text, color) {
    x.font = `bold ${Math.round(h / 14)}px system-ui, sans-serif`;
    const tw = x.measureText(text).width;
    x.fillStyle = color || "#d7263d"; x.fillRect((w - tw) / 2 - 10, h / 2 - h / 12, tw + 20, h / 9);
    x.fillStyle = "#fff"; x.textBaseline = "middle"; x.fillText(text, (w - tw) / 2, h / 2 - h / 12 + h / 18);
  }

  // ------------------------------------------------------------ audio analysis
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  function detectWhistle(x, sr) {
    const N = sr > 30000 ? 2048 : 1024, hop = N / 4;
    if (x.length < N) return null;
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const lo = Math.floor((1800 * N) / sr), hi = Math.ceil((3800 * N) / sr);
    const frames = 1 + Math.floor((x.length - N) / hop), band = new Float32Array(frames), ratio = new Float32Array(frames);
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < frames; f++) {
      const o = f * hop;
      for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let tot = 1e-12, b = 0;
      for (let k = 1; k < N / 2; k++) { const e = re[k] * re[k] + im[k] * im[k]; tot += e; if (k >= lo && k <= hi) b += e; }
      band[f] = b; ratio[f] = b / tot;
    }
    const sorted = Array.from(band).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length / 2)] + 1e-9;
    let run = 0;
    for (let f = 0; f < frames; f++) {
      run = (ratio[f] > 0.5 && band[f] > 30 * floor && band[f] > 1e-2) ? run + 1 : 0;
      if (run >= 3) return ((f - run + 1) * hop + N / 2) / sr;
    }
    return null;
  }
  function speechOnset(x, sr) {
    const n = Math.max(1, Math.floor(sr * 0.03)), frames = Math.floor(x.length / n);
    if (!frames) return { onset: null, speaking: 0 };
    const e = new Float32Array(frames);
    for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * n; i < (f + 1) * n; i++) s += x[i] * x[i]; e[f] = Math.sqrt(s / n) + 1e-9; }
    const sorted = Array.from(e).sort((a, b) => a - b), thr = Math.max(sorted[Math.floor(frames * 0.2)] * 4, 0.01);
    let onset = null, run = 0, active = 0;
    for (let f = 0; f < frames; f++) {
      if (e[f] > thr) { active++; run++; } else run = 0;
      if (onset == null && run >= 5) onset = ((f - run + 1) * n) / sr;
    }
    return { onset, speaking: (active * n) / sr };
  }
  function waveformImage(x, sr, markers, title) {
    const W = 720, H = 180, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.fillStyle = "#faf8f4"; g.fillRect(0, 0, W, H);
    const dur = Math.max(x.length / sr, 0.01), cols = W - 40, step = Math.max(1, Math.floor(x.length / cols));
    g.strokeStyle = "#3c6e96";
    for (let i = 0; i < cols; i++) {
      let a = 0; for (let k = i * step; k < Math.min(x.length, (i + 1) * step); k++) a = Math.max(a, Math.abs(x[k]));
      const hp = Math.min(1, a * 2.2) * 60; g.beginPath(); g.moveTo(20 + i, 95 - hp); g.lineTo(20 + i, 95 + hp); g.stroke();
    }
    g.fillStyle = "#333"; g.font = "12px system-ui, sans-serif"; g.fillText(title, 20, 16);
    for (let s = 0; s <= dur; s++) g.fillText(`${s}s`, 20 + (s / dur) * cols - 6, H - 6);
    markers.forEach(([t, label, color]) => {
      const px = 20 + Math.min(1, Math.max(0, t / dur)) * cols;
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.moveTo(px, 24); g.lineTo(px, H - 20); g.stroke(); g.lineWidth = 1;
      g.fillStyle = color; g.fillRect(px + 3, 26, g.measureText(label).width + 8, 16); g.fillStyle = "#fff"; g.fillText(label, px + 7, 38);
    });
    return c.toDataURL("image/png");
  }

  // ------------------------------------------------------------ text matching (proverb)
  const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
  function normalizeText(s) {
    return String(s || "").toLowerCase().replace(AR_MARKS, "").replace(/ـ/g, "")
      .replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).join(" ");
  }
  function similarity(a, b) {
    if (!a.length && !b.length) return 1;
    const dp = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      let prev = 0;
      for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = tmp; }
    }
    return (2 * dp[b.length]) / (a.length + b.length);
  }
  function stripPrompt(heard, prompt) {
    let h = normalizeText(heard).split(" ").filter(Boolean);
    const p = normalizeText(prompt).split(" ").filter(Boolean);
    if (p.length && h.slice(0, p.length).join(" ") === p.join(" ")) h = h.slice(p.length);
    return h.filter((t) => !p.includes(t)).join(" ");
  }
  function answerScore(expected, heard, prompt) {
    const h = prompt ? stripPrompt(heard, prompt) : normalizeText(heard);
    let best = 0;
    for (const opt of String(expected || "").split("|").filter((o) => o.trim())) {
      const e = normalizeText(opt);
      if (!e || !h) continue;
      if ((" " + h + " ").includes(" " + e + " ")) return 1;
      const et = e.split(" "), ht = h.split(" ");
      const hits = et.filter((tok) => Math.max(0, ...ht.map((u) => similarity(tok, u))) >= (tok.length <= 3 ? 0.85 : 0.75)).length;
      best = Math.max(best, hits / et.length, similarity(e, h));
    }
    return r2(best);
  }

  // ------------------------------------------------------------ goal-line judge (football)
  /* Goals are judged against goal lines the host MARKS on the picture: the two
   * post bases of each physical goal. A goal needs the ball's ground point to be
   * seen moving from the pitch side to the far side of that line, between the
   * posts, by at least one ball-width. Anything the camera cannot establish
   * (hidden ball, crossing at a post, flat camera angle) becomes a REVIEW for
   * the host, never an automatic goal. */
  class GoalJudge {
    constructor(lines, W, H, fps) {
      this.fps = fps; this.W = W; this.minLen = 0.06 * W; this.goals = [];
      for (const [name, gl] of Object.entries(lines || {})) {
        if (!gl || !gl.a || !gl.b) continue;
        const a = [gl.a[0] * W, gl.a[1] * H], b = [gl.b[0] * W, gl.b[1] * H];
        this.goals.push({ name, a, b, dx: b[0] - a[0], dy: b[1] - a[1], len: Math.hypot(b[0] - a[0], b[1] - a[1]), s: 1,
          st: { lastPitch: null, lastSeen: null, lock: false, back: 0, beyond: 0, lostFlag: false } });
      }
      this.goals.forEach((g) => { // pitch side = towards the other goal (or the picture centre)
        const o = this.goals.find((x) => x !== g);
        const ref = o ? [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2] : [W / 2, H / 2];
        if (this.raw(g, ref) > 0) g.s = -1;
      });
    }
    raw(g, p) { return (g.dx * (p[1] - g.a[1]) - g.dy * (p[0] - g.a[0])) / Math.max(1e-6, g.len); }
    sd(g, p) { return g.s * this.raw(g, p); } // > 0 means behind the goal line
    u(g, p) { return ((p[0] - g.a[0]) * g.dx + (p[1] - g.a[1]) * g.dy) / Math.max(1e-6, g.len * g.len); }
    step(t, ball) {
      const out = [], fps = this.fps;
      for (const g of this.goals) {
        const S = g.st;
        if (!ball) {
          const L = S.lastSeen;
          if (L && !S.lock && !S.lostFlag && t - L.t >= 3 / fps && L.d > -1.5 * L.r && L.u > -0.05 && L.u < 1.05) {
            out.push({ kind: "review", goal: g.name, t: L.t, u: L.u, why: "The ball disappeared right at the goal line - the camera cannot show whether it went in." });
            S.lostFlag = true; S.lock = true; S.back = 0;
          }
          continue;
        }
        const r = Math.max(2, ball.r), p = [ball.x, ball.y + r], d = this.sd(g, p), u = this.u(g, p);
        const reappeared = !!(S.lastSeen && t - S.lastSeen.t > 2.5 / fps);
        if (d < -0.5 * r) { // pitch side
          S.lastPitch = { t, u, d }; S.beyond = 0;
          if (S.lock) { if (d < -3 * r) { if (++S.back >= Math.max(2, Math.round(0.5 * fps))) { S.lock = false; S.back = 0; S.lostFlag = false; } } else S.back = 0; }
        } else if (d > r && !S.lock) { // the whole ball (as seen) is behind the line
          S.beyond++;
          const lp = S.lastPitch;
          if (lp && t - lp.t <= 3.0 && (S.beyond >= 2 || reappeared)) {
            const k = Math.min(1, Math.max(0, -lp.d / Math.max(1e-6, d - lp.d)));
            const uc = lp.u + (u - lp.u) * k, tc = lp.t + (t - lp.t) * k, hidden = reappeared || t - lp.t > 0.45 + (S.beyond - 1) / fps;
            let kind = "goal", why = "";
            if (uc < -0.3 || uc > 1.3) kind = null;
            else if (uc < -0.08 || uc > 1.08) kind = "miss";
            else if (g.len < this.minLen) { kind = "review"; why = "This goal line looks too short on screen (camera angle) to judge a crossing."; }
            else if (uc < 0.08 || uc > 0.92) { kind = "review"; why = "The ball crossed the line right next to a post."; }
            else if (hidden) { kind = "review"; why = "The ball was hidden while it crossed the line."; }
            if (kind) out.push({ kind, goal: g.name, t: tc, u: uc, why });
            S.lock = true; S.back = 0; S.lastPitch = null;
          }
        } else if (d >= -0.5 * r && d <= r) S.beyond = 0; // on the line: not a goal yet
        S.lastSeen = { t, d, u, r };
      }
      return out;
    }
  }

  // ------------------------------------------------------------ game 1: football
  async function football(v, audio, cfg, P) {
    if (!v) throw new JudgeError("Football needs a video with the players and the ball in view.");
    const defaults = { P1: ["A", "red"], P2: ["A", "yellow"], P3: ["B", "blue"], P4: ["B", "magenta"] };
    const given = cfg.players || Object.fromEntries(Object.entries(defaults).map(([k, [t, c]]) => [k, { team: t, color: c }]));
    const players = {};
    Object.entries(given).forEach(([pid, info]) => { players[pid] = { team: String(info.team || "A").toUpperCase(), c: resolveColor(info.color, (defaults[pid] || [])[1]) }; });
    const teams = new Set(Object.values(players).map((p) => p.team));
    if (!teams.has("A") || !teams.has("B")) throw new JudgeError("Football needs at least one player in Team A and one in Team B.");
    const ball = resolveColor(cfg.ball_color, "orange");
    const zoneTeam = String(cfg.team_a_attacks || "right") === "right" ? { right: "A", left: "B" } : { right: "B", left: "A" };
    const fps = GAMES.football.fps, dt = 1 / fps, confirmN = 2, releaseN = 4;
    const poss = {}, seen = {}, prev = {}, best = {};
    Object.keys(players).forEach((p) => { poss[p] = 0; seen[p] = 0; });
    const teamPoss = { A: 0, B: 0 }, score = { A: 0, B: 0 }, goals = [], frames = [], timeline = [];
    let prevBall = null, ballSeen = 0, ballMissing = 0, owner = null, pending = null, pendingN = 0, looseN = 0, lastTouch = null;
    let spell = null, n = 0, W = 0, H = 0, lastFc = null, gj = null;
    const goalLines = cfg.goal_lines && Object.keys(cfg.goal_lines).length ? cfg.goal_lines : null;
    const reviews = [], misses = [];
    const closeSpell = () => { if (spell) { const [p, s0, s1] = spell; if (!best[p] || s1 - s0 > best[p][1] - best[p][0]) best[p] = [s0, s1]; } spell = null; };
    for await (const f of sampleFrames(v, fps, GAMES.football.width, P)) {
      n = f.i + 1; W = f.w; H = f.h; lastFc = f.fc;
      if (!gj) gj = new GoalJudge(goalLines, W, H, fps);
      const N = W * H, B = toHSV(f.data, N), m = buffers(N).m;
      const minArea = Math.max(15, 0.0006 * N), dets = {};
      for (const [pid, p] of Object.entries(players)) {
        const comps = components(colorMask(B, p.c, N, m), W, H, minArea);
        if (!comps.length) continue;
        const pv = prev[pid];
        const pick = comps.reduce((a, c) => { const s = pv ? c.area / (1 + Math.hypot(c.cx - pv[0], c.cy - pv[1]) / 30) : c.area; return s > a[0] ? [s, c] : a; }, [-1, null])[1];
        dets[pid] = pick; prev[pid] = [pick.cx, pick.cy]; seen[pid]++;
      }
      let bdet = null;
      const bcomps = components(colorMask(B, ball, N, m), W, H, 6, 0.02 * N);
      for (const c of bcomps) {
        const fill = c.area / (c.w * c.h), asp = c.w / c.h;
        if (fill < 0.5 || asp < 0.5 || asp > 2) continue;
        const s = fill * Math.sqrt(c.area) / (prevBall ? 1 + Math.hypot(c.cx - prevBall[0], c.cy - prevBall[1]) / 40 : 1);
        if (!bdet || s > bdet.s) bdet = { s, x: c.cx, y: c.cy, r: Math.max(c.w, c.h) / 2 };
      }
      if (bdet) { prevBall = [bdet.x, bdet.y]; ballSeen++; ballMissing = 0; } else ballMissing++;
      let cand = null;
      if (bdet) {
        let bestS = Infinity;
        for (const [pid, d] of Object.entries(dets)) {
          const footY = d.y + d.h * 3, x0 = d.x - 0.25 * d.w, x1 = d.x + 1.25 * d.w;
          const dx = Math.max(x0 - bdet.x, 0, bdet.x - x1), dy = Math.max(d.y - bdet.y, 0, bdet.y - footY), dist = Math.hypot(dx, dy);
          if (dist <= Math.max(5, 0.5 * d.h)) { const s = dist + 0.25 * Math.hypot(bdet.x - (d.x + d.w / 2), bdet.y - footY); if (s < bestS) { bestS = s; cand = pid; } }
        }
      }
      if (cand && cand === pending) pendingN++; else { pending = cand; pendingN = cand ? 1 : 0; }
      if (cand && cand !== owner && pendingN >= confirmN) {
        owner = cand; lastTouch = cand;
        const back = (confirmN - 1) * dt; poss[owner] += back; teamPoss[players[owner].team] += back;
      }
      if (owner) {
        if (bdet && !cand) { if (++looseN >= releaseN) { owner = null; looseN = 0; } } else if (cand === owner) looseN = 0;
        if (!bdet && ballMissing > 2 * releaseN) owner = null;
      }
      if (owner && (cand === owner || (!bdet && ballMissing <= releaseN))) {
        poss[owner] += dt; teamPoss[players[owner].team] += dt;
        if (spell && spell[0] === owner && f.t - spell[2] <= 0.5) spell[2] = f.t + dt; else { closeSpell(); spell = [owner, f.t, f.t + dt]; }
      }
      const events = gj.step(f.t, bdet ? { x: bdet.x, y: bdet.y, r: bdet.r } : null), shots = [];
      for (const ev of events) {
        const team = zoneTeam[ev.goal] || "A", own = !!(lastTouch && players[lastTouch].team !== team);
        const base = { team, player: own ? null : lastTouch, time_s: r2(ev.t), goal: ev.goal, own_goal: own, cross_point: r2(ev.u) };
        if (own) base.own_goal_by = lastTouch;
        if (ev.kind === "goal") {
          goals.push({ ...base, evidence: "ball seen crossing the marked goal line between the posts" }); score[team]++;
          shots.push([`GOAL! Team ${team}` + (own ? ` (own goal by ${base.own_goal_by})` : (base.player ? ` - ${base.player}` : "")), "#d7263d"]);
          lastTouch = null; owner = null;
        } else if (ev.kind === "review") {
          const rv = { id: `R${reviews.length + 1}`, ...base, reason: ev.why };
          reviews.push(rv); shots.push([`CHECK ${rv.id}: possible goal, Team ${team}?`, "#b26a00"]);
        } else if (ev.kind === "miss") {
          misses.push({ time_s: r2(ev.t), goal: ev.goal, wide_of: ev.u < 0 ? "post 1" : "post 2" });
        }
      }
      const rec = { t: r2(f.t), p: {}, b: bdet ? [r3(bdet.x / W), r3(bdet.y / H), r3(bdet.r / W)] : null, o: owner, s: { ...score } };
      for (const [pid, d] of Object.entries(dets)) rec.p[pid] = [r3(d.x / W), r3(d.y / H), r3(d.w / W), r3(d.h / H)];
      timeline.push(rec);
      for (const [label, col] of shots) frames.push({ t: r2(f.t), label, img: snapshot(f.fc, (x, w, h) => { drawFootball(x, w, h, rec, players, goalLines); banner(x, w, h, label, col); }) });
    }
    closeSpell();
    const ids = Object.keys(poss), mvp = ids.some((p) => poss[p] > 0) ? ids.reduce((a, b) => (poss[b] > poss[a] ? b : a)) : null;
    if (mvp && best[mvp]) {
      const mid = (best[mvp][0] + best[mvp][1]) / 2;
      await seekTo(v, mid); lastFc.ctx.drawImage(v, 0, 0, W, H);
      const rec = timeline.reduce((a, r) => (Math.abs(r.t - mid) < Math.abs(a.t - mid) ? r : a), timeline[0]);
      frames.push({ t: r2(mid), label: `MVP ${mvp} on the ball`, img: snapshot(lastFc, (x, w, h) => { drawFootball(x, w, h, rec, players, goalLines); banner(x, w, h, `MVP ${mvp}`, "#1e8e4e"); }) });
    }
    const total = teamPoss.A + teamPoss.B, ballPct = (100 * ballSeen) / Math.max(1, n), warnings = [];
    if (ballPct < 50) warnings.push(`Ball visible in only ${ballPct.toFixed(0)}% of frames - pick the ball colour (calibration) or improve the camera angle.`);
    ids.forEach((p) => { const pc = (100 * seen[p]) / Math.max(1, n); if (pc < 50) warnings.push(`${p} visible in only ${pc.toFixed(0)}% of frames - check the bib colour.`); });
    let reason;
    if (!goalLines) { reason = "Goals were NOT judged: the goal lines were not marked on screen 5, so the AI cannot relate the ball to the real goals. "; warnings.push("Mark both posts of each goal (screen 5, calibration) and judge again to count goals."); }
    else if (goals.length) { const g = goals[goals.length - 1]; reason = `Goal for Team ${g.team} at ${g.time_s.toFixed(1)}s (${g.player || (g.own_goal ? "own goal by " + g.own_goal_by : "unknown scorer")}): the ball was seen crossing the marked ${g.goal} goal line between the posts. `; }
    else reason = "No goal: the ball was never seen crossing a marked goal line between the posts. ";
    if (reviews.length) reason += `${reviews.length} possible goal(s) need the host's decision. `;
    if (mvp) reason += `MVP ${mvp}: most time on the ball (${poss[mvp].toFixed(1)}s).`;
    const facts = {
      goals, score, goals_judged: !!goalLines, goal_reviews: reviews, near_misses: misses,
      goal_calibration: goalLines ? (cfg.goal_calibration_source || "marked by the host") : "not marked",
      goal_rule: "Goal = the ball's ground point is seen moving from the pitch side to behind the marked goal line, between the marked posts, by at least one ball-width. Hidden crossings, crossings at a post or flat camera angles are flagged for the host. A 2D picture cannot prove the whole ball crossed the line in 3D.",
      team_possession_sec: { A: r2(teamPoss.A), B: r2(teamPoss.B) },
      team_possession_pct: { A: total ? Math.round((1000 * teamPoss.A) / total) / 10 : 0, B: total ? Math.round((1000 * teamPoss.B) / total) / 10 : 0 },
      player_possession_sec: Object.fromEntries(ids.map((p) => [p, Math.round(poss[p] * 10) / 10])),
      player_team: Object.fromEntries(ids.map((p) => [p, players[p].team])), mvp,
      mvp_rule: "Player with the most time in possession of the ball, as seen by the AI",
      moment_reason: reason.trim(),
      detection_quality: { frames_analyzed: n, fps_analyzed: fps, ball_visible_pct: Math.round(ballPct * 10) / 10,
        players_visible_pct: Object.fromEntries(ids.map((p) => [p, Math.round((1000 * seen[p]) / Math.max(1, n)) / 10])) },
      warnings
    };
    return { facts, frames, overlay: { kind: "football", timeline, players: Object.fromEntries(ids.map((p) => [p, { team: players[p].team, draw: players[p].c.draw }])), lines: goalLines }, duration: v.duration };
  }
  function drawFootball(x, w, h, rec, players, lines) {
    x.lineWidth = 2; x.font = `${Math.max(10, Math.round(h / 28))}px system-ui, sans-serif`;
    Object.entries(lines || {}).forEach(([name, gl]) => { // only the goal lines the host marked
      if (!gl || !gl.a || !gl.b) return;
      const ax = gl.a[0] * w, ay = gl.a[1] * h, bx = gl.b[0] * w, by = gl.b[1] * h;
      x.strokeStyle = "#ffeb3b"; x.lineWidth = 3; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); x.lineWidth = 2;
      x.fillStyle = "#ffeb3b"; [[ax, ay], [bx, by]].forEach(([px, py]) => { x.beginPath(); x.arc(px, py, 4, 0, 2 * Math.PI); x.fill(); });
      x.fillStyle = "#000"; x.fillText(`${name} goal line (marked)`, Math.min(ax, bx) + 4, Math.min(ay, by) - 4);
    });
    for (const [pid, b] of Object.entries(rec.p || {})) {
      const col = (players[pid] && (players[pid].draw || (players[pid].c && players[pid].c.draw))) || "#fff";
      const [bx, by, bw, bh] = [b[0] * w, b[1] * h, b[2] * w, b[3] * h];
      x.strokeStyle = col; x.strokeRect(bx, by, bw, bh);
      x.fillStyle = col; x.fillRect(bx, by - 15, x.measureText(pid).width + 8, 14); x.fillStyle = "#fff"; x.fillText(pid, bx + 4, by - 4);
    }
    if (rec.b) {
      x.strokeStyle = "#fff"; x.beginPath(); x.arc(rec.b[0] * w, rec.b[1] * h, rec.b[2] * w + 5, 0, 2 * Math.PI); x.stroke();
      if (rec.o && rec.p[rec.o]) { const b = rec.p[rec.o]; x.strokeStyle = "#ffeb3b"; x.beginPath(); x.moveTo(rec.b[0] * w, rec.b[1] * h); x.lineTo((b[0] + b[2] / 2) * w, (b[1] + b[3] / 2) * h); x.stroke(); }
    }
    x.fillStyle = "rgba(19,41,75,.8)"; x.fillRect(0, 0, w, 20); x.fillStyle = "#fff";
    x.fillText(`AI JUDGE | Team 468 | JLWEO   A ${rec.s.A} - ${rec.s.B} B   t=${rec.t.toFixed(1)}s   on ball: ${rec.o || "-"}`, 6, 14);
  }

  // ------------------------------------------------------------ game 3: pearl balance (stillness per lane)
  async function pearl(v, audio, cfg, P) {
    if (!v) throw new JudgeError("The balance hold needs a video.");
    const ids = (cfg.lanes || ["P1", "P2"]).slice(0, 6), fps = GAMES.pearl_balance.fps;
    const still = cfg.still_threshold || 0.004, fail = cfg.fail_threshold || 0.012, entry = cfg.entry_threshold || 0.008;
    const needStill = Math.max(1, Math.round(0.5 * fps)), needFail = Math.max(1, Math.round(0.2 * fps));
    const L = ids.map((p) => ({ player: p, entered: false, start: null, end: null, endedBy: null, run: 0 }));
    const timeline = [];
    let prev = null, bounds = null, n = 0, W = 0;
    for await (const f of sampleFrames(v, fps, GAMES.pearl_balance.width, P)) {
      n = f.i + 1; W = f.w;
      if (!bounds) bounds = lanes(f.w, ids.length);
      const g = toGray(f.data, f.w * f.h, new Uint8Array(f.w * f.h)), rec = { t: r2(f.t), s: [] };
      L.forEach((l, k) => {
        const m = laneMotion(g, prev, f.w, f.h, bounds[k][0], bounds[k][1], 22);
        if (l.end == null) {
          if (!l.entered) { if (m >= entry) l.entered = true; }
          else if (l.start == null) { l.run = m < still ? l.run + 1 : 0; if (l.run >= needStill) { l.start = (f.i - l.run + 1) / fps; l.run = 0; } }
          else { l.run = m > fail ? l.run + 1 : 0; if (l.run >= needFail) { l.end = (f.i - l.run + 1) / fps; l.endedBy = "lost balance (big movement)"; } }
        }
        rec.s.push(!l.entered ? "waiting" : l.start == null ? "getting into pose" : l.end == null ? `HOLDING ${(f.t - l.start).toFixed(1)}s` : `OUT - held ${(l.end - l.start).toFixed(1)}s`);
      });
      timeline.push(rec); prev = g;
    }
    const dur = n / fps;
    const res = L.map((l) => {
      if (l.start != null && l.end == null) { l.end = dur; l.endedBy = "still holding when the clip ended"; }
      return { player: l.player, hold_s: l.start == null ? 0 : r2(l.end - l.start), hold_start_s: l.start == null ? null : r2(l.start), hold_end_s: l.end == null ? null : r2(l.end),
        ended_by: l.endedBy || (l.entered ? "never settled" : "no player detected"), player_detected: l.entered };
    });
    const bestHold = Math.max(0, ...res.map((r) => r.hold_s)), winners = bestHold > 0 ? res.filter((r) => bestHold - r.hold_s <= 0.2).map((r) => r.player) : [];
    const winner = winners.length === 1 ? winners[0] : winners.length ? "tie" : null;
    const w1 = res.find((r) => r.player === winner);
    const reason = winner && winner !== "tie" ? `${winner} held the pearl-diver pose longest: ${w1.hold_s.toFixed(1)}s (${w1.ended_by}).` : winner === "tie" ? `Tie between ${winners.join(", ")} at about ${bestHold.toFixed(1)}s.` : "No player managed a steady hold.";
    return { facts: { lanes: res, winner, winners, method: "Motion analysis per lane: a hold starts after 0.5s of stillness and ends at the first sustained big movement.", moment_reason: reason },
      frames: [], overlay: { kind: "lanes", ids, timeline }, duration: v.duration };
  }

  // ------------------------------------------------------------ game 4: souq (first team to show the target colour)
  async function souq(v, audio, cfg, P) {
    if (!v) throw new JudgeError("The souq sprint needs a video.");
    const target = resolveColor(cfg.target_color, "red"), label = cfg.target_label || `something ${target.name}`;
    const fps = GAMES.souq_hunt.fps, limit = Number(cfg.time_limit_s || 30), minFrac = Number(cfg.min_area_pct || 1.5) / 100;
    const baseN = Math.max(1, Math.round(0.5 * fps)), sustain = Math.max(2, Math.round(0.3 * fps));
    const hist = { A: [], B: [] }, base = {}, run = { A: 0, B: 0 }, found = { A: null, B: null }, peak = { A: 0, B: 0 }, frames = [], timeline = [];
    let n = 0;
    for await (const f of sampleFrames(v, fps, GAMES.souq_hunt.width, P)) {
      n = f.i + 1;
      const N = f.w * f.h, m = colorMask(toHSV(f.data, N), target, N, buffers(N).m), half = Math.floor(f.w / 2);
      const cnt = { A: 0, B: 0 };
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (m[y * f.w + x]) cnt[x < half ? "A" : "B"]++;
      const rec = { t: r2(f.t), s: [] };
      for (const t of ["A", "B"]) {
        const frac = cnt[t] / (half * f.h); peak[t] = Math.max(peak[t], frac);
        if (f.i < baseN) hist[t].push(frac);
        else {
          if (base[t] == null) base[t] = hist[t].slice().sort((a, b) => a - b)[Math.floor(hist[t].length / 2)];
          if (found[t] == null) {
            run[t] = frac - base[t] >= minFrac ? run[t] + 1 : 0;
            if (run[t] >= sustain) {
              found[t] = (f.i - run[t] + 1) / fps;
              frames.push({ t: r2(found[t]), label: `Team ${t} shows the target`, img: snapshot(f.fc, (x, w, h) => banner(x, w, h, `Team ${t} FOUND ${target.name.toUpperCase()}`, "#1e8e4e")) });
            }
          }
        }
        rec.s.push(found[t] != null ? `Team ${t}: FOUND at ${found[t].toFixed(1)}s` : `Team ${t}: searching`);
      }
      timeline.push(rec);
    }
    const teams = {};
    ["A", "B"].forEach((t) => { teams[t] = { side: t === "A" ? "left" : "right", found: found[t] != null, time_s: found[t] == null ? null : r2(found[t]), within_time: found[t] != null && found[t] <= limit, peak_area_pct: r2(100 * peak[t]), baseline_area_pct: r2(100 * (base[t] || 0)) }; });
    const valid = Object.entries(teams).filter(([, v2]) => v2.within_time);
    let winner = null, reason = `Neither team showed ${label} within ${limit}s.`;
    if (valid.length) {
      const first = Math.min(...valid.map(([, v2]) => v2.time_s)), tied = valid.filter(([, v2]) => v2.time_s - first <= 0.1).map(([t]) => t);
      winner = tied.length === 1 ? tied[0] : "tie";
      reason = winner === "tie" ? `Both teams showed ${label} at about ${first.toFixed(1)}s.` : `Team ${winner} showed ${label} first, at ${first.toFixed(1)}s.`;
    }
    return { facts: { target_color: target.name, target_label: label, teams, winner, time_limit_s: limit,
      method: "Colour detection in each half of the picture, compared with the first 0.5s so items already in the room do not count.", moment_reason: reason },
      frames, overlay: { kind: "lanes", ids: ["Team A", "Team B"], timeline }, duration: v.duration };
  }

  // ------------------------------------------------------------ game 5: falcon (hear the whistle, time each lane)
  async function falcon(v, audio, cfg, P) {
    if (!v || !audio) throw new JudgeError("The falcon challenge needs video AND sound - the AI must hear the whistle.");
    const ids = (cfg.lanes || ["P1", "P2"]).slice(0, 6), fps = GAMES.falcon_reflex.fps;
    const thr = cfg.react_threshold || 0.005, maxR = Number(cfg.max_reaction_s || 2), fsWin = 1.5;
    const lure = detectWhistle(audio.x, audio.sr);
    const img = waveformImage(audio.x, audio.sr, lure != null ? [[lure, `whistle heard ${lure.toFixed(2)}s`, "#c62828"]] : [], "What the AI heard - falcon whistle (2-3.5 kHz)");
    const S = ids.map(() => ({ react: null, fs: false, run: 0, fsRun: 0 })), timeline = [];
    let prev = null, bounds = null;
    for await (const f of sampleFrames(v, fps, GAMES.falcon_reflex.width, P)) {
      if (!bounds) bounds = lanes(f.w, ids.length);
      const g = toGray(f.data, f.w * f.h, new Uint8Array(f.w * f.h)), rec = { t: r2(f.t), s: [] };
      S.forEach((s, k) => {
        const m = laneMotion(g, prev, f.w, f.h, bounds[k][0], bounds[k][1], 22);
        if (lure != null) {
          if (f.t >= lure - fsWin && f.t < lure) { s.fsRun = m > thr ? s.fsRun + 1 : 0; if (s.fsRun >= 2) s.fs = true; }
          else if (f.t >= lure && s.react == null && f.t - lure <= maxR) { s.run = m > thr ? s.run + 1 : 0; if (s.run >= 2) s.react = (f.i - s.run + 1) / fps - lure; }
        }
        rec.s.push(s.fs ? "FALSE START" : s.react != null ? `reacted ${Math.max(0, s.react).toFixed(2)}s` : lure != null && f.t >= lure ? "..." : "waiting");
      });
      timeline.push(rec); prev = g;
    }
    const L = ids.map((p, k) => { const r = S[k].react == null ? null : r2(Math.max(0, S[k].react)); return { player: p, reaction_s: r, reacted: r != null, false_start: S[k].fs, valid: r != null && !S[k].fs }; });
    const valid = L.filter((l) => l.valid), fastest = valid.length ? valid.reduce((a, b) => (b.reaction_s < a.reaction_s ? b : a)).player : null;
    let reason = "The AI did not hear the falcon whistle, so this round cannot be judged.";
    if (lure != null && fastest) { reason = `Whistle heard at ${lure.toFixed(2)}s; ${fastest} reacted fastest in ${L.find((l) => l.player === fastest).reaction_s.toFixed(2)}s.`; const fs = L.filter((l) => l.false_start).map((l) => l.player); if (fs.length) reason += ` False start: ${fs.join(", ")}.`; }
    else if (lure != null) reason = `Whistle heard at ${lure.toFixed(2)}s but no valid reaction was seen.`;
    return { facts: { lure_detected: lure != null, lure_time_s: lure == null ? null : r2(lure), lanes: L, fastest, max_reaction_s: maxR, timing_resolution_s: r3(1 / fps),
      method: "Whistle found in the audio (2-3.5 kHz band); reaction = first big movement in each lane after the whistle.", moment_reason: reason },
      frames: [{ t: lure == null ? 0 : r2(lure), label: "Audio: what the AI heard", img }], overlay: { kind: "lanes", ids, timeline, lure }, duration: v.duration };
  }

  // ------------------------------------------------------------ game 2: proverb (speech timing + spoken answer)
  async function proverb(v, audio, cfg) {
    if (!audio) throw new JudgeError("The proverb duel needs a recording with sound.");
    const player = cfg.player || "P1", prompt = cfg.prompt || "", expected = cfg.expected_answer || "", limit = Number(cfg.time_limit_s || 10);
    const { onset, speaking } = speechOnset(audio.x, audio.sr);
    const transcript = cfg.transcript && String(cfg.transcript).trim() ? String(cfg.transcript).trim() : null;
    const score = transcript == null ? null : answerScore(expected, transcript, prompt), correct = score == null ? null : score >= 0.7;
    const within = onset != null && onset <= limit;
    let reason;
    if (onset == null) reason = `No speech detected from ${player} - no answer.`;
    else if (correct == null) reason = `${player} spoke after ${onset.toFixed(1)}s, but no words were captured (speech recognition needs the in-app recorder and internet), so the AI cannot judge the words.`;
    else reason = `${player} started answering after ${onset.toFixed(1)}s; heard "${transcript}", which ${correct ? "matches" : "does not match"} the expected ending (match ${score.toFixed(2)}).` + (within ? "" : ` Answer started after the ${limit}s limit.`);
    const marks = [[limit, `time limit ${limit}s`, "#c62828"]]; if (onset != null) marks.unshift([onset, `speech starts ${onset.toFixed(2)}s`, "#1e8e4e"]);
    return { facts: { player, prompt, expected_answer: expected, language: cfg.language || "ar-AE", transcript,
      transcript_source: transcript == null ? "none captured" : "phone speech recognition during the in-app recording",
      match_score: score, correct, speech_detected: onset != null, response_time_s: onset == null ? null : r2(onset), speaking_time_s: r2(speaking), time_limit_s: limit, within_time: within, moment_reason: reason },
      frames: [{ t: 0, label: `Audio: what the AI heard - ${player}`, img: waveformImage(audio.x, audio.sr, marks, `What the AI heard - ${player}`) }], overlay: null, duration: audio.x.length / audio.sr };
  }

  const ANALYZERS = { football, proverb, pearl_balance: pearl, souq_hunt: souq, falcon_reflex: falcon };

  // ------------------------------------------------------------ report integrity (SHA-256)
  function sha256(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = new TextEncoder().encode(str), l = bytes.length, nBlocks = ((l + 9 + 63) >> 6), w = new Uint32Array(nBlocks * 16);
    for (let i = 0; i < l; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    w[nBlocks * 16 - 1] = l * 8; w[nBlocks * 16 - 2] = Math.floor((l * 8) / 0x100000000);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const W = new Uint32Array(64), ror = (x, n) => (x >>> n) | (x << (32 - n));
    for (let b = 0; b < nBlocks; b++) {
      for (let t = 0; t < 16; t++) W[t] = w[b * 16 + t];
      for (let t = 16; t < 64; t++) { const s0 = ror(W[t - 15], 7) ^ ror(W[t - 15], 18) ^ (W[t - 15] >>> 3), s1 = ror(W[t - 2], 17) ^ ror(W[t - 2], 19) ^ (W[t - 2] >>> 10); W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0; }
      let a = h0, bb = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let t = 0; t < 64; t++) {
        const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
  }
  function canonical(o) {
    if (o === null || typeof o !== "object") return JSON.stringify(o);
    if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
    return "{" + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
  }
  function seal(report) {
    const body = { ...report }; delete body.verification_code;
    return { ...body, verification_code: `${TEAM_CODE}-${sha256(canonical(body))}` };
  }
  function verify(report) {
    if (!report || typeof report !== "object") return { valid: false, reason: "Not a report." };
    const code = report.verification_code;
    if (typeof code !== "string" || !/^JLWEO-[0-9a-f]{64}$/.test(code)) return { valid: false, reason: "Missing or malformed integrity code (expected JLWEO-<SHA-256>)." };
    if (report.team_code !== TEAM_CODE || String(report.team_id) !== TEAM_ID) return { valid: false, reason: "Report is not from Team 468's AI judge." };
    const body = { ...report }; delete body.verification_code;
    return sha256(canonical(body)) === code.slice(6)
      ? { valid: true, reason: "Integrity check passed: the report is exactly as the on-device AI judge created it.", code }
      : { valid: false, reason: "Integrity check FAILED: the report was changed after the AI judge created it.", code };
  }

  // ------------------------------------------------------------ main entry
  async function judge(gameId, src, round, cfg, onProgress) {
    if (!ANALYZERS[gameId]) throw new JudgeError(`Unknown game '${gameId}'.`);
    const P = onProgress || (() => {});
    P(0, "Opening the clip");
    const buf = src.blob ? await src.blob.arrayBuffer() : await (await fetch(src.url)).arrayBuffer();
    const url = src.blob ? URL.createObjectURL(src.blob) : src.url;
    const needVideo = gameId !== "proverb", needAudio = gameId === "proverb" || gameId === "falcon_reflex";
    const v = needVideo ? await openVideo(url) : null;
    const audio = needAudio ? await decodeAudio(buf) : null;
    if (needVideo && !v) throw new JudgeError("This browser could not open the video. Record in the app or use an MP4/MOV clip.");
    P(0.02, "The AI judge is watching and listening");
    const out = await ANALYZERS[gameId](v, audio, cfg || {}, (p) => P(p, "The AI judge is watching and listening"));
    P(1, "Done");
    const rid = Array.from(crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(6)) : [1, 2, 3, 4, 5, 6]).map((b) => b.toString(16).padStart(2, "0")).join("");
    const report = seal({
      schema: SCHEMA, report_id: rid, team_id: TEAM_ID, team_code: TEAM_CODE, game_id: gameId, game_name: GAMES[gameId].name,
      round: Number(round) || 1, timestamp: new Date().toISOString(),
      judge: { name: "FAGD on-device AI judge", version: VERSION, runs_on: "this device - nothing uploaded" },
      media: { filename: src.name || "clip", size_bytes: buf.byteLength, duration_s: r2(out.duration || 0), fps_analyzed: GAMES[gameId].fps, has_video: !!v, has_audio: !!audio, fingerprint: sha256Bytes(buf) },
      facts: out.facts,
      evidence: { frames: out.frames.map((f) => ({ t: f.t, label: f.label })) }
    });
    return { report, verification: verify(report), evidence: { frames: out.frames, overlay: out.overlay, url } };
  }
  function sha256Bytes(buf) { // fingerprint of the first 1 MB + size (fast on phones)
    const u = new Uint8Array(buf, 0, Math.min(buf.byteLength, 1 << 20)); let s = "";
    for (let i = 0; i < u.length; i += 4096) s += String.fromCharCode.apply(null, u.subarray(i, i + 4096));
    return sha256(s + ":" + buf.byteLength);
  }

  const api = { GoalJudge, judge, verify, seal, sha256, canonical, answerScore, normalizeText, detectWhistle, speechOnset, drawFootball, GAMES, COLOR_PRESETS, TEAM_ID, TEAM_CODE, VERSION, JudgeError };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FAGDJudge = api;
})(typeof window !== "undefined" ? window : globalThis);
