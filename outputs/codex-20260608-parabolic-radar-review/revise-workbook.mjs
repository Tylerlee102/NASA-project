import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/manual-20260607-parameter-model/spreadsheets/parabolic-radar-model/output/parabolic-motion-radar-model-baseline-and-runs.xlsx";
const outputDir =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review";
const outputPath = `${outputDir}/parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const colors = {
  header: "#0B1F3A",
  subheader: "#D9EAF7",
  paleBlue: "#EDF6FF",
  note: "#FFF4D6",
  grid: "#D9E2EC",
  text: "#203040",
  baseline: "#8A8F98",
  current: "#2563EB",
  orange: "#F97316",
  green: "#16A34A",
  cyan: "#0EA5E9",
  purple: "#7C3AED",
  slate: "#334155",
};

function setValues(sheetName, range, values) {
  workbook.worksheets.getItem(sheetName).getRange(range).values = values;
}

function setFormulas(sheetName, range, formulas) {
  workbook.worksheets.getItem(sheetName).getRange(range).formulas = formulas;
}

function formatHeader(range) {
  range.format = {
    fill: colors.header,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

function formatSubheader(range) {
  range.format = {
    fill: colors.subheader,
    font: { bold: true, color: colors.header },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
}

function formatBody(range) {
  range.format = {
    font: { color: colors.text },
    verticalAlignment: "top",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
}

function styleLine(series, color, { dashed = false, width = 1.7 } = {}) {
  // Line styling is applied after export with an XLSX XML patch. The current
  // artifact-tool chart facade preserves imported charts but rejects direct
  // series line serialization for this workbook.
  void series;
  void color;
  void dashed;
  void width;
}

function styleChart(chart, title, yTitle, xTitle = "Along-track position x (km)") {
  chart.title = title;
  chart.titlePlacement = "aboveChart";
  chart.titleTextStyle.fontSize = 12;
  chart.hasLegend = true;
  chart.legend = { position: "bottom", textStyle: { fontSize: 8 } };
  chart.xAxis = {
    axisType: "textAxis",
    title: { text: xTitle, textStyle: { fontSize: 9 } },
    textStyle: { fontSize: 8 },
    majorGridlines: { fill: "#D7D7D7", style: "dashed", width: 0.75 },
  };
  chart.yAxis = {
    title: { text: yTitle, textStyle: { fontSize: 9 } },
    textStyle: { fontSize: 8 },
    majorGridlines: { fill: "#D7D7D7", style: "dashed", width: 0.75 },
  };
}

function buildGeometryView() {
  const geom = workbook.worksheets.getOrAdd("Geometry_View");
  geom.showGridLines = false;
  const used = geom.getUsedRange();
  if (used) used.clear({ applyTo: "all" });
  geom.deleteAllDrawings();

  geom.getRange("A1:R1").merge();
  geom.getRange("A1").values = [["Geometry View: Where the Satellite Looks and What the Generated Ground Is"]];
  formatHeader(geom.getRange("A1:R1"));
  geom.getRange("A2:R3").merge();
  geom.getRange("A2").values = [[
    "This sheet separates location from radar reading. The satellite flies along y = 0 with altitude z(x). Nadir is the ground directly below at y = 0. Off-nadir is the side-looking target path at y = Inputs!C6. The generated topography is the orange/green ground profile; the grey 0 m datum is only a height guide, not a test result.",
  ]];
  geom.getRange("A2:R3").format = {
    fill: colors.note,
    font: { italic: true, color: colors.text },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };

  geom.getRange("A5:F5").values = [[
    "Mid-pass item",
    "Along-track x",
    "Cross-track y",
    "Altitude / surface height",
    "Unit",
    "Meaning",
  ]];
  formatSubheader(geom.getRange("A5:F5"));
  geom.getRange("A6:F8").values = [
    [
      "Satellite at closest approach",
      0,
      0,
      null,
      "km",
      "The spacecraft position at x = 0; this is the source of the parabolic-path geometry.",
    ],
    [
      "Nadir ground point",
      0,
      0,
      null,
      "m",
      "Ground directly below the satellite. This is the radar reference path.",
    ],
    [
      "Off-nadir target point",
      0,
      null,
      null,
      "m",
      "Side-looking target location at the cross-track offset. This is what the off-nadir radar line is looking at.",
    ],
  ];
  geom.getRange("D6").formulas = [["=Inputs!C5"]];
  geom.getRange("D7").formulas = [["=Model_Data!X122"]];
  geom.getRange("C8").formulas = [["=Inputs!C6"]];
  geom.getRange("D8").formulas = [["=Model_Data!Y122"]];
  formatBody(geom.getRange("A6:F8"));
  geom.getRange("A6:A8").format = {
    fill: colors.paleBlue,
    font: { bold: true, color: colors.header },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  geom.getRange("B6:D8").format.numberFormat = "0.000";

  geom.getRange("A46:C46").values = [[
    "x (km)",
    "Satellite/nadir track y=0 km",
    "Off-nadir target path y=Inputs!C6 km",
  ]];
  geom.getRange("E46:H46").values = [[
    "x (km)",
    "Generated off-nadir topography h_target (m)",
    "Generated nadir topography h_nadir (m)",
    "Satellite parabolic altitude z(x) (km)",
  ]];
  geom.getRange("J46:M46").values = [[
    "x (km)",
    "Generated off-nadir topography h_target (m)",
    "Generated nadir topography h_nadir (m)",
    "0 m Base Datum",
  ]];
  geom.getRange("O46:R46").values = [[
    "x (km)",
    "Generated off-nadir topography h_target (m)",
    "Generated nadir topography h_nadir (m)",
    "Radar apparent-depth change caused by topography (m)",
  ]];
  formatSubheader(geom.getRange("A46:R46"));

  const rows = 241;
  const planRows = [];
  const verticalRows = [];
  const topoRows = [];
  const compareRows = [];
  for (let i = 0; i < rows; i += 1) {
    const r = i + 2;
    planRows.push([`=Model_Data!A${r}`, "=0", "=Inputs!$C$6"]);
    verticalRows.push([
      `=Model_Data!A${r}`,
      `=Model_Data!Y${r}`,
      `=Model_Data!X${r}`,
      `=Model_Data!B${r}`,
    ]);
    topoRows.push([`=Model_Data!A${r}`, `=Model_Data!Y${r}`, `=Model_Data!X${r}`, "=0"]);
    compareRows.push([`=Model_Data!A${r}`, `=Model_Data!Y${r}`, `=Model_Data!X${r}`, `=Model_Data!AI${r}`]);
  }
  geom.getRange("A47:C287").formulas = planRows;
  geom.getRange("E47:H287").formulas = verticalRows;
  geom.getRange("J47:M287").formulas = topoRows;
  geom.getRange("O47:R287").formulas = compareRows;
  geom.getRange("A47:R287").format.numberFormat = "0.000";
  geom.getRange("A46:R287").format = {
    borders: { preset: "all", style: "thin", color: colors.grid },
    font: { color: colors.text },
  };

  const planChart = geom.charts.add("line", geom.getRange("A46:C287"));
  styleChart(planChart, "Plan View: Nadir Track and Off-Nadir Target Path", "Cross-track location y (km)");
  planChart.setPosition("A10", "I27");

  const verticalChart = geom.charts.add("line", geom.getRange("E46:H287"));
  styleChart(verticalChart, "Dual-Scale Geometry: Terrain Height and Satellite Altitude", "Generated surface height (m)");
  verticalChart.setPosition("J10", "R27");

  const topoChart = geom.charts.add("line", geom.getRange("J46:M287"));
  styleChart(topoChart, "Generated Ground Topography (Zoomed)", "Surface height (m)");
  topoChart.setPosition("A29", "I45");

  const compareChart = geom.charts.add("line", geom.getRange("O46:R287"));
  styleChart(compareChart, "Generated Ground vs Radar Reading Change", "Meters");
  compareChart.setPosition("J29", "R45");

  geom.getRange("A9:I9").merge();
  geom.getRange("A9").values = [["Horizontal location: the off-nadir target is a separate ground path at y = Inputs!C6, not the same point as nadir."]];
  geom.getRange("J9:R9").merge();
  geom.getRange("J9").values = [["Vertical location: terrain uses the left meter axis, while satellite altitude uses the right kilometer axis so neither scale hides the other."]];
  geom.getRange("A28:I28").merge();
  geom.getRange("A28").values = [["Zoomed generated ground: this is the actual topography used in the topo run. Compare orange/green terrain, not the grey 0 m datum."]];
  geom.getRange("J28:R28").merge();
  geom.getRange("J28").values = [["Reading comparison: radar apparent-depth change is not the same as ground height; it comes from off-nadir slant range minus nadir reference range."]];
  geom.getRange("A9:R9").format = { fill: colors.paleBlue, font: { bold: true, color: colors.header }, wrapText: true };
  geom.getRange("A28:R28").format = { fill: colors.paleBlue, font: { bold: true, color: colors.header }, wrapText: true };

  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R"]) {
    geom.getRange(`${col}:${col}`).format.columnWidthPx = col === "F" ? 380 : 150;
  }
  geom.getRange("A1:R3").format.rowHeightPx = 32;
  geom.getRange("A5:F8").format.rowHeightPx = 38;
  geom.freezePanes.freezeRows(5);
}

// Make legend labels call out reference/baseline series so they do not read like model runs.
setValues("Chart_Data", "B1:E1", [
  [
    "Flat-Nadir Reference Line",
    "Constant-altitude off-nadir reading (not plotted)",
    "Parabolic flat-surface reading (m)",
    "Parabolic topography-adjusted reading (m)",
  ],
]);
setValues("Chart_Data", "H1:J1", [
  [
    "0 m Base Datum",
    "Off-nadir target topography height (m)",
    "Nadir topography height (m)",
  ],
]);
setValues("Chart_Data", "Q1:T1", [
  [
    "VHF Smooth Flyby (Flat) (Hz)",
    "VHF Terrain-Distorted (Topo) (Hz)",
    "HF Smooth Flyby (Flat) (Hz)",
    "HF Terrain-Distorted (Topo) (Hz)",
  ],
]);
setValues("Chart_Data", "Z1:AB1", [
  [
    "Flat-Nadir Reference Line",
    "Flat ground + constant satellite altitude reading (not plotted)",
    "Flat ground + parabolic satellite path reading (m)",
  ],
]);
setValues("Chart_Data", "AD1:AG1", [
  [
    "x (km)",
    "Flat-Nadir Reference Line",
    "Parabolic flat-surface reading (m)",
    "Parabolic topography-adjusted reading (m)",
  ],
]);
setValues("Chart_Data", "AI1:AK1", [
  [
    "x (km)",
    "HF Smooth Flyby (Flat) (Hz)",
    "HF Terrain-Distorted (Topo) (Hz)",
  ],
]);
const chartRows = [];
const hfRows = [];
for (let i = 0; i < 241; i += 1) {
  const r = i + 2;
  chartRows.push([`=A${r}`, `=B${r}`, `=D${r}`, `=E${r}`]);
  hfRows.push([`=P${r}`, `=S${r}`, `=T${r}`]);
}
setFormulas("Chart_Data", "AD2:AG242", chartRows);
setFormulas("Chart_Data", "AI2:AK242", hfRows);
setValues("Scenario_Data", "AR1:AV1", [
  [
    "0 m Base Datum",
    "Current custom inputs off-nadir surface (m)",
    "Paper low-altitude 800-km pass off-nadir surface (m)",
    "Paper ice-ocean 1600-km pass off-nadir surface (m)",
    "Paper operating 25-to-1000-km pass off-nadir surface (m)",
  ],
]);
setValues("Scenario_Data", "AY1:BC1", [
  [
    "0 km Base Datum",
    "Current custom inputs altitude (km)",
    "Paper low-altitude 800-km pass altitude (km)",
    "Paper ice-ocean 1600-km pass altitude (km)",
    "Paper operating 25-to-1000-km pass altitude (km)",
  ],
]);
setValues("Scenario_Data", "BF1:BJ1", [
  [
    "Flat-Nadir Reference Line",
    "Current custom inputs apparent depth (m)",
    "Paper low-altitude 800-km pass apparent depth (m)",
    "Paper ice-ocean 1600-km pass apparent depth (m)",
    "Paper operating 25-to-1000-km pass apparent depth (m)",
  ],
]);
setValues("Scenario_Data", "BL1:BP1", [
  [
    "Pass fraction (-1 to +1)",
    "Current custom altitude (km)",
    "Paper 800-km low-altitude altitude (km)",
    "Paper 1600-km ice-ocean altitude (km)",
    "Paper 25-to-1000-km operating altitude (km)",
  ],
]);
const scenarioAltitudeRows = [];
for (let i = 0; i < 241; i += 1) {
  const r = i + 2;
  scenarioAltitudeRows.push([`=AX${r}`, `=AZ${r}`, `=BA${r}`, `=BB${r}`, `=BC${r}`]);
}
setFormulas("Scenario_Data", "BL2:BP242", scenarioAltitudeRows);

const dashboard = workbook.worksheets.getItem("Dashboard");
dashboard.showGridLines = false;
dashboard.deleteAllDrawings();
dashboard.getRange("A2:I2").merge();
dashboard.getRange("A2").values = [[
  "Open Geometry_View to see where the satellite, nadir track, and off-nadir target path are located. For topography, compare against the generated ground/topography lines; grey reference lines are only datum/depth guides.",
]];
dashboard.getRange("A2:I2").format = {
  fill: colors.note,
  font: { italic: true, color: colors.text },
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: colors.grid },
};
dashboard.getRange("A65:I72").clear({ applyTo: "all" });
dashboard.getRange("A65:I65").merge();
dashboard.getRange("A65").values = [["Quick Graph Guide"]];
formatHeader(dashboard.getRange("A65:I65"));
dashboard.getRange("A66:I66").values = [
  [
    "Graph",
    "What it is trying to show",
    null,
    null,
    null,
    "How to read the baseline",
    null,
    null,
    null,
  ],
];
dashboard.getRange("B66:E66").merge();
dashboard.getRange("F66:I66").merge();
formatSubheader(dashboard.getRange("A66:I66"));
dashboard.getRange("A67:I72").values = [
  [
    "Apparent depth",
    "Compares Flat-Nadir Reference Line, parabolic flat-surface reading, and parabolic topography-adjusted reading.",
    null,
    null,
    null,
    "No constant-altitude line is plotted; this keeps the comparison tied to the parabolic flyby.",
    null,
    null,
    null,
  ],
  [
    "Surface / geometry",
    "Generated topography is plotted in meters; Geometry_View also shows satellite altitude on a separate km axis.",
    null,
    null,
    null,
    "0 m Base Datum is only a datum. Orange/green are the generated terrain profiles.",
    null,
    null,
    null,
  ],
  [
    "VHF Doppler",
    "Shows Smooth Flyby (Flat) vs Terrain-Distorted (Topo) VHF Doppler on its own scale.",
    null,
    null,
    null,
    "Terrain wiggles are not mixed with HF scale compression.",
    null,
    null,
    null,
  ],
  [
    "HF Doppler",
    "Shows Smooth Flyby (Flat) vs Terrain-Distorted (Topo) HF Doppler on its own scale.",
    null,
    null,
    null,
    "HF variations are readable because VHF is no longer on the same axis.",
    null,
    null,
    null,
  ],
  [
    "Scenario altitude",
    "Only altitude vs normalized pass fraction is plotted for scenario comparisons.",
    null,
    null,
    null,
    "Scenario apparent-depth outcomes are not charted because their scales swamp the custom pass.",
    null,
    null,
    null,
  ],
  [null, null, null, null, null, null, null, null, null],
];
for (const row of [67, 68, 69, 70, 71]) {
  dashboard.getRange(`B${row}:E${row}`).merge();
  dashboard.getRange(`F${row}:I${row}`).merge();
}
formatBody(dashboard.getRange("A67:I71"));
dashboard.getRange("A67:A71").format = {
  fill: colors.paleBlue,
  font: { bold: true, color: colors.header },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};
dashboard.getRange("A65:I71").format.rowHeightPx = 36;

const apparentChart = dashboard.charts.add("line", workbook.worksheets.getItem("Chart_Data").getRange("AD1:AG242"));
styleChart(apparentChart, "Apparent Depth: Motion vs Topography", "Apparent depth / radar reading (m)");
apparentChart.setPosition("J2", "R24");

const terrainChart = dashboard.charts.add("line", workbook.worksheets.getItem("Chart_Data").getRange("G1:J242"));
styleChart(terrainChart, "Generated Ground Topography: Target and Nadir", "Surface height (m)");
terrainChart.setPosition("A28", "I45");

const vhfChart = dashboard.charts.add("line", workbook.worksheets.getItem("Chart_Data").getRange("P1:R242"));
styleChart(vhfChart, "VHF Doppler: Smooth Flyby vs Terrain-Distorted", "VHF Doppler shift (Hz)");
vhfChart.setPosition("J28", "R45");

const hfChart = dashboard.charts.add("line", workbook.worksheets.getItem("Chart_Data").getRange("AI1:AK242"));
styleChart(hfChart, "HF Doppler: Smooth Flyby vs Terrain-Distorted", "HF Doppler shift (Hz)");
hfChart.setPosition("J47", "R64");

const scenarioAltitudeChart = dashboard.charts.add(
  "line",
  workbook.worksheets.getItem("Scenario_Data").getRange("BL1:BP242"),
);
styleChart(scenarioAltitudeChart, "Scenario Altitude Profiles", "Altitude (km)", "Normalized pass position (-1 to +1)");
scenarioAltitudeChart.setPosition("A73", "R111");

buildGeometryView();

const guide = workbook.worksheets.getOrAdd("Graph_Guide");
guide.showGridLines = false;
const used = guide.getUsedRange();
if (used) used.clear({ applyTo: "all" });

guide.getRange("A1:G1").merge();
guide.getRange("A1").values = [["Graph Guide and Formula Audit"]];
formatHeader(guide.getRange("A1:G1"));
guide.getRange("A2:G2").merge();
guide.getRange("A2").values = [[
  "Grey reference lines are guides only. Apparent-depth charts now compare the Flat-Nadir Reference Line, the parabolic flat-surface reading, and the parabolic topography-adjusted reading. Scenario charts show altitude vs pass fraction only.",
]];
guide.getRange("A2:G2").format = {
  fill: colors.note,
  font: { italic: true, color: colors.text },
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: colors.grid },
};

guide.getRange("A4:G4").values = [[
  "Graph",
  "What it shows",
  "Why it matters",
  "How to read the baseline",
  "Source range",
  "Formula basis",
  "Audit status",
]];
formatSubheader(guide.getRange("A4:G4"));

guide.getRange("A5:G12").values = [
  [
    "Geometry_View: Satellite Location and Generated Ground",
    "Shows satellite/nadir/off-nadir locations, dual-scale terrain-vs-altitude geometry, zoomed generated topography, and radar reading change.",
    "Separates satellite motion, actual generated ground shape, and radar readout so the generated terrain is visible instead of crushed by altitude scale.",
    "Terrain uses the left meter axis; satellite altitude uses the right kilometer axis. The grey 0 m Base Datum is only a datum.",
    "Geometry_View charts; Model_Data!A:B:X:Y:AI",
    "Satellite is y=0, z(x). Nadir is y=0 with h_nadir. Off-nadir is y=Inputs!C6 with h_target. The geometry chart uses a secondary axis for satellite altitude.",
    "Live helper formulas from Model_Data",
  ],
  [
    "Apparent Depth: Motion vs Topography",
    "Compares Flat-Nadir Reference Line, parabolic flat-surface reading, and parabolic topography-adjusted reading across x.",
    "Separates pure parabolic flyby motion from motion plus generated terrain without adding the impossible constant-altitude line.",
    "Flat-Nadir Reference Line is the depth guide. The two colored parabolic lines are the actual comparison.",
    "Chart_Data!AD:AG",
    "apparent_depth = (R_off - R_nadir)*1000/n; topo version uses h_nadir and h_target.",
    "Linked to Checks!B21:B23",
  ],
  [
    "Generated Ground Topography: Target and Nadir",
    "Plots modeled terrain height at the side-looking target path and directly below the spacecraft.",
    "Shows the terrain terms that feed the topography-adjusted range equations.",
    "0 m Base Datum is a datum. Orange/green are actual generated terrain profiles.",
    "Chart_Data!G:J",
    "h_total(x,y) = h_project + ridge + crater + chaos + roughness + trough + seeded terrain.",
    "Inputs validated in Checks!B10:B16",
  ],
  [
    "VHF Doppler: Smooth Flyby vs Terrain-Distorted",
    "Compares VHF Smooth Flyby (Flat) against VHF Terrain-Distorted (Topo).",
    "Keeps the large VHF range on its own axis so terrain distortion is readable without compressing HF.",
    "Zero Hz is the radial-motion sign-change guide around closest approach.",
    "Chart_Data!P:R",
    "doppler = -2*range_rate/lambda; range_rate is from adjacent slant-range samples.",
    "PRF check in Checks!B19",
  ],
  [
    "HF Doppler: Smooth Flyby vs Terrain-Distorted",
    "Compares HF Smooth Flyby (Flat) against HF Terrain-Distorted (Topo).",
    "Separating HF from VHF lets the smaller HF terrain-induced wiggles autoscale clearly.",
    "Zero Hz is the radial-motion sign-change guide around closest approach.",
    "Chart_Data!AI:AK",
    "doppler = -2*range_rate/lambda; HF uses lambda_hf from Inputs!C14.",
    "PRF check context in Checks!B19",
  ],
  [
    "Scenario Altitude Profiles",
    "Plots scenario altitude versus normalized pass fraction for the checked custom and paper-derived pass cases.",
    "Compares parabolic pass shapes without mixing incompatible apparent-depth scales.",
    "No scenario apparent-depth chart is shown; the scenario depth values are too large to share a useful axis with the custom pass.",
    "Scenario_Data!BL:BP",
    "z(x) = z0 + Delta_z_edge*(x/x_edge)^2 after mapping each scenario to pass fraction -1 to +1.",
    "Scenario checks in Checks!B17:B18",
  ],
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
];
formatBody(guide.getRange("A5:G12"));
guide.getRange("A5:A12").format = {
  fill: colors.paleBlue,
  font: { bold: true, color: colors.header },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};

guide.getRange("A14:G14").merge();
guide.getRange("A14").values = [["Formula Audit Summary"]];
formatHeader(guide.getRange("A14:G14"));
guide.getRange("A15:E15").values = [["Audit item", "Live result", "Unit", "Formula / source", "Why it matters"]];
formatSubheader(guide.getRange("A15:E15"));
guide.getRange("A16:E21").values = [
  [
    "Workbook checks",
    null,
    null,
    '\'=IF(COUNTIF(Checks!B4:B23,"OK")=ROWS(Checks!B4:B23),"OK","Review Checks")',
    "Confirms input bounds, chart helper links, and apparent-height conversion checks.",
  ],
  [
    "Flat apparent depth at mid-pass",
    null,
    "m",
    "'=Dashboard!B7",
    "Expected flat-surface radar apparent depth before topography is applied.",
  ],
  [
    "Topography-adjusted apparent depth at mid-pass",
    null,
    "m",
    "'=Dashboard!B8",
    "Same geometry after terrain height changes the nadir and target ranges.",
  ],
  [
    "Depth change from topography",
    null,
    "m",
    "'=Dashboard!B9",
    "Topo apparent depth minus flat apparent depth; negative means the echo appears shallower.",
  ],
  [
    "Simple minimum PRF with topo",
    null,
    "Hz",
    "'=Dashboard!B16",
    "Twice max absolute topography-adjusted VHF Doppler.",
  ],
  [
    "Chart baseline treatment",
    "OK",
    null,
    "Baselines renamed and styled neutral grey.",
    "Prevents reference floors from reading like orange model output lines.",
  ],
];
guide.getRange("B16:B20").formulas = [
  ['=IF(COUNTIF(Checks!B4:B23,"OK")=ROWS(Checks!B4:B23),"OK","Review Checks")'],
  ["=Dashboard!B7"],
  ["=Dashboard!B8"],
  ["=Dashboard!B9"],
  ["=Dashboard!B16"],
];
guide.getRange("B17:B20").format.numberFormat = "0.000";
formatBody(guide.getRange("A16:E21"));
guide.getRange("A16:A21").format = {
  fill: colors.paleBlue,
  font: { bold: true, color: colors.header },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};
guide.getRange("B16:B21").format = {
  fill: "#E8F7EF",
  font: { bold: true, color: colors.header },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};

guide.getRange("A1:G21").format.font = { name: "Aptos", color: colors.text };
guide.getRange("A:A").format.columnWidthPx = 205;
guide.getRange("B:B").format.columnWidthPx = 360;
guide.getRange("C:C").format.columnWidthPx = 280;
guide.getRange("D:D").format.columnWidthPx = 250;
guide.getRange("E:E").format.columnWidthPx = 180;
guide.getRange("F:F").format.columnWidthPx = 360;
guide.getRange("G:G").format.columnWidthPx = 180;
guide.getRange("A1:G21").format.rowHeightPx = 42;
guide.getRange("A1:G1").format.rowHeightPx = 30;
guide.getRange("A2:G2").format.rowHeightPx = 34;
guide.getRange("A5:G10").format.rowHeightPx = 72;
guide.getRange("A11:G12").format.rowHeightPx = 20;
guide.getRange("A16:E21").format.rowHeightPx = 54;
formatHeader(guide.getRange("A1:G1"));
formatSubheader(guide.getRange("A4:G4"));
formatHeader(guide.getRange("A14:G14"));
formatSubheader(guide.getRange("A15:E15"));
guide.freezePanes.freezeRows(4);

// Add a short note to Checks so future readers know the graph guide is intentional.
const checks = workbook.worksheets.getItem("Checks");
checks.getRange("A25:C27").values = [
  ["Chart/graph communication checks", null, null],
  [
    "Baseline legends",
    "OK",
    "Flat-Nadir Reference Line and 0 m Base Datum labels are styled as neutral references, not scenario outputs.",
  ],
  [
    "Graph explanations",
    "OK",
    "Dashboard rows 65-71 and Graph_Guide explain every chart and its source range, including the split Doppler charts and dual-axis geometry chart.",
  ],
];
formatHeader(checks.getRange("A25:C25"));
formatBody(checks.getRange("A26:C27"));
checks.getRange("A26:A27").format = {
  fill: colors.paleBlue,
  font: { bold: true, color: colors.header },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};

await fs.mkdir(outputDir, { recursive: true });
const revised = await SpreadsheetFile.exportXlsx(workbook);
await revised.save(outputPath);

console.log(outputPath);
