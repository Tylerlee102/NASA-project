import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = "C:/Users/tyboy/OneDrive/Documents/Nasa project";
const v2Root = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v2");
const v3Root = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v3");
const inputWorkbook = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v22_paper_calibrated_dirty_ice_v3_confidence.xlsx"
);
const outputWorkbook = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v24_paper_calibrated_dirty_ice_v3_complete_reordered.xlsx"
);
const previewDir = path.join(v3Root, "excel_build/previews");

const files = {
  v3Summary: path.join(v3Root, "paper_calibrated_v3_confidence_summary.csv"),
  v3Points: path.join(v3Root, "paper_calibrated_v3_point_confidence.csv"),
  v3Uncertainty: path.join(v3Root, "paper_calibrated_v3_uncertainty_ranges.csv"),
  v3Evidence: path.join(v3Root, "paper_calibrated_v3_cross_instrument_evidence.csv"),
  v3Cases: path.join(v3Root, "paper_calibrated_v3_false_ocean_case_studies.csv"),
  v2Summary: path.join(v2Root, "paper_calibrated_v2_summary.csv"),
  v2Sensitivity: path.join(v2Root, "paper_calibrated_v2_attenuation_sensitivity.csv"),
};

const palette = {
  ink: "#1F2430",
  muted: "#667085",
  grid: "#DDE3EE",
  surface: "#F7F9FC",
  panel: "#FFFFFF",
  dark: "#2E3440",
  blue: "#3F6FB5",
  blueLight: "#EAF1FE",
  green: "#4C8B5F",
  greenLight: "#EAF7EC",
  orange: "#B96B3C",
  orangeLight: "#FFF2CC",
  red: "#A84E4E",
  redLight: "#FDECEC",
  purple: "#6F5EA8",
};

const scenarioOrder = [
  "clean_ice_control",
  "salt_layers_reason",
  "near_surface_brine",
  "warm_impure_ice",
  "briny_mushy_lens",
  "stacked_dirty_layers",
  "complex_paper_calibrated",
  "rough_surface_clutter",
  "complex_with_clutter",
];

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).trim();
  if (text === "") return null;
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);
  if (text === "True") return true;
  if (text === "False") return false;
  return value;
}

async function readCsvRecords(filePath) {
  const csvText = await fs.readFile(filePath, "utf8");
  const csvWorkbook = await Workbook.fromCSV(csvText, { sheetName: "CSV" });
  const sheet = csvWorkbook.worksheets.getItem("CSV");
  const matrix = sheet.getUsedRange(true).values;
  const headers = matrix[0].map((header) => String(header));
  return matrix.slice(1).map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      out[header] = normalizeValue(row[index]);
    });
    return out;
  });
}

function colName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function rangeAddress(startRow, startCol, rowCount, colCount) {
  const first = `${colName(startCol)}${startRow + 1}`;
  const last = `${colName(startCol + colCount - 1)}${startRow + rowCount}`;
  return `${first}:${last}`;
}

function writeMatrix(sheet, startRow, startCol, matrix) {
  if (!matrix.length || !matrix[0].length) return null;
  const range = sheet.getRangeByIndexes(startRow, startCol, matrix.length, matrix[0].length);
  range.values = matrix;
  return range;
}

function styleHeader(range, fill = palette.blue) {
  range.format = {
    fill,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: palette.grid },
  };
}

function styleBlock(range, fill = palette.panel) {
  range.format = {
    fill,
    borders: { preset: "all", style: "thin", color: palette.grid },
    wrapText: true,
  };
}

function setColWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function prepareSheet(workbook, name) {
  const sheet = workbook.worksheets.getOrAdd(name);
  try {
    for (const table of sheet.tables.items ?? []) table.delete();
  } catch {}
  try {
    sheet.deleteAllDrawings();
  } catch {}
  try {
    const used = sheet.getUsedRange();
    if (used) used.clear({ applyTo: "all" });
  } catch {}
  sheet.showGridLines = false;
  return sheet;
}

