/* Family AI Game Day - host app (Team 468 | Code: JLWEO)
 * Six screens: choose game -> players & teams -> rules & ready -> round in play
 * -> AI judge results -> final results. */
(function () {
  "use strict";
  const R = window.FAGDRules;
  const J = window.FAGDJudge;
  const G = R.GAME_INFO;
  const DEMO_FILES = ["football_demo.mp4", "proverb_demo.wav", "pearl_balance_demo.mp4", "souq_hunt_demo.mp4", "falcon_reflex_demo.mp4"];
  let lastEvidence = null; // images + overlay of the latest judged clip (kept in memory only)
  const STORE_KEY = "fagd-468-jlweo-state";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const round2 = (n) => Math.round(n * 100) / 100;
  const COLOR_HEX = { red: "#e53935", orange: "#ff8c00", yellow: "#fbc02d", green: "#43a047", cyan: "#00bcd4", blue: "#1e5ae6", magenta: "#d81bd8", purple: "#7b1fa2", white: "#f2f2f2" };
  const BIB_COLORS = ["red", "yellow", "blue", "magenta", "cyan", "green", "orange", "purple", "white"];
  const DEFAULT_PLAYERS = [
    { id: "P1", name: "P1", team: "A", color: "red" },
    { id: "P2", name: "P2", team: "A", color: "yellow" },
    { id: "P3", name: "P3", team: "B", color: "blue" },
    { id: "P4", name: "P4", team: "B", color: "magenta" }
  ];

  let info = { demo_files: DEMO_FILES };
  let state = load() || fresh();
  const media = { stream: null, recorder: null, chunks: [], blob: null, blobRound: null, mime: "", started: 0, duration: 0,
    transcript: "", recog: null, lureTimer: null, lureAt: null, audioCtx: null, uploadFile: null, revealed: false };
  const timer = { left: null, running: false, handle: null, last: 0 };

  function fresh() {
    return { screen: 1, maxScreen: 1, game: null, mode: "team", players: clone(DEFAULT_PLAYERS), rules: {}, round: 1,
      scores: { players: {}, teams: {} }, stats: {}, log: [], applied: [], current: null, calib: {}, source: null,
      demoFile: "", finished: false, matchId: 0 };
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: keep going */ } }
  function load() { try { const v = localStorage.getItem(STORE_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  function toast(msg, ms) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), ms || 3200);
  }
  async function postJSON(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  const nameOf = (id) => { const p = state.players.find((x) => x.id === id); return p ? p.name : (id || "-"); };
  const ctx = () => ({ rules: state.rules, players: state.players, mode: state.mode, decisions: (state.current && state.current.decisions) || {} });
  const pendingReviews = () => { const cur = state.current, f = cur && cur.report && cur.report.facts; return ((f && f.goal_reviews) || []).filter((rv) => (cur.decisions || {})[rv.id] == null); };
  function reviewsHTML(f) {
    const list = f.goal_reviews || [], dec = state.current.decisions || {};
    const misses = (f.near_misses || []).map((m) => `<li>Near miss at ${m.time_s}s - wide of ${esc(m.wide_of)} (${esc(m.goal)} goal): no goal</li>`).join("");
    let html = f.goals_judged === false ? '<div class="card verify bad"><div><h3>Goals not judged</h3><p>Mark both posts of each real goal in step 2, then run the AI judge again.</p></div></div>' : "";
    if (list.length) {
      html += `<div class="card review"><h3>Needs your decision: ${list.length} possible goal(s)</h3><p class="hint">The camera view could not establish these clearly, so the AI did not count them. Watch the moment in the replay, then decide. Your decision is recorded as a HOST decision, separate from the AI report.</p>
        ${list.map((rv) => `<div class="rv"><b>${rv.id}</b> at ${rv.time_s}s - Team ${rv.team}${rv.player ? ` (${esc(rv.player)})` : ""}: ${esc(rv.reason)}
          <div class="btn-row"><button class="btn ${dec[rv.id] === true ? "primary" : "ghost"}" data-rv="${rv.id}" data-ok="1">Goal ✓</button><button class="btn ${dec[rv.id] === false ? "primary" : "ghost"}" data-rv="${rv.id}" data-ok="0">No goal ✗</button></div></div>`).join("")}</div>`;
    }
    if (misses) html += `<div class="card"><h3>Near misses seen by the AI</h3><ul>${misses}</ul></div>`;
    return html;
  }

  // ------------------------------------------------------------ navigation
  function go(n) {
    if (n > state.maxScreen) return;
    if (n >= 2 && !state.game) n = 1;
    state.screen = n; save(); render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function unlock(n) { state.maxScreen = Math.max(state.maxScreen, n); }
  function render() {
    $$(".screen").forEach((s) => s.classList.toggle("active", Number(s.dataset.screen) === state.screen));
    $$("#stepper button").forEach((b) => {
      const n = Number(b.dataset.go);
      b.classList.toggle("active", n === state.screen);
      b.classList.toggle("done", n < state.screen);
      b.disabled = n > state.maxScreen;
    });
    [null, r1, r2, r3, r4, r5, r6][state.screen]();
  }
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) go(Number(nav.dataset.nav));
    const st = e.target.closest("#stepper button");
    if (st && !st.disabled) go(Number(st.dataset.go));
  });

  function resetMatch() {
    state.round = 1; state.scores = { players: {}, teams: {} }; state.stats = {}; state.log = []; state.applied = [];
    state.current = null; state.finished = false; state.matchId = (state.matchId || 0) + 1; state.source = null;
    media.blob = null; media.transcript = ""; media.revealed = false; resetTimer();
  }

  // ------------------------------------------------------------ 1. choose a game
  function r1() {
    $("#s1").innerHTML = `
      <div class="screen-head"><h2>1 · Choose a game</h2>
        <p>Football plus four original games inspired by sport, culture and heritage. Every game is judged by AI from real play - video, audio, or both.</p></div>
      <div class="game-grid">${Object.entries(G).map(([id, g]) => `
        <button class="game-card ${state.game === id ? "selected" : ""}" data-game="${id}">
          <div class="gc-top"><span class="gc-icon">${g.icon}</span><span class="gc-kind">${g.teamOnly ? "Team game" : "Individual or team"}</span></div>
          <h3>${esc(g.name)}${id === "football" ? ' <em>required</em>' : ""}</h3>
          <p class="gc-heritage">${esc(g.heritage)}</p>
          <p class="gc-ai"><b>AI judge:</b> ${esc(g.aiJudges)}</p>
          <div class="chips">${g.signals.map((s) => `<span class="chip">${s === "video" ? "🎥 Video" : "🎙 Audio"}</span>`).join("")}</div>
        </button>`).join("")}</div>`;
    $$(".game-card").forEach((b) => (b.onclick = () => chooseGame(b.dataset.game)));
  }
  function chooseGame(id) {
    if (state.game !== id) {
      state.game = id; state.rules = clone(G[id].rules); state.calib = {}; resetMatch();
      state.maxScreen = 2;
    }
    if (G[id].teamOnly) state.mode = "team";
    if (id === "proverb") state.rules.rounds = Math.max(state.rules.rounds, state.players.length);
    unlock(2); go(2);
  }

  // ------------------------------------------------------------ 2. players & teams
  function laneHint() {
    const order = state.players.map((p) => p.id).join(" | ");
    switch (state.game) {
      case "football": return "Give every player a bib of a different bright colour (not the ball's colour). The AI recognises players by bib colour; the numbers are for people.";
      case "souq_hunt": return "Team A searches on the LEFT half of the camera picture, Team B on the RIGHT half.";
      case "proverb": return `Players answer one at a time, in this order: ${order}.`;
      default: return `Players stand side by side in lanes, left to right as the camera sees them: ${order}.`;
    }
  }
  function r2() {
    if (!state.game) return go(1);
    const g = G[state.game], football = state.game === "football", team = state.mode === "team";
    $("#s2").innerHTML = `
      <div class="screen-head"><h2>2 · Players &amp; teams</h2><p>${esc(g.name)} - ${g.teamOnly ? "Team A vs Team B." : "play as individuals or as two teams."}</p></div>
      <div class="card">
        <div class="mode-row">${g.teamOnly ? '<span class="pill">Team game: Team A vs Team B</span>' : `
          <div class="seg" role="group"><button data-mode="team" class="${team ? "on" : ""}">Team mode</button><button data-mode="individual" class="${!team ? "on" : ""}">Individual mode</button></div>`}
        </div>
        <table class="players"><thead><tr><th>Player</th><th>Name</th>${team ? "<th>Team</th>" : ""}${football ? "<th>Bib colour (for the AI)</th>" : ""}<th></th></tr></thead>
        <tbody>${state.players.map((p, i) => `<tr>
          <td><span class="pid">${p.id}</span></td>
          <td><input data-i="${i}" data-f="name" value="${esc(p.name)}" maxlength="20" aria-label="Name of ${p.id}"></td>
          ${team ? `<td><select data-i="${i}" data-f="team"><option ${p.team === "A" ? "selected" : ""}>A</option><option ${p.team === "B" ? "selected" : ""}>B</option></select></td>` : ""}
          ${football ? `<td><div class="bib"><span class="swatch" style="background:${COLOR_HEX[p.color] || "#999"}"></span><select data-i="${i}" data-f="color">${BIB_COLORS.map((c) => `<option ${p.color === c ? "selected" : ""}>${c}</option>`).join("")}</select></div></td>` : ""}
          <td>${state.players.length > 2 ? `<button class="link" data-del="${i}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table>
        ${state.players.length < 4 ? '<button class="btn ghost" id="addP">+ Add player</button>' : ""}
        <p class="hint">${esc(laneHint())}</p>
        <div id="p2err" class="error"></div>
      </div>
      <div class="actions"><button class="btn ghost" data-nav="1">← Back</button><button class="btn primary" id="saveTeams">Save teams →</button></div>`;
    $$("#s2 [data-mode]").forEach((b) => (b.onclick = () => { state.mode = b.dataset.mode; save(); r2(); }));
    $$("#s2 [data-f]").forEach((el) => (el.onchange = () => {
      const p = state.players[Number(el.dataset.i)]; p[el.dataset.f] = el.value.trim() || p.id; save();
      if (el.dataset.f === "color") r2();
    }));
    $$("#s2 [data-del]").forEach((b) => (b.onclick = () => {
      state.players.splice(Number(b.dataset.del), 1);
      state.players.forEach((p, i) => { const old = p.id; p.id = `P${i + 1}`; if (p.name === old) p.name = p.id; });
      save(); r2();
    }));
    const add = $("#addP");
    if (add) add.onclick = () => {
      const n = state.players.length + 1, used = state.players.map((p) => p.color);
      state.players.push({ id: `P${n}`, name: `P${n}`, team: n % 2 ? "A" : "B", color: BIB_COLORS.find((c) => !used.includes(c)) });
      save(); r2();
    };
    $("#saveTeams").onclick = () => {
      const err = validatePlayers();
      $("#p2err").textContent = err || "";
      if (err) return;
      if (state.game === "proverb") state.rules.rounds = Math.max(state.rules.rounds, state.players.length);
      unlock(3); go(3);
    };
  }
  function validatePlayers() {
    const ps = state.players;
    if (state.mode === "team" && (!ps.some((p) => p.team === "A") || !ps.some((p) => p.team === "B"))) return "Each team needs at least one player.";
    if (state.game === "football") {
      const cols = ps.map((p) => p.color);
      if (new Set(cols).size !== cols.length) return "Every player needs a different bib colour.";
      if (cols.includes(state.rules.ballColor)) return `A bib has the same colour as the ball (${state.rules.ballColor}). Change it.`;
    }
    return "";
  }

  // ------------------------------------------------------------ 3. rules & ready
  function r3() {
    if (!state.game) return go(1);
    const g = G[state.game], ex = g.explain(state.rules);
    $("#s3").innerHTML = `
      <div class="screen-head"><h2>3 · Rules &amp; ready</h2><p>The app explains the rules before anyone plays. Adjust them if your family agrees.</p></div>
      <div class="grid2">
        <div class="card rules-explain">
          <h3>${esc(g.icon)} ${esc(g.name)}</h3>
          <dl>
            <dt>Points</dt><dd>${esc(ex.points)}</dd>
            <dt>Time</dt><dd>${esc(ex.time)}</dd>
            <dt>Penalties</dt><dd>${esc(ex.penalties)}</dd>
            <dt>Tie</dt><dd>${esc(ex.ties)}</dd>
            <dt>Winning</dt><dd>${esc(ex.winning)}</dd>
            <dt>AI judge</dt><dd>${esc(g.aiJudges)}</dd>
          </dl>
        </div>
        <div class="card"><h3>Settings</h3>
          <div class="fields">${g.fields.map((f) => `<label><span>${esc(f.label)}</span>${f.type === "select"
            ? `<select data-k="${f.key}">${f.options.map((o) => `<option ${String(state.rules[f.key]) === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
            : `<input type="number" data-k="${f.key}" value="${state.rules[f.key]}" min="${f.min}" max="${f.max}" step="${f.step || 1}">`}</label>`).join("")}</div>
        </div>
      </div>
      <div class="actions"><button class="btn ghost" data-nav="2">← Players</button><button class="btn primary" id="ready">Everyone ready ✓</button></div>`;
    $$("#s3 [data-k]").forEach((el) => (el.onchange = () => {
      const f = g.fields.find((x) => x.key === el.dataset.k);
      let v = f.type === "number" ? Number(el.value) : el.value;
      if (f.type === "number") v = Math.min(f.max, Math.max(f.min, isFinite(v) ? v : f.min));
      state.rules[f.key] = v; save(); r3();
    }));
    $("#ready").onclick = () => {
      if (state.game === "football" && state.players.some((p) => p.color === state.rules.ballColor)) return toast("A bib has the same colour as the ball - change it on screen 2.");
      resetMatch(); unlock(5); state.maxScreen = Math.max(state.maxScreen, 5); go(4);
    };
  }

  // ------------------------------------------------------------ round helpers
  const turnPlayer = () => state.players[(state.round - 1) % state.players.length];
  const currentProverb = () => R.PROVERBS[(state.round - 1 + (state.matchId || 0) * 3) % R.PROVERBS.length];
  const currentTarget = () => R.SOUQ_TARGETS[(state.round - 1) % R.SOUQ_TARGETS.length];
  function turnText() {
    const lanes = state.players.map((p) => p.id).join(" | ");
    switch (state.game) {
      case "football": return "Team A vs Team B";
      case "proverb": return `${turnPlayer().name}'s turn`;
      case "souq_hunt": return "Team A (left) vs Team B (right)";
      default: return `All players - lanes ${lanes}`;
    }
  }
  function challengeHTML() {
    switch (state.game) {
      case "football": return `<p class="ch-big">Score in the other team's goal.</p><p>Keep the ball to become MVP - the AI times who has it. Team A attacks the <b>${esc(state.rules.teamAAttacks)}</b> goal (as the camera sees it).</p>`;
      case "proverb": {
        const pv = currentProverb();
        if (!media.revealed) return `<p class="ch-big">Proverb hidden</p><p>Press <b>● Record</b>: the proverb appears when recording starts, so the AI can time ${esc(turnPlayer().name)}'s answer.</p><button class="btn link" id="reveal">Show it without recording</button>`;
        return `<p class="eyebrow">Complete the proverb</p><p class="ch-ar" dir="rtl" lang="ar">${esc(pv.prompt)} …</p><p class="hint">${esc(pv.meaning)}</p>`;
      }
      case "pearl_balance": return `<p class="ch-big">Pearl diver pose: arms forward, one knee up.</p><p>Get into the pose after recording starts, then hold steady. A big wobble ends your hold. The steadiest diver wins.</p>`;
      case "souq_hunt": {
        const c = state.calib && state.calib.TARGET;
        return `<p class="eyebrow">Find and hold up to the camera</p><p class="ch-big">${c ? "the item picked during calibration" : esc(currentTarget().label)}</p><p>Team A on the left, Team B on the right. First team to show it wins the round.</p>`;
      }
      case "falcon_reflex": return `<p class="ch-big">Stand still, glove-hand down.</p><p>When the falcon whistle sounds, raise your hand as fast as you can. Moving before the whistle is a false start. The app plays the whistle at a random moment while recording.</p>`;
      default: return "";
    }
  }
  function scoreboardHTML() {
    const tot = R.totals(state);
    if (state.mode === "team") {
      return `<div class="sb-teams">${["A", "B"].map((t) => `<div class="sb-team t${t}"><span>Team ${t}</span><b>${tot.teams[t]}</b>
        <small>${state.players.filter((p) => p.team === t).map((p) => `${esc(p.name)} ${tot.players[p.id]}`).join(" · ")}</small></div>`).join("")}</div>`;
    }
    return `<table class="sb-table">${state.players.map((p) => `<tr><td><span class="pid">${p.id}</span> ${esc(p.name)}</td><td><b>${tot.players[p.id]}</b></td></tr>`).join("")}</table>`;
  }

  // ------------------------------------------------------------ timer
  function resetTimer() { stopTimer(); timer.left = null; }
  function stopTimer() { timer.running = false; clearInterval(timer.handle); }
  function startTimer() {
    if (timer.left == null || timer.left <= 0) timer.left = Number(state.rules.roundSeconds || 60);
    timer.running = true; timer.last = performance.now(); clearInterval(timer.handle);
    timer.handle = setInterval(() => {
      const now = performance.now(); timer.left -= (now - timer.last) / 1000; timer.last = now;
      if (timer.left <= 0) { timer.left = 0; stopTimer(); beep(); toast("Time!"); }
      paintTimer();
    }, 200);
    paintTimer();
  }
  function paintTimer() {
    const el = $("#timer"); if (!el) return;
    const left = timer.left == null ? Number(state.rules.roundSeconds || 60) : timer.left;
    const s = Math.ceil(left);
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    el.classList.toggle("low", left <= 5 && timer.running);
  }
  function audioCtx() {
    if (!media.audioCtx) media.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (media.audioCtx.state === "suspended") media.audioCtx.resume();
    return media.audioCtx;
  }
  function beep() {
    try {
      const a = audioCtx(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 880; g.gain.value = 0.25; o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.4);
    } catch (e) { /* no audio */ }
  }
  function playLure() {
    const a = audioCtx();
    [0, 0.33].forEach((off) => {
      const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + off;
      o.type = "sine";
      o.frequency.setValueAtTime(2000, t0); o.frequency.linearRampToValueAtTime(3400, t0 + 0.25);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.01);
      g.gain.setValueAtTime(0.9, t0 + 0.24); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + 0.27);
    });
    const f = $("#flash"); f.classList.add("on"); setTimeout(() => f.classList.remove("on"), 600);
  }

  // ------------------------------------------------------------ 4. round in play
  function r4() {
    if (!state.game) return go(1);
    const g = G[state.game], r = state.rules;
    if (state.finished) {
      $("#s4").innerHTML = `<div class="card"><h3>All ${r.rounds} round(s) are done.</h3><div class="actions left"><button class="btn primary" data-nav="6">See final results →</button></div></div>`;
      return;
    }
    const needsAudio = g.signals.includes("audio");
    const hasRec = media.blob && media.blobRound === state.round;
    $("#s4").innerHTML = `
      <div class="round-head">
        <div><span class="eyebrow">${esc(g.icon)} ${esc(g.name)}</span><h2>Round ${state.round} of ${r.rounds} <span class="sep">|</span> ${esc(turnText())}</h2></div>
        <div class="timer" id="timer">--:--</div>
      </div>
      <div class="grid2">
        <div class="card challenge"><h3>Challenge</h3><div id="challengeBox">${challengeHTML()}</div>
          <div class="btn-row"><button class="btn ghost" id="tStart">▶ Start timer</button><button class="btn ghost" id="tPause">❚❚ Pause</button><button class="btn ghost" id="tReset">↺ Reset</button></div>
        </div>
        <div class="card"><h3>Record the round - camera${needsAudio ? " + microphone" : ""}</h3>
          <div class="preview-wrap"><video id="preview" playsinline muted></video><div class="rec-dot" id="recDot">● REC</div></div>
          <div class="btn-row"><button class="btn ghost" id="camOn">Start camera</button><button class="btn rec" id="recStart" disabled>● Record</button><button class="btn ghost" id="recStop" disabled>■ Stop</button></div>
          <p class="hint" id="recStatus">${hasRec ? `Recorded ${media.duration.toFixed(1)} s for this round ✓` : "Hold the phone sideways (landscape) and keep it still, with the whole play area in view."}</p>
          ${state.game === "falcon_reflex" ? `<p class="hint">Volume up: the AI must <b>hear</b> the whistle. In-app recording plays it automatically. If you record with the phone's camera app instead, play the whistle from a second device (another phone or laptop with this app open):</p>
            <button class="btn ghost" id="whistleBtn">🦅 Play whistle after a random 2-5 s delay</button>` : ""}
          ${state.game === "proverb" ? `<p class="hint">Live speech recognition: <b>${(window.SpeechRecognition || window.webkitSpeechRecognition) ? "available in this browser (needs internet)" : "not available in this browser - the AI will try online recognition on the recording"}</b>.</p>` : ""}
        </div>
      </div>
      <div class="card">${scoreboardHTML()}</div>
      <div class="actions"><button class="btn ghost" data-nav="3">← Rules</button>
        <button class="btn primary" id="toJudge">${hasRec ? "Send the recording to the AI judge →" : "Go to the AI judge (upload or demo clip) →"}</button></div>`;
    paintTimer();
    if (timer.running) paintTimer();
    $("#tStart").onclick = startTimer;
    $("#tPause").onclick = () => { stopTimer(); paintTimer(); };
    $("#tReset").onclick = () => { resetTimer(); paintTimer(); };
    const rev = $("#reveal"); if (rev) rev.onclick = () => { media.revealed = true; $("#challengeBox").innerHTML = challengeHTML(); };
    $("#camOn").onclick = startCamera;
    const wb = $("#whistleBtn");
    if (wb) wb.onclick = () => { audioCtx(); wb.disabled = true; wb.textContent = "🦅 Get ready…"; setTimeout(() => { playLure(); wb.disabled = false; wb.textContent = "🦅 Play whistle after a random 2-5 s delay"; }, 2000 + Math.random() * 3000); };
    $("#recStart").onclick = startRecording;
    $("#recStop").onclick = stopRecording;
    $("#toJudge").onclick = () => { state.source = hasRec ? "recording" : null; unlock(5); go(5); };
    if (media.stream) attachPreview();
  }
  function attachPreview() {
    const v = $("#preview"); if (!v || !media.stream) return;
    v.srcObject = media.stream; v.play().catch(() => {});
    $("#recStart").disabled = !!(media.recorder && media.recorder.state === "recording");
    $("#recStop").disabled = !(media.recorder && media.recorder.state === "recording");
    $("#camOn").textContent = "Camera on ✓";
  }
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return toast(window.isSecureContext === false
        ? "The camera only works when the app is opened from its https:// link. Or use screen 5 → 'Record with phone camera'."
        : "This browser cannot use the camera here. Use screen 5 → 'Record with phone camera'.", 7000);
    }
    try {
      if (!media.stream) {
        media.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          // echo cancellation / noise suppression would remove the falcon whistle from the recording
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      }
      attachPreview();
    } catch (e) {
      toast("Camera/microphone blocked: allow access in the browser's address bar and try again.", 5000);
    }
  }
  function pickMime() {
    const c = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
    for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }
  function startRecording() {
    if (!media.stream) return toast("Start the camera first.");
    audioCtx();
    media.chunks = []; media.transcript = ""; media.lureAt = null; media.mime = pickMime();
    try { media.recorder = new MediaRecorder(media.stream, media.mime ? { mimeType: media.mime } : undefined); }
    catch (e) { return toast("Recording is not supported in this browser."); }
    media.recorder.ondataavailable = (e) => { if (e.data && e.data.size) media.chunks.push(e.data); };
    media.recorder.onstop = () => {
      media.blob = new Blob(media.chunks, { type: media.recorder.mimeType || "video/webm" });
      media.blobRound = state.round; media.duration = (performance.now() - media.started) / 1000;
      const lure = media.lureAt != null ? ` Whistle played at ${media.lureAt.toFixed(1)} s (the AI must find it on its own).` : "";
      const said = state.game === "proverb" && media.transcript.trim() ? ` Browser heard: "${media.transcript.trim()}".` : "";
      const st = $("#recStatus"); if (st) st.textContent = `Recorded ${media.duration.toFixed(1)} s ✓.${lure}${said}`;
      const tj = $("#toJudge"); if (tj) { tj.textContent = "Send the recording to the AI judge →"; tj.onclick = () => { state.source = "recording"; unlock(5); go(5); }; }
    };
    media.recorder.start(250);
    media.started = performance.now();
    $("#recDot").classList.add("on");
    $("#recStart").disabled = true; $("#recStop").disabled = false;
    $("#recStatus").textContent = "Recording…";
    resetTimer(); startTimer();
    if (state.game === "proverb") { media.revealed = true; $("#challengeBox").innerHTML = challengeHTML(); startSpeech(); }
    if (state.game === "falcon_reflex") {
      const wait = 2500 + Math.random() * 3000;
      media.lureTimer = setTimeout(() => { media.lureAt = (performance.now() - media.started) / 1000; playLure(); }, wait);
    }
  }
  function stopRecording() {
    clearTimeout(media.lureTimer);
    if (media.recog) { try { media.recog.stop(); } catch (e) { /* ignore */ } media.recog = null; }
    if (media.recorder && media.recorder.state === "recording") media.recorder.stop();
    stopTimer();
    $("#recDot").classList.remove("on");
    $("#recStart").disabled = false; $("#recStop").disabled = true;
  }
  function startSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = state.rules.language || "ar-AE"; rec.continuous = true; rec.interimResults = false;
      rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) media.transcript += " " + e.results[i][0].transcript; };
      rec.onerror = () => {};
      rec.start(); media.recog = rec;
    } catch (e) { /* speech recognition unavailable */ }
  }

  // ------------------------------------------------------------ 5. AI judge results
  function judgeConfig() {
    const g = state.game, r = state.rules, ids = state.players.map((p) => p.id), c = state.calib || {};
    if (g === "football") {
      const marked = markedGoalLines(), demo = state.source === "demo";
      return { players: Object.fromEntries(state.players.map((p) => [p.id, { team: p.team, color: c[p.id] || p.color }])), ball_color: c.BALL || r.ballColor, team_a_attacks: r.teamAAttacks,
        goal_lines: marked || (demo ? DEMO_GOAL_LINES : null),
        goal_calibration_source: marked ? "marked by the host on a frame of the clip" : (demo ? "preset for the synthetic demo clip" : "not marked") };
    }
    if (g === "proverb") {
      const pv = currentProverb();
      const tr = state.source === "recording" && media.blobRound === state.round ? media.transcript.trim() : "";
      return { player: turnPlayer().id, prompt: pv.prompt, expected_answer: pv.answer, language: r.language, time_limit_s: r.roundSeconds, transcript: tr };
    }
    if (g === "pearl_balance") return { lanes: ids };
    if (g === "souq_hunt") { const t = currentTarget(); return { target_color: c.TARGET || t.color, target_label: c.TARGET ? "the calibrated item" : t.label.split(" - ")[0].toLowerCase(), time_limit_s: r.roundSeconds }; }
    if (g === "falcon_reflex") return { lanes: ids, max_reaction_s: 2.0 };
    return {};
  }
  function demosForGame() { return (info.demo_files || []).filter((f) => f.startsWith(state.game)); }
  function r5() {
    if (!state.game) return go(1);
    const g = G[state.game];
    const hasRec = !!(media.blob && media.blobRound === state.round);
    const demos = demosForGame();
    if (!state.source || (state.source === "recording" && !hasRec)) state.source = hasRec ? "recording" : (demos.length ? "demo" : "upload");
    if (!state.demoFile || !demos.includes(state.demoFile)) state.demoFile = demos[0] || "";
    const calib = ["football", "souq_hunt"].includes(state.game);
    $("#s5").innerHTML = `
      <div class="screen-head"><h2>5 · AI judge results</h2><p>${esc(g.icon)} ${esc(g.name)} - round ${Math.min(state.round, state.rules.rounds)} of ${state.rules.rounds}. The AI judge runs on this device - nothing is uploaded. The app checks each report's integrity code before any score changes.</p></div>
      <div class="card"><h3>1. What should the AI judge?</h3>
        <div class="src-tabs">
          ${srcTab("recording", "This round's recording", hasRec ? `${media.duration.toFixed(1)} s, recorded in the app` : "nothing recorded for this round yet", !hasRec)}
          ${srcTab("upload", "Phone camera / saved clip", "record with the camera app or pick a video")}
          ${srcTab("demo", "Demo clip", "synthetic test media (labelled)", !demos.length)}
          ${srcTab("import", "Import a saved report", "a report downloaded earlier")}
        </div>
        <div id="srcPanel" class="src-panel"></div>
      </div>
      ${calib ? calibHTML() : ""}
      <div class="card run-card" id="runCard">
        <button class="btn primary big" id="runJudge">Run the AI judge</button>
        <span id="judgeStatus" class="judge-status"></span>
      </div>
      <div id="results"></div>
      <div class="actions"><button class="btn ghost" data-nav="4">← Round in play</button><span id="nextWrap"></span></div>`;
    $$("#s5 input[name=src]").forEach((el) => (el.onchange = () => { state.source = el.value; save(); r5(); }));
    paintSource();
    if (calib) wireCalib();
    $("#runJudge").onclick = runJudge;
    $("#runCard").hidden = state.source === "import";
    renderResults();
  }
  function srcTab(val, title, sub, disabled) {
    return `<label class="src ${state.source === val ? "on" : ""} ${disabled ? "disabled" : ""}"><input type="radio" name="src" value="${val}" ${state.source === val ? "checked" : ""} ${disabled ? "disabled" : ""}><b>${esc(title)}</b><small>${esc(sub)}</small></label>`;
  }
  function paintSource() {
    const p = $("#srcPanel");
    if (state.source === "recording" && media.blob) {
      p.innerHTML = `<video controls playsinline class="clip" src="${URL.createObjectURL(media.blob)}"></video>`;
    } else if (state.source === "upload") {
      p.innerHTML = `<div class="btn-row">
          <label class="btn primary file-btn">📹 Record with phone camera<input type="file" id="capFile" accept="video/*" capture="environment" hidden></label>
          <label class="btn ghost file-btn">📁 Choose an existing clip<input type="file" id="upFile" accept="video/*,audio/*" hidden></label></div>
        <p class="hint">${media.uploadFile ? `Selected: <b>${esc(media.uploadFile.name)}</b>` : "Hold the phone sideways (landscape), keep it still, and keep the whole play area in view. Some phones ignore the camera button and show a file chooser instead - then pick Camera there."}</p>`;
      const pick = (e) => { media.uploadFile = e.target.files[0] || null; paintSource(); };
      $("#upFile").onchange = pick; $("#capFile").onchange = pick;
    } else if (state.source === "demo") {
      const demos = demosForGame();
      p.innerHTML = `<select id="demoSel">${demos.map((d) => `<option ${d === state.demoFile ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
        <p class="hint">Synthetic, clearly labelled test media. For the real demo, record your family playing.</p>`;
      const s = $("#demoSel"); if (s) s.onchange = () => { state.demoFile = s.value; save(); };
    } else if (state.source === "import") {
      p.innerHTML = `<p class="hint">Load a report saved earlier with "Download report". The app re-checks its integrity code before it can be applied.</p>
        <textarea id="impText" rows="6" placeholder='{"schema": "fagd-report/2", ... "verification_code": "JLWEO-..."}'></textarea>
        <div class="btn-row"><input type="file" id="impFile" accept=".json,application/json"><button class="btn primary" id="impBtn">Verify &amp; load report</button></div>`;
      $("#impFile").onchange = async (e) => { const f = e.target.files[0]; if (f) $("#impText").value = await f.text(); };
      $("#impBtn").onclick = () => importReport($("#impText").value);
    } else {
      p.innerHTML = "";
    }
  }

  // --- colour calibration (football bibs + ball, souq target)
  const GOAL_TARGETS = ["Left goal: post 1 base", "Left goal: post 2 base", "Right goal: post 1 base", "Right goal: post 2 base"];
  // Goal lines of the SYNTHETIC demo clip only (its goals are drawn by the generator at these spots).
  const DEMO_GOAL_LINES = { left: { a: [0.075, 0.3], b: [0.075, 0.7] }, right: { a: [0.925, 0.3], b: [0.925, 0.7] } };
  let calFrame = null;
  function calibTargets() { return state.game === "football" ? [...GOAL_TARGETS, ...state.players.map((p) => p.id), "BALL"] : ["TARGET"]; }
  function markedGoalLines() {
    const g = state.goalPts || {}, out = {};
    if (g[GOAL_TARGETS[0]] && g[GOAL_TARGETS[1]]) out.left = { a: g[GOAL_TARGETS[0]], b: g[GOAL_TARGETS[1]] };
    if (g[GOAL_TARGETS[2]] && g[GOAL_TARGETS[3]]) out.right = { a: g[GOAL_TARGETS[2]], b: g[GOAL_TARGETS[3]] };
    return Object.keys(out).length ? out : null;
  }
  function calibHTML() {
    const t = calibTargets(), fb = state.game === "football";
    return `<div class="card"><h3>2. ${fb ? "Mark the real goals, then the colours" : "Colour calibration"} <span class="opt">${fb ? "required for real football videos" : "recommended for real videos"}</span></h3>
      ${fb ? `<p class="hint"><b>Goals are only counted against goals you mark.</b> Load a frame, choose "Left goal: post 1 base", tap where that post touches the ground, then post 2, then the same for the right goal. Then pick each bib and the ball. (The demo clip has preset goal lines.)</p>`
        : `<p class="hint">Load a frame, then tap the item's colour in the picture. Without a pick the AI uses the called colour.</p>`}
      <div class="btn-row"><button class="btn ghost" id="calLoad">Load a frame from the selected clip</button>
        <select id="calTarget">${t.map((x) => `<option>${x}</option>`).join("")}</select>
        <button class="btn link" id="calClear">Clear all marks</button></div>
      <div class="cal-picks" id="calPicks">${calibPicksHTML()}</div>
      <canvas id="calCanvas" width="640" height="360" hidden></canvas></div>`;
  }
  function calibPicksHTML() {
    const gp = state.goalPts || {};
    return calibTargets().map((t) => GOAL_TARGETS.includes(t)
      ? `<span class="pick">${t.replace(" base", "")}: ${gp[t] ? "✓ marked" : "not marked"}</span>`
      : `<span class="pick">${t}: ${state.calib[t] ? `<i class="swatch" style="background:${state.calib[t].hex}"></i>picked` : "default"}</span>`).join("");
  }
  function drawCalMarks() {
    const c = $("#calCanvas"); if (!c || !calFrame) return;
    const x = c.getContext("2d"); x.putImageData(calFrame, 0, 0);
    const lines = markedGoalLines() || {}, gp = state.goalPts || {};
    x.lineWidth = 3; x.strokeStyle = "#ffeb3b"; x.fillStyle = "#ffeb3b"; x.font = "bold 13px system-ui, sans-serif";
    Object.values(lines).forEach((l) => { x.beginPath(); x.moveTo(l.a[0] * c.width, l.a[1] * c.height); x.lineTo(l.b[0] * c.width, l.b[1] * c.height); x.stroke(); });
    GOAL_TARGETS.forEach((t) => { const p = gp[t]; if (!p) return; x.beginPath(); x.arc(p[0] * c.width, p[1] * c.height, 6, 0, 2 * Math.PI); x.fill(); x.fillText(t.split(":")[0], p[0] * c.width + 8, p[1] * c.height - 6); });
  }
  function clipURL() {
    if (state.source === "recording" && media.blob) return URL.createObjectURL(media.blob);
    if (state.source === "upload" && media.uploadFile) return URL.createObjectURL(media.uploadFile);
    if (state.source === "demo" && state.demoFile) return `demo_media/${encodeURIComponent(state.demoFile)}`;
    return null;
  }
  function wireCalib() {
    $("#calClear").onclick = () => { state.calib = {}; state.goalPts = {}; save(); $("#calPicks").innerHTML = calibPicksHTML(); drawCalMarks(); };
    $("#calLoad").onclick = () => {
      const url = clipURL(); if (!url) return toast("Choose a recording, upload or demo clip first.");
      const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      v.onloadeddata = () => { const d = isFinite(v.duration) ? v.duration : 2; v.currentTime = Math.min(1, d / 2); };
      v.onseeked = () => {
        const c = $("#calCanvas"); const w = 640, h = Math.round(640 * (v.videoHeight || 360) / (v.videoWidth || 640));
        c.width = w; c.height = h; const cx = c.getContext("2d"); cx.drawImage(v, 0, 0, w, h); c.hidden = false;
        calFrame = cx.getImageData(0, 0, w, h); drawCalMarks();
      };
      v.onerror = () => toast("This browser cannot show a frame of that file. The AI can still read it; skip calibration.");
    };
    $("#calCanvas").onclick = (e) => {
      const c = e.currentTarget, rect = c.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * c.width / rect.width), y = Math.round((e.clientY - rect.top) * c.height / rect.height);
      const sel = $("#calTarget"), tgt = sel.value;
      if (GOAL_TARGETS.includes(tgt)) {
        state.goalPts = state.goalPts || {}; state.goalPts[tgt] = [Math.round((x / c.width) * 1000) / 1000, Math.round((y / c.height) * 1000) / 1000];
        save(); drawCalMarks(); $("#calPicks").innerHTML = calibPicksHTML(); toast(`${tgt.replace(" base", "")} marked`);
        if (sel.selectedIndex < sel.options.length - 1) sel.selectedIndex += 1;
        return;
      }
      const d = (calFrame ? (() => { const t = document.createElement("canvas"); t.width = c.width; t.height = c.height; t.getContext("2d").putImageData(calFrame, 0, 0); return t.getContext("2d"); })() : c.getContext("2d")).getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      r /= n; g /= n; b /= n;
      const target = $("#calTarget").value;
      state.calib[target] = { hsv: rgb2hsvCv(r, g, b), name: `picked-${target}`, hex: `rgb(${r | 0},${g | 0},${b | 0})` };
      save(); $("#calPicks").innerHTML = calibPicksHTML(); toast(`${target} colour picked`);
    };
  }
  function rgb2hsvCv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); }
    if (h < 0) h += 360;
    return [Math.round(h / 2), mx ? Math.round((d / mx) * 255) : 0, Math.round(mx)];
  }

  async function runJudge() {
    let src = null;
    if (state.source === "recording" && media.blob) {
      src = { blob: media.blob, name: `round${state.round}.${(media.blob.type || "").includes("mp4") ? "mp4" : "webm"}` };
    } else if (state.source === "upload" && media.uploadFile) {
      src = { blob: media.uploadFile, name: media.uploadFile.name };
    } else if (state.source === "demo" && state.demoFile) {
      src = { url: `demo_media/${encodeURIComponent(state.demoFile)}`, name: state.demoFile };
    } else {
      return toast("Record a clip, choose a clip, or pick a demo clip first.");
    }
    const btn = $("#runJudge"), st = $("#judgeStatus");
    btn.disabled = true;
    const show = (p, msg) => { st.innerHTML = `<span class="spin"></span> ${esc(msg)}… ${Math.round(p * 100)}%`; };
    show(0, "Opening the clip");
    try {
      const out = await J.judge(state.game, src, Math.min(state.round, state.rules.rounds), judgeConfig(), show);
      lastEvidence = out.evidence;
      state.current = { report: out.report, verification: out.verification, source: state.source };
      save(); st.textContent = "Done ✓ (judged on this device)"; renderResults();
      $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      st.textContent = "";
      toast(e instanceof J.JudgeError ? e.message : `The AI judge could not analyse this clip (${e.message || e}). Scores were not changed.`, 7000);
    } finally { btn.disabled = false; }
  }
  async function importReport(text) {
    let rep;
    try { rep = JSON.parse(text); } catch (e) { return toast("That is not valid JSON."); }
    const v = J.verify(rep);
    lastEvidence = null;
    state.current = { report: rep, verification: { valid: v.valid, reason: v.reason, code: v.code }, source: "import" };
    if (v.valid && rep.game_id !== state.game) toast(`Verified, but this report is for "${rep.game_name}", not the current game.`, 5000);
    save(); renderResults();
  }

  function factsHTML(game, f) {
    const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
    if (game === "football") {
      const tp = f.team_possession_pct || {}, ps = f.player_possession_sec || {};
      return `<p class="score-line">Team A <b>${f.score.A}</b> - <b>${f.score.B}</b> Team B</p>
        <div class="poss"><div class="pa" style="width:${tp.A || 50}%">A ${tp.A || 0}%</div><div class="pb" style="width:${tp.B || 50}%">B ${tp.B || 0}%</div></div>
        <table class="facts"><tr><th>Goal</th><th>Time</th><th>Team</th><th>Scorer</th></tr>${(f.goals || []).map((g, i) => `<tr><td>${i + 1}</td><td>${g.time_s}s</td><td>${g.team}</td><td>${g.own_goal ? `own goal (${esc(g.own_goal_by)})` : esc(g.player || "unknown")}</td></tr>`).join("") || '<tr><td colspan="4">No goals detected</td></tr>'}</table>
        <table class="facts"><tr><th>Player</th><th>Time on the ball</th></tr>${Object.entries(ps).sort((a, b) => b[1] - a[1]).map(([p, s]) => `<tr class="${p === f.mvp ? "mvp-row" : ""}"><td>${p} ${esc(nameOf(p) !== p ? "(" + nameOf(p) + ")" : "")}${p === f.mvp ? " 🏆 MVP" : ""}</td><td>${s}s</td></tr>`).join("")}</table>
        ${qualityHTML(f)}`;
    }
    if (game === "proverb") {
      const verdict = f.correct === true ? '<span class="ok">✓ correct</span>' : f.correct === false ? '<span class="bad">✗ not matching</span>' : '<span class="warn">? words not available</span>';
      return `<table class="facts">${row("Player", esc(f.player))}${row("Proverb start", `<span dir="rtl" lang="ar">${esc(f.prompt)}</span>`)}${row("Expected ending", `<span dir="rtl" lang="ar">${esc(f.expected_answer)}</span>`)}
        ${row("Heard", f.transcript == null ? "<i>no transcript</i>" : `<span dir="rtl" lang="ar">${esc(f.transcript || "(nothing recognisable)")}</span>`)}${row("Transcript source", esc(f.transcript_source))}
        ${row("Match", f.match_score == null ? "-" : f.match_score)}${row("Verdict", verdict)}${row("Started answering after", f.response_time_s == null ? "no speech" : f.response_time_s + " s")}${row("Within time limit", f.within_time ? "yes" : "no")}</table>`;
    }
    if (game === "pearl_balance") {
      return `<table class="facts"><tr><th>Lane</th><th>Hold</th><th>From → to</th><th>Ended by</th></tr>${(f.lanes || []).map((l) => `<tr class="${(f.winners || []).includes(l.player) ? "mvp-row" : ""}"><td>${l.player}</td><td><b>${l.hold_s}s</b></td><td>${l.hold_start_s ?? "-"} → ${l.hold_end_s ?? "-"}</td><td>${esc(l.ended_by)}</td></tr>`).join("")}</table><p class="hint">${esc(f.method)}</p>`;
    }
    if (game === "souq_hunt") {
      return `<p>Target: <b>${esc(f.target_label)}</b> (${esc(f.target_color)})</p><table class="facts"><tr><th>Team</th><th>Side</th><th>Found at</th></tr>${Object.entries(f.teams || {}).map(([t, v]) => `<tr class="${f.winner === t ? "mvp-row" : ""}"><td>Team ${t}</td><td>${v.side}</td><td>${v.found ? v.time_s + " s" : "not found"}</td></tr>`).join("")}</table><p class="hint">${esc(f.method)}</p>`;
    }
    if (game === "falcon_reflex") {
      return `<p>Whistle heard: <b>${f.lure_detected ? f.lure_time_s + " s" : "NOT heard"}</b></p><table class="facts"><tr><th>Lane</th><th>Reaction</th><th>Status</th></tr>${(f.lanes || []).map((l) => `<tr class="${l.player === f.fastest ? "mvp-row" : ""}"><td>${l.player}</td><td>${l.reaction_s == null ? "-" : l.reaction_s + " s"}</td><td>${l.false_start ? '<span class="bad">false start</span>' : l.valid ? "valid" : "no reaction"}</td></tr>`).join("")}</table><p class="hint">Timing resolution about ${f.timing_resolution_s}s. ${esc(f.method)}</p>`;
    }
    return `<pre>${esc(JSON.stringify(f, null, 2))}</pre>`;
  }
  function qualityHTML(f) {
    const q = f.detection_quality || {};
    const w = (f.warnings || []).map((x) => `<li>${esc(x)}</li>`).join("");
    return `<p class="hint">Ball visible in ${q.ball_visible_pct}% of ${q.frames_analyzed} frames analysed.</p>${w ? `<ul class="warnings">${w}</ul>` : ""}`;
  }
  function evidenceHTML() {
    const ev = lastEvidence;
    if (!ev) return '<p class="hint">Evidence images are kept on screen only until the page reloads. Run the AI judge again to see them.</p>';
    const media = ev.overlay
      ? `<p class="hint">Play the clip: the boxes and labels are what the AI detected at each moment.</p><div class="replay"><video id="evVideo" controls playsinline muted src="${ev.url}"></video><canvas id="evCanvas"></canvas></div>`
      : `<audio controls src="${ev.url}"></audio>`;
    const imgs = (ev.frames || []).map((f) => `<figure><img src="${f.img}" alt="${esc(f.label)}"><figcaption>${esc(f.label)} · ${f.t}s</figcaption></figure>`).join("");
    return media + `<div class="ev-frames">${imgs}</div>`;
  }
  function wireReplay() {
    const v = $("#evVideo"), c = $("#evCanvas"); if (!v || !c || !lastEvidence || !lastEvidence.overlay) return;
    const ov = lastEvidence.overlay, x = c.getContext("2d");
    const draw = () => {
      const w = v.clientWidth, h = v.clientHeight; if (!w || !h) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      x.clearRect(0, 0, w, h);
      const tl = ov.timeline; if (!tl || !tl.length) return;
      const t = v.currentTime; let rec = tl[0];
      for (const r of tl) { if (r.t <= t + 0.001) rec = r; else break; }
      if (ov.kind === "football") { J.drawFootball(x, w, h, rec, ov.players, ov.lines); return; }
      const n = ov.ids.length; x.font = `bold ${Math.max(11, Math.round(h / 24))}px system-ui, sans-serif`;
      ov.ids.forEach((id, k) => {
        const s = rec.s[k] || "", col = /OUT|FALSE/.test(s) ? "#c62828" : /HOLDING|FOUND|reacted/.test(s) ? "#1e8e4e" : "#555";
        const x0 = (k * w) / n; x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(x0 + 2, 2, w / n - 4, h - 4);
        const label = `${id}: ${s}`; x.fillStyle = col; x.fillRect(x0 + 6, 8, x.measureText(label).width + 10, Math.max(16, h / 18)); x.fillStyle = "#fff"; x.fillText(label, x0 + 11, 8 + Math.max(12, h / 24));
      });
      if (ov.lure != null && t >= ov.lure && t <= ov.lure + 0.8) { x.fillStyle = "rgba(30,120,200,.85)"; x.fillRect(w / 2 - 110, h / 2 - 18, 220, 36); x.fillStyle = "#fff"; x.fillText("WHISTLE HEARD", w / 2 - 70, h / 2 + 6); }
    };
    let raf = null;
    const loop = () => { draw(); if (!v.paused && !v.ended) raf = requestAnimationFrame(loop); };
    v.addEventListener("play", () => { cancelAnimationFrame(raf); loop(); });
    v.addEventListener("seeked", draw); v.addEventListener("loadeddata", draw); window.addEventListener("resize", draw);
  }

  function renderResults() {
    const box = $("#results"); if (!box) return;
    const cur = state.current;
    if (!cur) { box.innerHTML = ""; $("#nextWrap").innerHTML = ""; return; }
    const rep = cur.report || {}, v = cur.verification || {}, f = rep.facts;
    const applied = state.applied.includes(rep.report_id);
    const verifyCard = `<div class="card verify ${v.valid ? "ok" : "bad"}">
        <div class="v-icon">${v.valid ? "✓" : "✗"}</div>
        <div><h3>${v.valid ? "Report verified - unchanged since Team 468's on-device AI judge created it" : "Report REJECTED"}</h3>
          <p>${esc(v.reason)}</p><code class="vcode">${esc(rep.verification_code || "no integrity code")}</code>
          <p class="meta">Report ${esc(rep.report_id)} · ${esc(rep.game_name)} · round ${esc(rep.round)} · ${esc(rep.timestamp)}${rep.media ? ` · ${esc(rep.media.filename)} · clip fingerprint ${esc(String(rep.media.fingerprint || "").slice(0, 12))}…` : ""}</p></div></div>`;
    if (!f || rep.game_id !== state.game) {
      box.innerHTML = verifyCard + (f ? '<div class="card"><p>This report belongs to a different game, so it cannot be applied here.</p></div>' : "");
      return;
    }
    const preview = R.applyFacts(rep.game_id, f, ctx());
    box.innerHTML = verifyCard + `
      <div class="card moment"><span class="eyebrow">Game moment + reason</span><p class="big">${esc(f.moment_reason || "")}</p></div>
      <div class="grid2">
        <div class="card"><h3>What the AI found</h3>${factsHTML(rep.game_id, f)}</div>
        <div class="card"><h3>What the AI saw / heard</h3>${evidenceHTML()}</div>
      </div>
      ${rep.game_id === "football" ? reviewsHTML(f) : ""}
      <div class="card"><h3>What "Apply AI results" will do</h3>
        <ul class="apply-list">${preview.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        <div class="btn-row">
          <button id="applyBtn" class="btn primary" ${v.valid && !applied && !pendingReviews().length ? "" : "disabled"}>${applied ? "Applied ✓" : pendingReviews().length ? "Decide the possible goals first" : "Apply AI results"}</button>
          <button id="tamperBtn" class="btn warn">Tamper test</button>
          <button id="dlBtn" class="btn ghost">Download report (.json)</button>
        </div>
        <div id="tamperOut"></div>
      </div>`;
    $("#applyBtn").onclick = applyResults;
    $$("#results [data-rv]").forEach((b) => (b.onclick = () => {
      if (applied) return toast("This round is already applied.");
      state.current.decisions = state.current.decisions || {};
      state.current.decisions[b.dataset.rv] = b.dataset.ok === "1"; save(); renderResults();
    }));
    $("#tamperBtn").onclick = tamperTest;
    $("#dlBtn").onclick = () => download(`report_${rep.game_id}_r${rep.round}_${rep.report_id}.json`, JSON.stringify(rep, null, 2));
    wireReplay();
    paintNext();
  }
  function paintNext() {
    const w = $("#nextWrap"); if (!w) return;
    const cur = state.current;
    if (!cur || !state.applied.includes((cur.report || {}).report_id)) { w.innerHTML = ""; return; }
    w.innerHTML = state.finished ? '<button class="btn primary" data-nav="6">See final results →</button>' : `<button class="btn primary" data-nav="4">Next: round ${state.round} →</button>`;
  }
  function applyResults() {
    const cur = state.current, rep = cur.report;
    if (!cur.verification.valid) return toast("Only verified reports can change the score.");
    if (rep.game_id !== state.game) return toast("This report is for another game.");
    if (state.applied.includes(rep.report_id)) return toast("This report was already applied.");
    if (state.finished) return toast("All rounds are finished.");
    if (Number(rep.round) !== state.round && !confirm(`This report is for round ${rep.round}, but the current round is ${state.round}. Apply it anyway?`)) return;
    if (pendingReviews().length) return toast("Decide each possible goal first (Goal ✓ or No goal ✗).");
    const res = R.applyFacts(state.game, rep.facts, ctx());
    Object.entries(res.playerPts).forEach(([k, v]) => { state.scores.players[k] = round2((state.scores.players[k] || 0) + v); });
    Object.entries(res.teamPts).forEach(([k, v]) => { state.scores.teams[k] = round2((state.scores.teams[k] || 0) + v); });
    state.stats = R.mergeStats(state.game, state.stats, res.stats);
    state.log.push({ round: state.round, lines: res.lines, moment: rep.facts.moment_reason, report_id: rep.report_id, code: rep.verification_code });
    state.applied.push(rep.report_id);
    if (state.round >= state.rules.rounds) { state.finished = true; unlock(6); } else { state.round += 1; }
    media.blob = null; media.transcript = ""; media.revealed = false; media.uploadFile = null; state.source = null; resetTimer();
    unlock(6); save(); toast("Scores updated from the verified AI report ✓");
    renderResults();
  }
  function tamper(r) {
    const f = r.facts;
    switch (r.game_id) {
      case "football": {
        const before = f.score.B; f.score.B += 3;
        const pb = state.players.find((p) => p.team === "B");
        f.goals.push({ team: "B", player: pb ? pb.id : "P3", time_s: 1.0, goal: "left", own_goal: false });
        return `Edited the report to give Team B 3 extra goals (score ${before} → ${f.score.B}).`;
      }
      case "proverb": f.correct = !f.correct; f.within_time = true; return `Flipped the verdict to "${f.correct ? "correct" : "wrong"}".`;
      case "pearl_balance": f.lanes[0].hold_s = Number(f.lanes[0].hold_s) + 10; f.winners = [f.lanes[0].player]; f.winner = f.lanes[0].player; return `Added 10 seconds to ${f.lanes[0].player}'s hold and made them the winner.`;
      case "souq_hunt": f.winner = f.winner === "A" ? "B" : "A"; return `Changed the winner to Team ${f.winner}.`;
      case "falcon_reflex": { const l = f.lanes[f.lanes.length - 1]; l.reaction_s = 0.05; l.false_start = false; l.valid = true; f.fastest = l.player; return `Changed ${l.player}'s reaction to 0.05 s and made them fastest.`; }
      default: f.moment_reason = String(f.moment_reason) + " (edited)"; return "Edited the moment text.";
    }
  }
  async function tamperTest() {
    const fake = clone(state.current.report);
    const desc = tamper(fake);
    const res = J.verify(fake);
    $("#tamperOut").innerHTML = `<div class="tamper ${res.valid ? "bad" : "ok"}"><b>Tamper test:</b> ${esc(desc)}<br>${res.valid
      ? "⚠ The edited report was ACCEPTED - this would be a security problem."
      : `✓ The app REJECTED the edited report: ${esc(res.reason)} The original report still verifies.`}</div>`;
  }

  // ------------------------------------------------------------ 6. final results
  function r6() {
    if (!state.game) return go(1);
    const g = G[state.game], res = R.finalResult(state);
    $("#s6").innerHTML = `
      <div class="final-hero"><span class="eyebrow">${esc(g.icon)} ${esc(g.name)} · ${state.finished ? "Final results" : "Standings so far"}</span>
        <h2>${esc(state.log.length ? res.headline : "No verified rounds yet")}</h2>${res.tieBreak && state.log.length ? `<p>Tie-break: ${esc(res.tieBreak)}</p>` : ""}</div>
      <div class="grid2">
        <div class="card"><h3>Scores</h3>${scoreboardHTML()}</div>
        <div class="card mvp"><span class="eyebrow">MVP</span><h3>🏆 ${esc(res.mvp ? nameOf(res.mvp.id) : "-")} <small>${esc(res.mvp ? res.mvp.id : "")}</small></h3><p>${esc(res.mvp ? res.mvp.reason : "")}</p></div>
      </div>
      <div class="card"><h3>Match facts (from verified AI reports only)</h3>${state.log.map((l) => `<div class="logrow"><b>Round ${l.round}</b> - ${esc(l.moment)}<ul>${l.lines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><code>${esc(String(l.code).slice(0, 24))}…</code></div>`).join("") || "<p>No rounds applied yet.</p>"}</div>
      <div class="actions"><button class="btn ghost" id="dlSummary">Download match summary</button><button class="btn ghost" id="again">Play this game again</button><button class="btn primary" id="another">Choose another game</button></div>`;
    $("#again").onclick = () => { resetMatch(); save(); go(4); };
    $("#another").onclick = () => { state.game = null; resetMatch(); state.maxScreen = 1; save(); go(1); };
    $("#dlSummary").onclick = () => download(`match_${state.game}_team468.json`, JSON.stringify({ team: "Team 468 | Code: JLWEO", game: g.name, result: res, players: state.players, log: state.log }, null, 2));
  }

  // ------------------------------------------------------------ start
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
})();
