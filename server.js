const path = require("path");
const express = require("express");
const cheerio = require("cheerio");
const XLSX = require("xlsx");

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_WORKBOOK = path.join(__dirname, "data", "NFL_completed_2023_2024_FIXED.xlsx");
const WORKBOOK_PATH = process.env.EXCEL_PATH || DEFAULT_WORKBOOK;
const YEARS = [2025, 2024, 2023, 2022, 2021];
const TEAM_YEARS = [2025, 2024, 2023, 2022];

const FBG_URL = "https://www.footballguys.com/depth-charts";
const FANTASYPROS_URL = "https://www.fantasypros.com/nfl/projections/leaders.php";
const FBG_TO_WORKBOOK = {
  GB: "GNB",
  JAC: "JAX",
  KC: "KAN",
  LV: "LVR",
  NE: "NWE",
  NO: "NOR",
  SF: "SFO",
  TB: "TAM",
};
const FANTASYPROS_TO_WORKBOOK = {
  GB: "GNB",
  JAC: "JAX",
  KC: "KAN",
  LV: "LVR",
  NE: "NWE",
  NO: "NOR",
  SF: "SFO",
  TB: "TAM",
};

function normalizeName(name) {
  return String(name || "")
    .replace(/\s+\([A-Z-]+\)$/i, "")
    .replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function cleanPlayerName(name) {
  return String(name || "").replace(/\s+\([^)]+\)$/g, "").trim();
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctFromWhole(value) {
  const n = num(value);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

function readSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function metricRow(row, category) {
  if (category === "passing") {
    return {
      team: row.Team,
      pos: row.Pos,
      attempts: num(row.Att),
      passingShare: pctFromWhole(row["Passing Share"]),
      ypa: num(row["Y/A"]),
      tdPct: pctFromWhole(row["TD%"]),
      intPct: pctFromWhole(row["Int%"]),
      yards: num(row.Yds),
    };
  }
  if (category === "rushing") {
    return {
      team: row.Team,
      pos: row.Pos,
      attempts: num(row.Att),
      yards: num(row.Yds),
      td: num(row.TD),
      tdPct: pctFromWhole(row["TD %"]),
      ypa: num(row["Y/A"]),
      rushingShare: pctFromWhole(row["Rushing Share"]),
    };
  }
  return {
    team: row.Team,
    pos: row.Pos,
    targets: num(row.Tgt),
    receptions: num(row.Rec),
    yards: num(row.Yds),
    ypr: num(row["Y/R"]),
    ypt: num(row.Tgt) ? num(row.Yds) / num(row.Tgt) : null,
    td: num(row.TD),
    tdPct: pctFromWhole(row["TD %"]),
    targetShare: pctFromWhole(row["Target Share"]),
    catchPct: pctFromWhole(row["Ctch%"]),
    fumbles: num(row.Fmb),
  };
}

function loadWorkbookData() {
  const workbook = XLSX.readFile(WORKBOOK_PATH);
  const teams = readSheet(workbook, "ABB").map((row) => ({
    team: row.Team,
    abb: row.ABB,
  }));

  const teamHistory = {};
  for (const year of TEAM_YEARS) {
    for (const row of readSheet(workbook, `${year} Team`)) {
      const abb = row.ABB;
      if (!teamHistory[abb]) teamHistory[abb] = {};
      teamHistory[abb][year] = {
        team: row.Team,
        passPlays: num(row["Pass Plays"]),
        runPlays: num(row["Run Plays"]),
        totalPlays: num(row["Total Plays"]),
        passPct: pctFromWhole(row["Pass %"]),
        runPct: pctFromWhole(row["Run %"]),
      };
    }
  }

  const players = {};
  const categories = [
    ["passing", "Passing"],
    ["rushing", "Rushing"],
    ["receiving", "Receiving"],
  ];

  for (const [category, sheetSuffix] of categories) {
    for (const year of YEARS) {
      for (const row of readSheet(workbook, `${year} ${sheetSuffix}`)) {
        const player = cleanPlayerName(row.Player);
        if (!player) continue;
        const key = normalizeName(player);
        if (!players[key]) {
          players[key] = {
            player,
            positions: {},
            passing: {},
            rushing: {},
            receiving: {},
            fumbles: {},
          };
        }
        if (row.Pos) players[key].positions[row.Pos] = true;
        players[key][category][year] = metricRow(row, category);
      }
    }
  }

  for (const [key, player] of Object.entries(players)) {
    for (const year of YEARS) {
      const passing = player.passing[year] || {};
      const rushing = player.rushing[year] || {};
      const receiving = player.receiving[year] || {};
      const fumbles = receiving.fumbles ?? null;
      const touches =
        (passing.attempts || 0) + (rushing.attempts || 0) + (receiving.receptions || 0);
      player.fumbles[year] = {
        team: receiving.team || rushing.team || passing.team || null,
        pos: receiving.pos || rushing.pos || passing.pos || null,
        fumbles,
        touches: touches || null,
        fumblePct: touches && fumbles !== null ? fumbles / touches : null,
      };
    }
    player.positions = Object.keys(player.positions);
  }

  return { teams, teamHistory, players, years: YEARS, teamYears: TEAM_YEARS };
}

let cachedWorkbook;
function getWorkbookData() {
  if (!cachedWorkbook) cachedWorkbook = loadWorkbookData();
  return cachedWorkbook;
}

let depthCache = null;
let depthCacheAt = 0;
async function getDepthCharts() {
  const tenMinutes = 10 * 60 * 1000;
  if (depthCache && Date.now() - depthCacheAt < tenMinutes) return depthCache;

  const res = await fetch(FBG_URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProjectionBuilder/1.0",
    },
  });
  if (!res.ok) throw new Error(`Footballguys returned ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const charts = {};
  let lastUpdated = $("p.fs-6").first().text().trim();

  $(".depth-chart").each((_, chart) => {
    const id = $(chart).attr("id") || "";
    const fbgAbb = id.replace("depth_chart_", "");
    const abb = FBG_TO_WORKBOOK[fbgAbb] || fbgAbb;
    const teamName = $(chart).find(".team-header").first().text().trim();
    const teamChart = { teamName, abb, positions: { QB: [], RB: [], WR: [], TE: [] } };

    $(chart)
      .find("li.depth-chart-pos")
      .each((__, li) => {
        const label = $(li).find(".pos-label").first().text().replace(":", "").trim();
        if (!teamChart.positions[label]) return;
        $(li)
          .find("a.player")
          .each((___, a) => {
            const raw = $(a).text().trim();
            const name = cleanPlayerName(raw);
            if (!name) return;
            teamChart.positions[label].push({
              name,
              raw,
              starter: $(a).hasClass("starter"),
              historyKey: normalizeName(name),
            });
          });
      });
    charts[abb] = teamChart;
  });

  depthCache = { source: FBG_URL, lastUpdated, charts };
  depthCacheAt = Date.now();
  return depthCache;
}

let fantasyProsCache = null;
let fantasyProsCacheAt = 0;
function parseProjectionValue(text) {
  const parsed = Number(String(text || "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyProjectionStat(players, row, statKey, defaultPos) {
  const name = cleanPlayerName(row.name);
  const team = FANTASYPROS_TO_WORKBOOK[row.team] || row.team;
  if (!name || !team) return;
  const key = `${normalizeName(name)}|${team}`;
  if (!players[key]) {
    players[key] = {
      player: name,
      team,
      pos: defaultPos,
      passAtt: 0,
      passYds: 0,
      passTd: 0,
      int: 0,
      rushAtt: 0,
      rushYds: 0,
      rushTd: 0,
      rec: 0,
      recYds: 0,
      recTd: 0,
    };
  }
  players[key][statKey] = row.value;
  if (defaultPos === "QB") players[key].pos = "QB";
}

async function getFantasyProsProjections() {
  const oneHour = 60 * 60 * 1000;
  if (fantasyProsCache && Date.now() - fantasyProsCacheAt < oneHour) return fantasyProsCache;

  const res = await fetch(FANTASYPROS_URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProjectionBuilder/1.0",
    },
  });
  if (!res.ok) throw new Error(`FantasyPros returned ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const statMap = {
    "Pass Attempts": ["passAtt", "QB"],
    "Pass Yards": ["passYds", "QB"],
    "Pass TDs": ["passTd", "QB"],
    INTs: ["int", "QB"],
    "Rushing Attempts": ["rushAtt", null],
    "Rushing Yards": ["rushYds", null],
    "Rushing TDs": ["rushTd", null],
    Receptions: ["rec", null],
    "Receiving Yards": ["recYds", null],
    "Receiving TDs": ["recTd", null],
  };
  const playersByKey = {};

  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((__, th) => $(th).text().replace(/\s+/g, " ").trim())
      .get();
    const statHeader = headers.find((header) => header !== "Player");
    const config = statMap[statHeader];
    if (!config) return;
    const [statKey, defaultPos] = config;

    $(table)
      .find("tbody tr")
      .each((__, tr) => {
        const playerCell = $(tr).find("td").eq(0);
        const name = playerCell.find("a").first().text().trim();
        const team = playerCell.find("small").first().text().trim();
        const value = parseProjectionValue($(tr).find("td").eq(1).text());
        applyProjectionStat(playersByKey, { name, team, value }, statKey, defaultPos);
      });
  });

  const players = Object.values(playersByKey).map((player) => ({
    ...player,
    fantasyPoints:
      player.passYds * 0.04 +
      player.passTd * 4 -
      player.int * 2 +
      player.rushYds * 0.1 +
      player.rushTd * 6 +
      player.rec +
      player.recYds * 0.1 +
      player.recTd * 6,
  }));

  fantasyProsCache = { source: FANTASYPROS_URL, players };
  fantasyProsCacheAt = Date.now();
  return fantasyProsCache;
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/bootstrap", (req, res) => {
  try {
    res.json(getWorkbookData());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/depth-charts", async (req, res) => {
  try {
    res.json(await getDepthCharts());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/fantasypros-projections", async (req, res) => {
  try {
    res.json(await getFantasyProsProjections());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Projection builder running at http://localhost:${PORT}`);
  });
}

module.exports = app;