function title(sheet, text, note, colEnd = "N") {
  sheet.getRange(`A1:${colEnd}1`).merge();
  sheet.getRange("A1").values = [[text]];
  sheet.getRange("A1").format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF", size: 18 },
  };
  sheet.getRange(`A2:${colEnd}2`).merge();
  sheet.getRange("A2").values = [[note]];
  sheet.getRange("A2").format = { fill: palette.surface, font: { color: palette.muted }, wrapText: true };
  sheet.getRange("A1").format.rowHeightPx = 30;
  sheet.getRange("A2").format.rowHeightPx = 42;
  sheet.showGridLines = false;
}

function addTable(sheet, startRow, startCol, headers, rows, tableName, style = "TableStyleMedium2") {
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? null))];
  writeMatrix(sheet, startRow, startCol, matrix);
  const address = rangeAddress(startRow, startCol, matrix.length, headers.length);
  const table = sheet.tables.add(address, true, tableName);
  table.style = style;
  table.showFilterButton = true;
  return { address, rowCount: matrix.length, colCount: headers.length };
}

function addSection(sheet, startRow, titleText, headers, rows, tableName, color = palette.blue) {
  sheet.getRangeByIndexes(startRow, 0, 1, Math.min(headers.length, 10)).merge();
  sheet.getRangeByIndexes(startRow, 0, 1, 1).values = [[titleText]];
  sheet.getRangeByIndexes(startRow, 0, 1, Math.min(headers.length, 10)).format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF" },
  };
  const tableStart = startRow + 2;
  const result = addTable(sheet, tableStart, 0, headers, rows, tableName);
  styleHeader(sheet.getRangeByIndexes(tableStart, 0, 1, headers.length), color);
  return tableStart + result.rowCount + 3;
}

