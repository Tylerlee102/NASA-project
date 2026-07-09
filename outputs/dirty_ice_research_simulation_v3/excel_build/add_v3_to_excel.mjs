import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = "C:/Users/tyboy/OneDrive/Documents/Nasa project";
const v3Root = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v3");
const inputWorkbook = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v21_paper_calibrated_dirty_ice_with_clutter_cleaned.xlsx"
);
const outputWorkbook = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v22_paper_calibrated_dirty_ice_v3_confidence.xlsx"
);
const previewDir = path.join(v3Root, "excel_build/previews");

const files = {
  confidenceSummary: path.join(v3Root, "paper_calibrated_v3_confidence_summary.csv"),
  pointConfidence: path.join(v3Root, "paper_calibrated_v3_point_confidence.csv"),
  uncertainty: path.join(v3Root, "paper_calibrated_v3_uncertainty_ranges.csv"),
  crossInstrument: path.join(v3Root, "paper_calibrated_v3_cross_instrument_evidence.csv"),
  caseStudies: path.join(v3Root, "paper_calibrated_v3_false_ocean_case_studies.csv"),
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
  purpleLight: "#F1EDFA",
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

function clearSheet(workbook, name) {
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

function title(sheet, text, note, colEnd = "N") {
  try {
    sheet.getRange(`A1:${colEnd}2`).unmerge();
  } catch {}
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
}

function addTable(sheet, startRow, startCol, headers, rows, tableName) {
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? null))];
  writeMatrix(sheet, startRow, startCol, matrix);
  const address = rangeAddress(startRow, startCol, matrix.length, headers.length);
  const table = sheet.tables.add(address, true, tableName);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  return { address, rowCount: matrix.length, colCount: headers.length };
}

function formatScoreRange(sheet, startRow, col, rowCount) {
  if (rowCount <= 1) return;
  const range = sheet.getRangeByIndexes(startRow + 1, col, rowCount - 1, 1);
  range.setNumberFormat("0.0");
}

