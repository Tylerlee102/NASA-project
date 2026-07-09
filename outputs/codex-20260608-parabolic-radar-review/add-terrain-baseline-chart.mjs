import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx";
const outputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-checked-generated-topography.xlsx";

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
};

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
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
}

const sheet = workbook.worksheets.getOrAdd("Terrain_Baseline_Chart");
sheet.showGridLines = false;
const used = sheet.getUsedRange();
if (used) used.clear({ applyTo: "all" });
sheet.deleteAllDrawings();

sheet.getRange("A1:J1").merge();
sheet.getRange("A1").values = [["Radar Apparent Elevation Relative to Generated Topography"]];
formatHeader(sheet.getRange("A1:J1"));

sheet.getRange("A2:J4").merge();
sheet.getRange("A2").values = [[
  "This chart replaces the flat 0 m baseline with the generated nadir topography surface from Chart_Data. The radar depth readings are transformed into apparent elevation by subtracting depth from the generated topography height, so the visual shows how generated topography shifts the apparent radar horizon relative to the modeled terrain.",
]];
sheet.getRange("A2:J4").format = {
  fill: colors.note,
  font: { italic: true, color: colors.text },
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "outside", style: "thin", color: colors.grid },
};

sheet.getRange("A35:D35").values = [[
  "Along-track Distance x (km)",
  "Generated Topography Surface (Baseline)",
  "Apparent Radar Horizon (Flat Geometry)",
  "Apparent Radar Horizon (Topo-Adjusted)",
]];
formatSubheader(sheet.getRange("A35:D35"));

const helperRows = [];
for (let i = 0; i < 241; i += 1) {
  const sourceRow = i + 2;
  helperRows.push([
    `=Chart_Data!A${sourceRow}`,
    `=Chart_Data!J${sourceRow}`,
    `=Chart_Data!J${sourceRow}-Chart_Data!D${sourceRow}`,
    `=Chart_Data!J${sourceRow}-Chart_Data!E${sourceRow}`,
  ]);
}
sheet.getRange("A36:D276").formulas = helperRows;
sheet.getRange("A36:D276").format.numberFormat = "0.000";
formatBody(sheet.getRange("A36:D276"));

const chart = sheet.charts.add("line", sheet.getRange("A35:D276"));
chart.title = "Radar Apparent Elevation Relative to Generated Topography";
chart.titlePlacement = "aboveChart";
chart.titleTextStyle.fontSize = 13;
chart.hasLegend = true;
chart.legend = { position: "bottom", textStyle: { fontSize: 9 } };
chart.xAxis = {
  axisType: "textAxis",
  title: { text: "Along-track Distance x (km)", textStyle: { fontSize: 10 } },
  textStyle: { fontSize: 8 },
  majorGridlines: { fill: "#D7D7D7", style: "dashed", width: 0.75 },
};
chart.yAxis = {
  title: { text: "Elevation (m)", textStyle: { fontSize: 10 } },
  textStyle: { fontSize: 8 },
  majorGridlines: { fill: "#D7D7D7", style: "dashed", width: 0.75 },
};
chart.setPosition("A6", "J32");

const series = chart.series.items;
if (series[0]) series[0].line = { fill: colors.terrain, style: "solid", width: 3 };
if (series[1]) series[1].line = { fill: colors.flat, style: "dashed", width: 2 };
if (series[2]) series[2].line = { fill: colors.topo, style: "solid", width: 2.5 };

sheet.getRange("F35:J39").values = [
  ["Formula notes", null, null, null, null],
  ["Generated Topography Surface", "Generated nadir topography height from Chart_Data!J", null, null, null],
  ["Flat Geometry Horizon", "Generated nadir topography height - Parabolic flat-surface reading", null, null, null],
  ["Topo-Adjusted Horizon", "Generated nadir topography height - Parabolic topography-adjusted reading", null, null, null],
  ["Source columns", "Chart_Data A, D, E, J", null, null, null],
];
sheet.getRange("F35:J35").merge();
formatHeader(sheet.getRange("F35:J35"));
for (const row of [36, 37, 38, 39]) {
  sheet.getRange(`G${row}:J${row}`).merge();
}
formatBody(sheet.getRange("F36:J39"));
sheet.getRange("F36:F39").format = {
  fill: colors.subheader,
  font: { bold: true, color: colors.header },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.grid },
};

for (const col of ["A", "B", "C", "D"]) {
  sheet.getRange(`${col}:${col}`).format.columnWidthPx = 210;
}
for (const col of ["F", "G", "H", "I", "J"]) {
  sheet.getRange(`${col}:${col}`).format.columnWidthPx = col === "F" ? 190 : 130;
}
sheet.getRange("A1:J1").format.rowHeightPx = 30;
sheet.getRange("A2:J4").format.rowHeightPx = 32;
sheet.getRange("A35:J39").format.rowHeightPx = 36;
sheet.freezePanes.freezeRows(35);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const preview = await workbook.render({
  sheetName: "Terrain_Baseline_Chart",
  range: "A1:J39",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/final-Terrain_Baseline_Chart.png",
  new Uint8Array(await preview.arrayBuffer()),
);

console.log(outputPath);