function pct(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function addMainGraphs(workbook, data) {
  const sheet = prepareSheet(workbook, "00_MAIN_GRAPHS");
  title(
    sheet,
    "Europa Dirty-Ice Radar v3 - Main Graphs",
    "Front-page view only: confidence, ambiguity, clutter, and false-boundary risk. Detailed numbers are consolidated on 01_ALL_NUMBERS."
  );
  setColWidths(sheet, [170, 105, 110, 115, 115, 115, 135, 360, 28, 170, 120, 125, 125, 120]);

  const totalRows = data.v3Points.length;
  const highRows = data.v3Points.filter((row) => row.v3_interpretation === "high-confidence ocean candidate").length;
  const moderateRows = data.v3Points.filter((row) => row.v3_interpretation === "moderate-confidence ocean candidate").length;
  const falseRows = data.v3Points.filter((row) =>
    ["ambiguous", "likely_false_boundary", "surface_clutter"].includes(String(row.v3_broad_outcome))
  ).length;
  const cleanHf = data.v3Summary.find(
    (row) =>
      row.shell_mode === "workbook_mid_shell" &&
      row.scenario === "clean_ice_control" &&
      row.band === "HF_9MHz_full_depth"
  );
  const worst = [...data.v3Summary]
    .filter((row) => row.shell_mode === "workbook_mid_shell")
    .sort((a, b) => Number(b.ambiguous_or_false_pct ?? 0) - Number(a.ambiguous_or_false_pct ?? 0))[0];

  const cards = [
    ["Point-confidence rows", totalRows, "rows", palette.blueLight],
    ["High-confidence ocean", pct(highRows, totalRows), "share", palette.greenLight],
    ["Moderate + high ocean", pct(highRows + moderateRows, totalRows), "share", palette.greenLight],
    ["Ambiguous/false/clutter", pct(falseRows, totalRows), "share", palette.redLight],
    ["Clean HF score", cleanHf?.median_ocean_confidence_score ?? null, "0-100", palette.blueLight],
    ["Worst mid-shell ambiguity", `${worst?.scenario_label ?? "n/a"} / ${worst?.band ?? "n/a"}`, "scenario", palette.orangeLight],
  ];
  cards.forEach((card, index) => {
    const row = 3 + Math.floor(index / 3) * 3;
    const col = (index % 3) * 3;
    const labelRange = sheet.getRangeByIndexes(row, col, 2, 2);
    labelRange.merge();
    labelRange.values = [[card[0]]];
    labelRange.format = {
      fill: palette.dark,
      font: { bold: true, color: "#FFFFFF" },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: palette.grid },
    };
    const valueRange = sheet.getRangeByIndexes(row + 2, col, 1, 2);
    valueRange.merge();
    valueRange.values = [[card[1]]];
    valueRange.format = {
      fill: card[3],
      font: { bold: true, color: palette.ink, size: 13 },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: palette.grid },
    };
    if (card[2] === "share") valueRange.setNumberFormat("0.0%");
    if (card[2] === "0-100") valueRange.setNumberFormat("0.0");
  });

  const focus = data.v3Summary
    .filter((row) => row.shell_mode === "workbook_mid_shell")
    .sort((a, b) => {
      const aRisk = Number(a.ambiguous_or_false_pct ?? 0) + Number(a.not_interpretable_pct ?? 0);
      const bRisk = Number(b.ambiguous_or_false_pct ?? 0) + Number(b.not_interpretable_pct ?? 0);
      return bRisk - aRisk;
    })
    .slice(0, 9);
  const riskHeaders = [
    "Scenario",
    "Band",
    "Median score",
    "Moderate/high ocean %",
    "Ambiguous/false %",
    "Not interpretable %",
    "Top risk x_km",
    "Takeaway",
  ];
  const riskRows = focus.map((row) => ({
    Scenario: row.scenario_label,
    Band: row.band,
    "Median score": row.median_ocean_confidence_score,
    "Moderate/high ocean %": Number(row.moderate_or_high_ocean_pct) / 100,
    "Ambiguous/false %": Number(row.ambiguous_or_false_pct) / 100,
    "Not interpretable %": Number(row.not_interpretable_pct) / 100,
    "Top risk x_km": row.strongest_risk_x_km,
    Takeaway: row.main_takeaway,
  }));
  writeMatrix(sheet, 10, 0, [riskHeaders, ...riskRows.map((row) => riskHeaders.map((header) => row[header]))]);
  styleHeader(sheet.getRange("A11:H11"), palette.blue);
  styleBlock(sheet.getRange(`A12:H${11 + riskRows.length}`), palette.panel);
  sheet.getRange(`D12:F${11 + riskRows.length}`).setNumberFormat("0.0%");
  sheet.getRange(`C12:C${11 + riskRows.length}`).setNumberFormat("0.0");
  sheet.getRange(`A12:H${11 + riskRows.length}`).format.rowHeightPx = 34;

  const hfRows = data.v3Summary
    .filter((row) => row.shell_mode === "workbook_mid_shell" && row.band === "HF_9MHz_full_depth")
    .sort((a, b) => scenarioOrder.indexOf(a.scenario) - scenarioOrder.indexOf(b.scenario));
  const categories = hfRows.map((row) => row.scenario_label);
  const chart = sheet.charts.add("bar", {
    title: "HF 9 MHz Mid-Shell Confidence vs Ambiguity",
    categories,
    series: [
      { name: "Median confidence", values: hfRows.map((row) => Number(row.median_ocean_confidence_score ?? 0)) },
      { name: "Ambiguous/false %", values: hfRows.map((row) => Number(row.ambiguous_or_false_pct ?? 0)) },
    ],
    hasLegend: true,
    from: { row: 21, col: 8 },
    extent: { widthPx: 620, heightPx: 340 },
  });
  chart.xAxis = { axisType: "textAxis", tickLabelInterval: 1 };

  const uncertaintyFocus = data.v3Uncertainty.filter(
    (row) =>
      row.shell_mode === "workbook_mid_shell" &&
      row.scenario === "complex_paper_calibrated" &&
      row.band === "HF_9MHz_full_depth"
  );
  const uHeaders = ["Assumption case", "Median score", "Moderate/high ocean %", "Ambiguous/false %", "Not interpretable %"];
  const uRows = uncertaintyFocus.map((row) => ({
    "Assumption case": row.assumption_case,
    "Median score": row.median_ocean_confidence_score,
    "Moderate/high ocean %": Number(row.moderate_or_high_ocean_pct) / 100,
    "Ambiguous/false %": Number(row.ambiguous_or_false_pct) / 100,
    "Not interpretable %": Number(row.not_interpretable_pct) / 100,
  }));
  writeMatrix(sheet, 26, 0, [uHeaders, ...uRows.map((row) => uHeaders.map((header) => row[header]))]);
  styleHeader(sheet.getRange("A27:E27"), palette.orange);
  styleBlock(sheet.getRange(`A28:E${27 + uRows.length}`), palette.panel);
  sheet.getRange(`B28:B${27 + uRows.length}`).setNumberFormat("0.0");
  sheet.getRange(`C28:E${27 + uRows.length}`).setNumberFormat("0.0%");

  const caseHeaders = ["case_name", "scenario", "band", "v3_confidence_score_0_100", "v3_interpretation"];
  writeMatrix(sheet, 33, 0, [
    ["Case study", "Scenario", "Band", "Score", "Interpretation"],
    ...data.v3Cases.map((row) => caseHeaders.map((header) => row[header])),
  ]);
  styleHeader(sheet.getRange("A34:E34"), palette.red);
  styleBlock(sheet.getRange(`A35:E${34 + data.v3Cases.length}`), palette.panel);
  sheet.getRange(`D35:D${34 + data.v3Cases.length}`).setNumberFormat("0.0");
  sheet.freezePanes.freezeRows(2);
}