function pct(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function findRow(rows, filters) {
  return rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
}

function addDashboard(workbook, summary, pointConfidence, uncertainty) {
  const sheet = clearSheet(workbook, "V3_Dashboard");
  title(
    sheet,
    "V3 Confidence Layer",
    "Paper-calibrated interpretation layer: radar echoes are scored by ocean margin, false-layer risk, clutter risk, material ambiguity, band depth window, and cross-band support."
  );
  setColWidths(sheet, [155, 105, 110, 115, 115, 115, 120, 360, 28, 155, 110, 115, 120, 120]);

  const totalRows = pointConfidence.length;
  const highRows = pointConfidence.filter((row) => row.v3_interpretation === "high-confidence ocean candidate").length;
  const moderateRows = pointConfidence.filter((row) => row.v3_interpretation === "moderate-confidence ocean candidate").length;
  const falseRows = pointConfidence.filter((row) =>
    ["ambiguous", "likely_false_boundary", "surface_clutter"].includes(String(row.v3_broad_outcome))
  ).length;
  const cleanHf = findRow(summary, {
    shell_mode: "workbook_mid_shell",
    scenario: "clean_ice_control",
    band: "HF_9MHz_full_depth",
  });
  const worst = [...summary]
    .filter((row) => row.shell_mode === "workbook_mid_shell")
    .sort((a, b) => Number(b.ambiguous_or_false_pct ?? 0) - Number(a.ambiguous_or_false_pct ?? 0))[0];

  const cards = [
    ["Point-confidence rows", totalRows, "rows", palette.blueLight],
    ["High-confidence ocean", pct(highRows, totalRows), "share", palette.greenLight],
    ["Moderate + high ocean", pct(highRows + moderateRows, totalRows), "share", palette.greenLight],
    ["Ambiguous/false/clutter", pct(falseRows, totalRows), "share", palette.redLight],
    ["Clean HF mid-shell score", cleanHf?.median_ocean_confidence_score ?? null, "0-100", palette.blueLight],
    ["Worst mid-shell ambiguity", `${worst?.scenario_label ?? "n/a"} / ${worst?.band ?? "n/a"}`, "scenario", palette.orangeLight],
  ];

  cards.forEach((card, index) => {
    const row = 3 + Math.floor(index / 3) * 3;
    const col = (index % 3) * 3;
    const range = sheet.getRangeByIndexes(row, col, 2, 2);
    range.merge();
    range.values = [[card[0]]];
    range.format = {
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

  const focus = summary
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
    "Top risk location",
    "Takeaway",
  ];
  const riskRows = focus.map((row) => ({
    Scenario: row.scenario_label,
    Band: row.band,
    "Median score": row.median_ocean_confidence_score,
    "Moderate/high ocean %": Number(row.moderate_or_high_ocean_pct) / 100,
    "Ambiguous/false %": Number(row.ambiguous_or_false_pct) / 100,
    "Not interpretable %": Number(row.not_interpretable_pct) / 100,
    "Top risk location": row.strongest_risk_x_km,
    Takeaway: row.main_takeaway,
  }));
  writeMatrix(sheet, 10, 0, [riskHeaders, ...riskRows.map((row) => riskHeaders.map((header) => row[header]))]);
  styleHeader(sheet.getRange("A11:H11"), palette.blue);
  styleBlock(sheet.getRange(`A12:H${11 + riskRows.length}`), palette.panel);
  sheet.getRange(`D12:F${11 + riskRows.length}`).setNumberFormat("0.0%");
  sheet.getRange(`C12:C${11 + riskRows.length}`).setNumberFormat("0.0");
  sheet.getRange(`H12:H${11 + riskRows.length}`).format.wrapText = true;
  sheet.getRange(`A12:H${11 + riskRows.length}`).format.rowHeightPx = 34;

  const hfRows = summary
    .filter((row) => row.shell_mode === "workbook_mid_shell" && row.band === "HF_9MHz_full_depth")
    .sort((a, b) => scenarioOrder.indexOf(a.scenario) - scenarioOrder.indexOf(b.scenario));
  const chartHeaders = ["Scenario", "Median confidence", "Ambiguous/false %"];
  const chartRows = hfRows.map((row) => [
    row.scenario_label,
    row.median_ocean_confidence_score,
    Number(row.ambiguous_or_false_pct) / 100,
  ]);
  writeMatrix(sheet, 10, 9, [chartHeaders, ...chartRows]);
  styleHeader(sheet.getRange(`J11:L11`), palette.purple);
  styleBlock(sheet.getRange(`J12:L${11 + chartRows.length}`), palette.panel);
  sheet.getRange(`K12:K${11 + chartRows.length}`).setNumberFormat("0.0");
  sheet.getRange(`L12:L${11 + chartRows.length}`).setNumberFormat("0.0%");
  const chart = sheet.charts.add("bar", sheet.getRange(`J11:L${11 + chartRows.length}`));
  chart.title = "HF 9 MHz Mid-Shell Confidence vs Ambiguity";
  chart.hasLegend = true;
  chart.xAxis = { axisType: "textAxis" };
  chart.setPosition("I22", "N41");

  const uncertaintyFocus = uncertainty.filter(
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

  const sourceRows = [
    ["Source", "Location"],
    ["V3 point confidence", "outputs/dirty_ice_research_simulation_v3/paper_calibrated_v3_point_confidence.csv"],
    ["V3 scoring caveat", "Sensitivity decision aid, not real REASON Europa data and not a NASA mission processor."],
    ["REASON paper", "https://link.springer.com/article/10.1007/s11214-024-01072-3"],
    ["NASA instrument context", "https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/"],
  ];
  sourceRows.forEach((row, index) => {
    const excelRow = 45 + index;
    sheet.getRange(`A${excelRow}`).values = [[row[0]]];
    sheet.getRange(`B${excelRow}:H${excelRow}`).merge();
    sheet.getRange(`B${excelRow}`).values = [[row[1]]];
  });
  styleHeader(sheet.getRange("A45:H45"), palette.dark);
  styleBlock(sheet.getRange("A46:H49"), palette.surface);
  sheet.freezePanes.freezeRows(2);
}

function addSummarySheet(workbook, summary) {
  const sheet = clearSheet(workbook, "V3_Confidence");
  const headers = Object.keys(summary[0]);
  const { rowCount } = addTable(sheet, 0, 0, headers, summary, "V3ConfidenceSummaryTable");
  styleHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length), palette.blue);
  setColWidths(sheet, headers.map((h) => (h.includes("takeaway") ? 370 : h.length > 24 ? 155 : 120)));
  formatScoreRange(sheet, 0, headers.indexOf("median_ocean_confidence_score"), rowCount);
  ["high_confidence_ocean_pct", "moderate_or_high_ocean_pct", "ambiguous_or_false_pct", "not_interpretable_pct"].forEach(
    (header) => {
      const index = headers.indexOf(header);
      if (index >= 0) sheet.getRangeByIndexes(1, index, rowCount - 1, 1).setNumberFormat("0.0");
    }
  );
  sheet.freezePanes.freezeRows(1);
}

function addUncertaintySheet(workbook, uncertainty) {
  const sheet = clearSheet(workbook, "V3_Uncertainty");
  const headers = Object.keys(uncertainty[0]);
  const { rowCount } = addTable(sheet, 0, 0, headers, uncertainty, "V3UncertaintyTable");
  styleHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length), palette.orange);
  setColWidths(sheet, headers.map((h) => (h.includes("note") ? 330 : h.length > 24 ? 155 : 118)));
  ["median_ocean_confidence_score", "p10_ocean_confidence_score", "p90_ocean_confidence_score"].forEach((header) => {
    const index = headers.indexOf(header);
    if (index >= 0) sheet.getRangeByIndexes(1, index, rowCount - 1, 1).setNumberFormat("0.0");
  });
  sheet.freezePanes.freezeRows(1);
}

