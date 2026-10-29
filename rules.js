/* Family AI Game Day - game catalogue and scoring rules (Team 468 | Code: JLWEO)
 * The AI judge reports FACTS. These rules turn facts into points.
 * Works in the browser (window.FAGDRules) and in Node (require) for tests. */
(function (root) {
  "use strict";

  // Proverb list: edit freely. "answer" may hold alternatives separated by |
  const PROVERBS = [
    { prompt: "من جد", answer: "وجد", meaning: "Whoever strives, finds success." },
    { prompt: "الصديق وقت", answer: "الضيق", meaning: "A true friend shows in hard times." },
    { prompt: "اللي ما يعرف الصقر", answer: "يشويه", meaning: "Whoever doesn't know the falcon's worth would roast it." },
    { prompt: "الجار قبل", answer: "الدار", meaning: "Choose the neighbour before the house." },
    { prompt: "يد وحدة", answer: "ما تصفق", meaning: "One hand cannot clap - teamwork." },
    { prompt: "من صبر", answer: "ظفر", meaning: "Patience wins." },
    { prompt: "كل تأخيرة", answer: "فيها خيرة", meaning: "Every delay holds some good." },
    { prompt: "على قد لحافك", answer: "مد رجليك|مد رجولك", meaning: "Live within your means." }
  ];

  const SOUQ_TARGETS = [
    { color: "red", label: "something RED - like a red Sadu cushion" },
    { color: "yellow", label: "something YELLOW - like a saffron tin or a lemon" },
    { color: "green", label: "something GREEN - like a palm frond or a green cup" },
    { color: "blue", label: "something BLUE - like a sea-blue pearl box" }
  ];

  const GAME_INFO = {
    football: {
      name: "Football", icon: "⚽", kind: "team", teamOnly: true, signals: ["video"],
      heritage: "Sport - the family match in the garden or majlis yard.",
      aiJudges: "Tracks every player's bib colour and the ball, detects goals, and times who keeps the ball.",
      rules: { rounds: 1, roundSeconds: 180, pointsPerGoal: 1, ballColor: "orange", teamAAttacks: "right" },
      fields: [
        { key: "rounds", label: "Matches (rounds)", type: "number", min: 1, max: 5 },
        { key: "roundSeconds", label: "Match length (seconds)", type: "number", min: 30, max: 1200 },
        { key: "pointsPerGoal", label: "Points per goal", type: "number", min: 1, max: 5 },
        { key: "ballColor", label: "Ball colour", type: "select", options: ["orange", "yellow", "white", "cyan", "red", "blue", "green", "magenta"] },
        { key: "teamAAttacks", label: "Team A attacks the goal on the", type: "select", options: ["right", "left"] }
      ],
      explain: (r) => ({
        points: `Each goal = ${r.pointsPerGoal} point(s) for the scoring team. The AI sees a goal when the ball enters a goal zone.`,
        time: `Each match lasts ${r.roundSeconds} s. ${r.rounds} match(es).`,
        penalties: "An own goal counts for the other team.",
        ties: "Tie-break: the team that kept the ball longer (AI possession time) wins.",
        winning: "Most goals wins. MVP = the player the AI saw with the ball for the longest time."
      })
    },
    proverb: {
      name: "Al-Sana'a & Majlis Proverb Duel", icon: "📜", kind: "individual", teamOnly: false, signals: ["audio"],
      heritage: "Heritage - Emirati majlis proverbs passed between generations.",
      aiJudges: "Listens: times how fast the player starts answering and checks the spoken ending of the proverb.",
      rules: { rounds: 4, roundSeconds: 10, pointsCorrect: 2, fastBonus: 1, fastBonusSeconds: 3, language: "ar-AE" },
      fields: [
        { key: "rounds", label: "Turns (rounds)", type: "number", min: 1, max: 12 },
        { key: "roundSeconds", label: "Answer time limit (seconds)", type: "number", min: 3, max: 30 },
        { key: "pointsCorrect", label: "Points for a correct ending", type: "number", min: 1, max: 5 },
        { key: "fastBonus", label: "Speed bonus points", type: "number", min: 0, max: 3 },
        { key: "fastBonusSeconds", label: "Speed bonus if answer starts within (s)", type: "number", min: 1, max: 10 },
        { key: "language", label: "Speech language", type: "select", options: ["ar-AE", "ar-SA", "en-US", "en-GB"] }
      ],
      explain: (r) => ({
        points: `Correct ending = ${r.pointsCorrect} points, +${r.fastBonus} if the answer starts within ${r.fastBonusSeconds} s.`,
        time: `The proverb appears when recording starts; answer within ${r.roundSeconds} s.`,
        penalties: "A late or wrong answer scores 0.",
        ties: "Tie-break: the lowest total answering time on correct answers.",
        winning: "Highest score wins (team mode: team members' points are added)."
      })
    },
    pearl_balance: {
      name: "Pearl Diver's Balance Hold", icon: "🦪", kind: "individual", teamOnly: false, signals: ["video"],
      heritage: "Heritage + sport - pearl divers' balance and breath control before the dive.",
      aiJudges: "Watches each lane: measures how long each diver stays steady in the pose before a big wobble.",
      rules: { rounds: 2, roundSeconds: 30, pointsWin: 3, pointsHold: 1, minHoldSeconds: 10 },
      fields: [
        { key: "rounds", label: "Rounds", type: "number", min: 1, max: 6 },
        { key: "roundSeconds", label: "Round length (seconds)", type: "number", min: 10, max: 120 },
        { key: "pointsWin", label: "Points for the longest hold", type: "number", min: 1, max: 5 },
        { key: "pointsHold", label: "Points for any good hold", type: "number", min: 0, max: 3 },
        { key: "minHoldSeconds", label: "A good hold lasts at least (s)", type: "number", min: 2, max: 60 }
      ],
      explain: (r) => ({
        points: `Longest steady hold = ${r.pointsWin} points; every other hold of ${r.minHoldSeconds} s or more = ${r.pointsHold}.`,
        time: `Rounds last up to ${r.roundSeconds} s. Players stand in lanes, left to right in player order.`,
        penalties: "A big wobble or a fall ends your hold.",
        ties: "Tie-break: the best single hold across all rounds.",
        winning: "Highest score wins."
      })
    },
    souq_hunt: {
      name: "Souq Treasure Scavenger Sprint", icon: "🧺", kind: "team", teamOnly: true, signals: ["video"],
      heritage: "Culture - finding treasures in the souq. Team A searches on the left, Team B on the right.",
      aiJudges: "Watches both halves of the picture and spots the first team to hold up an item of the called colour.",
      rules: { rounds: 3, roundSeconds: 30, pointsFirst: 2, pointsTie: 1 },
      fields: [
        { key: "rounds", label: "Rounds", type: "number", min: 1, max: 8 },
        { key: "roundSeconds", label: "Search time limit (seconds)", type: "number", min: 10, max: 120 },
        { key: "pointsFirst", label: "Points for the first team", type: "number", min: 1, max: 5 },
        { key: "pointsTie", label: "Points each in a tie", type: "number", min: 0, max: 3 }
      ],
      explain: (r) => ({
        points: `First team to show the target to the camera = ${r.pointsFirst} points (tie: ${r.pointsTie} each).`,
        time: `Find it within ${r.roundSeconds} s.`,
        penalties: "Items already visible before the call do not count.",
        ties: "Tie-break: the team with the lower total finding time.",
        winning: "Highest team score wins."
      })
    },
    falcon_reflex: {
      name: "Falcon Reflex & Call Challenge", icon: "🦅", kind: "individual", teamOnly: false, signals: ["video", "audio"],
      heritage: "Heritage + sport - falconry: answer the falconer's whistle like a trained falcon.",
      aiJudges: "Listens for the whistle in the audio, then watches each lane and times the first raised glove-hand.",
      rules: { rounds: 3, roundSeconds: 12, pointsFastest: 3, pointsGood: 1, goodReactionSeconds: 1.0, falseStartPenalty: -1 },
      fields: [
        { key: "rounds", label: "Rounds", type: "number", min: 1, max: 8 },
        { key: "roundSeconds", label: "Recording length (seconds)", type: "number", min: 6, max: 30 },
        { key: "pointsFastest", label: "Points for the fastest", type: "number", min: 1, max: 5 },
        { key: "pointsGood", label: "Points for a quick reaction", type: "number", min: 0, max: 3 },
        { key: "goodReactionSeconds", label: "Quick reaction = under (s)", type: "number", min: 0.2, max: 2, step: 0.1 },
        { key: "falseStartPenalty", label: "False start penalty", type: "number", min: -5, max: 0 }
      ],
      explain: (r) => ({
        points: `Fastest valid reaction = ${r.pointsFastest} points; any reaction under ${r.goodReactionSeconds} s = ${r.pointsGood}.`,
        time: "The app plays the falcon whistle at a random moment during recording.",
        penalties: `Moving before the whistle is a false start: ${r.falseStartPenalty} point.`,
        ties: "Tie-break: the best single reaction time.",
        winning: "Highest score wins."
      })
    }
  };

  function teamOf(players, id) {
    const p = players.find((x) => x.id === id);
    return p ? p.team : null;
  }

  function add(map, key, n) { map[key] = Math.round(((map[key] || 0) + n) * 100) / 100; }

  /* Turn verified AI facts into points. Returns {playerPts, teamPts, lines, stats}. */
  function applyFacts(gameId, facts, ctx) {
    const r = ctx.rules, players = ctx.players;
    const out = { playerPts: {}, teamPts: {}, lines: [], stats: {} };
    const known = (id) => players.some((p) => p.id === id);
    if (gameId === "football") {
      (facts.goals || []).forEach((g) => {
        const t = Number(g.time_s).toFixed(1);
        if (g.own_goal) {
          add(out.teamPts, g.team, r.pointsPerGoal);
          out.lines.push(`Own goal by ${g.own_goal_by} at ${t}s → +${r.pointsPerGoal} Team ${g.team}`);
        } else if (g.player && known(g.player)) {
          add(out.playerPts, g.player, r.pointsPerGoal);
          out.lines.push(`Goal by ${g.player} (Team ${g.team}) at ${t}s → +${r.pointsPerGoal}`);
        } else {
          add(out.teamPts, g.team, r.pointsPerGoal);
          out.lines.push(`Goal for Team ${g.team} at ${t}s (scorer not identified) → +${r.pointsPerGoal}`);
        }
      });
      if (facts.goals_judged === false) out.lines.push("Goals were NOT judged (goal lines not marked) - no goal points.");
      else if (!(facts.goals || []).length) out.lines.push("No goals counted by the AI this match.");
      (facts.goal_reviews || []).forEach((rv) => {
        const d = (ctx.decisions || {})[rv.id], t = Number(rv.time_s).toFixed(1);
        if (d === true) {
          if (rv.player && known(rv.player) && !rv.own_goal) add(out.playerPts, rv.player, r.pointsPerGoal); else add(out.teamPts, rv.team, r.pointsPerGoal);
          out.lines.push(`${rv.id} at ${t}s: HOST confirmed goal for Team ${rv.team} → +${r.pointsPerGoal} (AI was unsure: ${rv.reason})`);
        } else if (d === false) out.lines.push(`${rv.id} at ${t}s: HOST ruled no goal`);
        else out.lines.push(`${rv.id} at ${t}s: possible goal for Team ${rv.team} - waiting for the host's decision`);
      });
      (facts.near_misses || []).forEach((m) => out.lines.push(`Near miss at ${Number(m.time_s).toFixed(1)}s (wide of ${m.wide_of}) - no goal`));
      out.stats = { playerPossession: facts.player_possession_sec || {}, teamPossession: facts.team_possession_sec || {} };
      if (facts.mvp) out.lines.push(`AI match MVP: ${facts.mvp} (${(facts.player_possession_sec || {})[facts.mvp]}s on the ball)`);
    } else if (gameId === "proverb") {
      const p = facts.player;
      let pts = 0;
      if (facts.correct === true && facts.within_time) {
        pts = r.pointsCorrect;
        if (facts.response_time_s != null && facts.response_time_s <= r.fastBonusSeconds) pts += r.fastBonus;
        out.lines.push(`${p}: correct ending in ${facts.response_time_s}s → +${pts}`);
        out.stats = { correctTime: { [p]: facts.response_time_s || 0 } };
      } else if (facts.correct === true) {
        out.lines.push(`${p}: correct but too late (${facts.response_time_s}s) → 0`);
      } else if (facts.correct === false) {
        out.lines.push(`${p}: the ending heard does not match → 0`);
      } else {
        out.lines.push(`${p}: the AI could not hear the words (no transcript) → 0`);
      }
      if (known(p) && pts) add(out.playerPts, p, pts);
    } else if (gameId === "pearl_balance") {
      const lanes = (facts.lanes || []).filter((l) => known(l.player));
      const winners = facts.winners || [];
      lanes.forEach((l) => {
        let pts = 0;
        if (winners.includes(l.player)) pts = r.pointsWin;
        else if (l.hold_s >= r.minHoldSeconds) pts = r.pointsHold;
        if (pts) add(out.playerPts, l.player, pts);
        out.lines.push(`${l.player}: held ${l.hold_s}s → +${pts}`);
      });
      out.stats = { bestHold: Object.fromEntries(lanes.map((l) => [l.player, l.hold_s])) };
    } else if (gameId === "souq_hunt") {
      const w = facts.winner;
      if (w === "tie") {
        ["A", "B"].forEach((t) => add(out.teamPts, t, r.pointsTie));
        out.lines.push(`Both teams found it together → +${r.pointsTie} each`);
      } else if (w === "A" || w === "B") {
        add(out.teamPts, w, r.pointsFirst);
        out.lines.push(`Team ${w} found ${facts.target_color} first (${facts.teams[w].time_s}s) → +${r.pointsFirst}`);
      } else {
        out.lines.push("Nobody found the target in time → 0");
      }
      const times = {};
      Object.entries(facts.teams || {}).forEach(([t, v]) => { times[t] = v.within_time ? v.time_s : r.roundSeconds; });
      out.stats = { findTime: times };
    } else if (gameId === "falcon_reflex") {
      if (!facts.lure_detected) {
        out.lines.push("The AI did not hear the whistle - round void, replay it.");
      } else {
        (facts.lanes || []).filter((l) => known(l.player)).forEach((l) => {
          let pts = 0;
          if (l.false_start) pts = r.falseStartPenalty;
          else if (l.valid && l.player === facts.fastest) pts = r.pointsFastest;
          else if (l.valid && l.reaction_s <= r.goodReactionSeconds) pts = r.pointsGood;
          if (pts) add(out.playerPts, l.player, pts);
          const what = l.false_start ? "false start" : (l.valid ? `${l.reaction_s}s` : "no reaction");
          out.lines.push(`${l.player}: ${what} → ${pts >= 0 ? "+" : ""}${pts}`);
        });
        out.stats = { bestReaction: Object.fromEntries((facts.lanes || []).filter((l) => l.valid).map((l) => [l.player, l.reaction_s])) };
      }
    }
    return out;
  }

  /* Merge one round's stats into the running match stats. */
  function mergeStats(gameId, stats, add_) {
    const s = stats || {};
    const sumInto = (key) => { s[key] = s[key] || {}; Object.entries(add_[key] || {}).forEach(([k, v]) => { s[key][k] = Math.round(((s[key][k] || 0) + Number(v)) * 100) / 100; }); };
    const bestInto = (key, better) => { s[key] = s[key] || {}; Object.entries(add_[key] || {}).forEach(([k, v]) => { if (s[key][k] == null || better(v, s[key][k])) s[key][k] = v; }); };
    if (gameId === "football") { sumInto("playerPossession"); sumInto("teamPossession"); }
    if (gameId === "proverb") { sumInto("correctTime"); }
    if (gameId === "souq_hunt") { sumInto("findTime"); }
    if (gameId === "pearl_balance") { bestInto("bestHold", (a, b) => a > b); }
    if (gameId === "falcon_reflex") { bestInto("bestReaction", (a, b) => a < b); }
    return s;
  }

  /* Tie-break value: higher is better. */
  function tieValue(gameId, stats, ids) {
    const s = stats || {};
    const sum = (m) => ids.reduce((a, id) => a + Number((m || {})[id] || 0), 0);
    const best = (m, pick) => { const v = ids.map((id) => (m || {})[id]).filter((x) => x != null); return v.length ? pick(...v) : null; };
    switch (gameId) {
      case "football": return ids.length === 1 && ["A", "B"].includes(ids[0]) ? Number((s.teamPossession || {})[ids[0]] || 0) : sum(s.playerPossession);
      case "proverb": return -sum(s.correctTime);
      case "souq_hunt": return -sum(s.findTime);
      case "pearl_balance": { const b = best(s.bestHold, Math.max); return b == null ? -1 : b; }
      case "falcon_reflex": { const b = best(s.bestReaction, Math.min); return b == null ? -99 : -b; }
      default: return 0;
    }
  }

  function totals(state) {
    const players = state.players;
    const pp = {};
    players.forEach((p) => { pp[p.id] = Number((state.scores.players || {})[p.id] || 0); });
    const tp = { A: 0, B: 0 };
    players.forEach((p) => { if (p.team in tp) tp[p.team] += pp[p.id]; });
    Object.entries(state.scores.teams || {}).forEach(([t, v]) => { if (t in tp) tp[t] += Number(v); });
    return { players: pp, teams: tp };
  }

  function finalResult(state) {
    const g = state.game, tot = totals(state), stats = state.stats || {};
    const res = { totals: tot, headline: "", tieBreak: null, mvp: null, ranking: [] };
    const memberIds = (team) => state.players.filter((p) => p.team === team).map((p) => p.id);
    if (state.mode === "team") {
      const a = tot.teams.A, b = tot.teams.B;
      if (a !== b) {
        const w = a > b ? "A" : "B";
        res.headline = `Team ${w} wins ${Math.max(a, b)}-${Math.min(a, b)}`;
        res.winner = w;
      } else {
        const va = g === "football" || g === "souq_hunt" ? tieValue(g, stats, ["A"]) : tieValue(g, stats, memberIds("A"));
        const vb = g === "football" || g === "souq_hunt" ? tieValue(g, stats, ["B"]) : tieValue(g, stats, memberIds("B"));
        if (g === "souq_hunt") {
          const fa = Number((stats.findTime || {}).A || 0), fb = Number((stats.findTime || {}).B || 0);
          res.winner = fa === fb ? null : (fa < fb ? "A" : "B");
        } else {
          res.winner = va === vb ? null : (va > vb ? "A" : "B");
        }
        res.tieBreak = GAME_INFO[g].explain(state.rules).ties;
        res.headline = res.winner ? `Team ${res.winner} wins ${a}-${b} on the tie-break` : `Draw ${a}-${b}`;
      }
    }
    res.ranking = state.players.map((p) => ({ id: p.id, name: p.name, team: p.team, points: tot.players[p.id], tie: tieValue(g, stats, [p.id]) }))
      .sort((x, y) => (y.points - x.points) || (y.tie - x.tie));
    if (state.mode !== "team") {
      const top = res.ranking[0];
      const tied = res.ranking.filter((r) => r.points === top.points);
      res.headline = tied.length > 1 && tied[0].tie === tied[1].tie ? `Draw at ${top.points} points` : `${top.name} wins with ${top.points} points`;
      if (tied.length > 1) res.tieBreak = GAME_INFO[g].explain(state.rules).ties;
    }
    if (g === "football") {
      const poss = stats.playerPossession || {};
      const ids = Object.keys(poss);
      if (ids.length) {
        const id = ids.reduce((a, b) => (poss[b] > poss[a] ? b : a));
        res.mvp = { id, reason: `The AI saw ${id} with the ball for ${poss[id]}s - the longest of any player.` };
      }
    } else if (res.ranking.length) {
      const top = res.ranking[0];
      res.mvp = { id: top.id, reason: `${top.name} scored the most points (${top.points}).` };
    }
    return res;
  }

  const api = { PROVERBS, SOUQ_TARGETS, GAME_INFO, applyFacts, mergeStats, tieValue, totals, finalResult, teamOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FAGDRules = api;
})(typeof window !== "undefined" ? window : globalThis);