function addAllNumbers(workbook, data) {
  const sheet = prepareSheet(workbook, "01_ALL_NUMBERS");
  title(
    sheet,
    "All Numbers",
    "Every numeric output is consolidated here: v3 confidence summary, uncertainty cases, case studies, v2 scenario numbers, attenuation sensitivity, and full point-confidence data.",
    "H"
  );
  setColWidths(sheet, Array.from({ length: 31 }, (_, index) => (index < 8 ? 135 : 115)));

  let row = 4;
  const indexRows = [
    ["Section", "What is here"],
    ["V3 confidence summary", "Scenario x shell x band confidence and risk summary."],
    ["V3 uncertainty ranges", "Optimistic, nominal, and pessimistic confidence cases."],
    ["V3 false-ocean case studies", "Representative clean, false-layer, clutter, weak, internal, and near-tie cases."],
    ["V2 scenario summary", "Original v2 outcome percentages and radar-band behavior."],
    ["V2 attenuation sensitivity", "Dirty-layer attenuation/thickness sensitivity grid."],
    ["V3 point confidence", "Full one-row-per-point confidence table, 19,521 rows."],
  ];
  writeMatrix(sheet, row, 0, indexRows);
  styleHeader(sheet.getRangeByIndexes(row, 0, 1, 2), palette.dark);
  styleBlock(sheet.getRangeByIndexes(row + 1, 0, indexRows.length - 1, 2), palette.surface);
  row += indexRows.length + 3;

  row = addSection(sheet, row, "V3 confidence summary", Object.keys(data.v3Summary[0]), data.v3Summary, "AllV3ConfidenceSummary", palette.blue);
  row = addSection(sheet, row, "V3 uncertainty ranges", Object.keys(data.v3Uncertainty[0]), data.v3Uncertainty, "AllV3Uncertainty", palette.orange);
  row = addSection(sheet, row, "V3 false-ocean case studies", Object.keys(data.v3Cases[0]), data.v3Cases, "AllV3Cases", palette.red);
  row = addSection(sheet, row, "V2 scenario summary", Object.keys(data.v2Summary[0]), data.v2Summary, "AllV2ScenarioSummary", palette.purple);
  row = addSection(
    sheet,
    row,
    "V2 attenuation sensitivity",
    Object.keys(data.v2Sensitivity[0]),
    data.v2Sensitivity,
    "AllV2Sensitivity",
    palette.green
  );
  row = addSection(sheet, row, "V3 point confidence", Object.keys(data.v3Points[0]), data.v3Points, "AllV3PointConfidence", palette.blue);

  sheet.freezePanes.freezeRows(3);
}