function addPointConfidenceSheet(workbook, points) {
  const sheet = clearSheet(workbook, "V3_Point_Confidence");
  const headers = Object.keys(points[0]);
  const { rowCount } = addTable(sheet, 0, 0, headers, points, "V3PointConfidenceTable");
  styleHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length), palette.blue);
  setColWidths(
    sheet,
    headers.map((h) => {
      if (h === "band_role" || h === "v3_interpretation" || h === "layer_source_statuses") return 260;
      if (h.includes("risk") || h.includes("score") || h.includes("margin")) return 115;
      if (h.includes("depth") || h.includes("height")) return 110;
      return 105;
    })
  );
  const scoreIndex = headers.indexOf("ocean_confidence_score_0_100");
  if (scoreIndex >= 0) sheet.getRangeByIndexes(1, scoreIndex, rowCount - 1, 1).setNumberFormat("0.0");
  sheet.freezePanes.freezeRows(1);
}

function addCaseStudiesSheet(workbook, cases) {
  const sheet = clearSheet(workbook, "V3_Case_Studies");
  title(
    sheet,
    "V3 False-Ocean Case Studies",
    "Representative points from the simulation showing clean ocean, false-boundary, clutter, attenuation-hidden, and near-tie ambiguity cases.",
    "Q"
  );
  const headers = Object.keys(cases[0]);
  const { rowCount } = addTable(sheet, 3, 0, headers, cases, "V3CaseStudiesTable");
  styleHeader(sheet.getRangeByIndexes(3, 0, 1, headers.length), palette.red);
  setColWidths(
    sheet,
    headers.map((h) => {
      if (h === "scientific_question" || h === "why_it_matters") return 360;
      if (h === "v3_interpretation" || h === "case_name") return 210;
      return h.length > 24 ? 140 : 105;
    })
  );
  sheet.getRangeByIndexes(4, headers.indexOf("scientific_question"), rowCount - 1, 1).format.wrapText = true;
  sheet.getRangeByIndexes(4, headers.indexOf("why_it_matters"), rowCount - 1, 1).format.wrapText = true;
  sheet.getRangeByIndexes(4, 0, rowCount - 1, headers.length).format.rowHeightPx = 42;
  sheet.freezePanes.freezeRows(4);
}

function addCrossInstrumentSheet(workbook, evidence) {
  const sheet = clearSheet(workbook, "V3_Cross_Instrument");
  title(
    sheet,
    "V3 Cross-Instrument Evidence",
    "How other Europa Clipper measurements could strengthen or weaken a radar-ocean interpretation.",
    "H"
  );
  const headers = Object.keys(evidence[0]);
  const { rowCount } = addTable(sheet, 3, 0, headers, evidence, "V3CrossInstrumentTable");
  styleHeader(sheet.getRangeByIndexes(3, 0, 1, headers.length), palette.green);
  setColWidths(sheet, [165, 150, 260, 310, 310, 250, 155, 310]);
  sheet.getRangeByIndexes(4, 2, rowCount - 1, 4).format.wrapText = true;
  sheet.freezePanes.freezeRows(4);
}

async function main() {
  await fs.mkdir(previewDir, { recursive: true });
  const [summary, points, uncertainty, evidence, cases] = await Promise.all([
    readCsvRecords(files.confidenceSummary),
    readCsvRecords(files.pointConfidence),
    readCsvRecords(files.uncertainty),
    readCsvRecords(files.crossInstrument),
    readCsvRecords(files.caseStudies),
  ]);

  const input = await FileBlob.load(inputWorkbook);
  const workbook = await SpreadsheetFile.importXlsx(input);

  addDashboard(workbook, summary, points, uncertainty);
  addSummarySheet(workbook, summary);
  addUncertaintySheet(workbook, uncertainty);
  addCaseStudiesSheet(workbook, cases);
  addCrossInstrumentSheet(workbook, evidence);
  addPointConfidenceSheet(workbook, points);

  const dashboardPreview = await workbook.render({
    sheetName: "V3_Dashboard",
    range: "A1:N50",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, "v3_dashboard.png"),
    new Uint8Array(await dashboardPreview.arrayBuffer())
  );
  const casesPreview = await workbook.render({
    sheetName: "V3_Case_Studies",
    range: "A1:Q11",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(path.join(previewDir, "v3_case_studies.png"), new Uint8Array(await casesPreview.arrayBuffer()));

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
        summaryRows: summary.length,
        pointRows: points.length,
        uncertaintyRows: uncertainty.length,
        evidenceRows: evidence.length,
        caseRows: cases.length,
        errorScan: errorScan.ndjson,
      },
      null,
      2
    )
  );
}

await main();
