const screens = ["Team", "Passing", "Rushing", "Receiving", "Fumbles", "Final Projection"];
const years = [2025, 2024, 2023, 2022, 2021];
const teamYears = [2025, 2024, 2023, 2022];
const storeKey = "fantasyProjectionBuilder.v1";

const categoryConfig = {
  passing: {
    title: "Passing",
    positions: ["QB"],
    rows: [
      { key: "share", label: "Passing Share", hist: "passingShare", output: "attempts", outLabel: "QB Attempts", pct: true },
      { key: "ypa", label: "Yards Per Attempt", hist: "ypa", output: "yards", outLabel: "Passing Yards" },
      { key: "tdPct", label: "Passing TD %", hist: "tdPct", output: "td", outLabel: "Passing TD", pct: true },
      { key: "intPct", label: "INT %", hist: "intPct", output: "int", outLabel: "Interceptions", pct: true },
    ],
  },
  rushing: {
    title: "Rushing",
    positions: ["QB", "RB", "WR"],
    rows: [
      { key: "share", label: "Rushing Share", hist: "rushingShare", output: "attempts", outLabel: "Rush Attempts", pct: true },
      { key: "ypa", label: "Yards Per Rush", hist: "ypa", output: "yards", outLabel: "Rush Yards" },
      { key: "tdPct", label: "Rushing TD %", hist: "tdPct", output: "td", outLabel: "Rush TD", pct: true },
    ],
  },
  receiving: {
    title: "Receiving",
    positions: ["WR", "RB", "TE"],
    rows: [
      { key: "share", label: "Target Share", hist: "targetShare", output: "targets", outLabel: "Targets", pct: true },
      { key: "catchPct", label: "Catch %", hist: "catchPct", output: "receptions", outLabel: "Receptions", pct: true },
      { key: "ypr", label: "Yards Per Reception", hist: "ypr", output: "yards", outLabel: "Receiving Yards" },
      { key: "tdPct", label: "Receiving TD %", hist: "tdPct", output: "td", outLabel: "Receiving TD", pct: true },
    ],
  },
};

const screenCategories = {
  1: "passing",
  2: "rushing",
  3: "receiving",
};

const leagueAverageDefaults = {
  passing: 200,
  rushing: 50,
  receiving: 40,
  fumbles: 50,
};

const leagueVolumeLabels = {
  passing: "pass attempts",
  rushing: "rush attempts",
  receiving: "targets",
  fumbles: "touches",
};

const teamColors = {
  ARI: ["#97233F", "#FFB612"],
  ATL: ["#A71930", "#000000"],
  BAL: ["#241773", "#9E7C0C"],
  BUF: ["#00338D", "#C60C30"],
  CAR: ["#0085CA", "#101820"],
  CHI: ["#0B162A", "#C83803"],
  CIN: ["#FB4F14", "#000000"],
  CLE: ["#311D00", "#FF3C00"],
  DAL: ["#003594", "#869397"],
  DEN: ["#FB4F14", "#002244"],
  DET: ["#0076B6", "#B0B7BC"],
  GNB: ["#203731", "#FFB612"],
  HOU: ["#03202F", "#A71930"],
  IND: ["#002C5F", "#A2AAAD"],
  JAX: ["#006778", "#D7A22A"],
  KAN: ["#E31837", "#FFB81C"],
  LVR: ["#000000", "#A5ACAF"],
  LAC: ["#0080C6", "#FFC20E"],
  LAR: ["#003594", "#FFA300"],
  MIA: ["#008E97", "#FC4C02"],
  MIN: ["#4F2683", "#FFC62F"],
  NWE: ["#002244", "#C60C30"],
  NOR: ["#D3BC8D", "#101820"],
  NYG: ["#0B2265", "#A71930"],
  NYJ: ["#125740", "#000000"],
  PHI: ["#004C54", "#A5ACAF"],
  PIT: ["#FFB612", "#101820"],
  SFO: ["#AA0000", "#B3995D"],
  SEA: ["#002244", "#69BE28"],
  TAM: ["#D50A0A", "#34302B"],
  TEN: ["#0C2340", "#4B92DB"],
  WAS: ["#5A1414", "#FFB612"],
};

