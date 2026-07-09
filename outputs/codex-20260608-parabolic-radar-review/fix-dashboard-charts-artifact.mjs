import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-checked-generated-topography.xlsx";
const outputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-dashboard-fixed-generated-topography.xlsx";
const previewPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/dashboard-fixed-preview.png";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const colors = {
  header: "#0B1F3A",
  subheader: "#D9EAF7",
  note: "#FFF4D6",
  grid: "#D9E2EC",
  text: "#203040",
  terrain: "#16A34A",
  flat: "#2563EB",
  topo: "#F97316",
  satellite: "#4B5563",
  hfTopo: "#0891B2",
  scenarioPurple: "#7C3AED",
};

function header(range) {
  range.format = {
    fill: colors.header,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

function body(range) {
  range.format = {
    font: { color: colors.text },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
}

function subheader(range) {
  range.format = {
    fill: colors.subheader,
    font: { bold: true, color: colors.header },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
}

function styleChart(chart, title, xTitle, yTitle) {
  chart.title = title;
  chart.titlePlacement = "aboveChart";
  chart.titleTextStyle.fontSize = 11;
  chart.hasLegend = true;
  chart.legend = { position: "bottom", textStyle: { fontSize: 8 } };
  chart.xAxis = {
    axisType: "textAxis",
    title: { text: xTitle, textStyle: { fontSize: 9 } },
    textStyle: { fontSize: 8 },
    majorGridlines: { fill: "#E5E7EB", style: "dashed", width: 0.75 },
  };
  chart.yAxis = {
    title: { text: yTitle, textStyle: { fontSize: 9 } },
    textStyle: { fontSize: 8 },
    majorGridlines: { fill: "#E5E7EB", style: "dashed", width: 0.75 },
  };
}

function setLineStyles(chart, styles) {
  chart.series.items.forEach((series, index) => {
    const style = styles[index] ?? {};
    series.line = {
      fill: style.fill ?? colors.text,
      style: style.style ?? "solid",
      width: style.width ?? 2,
    };
  });
}

function addLineChart(sheet, sourceRange, positionStart, positionEnd, title, xTitle, yTitle, styles) {
  const chart = sheet.charts.add("line", sourceRange);
  styleChart(chart, title, xTitle, yTitle);
  setLineStyles(chart, styles);
  chart.setPosition(positionStart, positionEnd);
  return chart;
}

const helper = workbook.worksheets.getOrAdd("Dashboard_Chart_Data");
helper.showGridLines = false;
const helperUsed = helper.getUsedRange();
if (helperUsed) helperUsed.clear({ applyTo: "all" });
helper.deleteAllDrawings();

helper.getRange("A1:Q1").values = [[
  "Along-track Distance x (km)",
  "Generated Topography Surface (Baseline)",
  "Apparent Radar Horizon (Flat Geometry)",
  "Apparent Radar Horizon (Topo-Adjusted)",
  "Off-Nadir Generated Topography Height (m)",
  "Nadir Generated Topography Height (m)",
  "Satellite Parabolic Altitude (km)",
  "Satellite Altitude Rise Above Closest Approach (km)",
  "Smooth Flyby VHF Doppler (Hz)",
  "Terrain-Distorted VHF Doppler (Hz)",
  "Smooth Flyby HF Doppler (Hz)",
  "Terrain-Distorted HF Doppler (Hz)",
  "Scenario Pass Fraction",
  "Current Custom Altitude (km)",
  "Paper 800-km Pass Altitude (km)",
  "Paper 1600-km Pass Altitude (km)",
  "Paper 25-to-1000-km Altitude (km)",
]];
subheader(helper.getRange("A1:Q1"));

const formulas = [];
for (let i = 0; i < 241; i += 1) {
  const row = i + 2;
  formulas.push([
    `=Chart_Data!A${row}`,
    `=Chart_Data!J${row}`,
    `=Chart_Data!J${row}-Chart_Data!D${row}`,
    `=Chart_Data!J${row}-Chart_Data!E${row}`,
    `=Chart_Data!I${row}`,
    `=Chart_Data!J${row}`,
    `=Model_Data!B${row}`,
    `=Model_Data!B${row}-Inputs!$C$5`,
    `=Chart_Data!Q${row}`,
    `=Chart_Data!R${row}`,
    `=Chart_Data!S${row}`,
    `=Chart_Data!T${row}`,
    `=Scenario_Data!AX${row}`,
    `=Scenario_Data!AZ${row}`,
    `=Scenario_Data!BA${row}`,
    `=Scenario_Data!BB${row}`,
    `=Scenario_Data!BC${row}`,
  ]);
}
helper.getRange("A2:Q242").formulas = formulas;
helper.getRange("A2:Q242").format.numberFormat = "0.000";
body(helper.getRange("A2:Q242"));
for (let col = 1; col <= 17; col += 1) {
  helper.getRangeByIndexes(0, col - 1, 1, 1).format.columnWidthPx = 170;
}

const dashboard = workbook.worksheets.getItem("Dashboard");
dashboard.deleteAllDrawings();

dashboard.getRange("A25:H26").values = [[
  "How to read this model: the chart baseline is the generated topography surface, not the scanned surface and not a 0 m floor. Apparent radar horizon = generated nadir topography height - radar depth reading. Nadir is straight below the spacecraft; off-nadir is the side-looking target at y = Inputs!C6.",
  null, null, null, null, null, null, null,
], [null, null, null, null, null, null, null, null]];
dashboard.getRange("A25:H26").format = {
  fill: colors.note,
  font: { color: colors.text },
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "outside", style: "thin", color: colors.grid },
};

dashboard.getRange("A65:H72").clear({ applyTo: "all" });
dashboard.getRange("A65:H65").merge();
dashboard.getRange("A65").values = [["Quick Graph Guide"]];
header(dashboard.getRange("A65:H65"));
dashboard.getRange("A66:H66").values = [[
  "Graph",
  "What it is trying to show",
  null,
  null,
  null,
  "How to read the baseline",
  null,
  null,
]];
dashboard.getRange("B66:E66").merge();
dashboard.getRange("F66:H66").merge();
subheader(dashboard.getRange("A66:H66"));

const guideRows = [
  [
    "Apparent elevation",
    "Generated terrain surface compared with the two radar horizons after converting depth into elevation.",
    "Green is generated topography. Blue/orange are apparent radar horizons, not spacecraft motion.",
  ],
  [
    "Surface geometry",
    "Generated off-nadir terrain and generated nadir terrain, both zoomed in meters.",
    "This is the ground shape. It is separate from satellite altitude so the terrain is not crushed.",
  ],
  [
  "Satellite altitude",
    "The parabolic spacecraft altitude rise above closest approach, shown with the same x positions.",
    "This shows the spacecraft motion separately so the terrain chart can stay zoomed in meters.",
  ],
  [
    "VHF Doppler",
    "Smooth flyby VHF Doppler compared with terrain-distorted VHF Doppler.",
    "Separate VHF graph keeps its large scale from hiding HF behavior.",
  ],
  [
    "HF Doppler",
    "Smooth flyby HF Doppler compared with terrain-distorted HF Doppler.",
    "Zoomed HF scale makes the terrain-driven wiggles readable.",
  ],
  [
    "Scenario altitude",
    "Only altitude profiles for custom and paper scenarios, normalized by pass fraction.",
    "No scenario apparent-depth plot; that would flatten the custom pass.",
  ],
];
dashboard.getRange("A67:H72").values = guideRows.map((row) => [
  row[0],
  row[1],
  null,
  null,
  null,
  row[2],
  null,
  null,
]);
for (const row of [67, 68, 69, 70, 71, 72]) {
  dashboard.getRange(`B${row}:E${row}`).merge();
  dashboard.getRange(`F${row}:H${row}`).merge();
}
body(dashboard.getRange("A67:H72"));
dashboard.getRange("A67:A72").format = {
  fill: colors.subheader,
  font: { bold: true, color: colors.header },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};
dashboard.getRange("M1:R1").merge();
dashboard.getRange("M1").values = [["Dashboard charts rebuilt: generated topography is the reference baseline"]];
dashboard.getRange("M1:R1").format = {
  fill: colors.note,
  font: { bold: true, color: colors.text },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
dashboard.getRange("A65:H72").format.rowHeightPx = 38;

addLineChart(
  dashboard,
  helper.getRange("A1:D242"),
  "I3",
  "R23",
  "Radar Apparent Elevation Relative to Generated Topography",
  "Along-track distance x (km)",
  "Elevation (m)",
  [
    { fill: colors.terrain, style: "solid", width: 3 },
    { fill: colors.flat, style: "dashed", width: 2 },
    { fill: colors.topo, style: "solid", width: 2.5 },
  ],
);

helper.getRange("S1:U1").values = [[
  "Along-track Distance x (km)",
  "Off-Nadir Generated Topography",
  "Nadir Generated Topography",
]];
helper.getRange("S2:U242").formulas = formulas.map((_, i) => {
  const row = i + 2;
  return [`=A${row}`, `=E${row}`, `=F${row}`];
});
subheader(helper.getRange("S1:U1"));
body(helper.getRange("S2:U242"));

addLineChart(
  dashboard,
  helper.getRange("S1:U242"),
  "A29",
  "H48",
  "Generated Surface Geometry (Terrain, Zoomed)",
  "Along-track distance x (km)",
  "Generated topography height (m)",
  [
    { fill: colors.topo, style: "solid", width: 2 },
    { fill: colors.terrain, style: "solid", width: 2 },
  ],
);

helper.getRange("W1:X1").values = [[
  "Along-track Distance x (km)",
  "Satellite Altitude Rise Above Closest Approach",
]];
helper.getRange("W2:X242").formulas = formulas.map((_, i) => {
  const row = i + 2;
  return [`=A${row}`, `=H${row}`];
});
subheader(helper.getRange("W1:X1"));
body(helper.getRange("W2:X242"));

addLineChart(
  dashboard,
  helper.getRange("W1:X242"),
  "A49",
  "H64",
  "Satellite Altitude Rise Above Closest Approach",
  "Along-track distance x (km)",
  "Altitude rise (km)",
  [
    { fill: colors.satellite, style: "dashed", width: 2.5 },
  ],
);

helper.getRange("Z1:AB1").values = [[
  "Along-track Distance x (km)",
  "Smooth Flyby VHF Doppler (Flat)",
  "Terrain-Distorted VHF Doppler (Topo)",
]];
helper.getRange("Z2:AB242").formulas = formulas.map((_, i) => {
  const row = i + 2;
  return [`=A${row}`, `=I${row}`, `=J${row}`];
});
subheader(helper.getRange("Z1:AB1"));
body(helper.getRange("Z2:AB242"));

addLineChart(
  dashboard,
  helper.getRange("Z1:AB242"),
  "I25",
  "R44",
  "VHF Doppler: Smooth Flyby vs Terrain-Distorted",
  "Along-track distance x (km)",
  "Doppler shift (Hz)",
  [
    { fill: colors.flat, style: "dashed", width: 2 },
    { fill: colors.topo, style: "solid", width: 2 },
  ],
);

helper.getRange("AD1:AF1").values = [[
  "Along-track Distance x (km)",
  "Smooth Flyby HF Doppler (Flat)",
  "Terrain-Distorted HF Doppler (Topo)",
]];
helper.getRange("AD2:AF242").formulas = formulas.map((_, i) => {
  const row = i + 2;
  return [`=A${row}`, `=K${row}`, `=L${row}`];
});
subheader(helper.getRange("AD1:AF1"));
body(helper.getRange("AD2:AF242"));

addLineChart(
  dashboard,
  helper.getRange("AD1:AF242"),
  "I46",
  "R64",
  "HF Doppler: Smooth Flyby vs Terrain-Distorted",
  "Along-track distance x (km)",
  "Doppler shift (Hz)",
  [
    { fill: colors.flat, style: "dashed", width: 2 },
    { fill: colors.hfTopo, style: "solid", width: 2 },
  ],
);

helper.getRange("AH1:AL1").values = [[
  "Scenario Pass Fraction",
  "Current Custom Altitude",
  "Paper 800-km Pass Altitude",
  "Paper 1600-km Pass Altitude",
  "Paper 25-to-1000-km Altitude",
]];
helper.getRange("AH2:AL242").formulas = formulas.map((_, i) => {
  const row = i + 2;
  return [`=M${row}`, `=N${row}`, `=O${row}`, `=P${row}`, `=Q${row}`];
});
subheader(helper.getRange("AH1:AL1"));
body(helper.getRange("AH2:AL242"));

addLineChart(
  dashboard,
  helper.getRange("AH1:AL242"),
  "A74",
  "R111",
  "Scenario Altitude Profiles Only",
  "Pass fraction (-1 to +1)",
  "Altitude (km)",
  [
    { fill: colors.topo, style: "solid", width: 2 },
    { fill: colors.terrain, style: "solid", width: 2 },
    { fill: colors.flat, style: "solid", width: 2 },
    { fill: colors.scenarioPurple, style: "dashed", width: 2 },
  ],
);

const chartData = workbook.worksheets.getItem("Chart_Data");
chartData.getRange("B1").values = [["Flat-Nadir Reference Line (0 m datum)"]];
chartData.getRange("H1").values = [["0 m Base Datum"]];
chartData.getRange("Z1").values = [["Flat-Nadir Reference Line (0 m datum)"]];

const graphGuide = workbook.worksheets.getItem("Graph_Guide");
const guideUsed = graphGuide.getUsedRange();
if (guideUsed) guideUsed.clear({ applyTo: "all" });
graphGuide.deleteAllDrawings();
graphGuide.getRange("A1:F1").merge();
graphGuide.getRange("A1").values = [["Graph Guide: Generated Topography Baseline"]];
header(graphGuide.getRange("A1:F1"));
graphGuide.getRange("A3:F3").values = [[
  "Graph",
  "Question it answers",
  "Reference / baseline",
  "What the plotted lines mean",
  "Formula basis",
  "What not to infer",
]];
subheader(graphGuide.getRange("A3:F3"));
graphGuide.getRange("A4:F9").values = [
  [
    "Radar Apparent Elevation",
    "How do radar horizons move when generated terrain is included?",
    "Generated nadir topography surface from Chart_Data!J.",
    "Green is generated terrain; blue is generated terrain minus flat radar depth; orange is generated terrain minus topo-adjusted radar depth.",
    "Dashboard_Chart_Data!B:D = Chart_Data!J, J-D, J-E.",
    "The blue/orange curves are not satellite altitude and not ground height by themselves.",
  ],
  [
    "Generated Surface Geometry",
    "What does the modeled ground actually look like at nadir and off-nadir?",
    "No 0 m floor is used as the visual reference.",
    "Orange is off-nadir generated topography; green is nadir generated topography.",
    "Chart_Data!I:J, generated from Model_Data!Y:X and Inputs topography controls.",
    "This is terrain height, not the radar depth reading.",
  ],
  [
    "Satellite Altitude",
    "Where is the spacecraft along the pass?",
    "Same x positions as the terrain chart, but plotted as rise above closest approach in kilometers.",
    "Gray dashed line is the altitude rise. Absolute altitude is stored separately, but not used for this chart.",
    "Dashboard_Chart_Data!H = Model_Data!B - Inputs!C5.",
    "The chart uses altitude rise so the parabola is visible; absolute 400 km altitude would look almost flat.",
  ],
  [
    "VHF Doppler",
    "How does terrain perturb the large VHF Doppler trend?",
    "Smooth flyby VHF line is the flat-geometry control.",
    "Blue dashed is smooth/flat; orange is terrain-distorted/topo.",
    "Chart_Data!Q:R.",
    "Do not compare HF on this chart; the VHF scale is much larger.",
  ],
  [
    "HF Doppler",
    "What do the smaller HF Doppler changes look like when zoomed?",
    "Smooth flyby HF line is the flat-geometry control.",
    "Blue dashed is smooth/flat; teal is terrain-distorted/topo.",
    "Chart_Data!S:T.",
    "This is a separate graph so the terrain wiggles are visible.",
  ],
  [
    "Scenario Altitude",
    "How do custom and paper-derived altitude profiles compare?",
    "Pass fraction from -1 to +1 normalizes different pass lengths.",
    "Only altitude lines are plotted.",
    "Scenario_Data!AX:BC.",
    "Scenario apparent depths are not plotted together because the paper scenarios dwarf the custom pass.",
  ],
];
body(graphGuide.getRange("A4:F9"));
for (const width of [
  ["A:A", 190],
  ["B:B", 260],
  ["C:C", 260],
  ["D:D", 330],
  ["E:E", 240],
  ["F:F", 300],
]) {
  graphGuide.getRange(width[0]).format.columnWidthPx = width[1];
}
graphGuide.getRange("A1:F9").format.rowHeightPx = 42;

const preview = await workbook.render({
  sheetName: "Dashboard",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(outputPath);
console.log(previewPath);