function addDetails(workbook, data) {
  const sheet = prepareSheet(workbook, "02_DETAILS_SOURCES");
  title(
    sheet,
    "Details and Sources",
    "Scoring logic, confidence interpretation guide, cross-instrument evidence, and source links.",
    "H"
  );
  setColWidths(sheet, [190, 230, 300, 330, 330, 260, 170, 320]);

  writeMatrix(sheet, 4, 0, [
    ["Score / label", "Meaning"],
    ["High-confidence ocean candidate", "The ocean return is strong and not strongly challenged by false-layer, clutter, band-window, or material-risk checks."],
    ["Moderate-confidence ocean candidate", "The ocean return is plausible, but needs cross-band or cross-instrument support."],
    ["Ambiguous ocean vs internal layer", "A false/internal reflector is close enough in strength to confuse the ocean interpretation."],
    ["Likely false/internal boundary", "A non-ocean reflector is stronger or more convincing than the ocean echo under current assumptions."],
    ["Likely surface-clutter echo", "The VHF shallow feature is better explained by rough-surface clutter than a true subsurface target."],
    ["Too weak / outside depth window", "This band or scenario should not be treated as a reliable ocean-depth call."],
  ]);
  styleHeader(sheet.getRange("A5:B5"), palette.blue);
  styleBlock(sheet.getRange("A6:B11"), palette.panel);

  writeMatrix(sheet, 13, 0, [
    ["Risk component", "Used for"],
    ["Ocean SNR margin", "How far above or below the detection threshold the ocean return sits."],
    ["False-layer risk", "Whether an internal dirty/briny/salt/void layer can imitate or dominate the ocean echo."],
    ["Surface-clutter risk", "Whether rough terrain can create a misleading VHF shallow return."],
    ["Material ambiguity", "Whether composition/dirty ice makes radar interpretation less unique."],
    ["Band-window penalty", "Whether that radar mode is expected to see the ocean depth at all."],
    ["Cross-band support", "Whether other REASON band behavior supports or contradicts the interpretation."],
  ]);
  styleHeader(sheet.getRange("A14:B14"), palette.orange);
  styleBlock(sheet.getRange("A15:B20"), palette.panel);

  const evidenceHeaders = Object.keys(data.v3Evidence[0]);
  addTable(sheet, 4, 3, evidenceHeaders, data.v3Evidence, "DetailsCrossInstrument");
  styleHeader(sheet.getRangeByIndexes(4, 3, 1, evidenceHeaders.length), palette.green);
  sheet.getRangeByIndexes(5, 5, data.v3Evidence.length, 3).format.wrapText = true;

  writeMatrix(sheet, 23, 0, [
    ["Source", "Location"],
    ["NASA Europa Clipper instruments", "https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/"],
    ["REASON 2024 paper", "https://link.springer.com/article/10.1007/s11214-024-01072-3"],
    ["V3 point confidence CSV", "outputs/dirty_ice_research_simulation_v3/paper_calibrated_v3_point_confidence.csv"],
    ["V3 caveat", "Sensitivity decision aid, not real REASON Europa data and not a NASA mission processor."],
  ]);
  styleHeader(sheet.getRange("A24:B24"), palette.dark);
  styleBlock(sheet.getRange("A25:B28"), palette.surface);
  sheet.freezePanes.freezeRows(3);
}

async function main() {
  await fs.mkdir(previewDir, { recursive: true });
  const [
    v3Summary,
    v3Points,
    v3Uncertainty,
    v3Evidence,
    v3Cases,
    v2Summary,
    v2Sensitivity,
  ] = await Promise.all([
    readCsvRecords(files.v3Summary),
    readCsvRecords(files.v3Points),
    readCsvRecords(files.v3Uncertainty),
    readCsvRecords(files.v3Evidence),
    readCsvRecords(files.v3Cases),
    readCsvRecords(files.v2Summary),
    readCsvRecords(files.v2Sensitivity),
  ]);

  const input = await FileBlob.load(inputWorkbook);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const data = { v3Summary, v3Points, v3Uncertainty, v3Evidence, v3Cases, v2Summary, v2Sensitivity };
  addMainGraphs(workbook, data);
  addAllNumbers(workbook, data);
  addDetails(workbook, data);

  const mainPreview = await workbook.render({ sheetName: "00_MAIN_GRAPHS", range: "A1:N42", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, "v24_complete_main_graphs.png"), new Uint8Array(await mainPreview.arrayBuffer()));
  const numbersPreview = await workbook.render({ sheetName: "01_ALL_NUMBERS", range: "A1:H24", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, "v24_complete_all_numbers_top.png"), new Uint8Array(await numbersPreview.arrayBuffer()));

  const errorScan = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    maxChars: 12000,
  });

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputWorkbook);
  console.log(
    JSON.stringify(
      {
        outputWorkbook,
        sheets: ["00_MAIN_GRAPHS", "01_ALL_NUMBERS", "02_DETAILS_SOURCES"],
        pointRows: v3Points.length,
        errorScan: errorScan.ndjson,
      },
      null,
      2
    )
  );
}

await main();