let data = null;
let depth = null;
let fantasyPros = null;
let state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) || { selectedTeam: null, screen: 0, teamStage: 0, metricStage: {}, teams: {} };
  } catch {
    return { selectedTeam: null, screen: 0, teamStage: 0, metricStage: {}, teams: {} };
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function exportProgress() {
  saveState();
  const payload = {
    app: "fantasyProjectionBuilder",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `fantasy-projections-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const importedState = payload.state || payload;
      if (!importedState || typeof importedState !== "object" || !importedState.teams) {
        throw new Error("This does not look like a projection progress file.");
      }
      state = {
        selectedTeam: importedState.selectedTeam || null,
        screen: Number(importedState.screen) || 0,
        teamStage: Number(importedState.teamStage) || 0,
        metricStage: importedState.metricStage || {},
        leagueMins: importedState.leagueMins || {},
        leaderboardRoundNumbers: Boolean(importedState.leaderboardRoundNumbers ?? importedState.roundNumbers),
        filters: importedState.filters || { search: "", team: "All", pos: "All", min: "" },
        teams: importedState.teams || {},
      };
      saveState();
      render();
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function fmt(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtLeaderboard(value, digits = 1) {
  return fmt(value, state.leaderboardRoundNumbers ? 0 : digits);
}

function fmtPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function readRate(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function readPercentInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function displayInput(value, pct = false) {
  if (value === null || value === undefined) return "";
  return pct ? (value * 100).toFixed(1).replace(/\.0$/, "") : value;
}

function normalizeName(name) {
  return String(name || "").replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function teamState(abb = state.selectedTeam) {
  if (!state.teams[abb]) state.teams[abb] = { teamInputs: {}, players: {}, rosters: {} };
  if (!state.teams[abb].rosters) state.teams[abb].rosters = {};
  ["passing", "rushing", "receiving"].forEach((cat) => {
    if (!state.teams[abb].rosters[cat]) state.teams[abb].rosters[cat] = [];
  });
  return state.teams[abb];
}

function playerId(player) {
  return `${player.name}|${state.selectedTeam}|${player.pos}`;
}

function ensurePlayer(player) {
  const ts = teamState();
  const id = playerId(player);
  if (!ts.players[id]) {
    ts.players[id] = {
      name: player.name,
      team: state.selectedTeam,
      pos: player.pos,
      passing: {},
      rushing: {},
      receiving: {},
      fumbles: {},
    };
  }
  return ts.players[id];
}

function selectedTeamMeta() {
  return data.teams.find((team) => team.abb === state.selectedTeam);
}

function selectedColors() {
  return teamColors[state.selectedTeam] || ["#0f766e", "#8b5cf6"];
}

function selectedDepth() {
  return depth?.charts?.[state.selectedTeam] || { positions: { QB: [], RB: [], WR: [], TE: [] } };
}

function depthCandidates(category) {
  const chart = selectedDepth();
  const history = data.players;
  if (category === "passing") return (chart.positions.QB || []).map((p) => ({ ...p, pos: "QB" }));
  if (category === "receiving") {
    return ["WR", "RB", "TE"].flatMap((pos) => (chart.positions[pos] || []).map((p) => ({ ...p, pos })));
  }
  const qbs = (chart.positions.QB || []).map((p) => ({ ...p, pos: "QB" }));
  const rbs = (chart.positions.RB || []).map((p) => ({ ...p, pos: "RB" }));
  const wrs = (chart.positions.WR || [])
    .filter((p) => Object.keys(history[p.historyKey]?.rushing || {}).length > 0)
    .map((p) => ({ ...p, pos: "WR" }));
  return [...qbs, ...rbs, ...wrs];
}

function getRoster(category) {
  const ids = new Set(teamState().rosters[category] || []);
  return depthCandidates(category).filter((p) => ids.has(playerId(p)));
}

function addRosterPlayer(category, player) {
  const ts = teamState();
  const id = playerId(player);
  if (!ts.rosters[category].includes(id)) ts.rosters[category].push(id);
  ensurePlayer(player);
  saveState();
}

function removeRosterPlayer(category, player) {
  const ts = teamState();
  const id = playerId(player);
  ts.rosters[category] = ts.rosters[category].filter((existing) => existing !== id);
  saveState();
}

function getFumblePlayers() {
  const players = new Map();
  ["passing", "rushing", "receiving"].forEach((cat) => {
    getRoster(cat).forEach((p) => players.set(`${p.name}|${p.pos}`, p));
  });
  return [...players.values()];
}

function selectedProjectionPlayers(abb = state.selectedTeam) {
  const ts = teamState(abb);
  const ids = new Set(Object.values(ts.rosters || {}).flat());
  return [...ids].map((id) => ts.players[id]).filter(Boolean);
}

function depthChartPosition(team, name) {
  const chart = depth?.charts?.[team]?.positions || {};
  const key = normalizeName(name);
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    if ((chart[pos] || []).some((player) => player.historyKey === key || normalizeName(player.name) === key)) return pos;
  }
  return "";
}

function leagueMin(category) {
  if (!state.leagueMins) state.leagueMins = {};
  return Number(state.leagueMins[category] ?? leagueAverageDefaults[category] ?? 0);
}

function setLeagueMin(category, value) {
  if (!state.leagueMins) state.leagueMins = {};
  state.leagueMins[category] = Number(value) || 0;
  saveState();
}

function categoryVolume(category, row) {
  if (category === "passing") return row.attempts || 0;
  if (category === "rushing") return row.attempts || 0;
  if (category === "receiving") return row.targets || 0;
  return row.touches || 0;
}

function leagueAverage(category, metric, year) {
  const min = leagueMin(category);
  const values = Object.values(data.players)
    .map((player) => player[category]?.[year])
    .filter((row) => row && categoryVolume(category, row) >= min)
    .map((row) => row[metric.hist])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function leagueAverageControls(category) {
  return `<div class="league-controls"><label>League avg minimum ${leagueVolumeLabels[category]}</label><input id="leagueMinInput" type="number" min="0" step="1" value="${leagueMin(category)}" /></div>`;
}

function allocationSummary(category, metric) {
  if (metric.key !== "share") return "";
  const total = getRoster(category).reduce((sum, player) => {
    const saved = teamState().players[playerId(player)]?.[category]?.[metric.key];
    return sum + (readRate(saved) || 0);
  }, 0);
  const remaining = 1 - total;
  const status = remaining < -0.0001 ? "over" : remaining > 0.0001 ? "remaining" : "complete";
  return `<div class="allocation ${status}" id="allocationTracker">
    <div><span>Assigned</span><strong id="allocationAssigned">${fmtPct(total)}</strong></div>
    <div><span>Remaining</span><strong id="allocationRemaining">${fmtPct(remaining)}</strong></div>
  </div>`;
}

function updateAllocationTracker(category, metric) {
  if (metric.key !== "share") return;
  const tracker = document.getElementById("allocationTracker");
  if (!tracker) return;
  const total = getRoster(category).reduce((sum, player) => {
    const saved = teamState().players[playerId(player)]?.[category]?.[metric.key];
    return sum + (readRate(saved) || 0);
  }, 0);
  const remaining = 1 - total;
  tracker.classList.toggle("over", remaining < -0.0001);
  tracker.classList.toggle("remaining", remaining >= 0.0001);
  tracker.classList.toggle("complete", Math.abs(remaining) < 0.0001);
  document.getElementById("allocationAssigned").textContent = fmtPct(total);
  document.getElementById("allocationRemaining").textContent = fmtPct(remaining);
}

function fumbleLeagueAverage(year) {
  const min = leagueMin("fumbles");
  const values = Object.values(data.players)
    .map((player) => player.fumbles?.[year])
    .filter((row) => row && (row.touches || 0) >= min)
    .map((row) => row.fumblePct)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function projectionBase() {
  const inputs = teamState().teamInputs;
  const total = Number(inputs.totalPlays) || 0;
  const passPct = readRate(inputs.passPct) || 0;
  const runPct = readRate(inputs.runPct) || 0;
  return { total, passPct, runPct, passPlays: total * passPct, runPlays: total * runPct };
}

function updateTeamComputed() {
  const base = projectionBase();
  const totalEl = document.getElementById("computedTotalPlays");
  const passEl = document.getElementById("computedPassPlays");
  const runEl = document.getElementById("computedRunPlays");
  if (totalEl) totalEl.textContent = fmt(base.total);
  if (passEl) passEl.textContent = fmt(base.passPlays);
  if (runEl) runEl.textContent = fmt(base.runPlays);
}

function updateCategoryComputed(category, metric) {
  recalc();
  document.querySelectorAll(`[data-output-category="${category}"]`).forEach((cell) => {
    const player = teamState().players[cell.dataset.player];
    cell.textContent = fmt(
      player?.[category]?.[metric.output],
      metric.output.includes("td") || metric.output === "int" || metric.output === "receptions" ? 1 : 0,
    );
  });
  updateAllocationTracker(category, metric);
  saveState();
}

function updateFumbleComputed() {
  recalc();
  document.querySelectorAll("[data-fumble-output]").forEach((cell) => {
    const player = teamState().players[cell.dataset.player];
    if (cell.dataset.fumbleOutput === "opportunities") cell.textContent = fmt(player?.fumbles?.opportunities, 1);
    if (cell.dataset.fumbleOutput === "fumbles") cell.textContent = fmt(player?.fumbles?.fumbles, 1);
  });
  saveState();
}

function recalc() {
  const base = projectionBase();
  Object.values(teamState().players).forEach((p) => {
    const pass = p.passing || {};
    pass.attempts = base.passPlays * (readRate(pass.share) || 0);
    pass.yards = pass.attempts * (Number(pass.ypa) || 0);
    pass.td = pass.attempts * (readRate(pass.tdPct) || 0);
    pass.int = pass.attempts * (readRate(pass.intPct) || 0);

    const rush = p.rushing || {};
    rush.attempts = base.runPlays * (readRate(rush.share) || 0);
    rush.yards = rush.attempts * (Number(rush.ypa) || 0);
    rush.td = rush.attempts * (readRate(rush.tdPct) || 0);

    const rec = p.receiving || {};
    rec.targets = base.passPlays * (readRate(rec.share) || 0);
    rec.receptions = rec.targets * (readRate(rec.catchPct) || 0);
    rec.yards = rec.receptions * (Number(rec.ypr) || 0);
    rec.td = rec.receptions * (readRate(rec.tdPct) || 0);

    const opp =
      p.pos === "QB"
        ? (pass.attempts || 0) + (rush.attempts || 0)
        : p.pos === "RB"
          ? (rush.attempts || 0) + (rec.receptions || 0)
          : rec.receptions || 0;
    p.fumbles.opportunities = opp;
    p.fumbles.fumbles = opp * (readRate(p.fumbles.fumblePct) || 0);
    p.fantasyPoints =
      (pass.yards || 0) * 0.04 +
      (pass.td || 0) * 4 -
      (pass.int || 0) * 2 +
      (rush.yards || 0) * 0.1 +
      (rush.td || 0) * 6 +
      (rec.receptions || 0) +
      (rec.yards || 0) * 0.1 +
      (rec.td || 0) * 6 -
      (p.fumbles.fumbles || 0) * 2;
  });
}

function appFrame(content) {
  const [primary, secondary] = selectedColors();
  document.getElementById("app").innerHTML = `
    <div class="app-shell" style="--team-primary:${primary};--team-secondary:${secondary};">
      <header class="topbar">
        <div class="brand">
          <strong>Fantasy Projection Builder</strong>
          <span>${depth?.lastUpdated || "Depth charts loading"}</span>
        </div>
        <div>
          <button class="secondary" id="teamSelectBtn">Teams</button>
          <button class="ghost" id="leaderBtn">Leaderboard</button>
          <button class="ghost" id="compareBtn">Compare</button>
          <button class="ghost" id="exportBtn">Export</button>
          <button class="ghost" id="importBtn">Import</button>
          <input id="importFile" type="file" accept="application/json,.json" hidden />
        </div>
      </header>
      ${content}
    </div>`;
  document.getElementById("teamSelectBtn").onclick = () => {
    state.selectedTeam = null;
    state.screen = 0;
    saveState();
    render();
  };
  document.getElementById("leaderBtn").onclick = () => renderLeaderboard();
  document.getElementById("compareBtn").onclick = () => renderCompareProjections();
  document.getElementById("exportBtn").onclick = exportProgress;
  document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();
  document.getElementById("importFile").onchange = (event) => importProgress(event.target.files?.[0]);
}

function render() {
  recalc();
  saveState();
  if (!state.selectedTeam) return renderTeamSelect();
  return renderWizard();
}

function renderTeamSelect() {
  const buttons = data.teams
    .map((team) => {
      const [primary, secondary] = teamColors[team.abb] || ["#0f766e", "#8b5cf6"];
      return `<button class="team-button" style="--card-primary:${primary};--card-secondary:${secondary};" data-team="${team.abb}"><strong>${team.team}</strong><span>${team.abb}</span></button>`;
    })
    .join("");
  appFrame(`<main class="screen"><h1>Select Team</h1><p class="mini">Choose a team to start the step-by-step projection flow.</p><div class="team-grid">${buttons}</div></main>`);
  document.querySelectorAll("[data-team]").forEach((btn) => {
    btn.onclick = () => {
      state.selectedTeam = btn.dataset.team;
      state.screen = 0;
      saveState();
      render();
    };
  });
}

function renderWizard() {
  const meta = selectedTeamMeta();
  const stepper = screens.map((s, i) => `<button class="step ${i === state.screen ? "active" : ""}" data-step="${i}">${i + 1}. ${s}</button>`).join("");
  appFrame(`<main class="screen wizard"><div class="stepper">${stepper}</div><section id="wizardPanel"></section></main>`);
  document.querySelectorAll("[data-step]").forEach((button) => {
    button.onclick = () => {
      state.validationOpen = false;
      state.screen = Number(button.dataset.step);
      const category = screenCategories[state.screen];
      if (category && state.metricStage[category] === undefined) state.metricStage[category] = 0;
      render();
    };
  });
  if (state.validationOpen) return renderProjectionCheck();
  if (state.screen === 0) renderTeamScreen(meta);
  if (state.screen === 1) renderCategory("passing");
  if (state.screen === 2) renderCategory("rushing");
  if (state.screen === 3) renderCategory("receiving");
  if (state.screen === 4) renderFumbles();
  if (state.screen === 5) renderFinal();
}

function teamReferenceTable() {
  const hist = data.teamHistory[state.selectedTeam] || {};
  const rows = [
    ["Total plays", "totalPlays", fmt],
    ["Pass attempts", "passPlays", fmt],
    ["Rush attempts", "runPlays", fmt],
    ["Pass %", "passPct", fmtPct],
    ["Run %", "runPct", fmtPct],
  ];
  return `<div class="reference-wrap"><div class="reference-title"><h3>Historical Team Reference</h3><span class="mini">Last 4 seasons</span></div>
    <div class="table-wrap"><table><thead><tr><th>Metric</th>${teamYears.map((y) => `<th>${y}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, key, formatter]) => `<tr><td>${label}</td>${teamYears.map((y) => `<td>${formatter(hist[y]?.[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}

function renderTeamScreen(meta) {
  const ts = teamState();
  const base = projectionBase();
  const stage = state.teamStage || 0;
  const inputBlock =
    stage === 0
      ? `<div class="input-grid"><div class="field-card"><label>Projected Total Plays</label><input id="totalPlays" type="number" min="0" value="${ts.teamInputs.totalPlays || ""}" /></div>
        <div class="computed"><div><span>Projected Total Plays</span><strong id="computedTotalPlays">${fmt(base.total)}</strong></div></div></div>`
      : `<div class="input-grid"><div class="field-card"><label>Projected Pass %</label><input id="passPct" type="number" step="0.1" value="${displayInput(readRate(ts.teamInputs.passPct), true)}" /></div>
        <div class="field-card"><label>Projected Run %</label><input id="runPct" type="number" step="0.1" value="${displayInput(readRate(ts.teamInputs.runPct), true)}" /></div></div>
        <div class="computed" style="margin-top:14px"><div><span>Projected Pass Plays</span><strong id="computedPassPlays">${fmt(base.passPlays)}</strong></div><div><span>Projected Run Plays</span><strong id="computedRunPlays">${fmt(base.runPlays)}</strong></div></div>`;
  document.getElementById("wizardPanel").innerHTML = `<div class="panel"><div class="panel-head"><h1>${meta.team}</h1><span class="metric-pill">${stage === 0 ? "Total Plays" : "Pass / Run Mix"}</span></div><div class="panel-body">${teamReferenceTable()}${inputBlock}${navButtons()}</div></div>`;
  ["totalPlays", "passPct", "runPct"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.oninput = () => {
      ts.teamInputs[id] = id === "totalPlays" ? el.value : readPercentInput(el.value);
      updateTeamComputed();
      saveState();
    };
  });
  bindNav(() => {
    if (stage === 0) state.teamStage = 1;
    else {
      state.screen = 1;
      state.metricStage.passing = 0;
    }
    render();
  });
}

function historyTable(players, category, metric) {
  const label = metric.label;
  const rows = players.map((p) => {
    const hist = data.players[p.historyKey]?.[category] || {};
    return `<tr><td class="player-cell">${p.name}</td><td>${p.pos}</td>${years
      .map((y) => {
        const value = hist[y]?.[metric.hist];
        const team = hist[y]?.team;
        const shown = metric.pct ? fmtPct(value) : fmt(value, metric.key.includes("yp") ? 1 : 0);
        return `<td>${shown}${team ? `<span class="mini"> ${team}</span>` : ""}</td>`;
      })
      .join("")}</tr>`;
  });
  const averageRow = `<tr class="league-average-row"><td class="player-cell">League average</td><td>Min ${leagueMin(category)}</td>${years
    .map((y) => {
      const value = leagueAverage(category, metric, y);
      const shown = metric.pct ? fmtPct(value) : fmt(value, metric.key.includes("yp") ? 1 : 0);
      return `<td>${shown}</td>`;
    })
    .join("")}</tr>`;
  return `<div class="reference-wrap"><div class="reference-title"><h3>${label} Reference</h3><span class="mini">2021-2025, dash means no row in workbook</span></div>${leagueAverageControls(category)}<div class="table-wrap"><table><thead><tr><th class="player-cell">Player</th><th>Pos</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>${averageRow}${rows.join("")}</tbody></table></div></div>`;
}

function renderCategory(category) {
  const config = categoryConfig[category];
  const roster = getRoster(category);
  const candidates = depthCandidates(category);
  roster.forEach(ensurePlayer);
  const stage = state.metricStage[category] || 0;
  const metric = config.rows[stage];
  const selectedIds = new Set(teamState().rosters[category] || []);
  const rows = roster
    .map((p) => {
      const player = ensurePlayer(p);
      const bucket = player[category];
      return `<tr>
        <td class="player-cell">${p.name}${p.starter ? ' <span class="mini">starter</span>' : ""}</td>
        <td>${p.pos}</td>
        <td><input class="player-input" data-player="${playerId(p)}" data-category="${category}" data-key="${metric.key}" type="number" step="0.1" value="${displayInput(readRate(bucket[metric.key] ?? bucket[metric.key]), metric.pct)}" /></td>
        <td class="calc-out" data-output-category="${category}" data-player="${playerId(p)}">${fmt(bucket[metric.output], metric.output.includes("td") || metric.output === "int" || metric.output === "receptions" ? 1 : 0)}</td>
        <td><button class="small secondary remove-player" data-player="${playerId(p)}" data-category="${category}">Remove</button></td>
      </tr>`;
    })
    .join("");
  const candidateRows = candidates
    .map((p, index) => {
      const id = playerId(p);
      const selected = selectedIds.has(id);
      return `<tr>
        <td>${index + 1}</td>
        <td class="player-cell">${p.name}${p.starter ? ' <span class="starter-badge">Starter</span>' : ""}</td>
        <td>${p.pos}</td>
        <td><button class="small add-player" data-category="${category}" data-index="${index}" ${selected ? "disabled" : ""}>${selected ? "Added" : "Add"}</button></td>
      </tr>`;
    })
    .join("");
  const base = projectionBase();
  const source = category === "rushing" ? `${fmt(base.runPlays)} projected run plays` : `${fmt(base.passPlays)} projected pass plays`;
  document.getElementById("wizardPanel").innerHTML = `<div class="panel"><div class="panel-head"><h1>${config.title}</h1><span class="metric-pill">${metric.label}</span></div><div class="panel-body">
    <div class="summary-band"><div><span>Team</span><strong>${state.selectedTeam}</strong></div><div><span>Source Volume</span><strong>${source}</strong></div><div><span>Players Added</span><strong>${roster.length}</strong></div><div><span>Step</span><strong>${stage + 1}/${config.rows.length}</strong></div></div>
    ${allocationSummary(category, metric)}
    <details class="adder"><summary>Add Player to ${config.title}</summary><div class="table-wrap"><table><thead><tr><th>Depth</th><th class="player-cell">Player</th><th>Pos</th><th></th></tr></thead><tbody>${candidateRows || `<tr><td colspan="4" class="empty">No eligible depth-chart players were found.</td></tr>`}</tbody></table></div></details>
    ${historyTable(roster, category, metric)}
    <div class="table-wrap"><table><thead><tr><th class="player-cell">Player</th><th>Pos</th><th>${metric.label}</th><th>${metric.outLabel}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="empty">Add players from the depth-chart list above to project this category.</td></tr>`}</tbody></table></div>
    ${navButtons()}</div></div>`;
  document.querySelectorAll(".add-player").forEach((button) => {
    button.onclick = () => {
      const player = candidates[Number(button.dataset.index)];
      if (player) addRosterPlayer(category, player);
      render();
    };
  });
  document.querySelectorAll(".remove-player").forEach((button) => {
    button.onclick = () => {
      const player = roster.find((p) => playerId(p) === button.dataset.player);
      if (player) removeRosterPlayer(category, player);
      render();
    };
  });
  const leagueInput = document.getElementById("leagueMinInput");
  if (leagueInput) {
    leagueInput.onchange = () => {
      setLeagueMin(category, leagueInput.value);
      render();
    };
  }
  document.querySelectorAll(".player-input").forEach((input) => {
    input.oninput = () => {
      const player = teamState().players[input.dataset.player];
      player[input.dataset.category][input.dataset.key] = metric.pct ? readPercentInput(input.value) : Number(input.value || 0);
      updateCategoryComputed(category, metric);
    };
  });
  bindNav(() => {
    if (stage < config.rows.length - 1) state.metricStage[category] = stage + 1;
    else {
      state.screen += 1;
      const nextCategory = screenCategories[state.screen];
      if (nextCategory) state.metricStage[nextCategory] = 0;
    }
    render();
  });
}

function pctIssue(label, value, issues) {
  if ((value || 0) > 1.000001) {
    issues.push({
      check: label,
      projected: fmtPct(value),
      limit: "100.0%",
      detail: `${label} is above 100%.`,
    });
  }
}

function projectionCheckIssues() {
  recalc();
  const issues = [];
  const ts = teamState();
  const base = projectionBase();
  const players = selectedProjectionPlayers();

  pctIssue("Team pass + run %", base.passPct + base.runPct, issues);
  pctIssue("Passing share total", getRoster("passing").reduce((sum, p) => sum + (readRate(ts.players[playerId(p)]?.passing?.share) || 0), 0), issues);
  pctIssue("Rushing share total", getRoster("rushing").reduce((sum, p) => sum + (readRate(ts.players[playerId(p)]?.rushing?.share) || 0), 0), issues);
  pctIssue("Target share total", getRoster("receiving").reduce((sum, p) => sum + (readRate(ts.players[playerId(p)]?.receiving?.share) || 0), 0), issues);

  players.forEach((p) => {
    [
      ["Passing TD %", p.passing?.tdPct],
      ["INT %", p.passing?.intPct],
      ["Rushing TD %", p.rushing?.tdPct],
      ["Catch %", p.receiving?.catchPct],
      ["Receiving TD %", p.receiving?.tdPct],
      ["Fumble %", p.fumbles?.fumblePct],
    ].forEach(([label, value]) => {
      if ((readRate(value) || 0) > 1.000001) {
        issues.push({
          check: `${p.name} ${label}`,
          projected: fmtPct(readRate(value)),
          limit: "100.0%",
          detail: `${label} for ${p.name} is above 100%.`,
        });
      }
    });
  });

  const passingYards = players.reduce((sum, p) => sum + (p.passing?.yards || 0), 0);
  const receivingYards = players.reduce((sum, p) => sum + (p.receiving?.yards || 0), 0);
  if (receivingYards > passingYards + 0.0001) {
    issues.push({
      check: "Receiving yards vs passing yards",
      projected: fmt(receivingYards, 1),
      limit: fmt(passingYards, 1),
      detail: "Projected receiving yards exceed projected passing yards.",
    });
  }

  const passingTd = players.reduce((sum, p) => sum + (p.passing?.td || 0), 0);
  const receivingTd = players.reduce((sum, p) => sum + (p.receiving?.td || 0), 0);
  if (receivingTd > passingTd + 0.0001) {
    issues.push({
      check: "Receiving TDs vs passing TDs",
      projected: fmt(receivingTd, 1),
      limit: fmt(passingTd, 1),
      detail: "Projected receiving TDs exceed projected passing TDs.",
    });
  }

  return issues;
}

function renderProjectionCheck() {
  const issues = projectionCheckIssues();
  const rows = issues
    .map(
      (issue) => `<tr><td class="player-cell">${issue.check}</td><td>${issue.projected}</td><td>${issue.limit}</td><td class="player-cell">${issue.detail}</td></tr>`,
    )
    .join("");
  const body = issues.length
    ? `<div class="check-banner warn"><strong>${issues.length} check${issues.length === 1 ? "" : "s"} need attention</strong><span>You can go back to adjust projections or continue anyway.</span></div>
      <div class="table-wrap"><table><thead><tr><th class="player-cell">Check</th><th>Projected</th><th>Limit</th><th class="player-cell">Details</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="check-banner pass"><strong>All checks passed</strong><span>No percentage, yardage, or touchdown overages found.</span></div>`;
  document.getElementById("wizardPanel").innerHTML = `<div class="panel"><div class="panel-head"><h1>Projection Check</h1><span class="metric-pill">Before Final</span></div><div class="panel-body">${body}<div class="action-row"><button class="secondary" id="checkBackBtn">Back to Fumbles</button><button id="checkContinueBtn">${issues.length ? "Continue Anyway" : "Continue"}</button></div></div></div>`;
  document.getElementById("checkBackBtn").onclick = () => {
    state.validationOpen = false;
    state.screen = 4;
    render();
  };
  document.getElementById("checkContinueBtn").onclick = () => {
    state.validationOpen = false;
    state.screen = 5;
    render();
  };
}

function renderFumbles() {
  const roster = getFumblePlayers();
  roster.forEach(ensurePlayer);
  const averageRow = `<tr class="league-average-row"><td class="player-cell">League average</td><td>Min ${leagueMin("fumbles")}</td>${years
    .map((y) => `<td>- / - / ${fmtPct(fumbleLeagueAverage(y))}</td>`)
    .join("")}<td></td><td></td><td></td></tr>`;
  const rows = roster
    .map((p) => {
      const player = ensurePlayer(p);
      const hist = data.players[p.historyKey]?.fumbles || {};
      return `<tr>
        <td class="player-cell">${p.name}</td><td>${p.pos}</td>
        ${years.map((y) => `<td>${fmt(hist[y]?.fumbles)} / ${fmt(hist[y]?.touches)} / ${fmtPct(hist[y]?.fumblePct)}</td>`).join("")}
        <td><input class="player-input fumble-input" data-player="${playerId(p)}" type="number" step="0.1" value="${displayInput(readRate(player.fumbles.fumblePct), true)}" /></td>
        <td class="calc-out" data-fumble-output="opportunities" data-player="${playerId(p)}">${fmt(player.fumbles.opportunities, 1)}</td>
        <td class="calc-out" data-fumble-output="fumbles" data-player="${playerId(p)}">${fmt(player.fumbles.fumbles, 1)}</td>
      </tr>`;
    })
    .join("");
  document.getElementById("wizardPanel").innerHTML = `<div class="panel"><div class="panel-head"><h1>Fumbles</h1><span class="metric-pill">Fumble %</span></div><div class="panel-body">
    <div class="reference-title"><h3>Historical Fumbles / Touches / Fumble %</h3><span class="mini">Opportunities use projected role by position</span></div>
    ${leagueAverageControls("fumbles")}
    <div class="table-wrap"><table><thead><tr><th class="player-cell">Player</th><th>Pos</th>${years.map((y) => `<th>${y}</th>`).join("")}<th>Fumble %</th><th>Projected Opp</th><th>Fumbles</th></tr></thead><tbody>${averageRow}${rows}</tbody></table></div>
    ${navButtons()}</div></div>`;
  const leagueInput = document.getElementById("leagueMinInput");
  if (leagueInput) {
    leagueInput.onchange = () => {
      setLeagueMin("fumbles", leagueInput.value);
      render();
    };
  }
  document.querySelectorAll(".fumble-input").forEach((input) => {
    input.oninput = () => {
      teamState().players[input.dataset.player].fumbles.fumblePct = readPercentInput(input.value);
      updateFumbleComputed();
    };
  });
  bindNav(() => {
    const issues = projectionCheckIssues();
    if (issues.length) {
      state.validationOpen = true;
    } else {
      state.screen = 5;
    }
    render();
  });
}

function playerStat(player, key) {
  const stats = {
    rank: 0,
    name: player.name || "",
    team: player.team || "",
    pos: player.pos || "",
    fantasyPoints: player.fantasyPoints || 0,
    passAtt: player.passing?.attempts || 0,
    passYds: player.passing?.yards || 0,
    passTd: player.passing?.td || 0,
    int: player.passing?.int || 0,
    rushAtt: player.rushing?.attempts || 0,
    rushYds: player.rushing?.yards || 0,
    rushTd: player.rushing?.td || 0,
    targets: player.receiving?.targets || 0,
    rec: player.receiving?.receptions || 0,
    recYds: player.receiving?.yards || 0,
    recTd: player.receiving?.td || 0,
    fumbles: player.fumbles?.fumbles || 0,
  };
  return stats[key];
}

function sortPlayers(players, sortConfig = { key: "fantasyPoints", dir: "desc" }) {
  return [...players].sort((a, b) => {
    const aValue = playerStat(a, sortConfig.key);
    const bValue = playerStat(b, sortConfig.key);
    if (typeof aValue === "string" || typeof bValue === "string") {
      return sortConfig.dir === "asc"
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    }
    return sortConfig.dir === "asc" ? aValue - bValue : bValue - aValue;
  });
}

function projectionRows(players, columns) {
  return players
    .map(
      (p, i) => `<tr>${columns
        .map((col) => {
          if (col.key === "rank") return `<td>${i + 1}</td>`;
          if (col.key === "name") return `<td class="player-cell">${p.name}</td>`;
          if (col.key === "team") return `<td>${p.team}</td>`;
          if (col.key === "pos") return `<td>${p.pos}</td>`;
          return `<td>${fmtLeaderboard(playerStat(p, col.key), 1)}</td>`;
        })
        .join("")}</tr>`,
    )
    .join("");
}

function finalTable(players, options = {}) {
  const positionFilter = options.positionFilter || "All";
  const sortable = Boolean(options.sortable);
  const sortConfig = options.sortConfig || { key: "fantasyPoints", dir: "desc" };
  const showPassing = !["RB", "WR", "TE"].includes(positionFilter);
  const rushingColumns = [
    { key: "rushAtt", label: "Rush Att" },
    { key: "rushYds", label: "Rush Yds" },
    { key: "rushTd", label: "Rush TD" },
  ];
  const receivingColumns = [
    { key: "targets", label: "Targets" },
    { key: "rec", label: "Rec" },
    { key: "recYds", label: "Rec Yds" },
    { key: "recTd", label: "Rec TD" },
  ];
  const skillColumns = ["WR", "TE"].includes(positionFilter)
    ? [...receivingColumns, ...rushingColumns]
    : [...rushingColumns, ...receivingColumns];
  const columns = [
    { key: "rank", label: "Rank" },
    { key: "name", label: "Player" },
    { key: "team", label: "Team" },
    { key: "pos", label: "Pos" },
    { key: "fantasyPoints", label: "Fantasy" },
    ...(showPassing
      ? [
          { key: "passAtt", label: "Pass Att" },
          { key: "passYds", label: "Pass Yds" },
          { key: "passTd", label: "Pass TD" },
          { key: "int", label: "INT" },
        ]
      : []),
    ...skillColumns,
    { key: "fumbles", label: "Fumbles" },
  ];
  const sorted = sortPlayers(players, sortConfig);
  const headers = columns
    .map((col) => {
      const active = sortConfig.key === col.key;
      const arrow = active ? (sortConfig.dir === "asc" ? " ▲" : " ▼") : "";
      const cls = col.key === "name" ? "player-cell" : "";
      return sortable
        ? `<th class="${cls}"><button class="sort-header ${active ? "active" : ""}" data-sort-key="${col.key}">${col.label}${arrow}</button></th>`
        : `<th class="${cls}">${col.label}</th>`;
    })
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${projectionRows(sorted, columns)}</tbody></table></div>`;
}

function renderFinal() {
  const players = selectedProjectionPlayers();
  document.getElementById("wizardPanel").innerHTML = `<div class="panel"><div class="panel-head"><h1>Final Projection</h1><button id="openLeaderboard">Player Leaderboard</button></div><div class="panel-body">${finalTable(players)}${navButtons("Back", "Leaderboard")}</div></div>`;
  document.getElementById("openLeaderboard").onclick = renderLeaderboard;
  bindNav(() => renderLeaderboard());
}

function allPlayers() {
  recalc();
  return Object.keys(state.teams).flatMap((abb) => selectedProjectionPlayers(abb));
}

async function loadFantasyPros() {
  if (fantasyPros) return fantasyPros;
  const res = await fetch("/api/fantasypros-projections");
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  fantasyPros = json;
  return fantasyPros;
}

function fantasyProsPlayerMap(team) {
  const map = new Map();
  (fantasyPros?.players || [])
    .filter((player) => player.team === team)
    .forEach((player) => map.set(normalizeName(player.player), player));
  return map;
}

function myPlayerMap(team) {
  const map = new Map();
  selectedProjectionPlayers(team).forEach((player) => map.set(normalizeName(player.name), player));
  return map;
}

function myCompareStats(player) {
  if (!player) {
    return {
      fantasyPoints: 0,
      passYds: 0,
      passTd: 0,
      rushYds: 0,
      rushTd: 0,
      rec: 0,
      recYds: 0,
      recTd: 0,
    };
  }
  return {
    fantasyPoints: player.fantasyPoints || 0,
    passYds: player.passing?.yards || 0,
    passTd: player.passing?.td || 0,
    rushYds: player.rushing?.yards || 0,
    rushTd: player.rushing?.td || 0,
    rec: player.receiving?.receptions || 0,
    recYds: player.receiving?.yards || 0,
    recTd: player.receiving?.td || 0,
  };
}

function fpCompareStats(player) {
  if (!player) {
    return {
      fantasyPoints: 0,
      passYds: 0,
      passTd: 0,
      rushYds: 0,
      rushTd: 0,
      rec: 0,
      recYds: 0,
      recTd: 0,
    };
  }
  return {
    fantasyPoints: player.fantasyPoints || 0,
    passYds: player.passYds || 0,
    passTd: player.passTd || 0,
    rushYds: player.rushYds || 0,
    rushTd: player.rushTd || 0,
    rec: player.rec || 0,
    recYds: player.recYds || 0,
    recTd: player.recTd || 0,
  };
}

function diffClass(value) {
  if (value > 0.05) return "diff-pos";
  if (value < -0.05) return "diff-neg";
  return "";
}

function compareCell(myValue, fpValue, digits = 1) {
  const diff = myValue - fpValue;
  return `<td>${fmt(myValue, digits)}</td><td>${fmt(fpValue, digits)}</td><td class="${diffClass(diff)}">${diff > 0 ? "+" : ""}${fmt(diff, digits)}</td>`;
}

async function renderCompareProjections() {
  const selected = state.compareTeam || state.selectedTeam || data.teams[0]?.abb;
  state.compareTeam = selected;
  const selectedPos = state.comparePosition || "All";
  appFrame(`<main class="screen"><div class="panel"><div class="panel-head"><h1>Compare Projections</h1><button class="secondary" id="backToWizard">Back to Wizard</button></div><div class="panel-body"><div class="loading">Loading FantasyPros projections...</div></div></div></main>`);
  document.getElementById("backToWizard").onclick = render;
  try {
    await loadFantasyPros();
  } catch (error) {
    document.querySelector(".panel-body").innerHTML = `<div class="empty">Unable to load FantasyPros projections: ${error.message}</div>`;
    return;
  }

  const teamButtons = data.teams
    .map((team) => `<button class="team-chip ${team.abb === selected ? "active" : ""}" data-compare-team="${team.abb}">${team.abb}</button>`)
    .join("");
  const myMap = myPlayerMap(selected);
  const fpMap = fantasyProsPlayerMap(selected);
  const keys = [...myMap.keys()];
  const missingValuable = [...fpMap.entries()]
    .filter(([key, player]) => !myMap.has(key))
    .filter(([, player]) => (selectedPos === "All" || player.pos === selectedPos))
    .filter(([, player]) => (player.pos === "QB" ? player.fantasyPoints >= 150 : player.fantasyPoints >= 80))
    .sort((a, b) => (b[1].fantasyPoints || 0) - (a[1].fantasyPoints || 0));
  const rows = keys
    .map((key) => {
      const mine = myMap.get(key);
      const fp = fpMap.get(key);
      const name = mine?.name || fp?.player || "-";
      const pos = mine?.pos || fp?.pos || depthChartPosition(selected, name) || "-";
      if (selectedPos !== "All" && pos !== selectedPos) return "";
      const myStats = myCompareStats(mine);
      const fpStats = fpCompareStats(fp);
      return `<tr>
        <td class="player-cell">${name}</td>
        <td>${selected}</td>
        <td>${pos}</td>
        ${compareCell(myStats.fantasyPoints, fpStats.fantasyPoints, 1)}
        ${compareCell(myStats.passYds, fpStats.passYds, 1)}
        ${compareCell(myStats.passTd, fpStats.passTd, 1)}
        ${compareCell(myStats.rushYds, fpStats.rushYds, 1)}
        ${compareCell(myStats.rushTd, fpStats.rushTd, 1)}
        ${compareCell(myStats.rec, fpStats.rec, 1)}
        ${compareCell(myStats.recYds, fpStats.recYds, 1)}
        ${compareCell(myStats.recTd, fpStats.recTd, 1)}
      </tr>`;
    })
    .join("");
  const missingRows = missingValuable
    .map(([, player]) => {
      const threshold = player.pos === "QB" ? 150 : 80;
      return `<tr>
        <td class="player-cell">${player.player}</td>
        <td>${player.team}</td>
        <td>${player.pos}</td>
        <td>${fmt(player.fantasyPoints, 1)}</td>
        <td>${fmt(threshold, 0)}</td>
        <td>${fmt(player.passYds, 1)}</td>
        <td>${fmt(player.passTd, 1)}</td>
        <td>${fmt(player.rushYds, 1)}</td>
        <td>${fmt(player.rushTd, 1)}</td>
        <td>${fmt(player.rec, 1)}</td>
        <td>${fmt(player.recYds, 1)}</td>
        <td>${fmt(player.recTd, 1)}</td>
      </tr>`;
    })
    .join("");
  const positionOptions = ["All", "QB", "RB", "WR", "TE"]
    .map((pos) => `<option value="${pos}" ${selectedPos === pos ? "selected" : ""}>${pos}</option>`)
    .join("");

  appFrame(`<main class="screen"><div class="panel"><div class="panel-head"><h1>Compare Projections</h1><span class="metric-pill">FantasyPros</span></div><div class="panel-body">
    <div class="compare-teams">${teamButtons}</div>
    <div class="compare-controls"><label>Position</label><select id="comparePosition">${positionOptions}</select></div>
    <div class="reference-title"><h3>${selected} Comparison</h3><span class="mini">Difference is your projection minus FantasyPros. Source: fantasypros.com</span></div>
    <div class="table-wrap compare-table"><table><thead><tr>
      <th class="player-cell">Player</th><th>Team</th><th>Pos</th>
      <th>My FPts</th><th>FP FPts</th><th>Diff</th>
      <th>My Pass Yds</th><th>FP Pass Yds</th><th>Diff</th>
      <th>My Pass TD</th><th>FP Pass TD</th><th>Diff</th>
      <th>My Rush Yds</th><th>FP Rush Yds</th><th>Diff</th>
      <th>My Rush TD</th><th>FP Rush TD</th><th>Diff</th>
      <th>My Rec</th><th>FP Rec</th><th>Diff</th>
      <th>My Rec Yds</th><th>FP Rec Yds</th><th>Diff</th>
      <th>My Rec TD</th><th>FP Rec TD</th><th>Diff</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="24" class="empty">No projected players found for this team yet. Add players in the projection builder first.</td></tr>`}</tbody></table></div>
    <div class="reference-title missing-title"><h3>Missing Valuable Players</h3><span class="mini">FantasyPros players not in your projections. Thresholds: QB 150+ FPTS, RB/WR/TE 80+ FPTS.</span></div>
    <div class="table-wrap"><table><thead><tr>
      <th class="player-cell">Player</th><th>Team</th><th>Pos</th><th>FP FPTS</th><th>Threshold</th>
      <th>Pass Yds</th><th>Pass TD</th><th>Rush Yds</th><th>Rush TD</th><th>Rec</th><th>Rec Yds</th><th>Rec TD</th>
    </tr></thead><tbody>${missingRows || `<tr><td colspan="12" class="empty">No valuable missing players for this team/filter.</td></tr>`}</tbody></table></div>
  </div></div></main>`);
  document.querySelectorAll("[data-compare-team]").forEach((button) => {
    button.onclick = () => {
      state.compareTeam = button.dataset.compareTeam;
      renderCompareProjections();
    };
  });
  document.getElementById("comparePosition").onchange = (event) => {
    state.comparePosition = event.target.value;
    renderCompareProjections();
  };
}

function renderLeaderboard() {
  const teams = ["All", ...data.teams.map((t) => t.abb)];
  const positions = ["All", "QB", "RB", "WR", "TE"];
  const filters = state.filters || { search: "", team: "All", pos: "All", min: "" };
  let players = allPlayers();
  if (filters.team && filters.team !== "All") players = players.filter((p) => p.team === filters.team);
  if (filters.pos && filters.pos !== "All") players = players.filter((p) => p.pos === filters.pos);
  if (filters.search) players = players.filter((p) => p.name.toLowerCase().includes(filters.search.toLowerCase()));
  if (filters.min !== "") players = players.filter((p) => (p.fantasyPoints || 0) >= Number(filters.min));
  const sortConfig = state.leaderboardSort || { key: "fantasyPoints", dir: "desc" };
  appFrame(`<main class="screen"><div class="panel"><div class="panel-head"><h1>Player Leaderboard</h1><button class="secondary" id="backToWizard">Back to Wizard</button></div><div class="panel-body">
    <div class="leader-filters"><input id="filterSearch" placeholder="Player search" value="${filters.search || ""}" />
      <select id="filterTeam">${teams.map((t) => `<option ${filters.team === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select id="filterPos">${positions.map((p) => `<option ${filters.pos === p ? "selected" : ""}>${p}</option>`).join("")}</select>
      <input id="filterMin" type="number" placeholder="Minimum fantasy points" value="${filters.min || ""}" />
      <label class="round-toggle leaderboard-round"><input id="leaderboardRoundNumbers" type="checkbox" ${state.leaderboardRoundNumbers ? "checked" : ""} /> Round</label></div>
    ${finalTable(players, { sortable: true, sortConfig, positionFilter: filters.pos })}</div></div></main>`);
  document.getElementById("backToWizard").onclick = render;
  document.getElementById("leaderboardRoundNumbers").onchange = (event) => {
    state.leaderboardRoundNumbers = event.target.checked;
    saveState();
    renderLeaderboard();
  };
  document.querySelectorAll("[data-sort-key]").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.sortKey;
      const current = state.leaderboardSort || { key: "fantasyPoints", dir: "desc" };
      state.leaderboardSort = {
        key,
        dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
      };
      saveState();
      renderLeaderboard();
    };
  });
  ["filterSearch", "filterTeam", "filterPos", "filterMin"].forEach((id) => {
    document.getElementById(id).oninput = () => {
      state.filters = {
        search: document.getElementById("filterSearch").value,
        team: document.getElementById("filterTeam").value,
        pos: document.getElementById("filterPos").value,
        min: document.getElementById("filterMin").value,
      };
      saveState();
      renderLeaderboard();
    };
  });
}

function navButtons(back = "Back", next = "Next") {
  return `<div class="action-row"><button class="secondary" id="backBtn">${back}</button><button id="nextBtn">${next}</button></div>`;
}

function bindNav(nextHandler) {
  document.getElementById("nextBtn").onclick = nextHandler;
  document.getElementById("backBtn").onclick = () => {
    const currentCategory = screenCategories[state.screen];
    if (currentCategory && (state.metricStage[currentCategory] || 0) > 0) {
      state.metricStage[currentCategory] -= 1;
    } else if (state.screen === 0 && state.teamStage === 1) {
      state.teamStage = 0;
    } else if (state.screen > 0) {
      state.screen -= 1;
      const previousCategory = screenCategories[state.screen];
      if (previousCategory) {
        state.metricStage[previousCategory] = categoryConfig[previousCategory].rows.length - 1;
      }
    } else {
      state.selectedTeam = null;
    }
    render();
  };
}

async function init() {
  try {
    const [bootstrap, charts] = await Promise.all([fetch("/api/bootstrap"), fetch("/api/depth-charts")]);
    data = await bootstrap.json();
    depth = await charts.json();
    if (data.error) throw new Error(data.error);
    if (depth.error) throw new Error(depth.error);
    render();
  } catch (error) {
    document.getElementById("app").innerHTML = `<div class="loading">Unable to load app data: ${error.message}</div>`;
  }
}

init();
