import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = "C:/Users/tyboy/OneDrive/Documents/Nasa project";
const v2Root = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v2");
const workbookPath = path.join(projectRoot, "outputs/europa_ice_subsurface_simulation/v19.xlsx");
const outputPath = path.join(projectRoot, "outputs/europa_ice_subsurface_simulation/v20_paper_calibrated_dirty_ice_with_clutter.xlsx");
const previewDir = path.join(v2Root, "excel_build/previews");

const files = {
  summary: path.join(v2Root, "paper_calibrated_v2_summary.csv"),
  results: path.join(v2Root, "paper_calibrated_v2_results.csv"),
  sensitivity: path.join(v2Root, "paper_calibrated_v2_attenuation_sensitivity.csv"),
  calibration: path.join(v2Root, "paper_calibration_parameters.csv"),
  materials: path.join(v2Root, "paper_material_library.csv"),
  validation: path.join(v2Root, "physics_validation_checks.csv"),
};

const palette = {
  ink: "#1F2430",
  muted: "#6F768A",
  grid: "#DDE3EE",
  surface: "#F7F9FC",
  panel: "#FFFFFF",
  blue: "#5477C4",
  blueLight: "#EAF1FE",
  orange: "#CC6F47",
  orangeLight: "#FFEDDE",
  olive: "#71B436",
  oliveLight: "#D8ECBD",
  pink: "#BD569B",
  pinkLight: "#FCDAD6",
  gold: "#B8A037",
  goldLight: "#FFF4C2",
  neutral: "#E2E5EA",
  dark: "#2E3440",
};

const hfScenarioOrder = [
  "clean_ice_control",
  "salt_layers_reason",
  "near_surface_brine",
  "warm_impure_ice",
  "briny_mushy_lens",
  "stacked_dirty_layers",
  "complex_paper_calibrated",
];

const clutterScenarioOrder = [
  "clean_ice_control",
  "rough_surface_clutter",
  "complex_paper_calibrated",
  "complex_with_clutter",
];

const scenarioLabels = {
  clean_ice_control: "Clean ice",
  salt_layers_reason: "Salt layers",
  near_surface_brine: "Near-surface brine",
  warm_impure_ice: "Warm impure ice",
  briny_mushy_lens: "Briny/mushy lens",
  stacked_dirty_layers: "Stacked dirty layers",
  complex_paper_calibrated: "Complex dirty ice",
  rough_surface_clutter: "Rough surface clutter",
  complex_with_clutter: "Complex + clutter",
};

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
  const headers = matrix[0].map((h) => String(h));
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

function sheetRef(sheetName, range) {
  return `'${sheetName}'!${range}`;
}

function aggregateFormula(metricColumn, scenario, band) {
  const valueRange = `V2_Summary!$${metricColumn}$2:$${metricColumn}$82`;
  const shellRange = "V2_Summary!$A$2:$A$82";
  const scenarioRange = "V2_Summary!$B$2:$B$82";
  const bandRange = "V2_Summary!$C$2:$C$82";
  const criteria = `${shellRange},"workbook_mid_shell",${scenarioRange},"${scenario}",${bandRange},"${band}"`;
  return `SUMIFS(${valueRange},${criteria})/COUNTIFS(${criteria})`;
}

function pctFormula(metricColumn, scenario, band) {
  return `=${aggregateFormula(metricColumn, scenario, band)}/100`;
}

function dbFormula(metricColumn, scenario, band) {
  return `=${aggregateFormula(metricColumn, scenario, band)}`;
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

function writeMatrix(sheet, startRow, startCol, matrix) {
  if (!matrix.length || !matrix[0].length) return null;
  const range = sheet.getRangeByIndexes(startRow, startCol, matrix.length, matrix[0].length);
  range.values = matrix;
  return range;
}

function addTable(sheet, startRow, startCol, headers, rows, tableName) {
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? null))];
  writeMatrix(sheet, startRow, startCol, matrix);
  const address = rangeAddress(startRow, startCol, matrix.length, headers.length);
  const table = sheet.tables.add(address, true, tableName);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  return { table, address, rowCount: matrix.length, colCount: headers.length };
}

function setColWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
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

function title(sheet, text, note = "") {
  try {
    sheet.getRange("A1:N2").unmerge();
  } catch {}
  const titleRange = sheet.getRange("A1:N1");
  titleRange.merge();
  titleRange.format = { fill: palette.dark, font: { bold: true, color: "#FFFFFF", size: 18 } };
  titleRange.values = [[text]];
  const noteRange = sheet.getRange("A2:N2");
  noteRange.merge();
  noteRange.format = { fill: palette.surface, font: { color: palette.muted }, wrapText: true };
  noteRange.values = [[note]];
  sheet.getRange("A1").format.rowHeightPx = 28;
  sheet.getRange("A2").format.rowHeightPx = 42;
}

function summaryLookup(records, scenario, band, column) {
  const row = records.find((item) => item.shell_mode === "workbook_mid_shell" && item.scenario === scenario && item.band === band);
  return row?.[column] ?? null;
}

function addDashboard(workbook, summary) {
  const sheet = clearSheet(workbook, "V2_Dashboard");
  title(
    sheet,
    "Paper-Calibrated Europa Radar v2",
    "Sensitivity simulation added from Python v2: attenuation, dirty-layer false boundaries, and VHF shallow clutter are tracked separately."
  );
  setColWidths(sheet, [150, 112, 112, 150, 112, 112, 150, 112, 112, 150, 112, 112, 95, 95]);

  const cards = [
    ["Clean HF ocean margin", dbFormula("Q", "clean_ice_control", "HF_9MHz_full_depth"), "dB", palette.blueLight],
    ["Stacked dirty false risk", pctFormula("M", "stacked_dirty_layers", "HF_9MHz_full_depth"), "%", palette.orangeLight],
    ["Complex weak/no deep", pctFormula("L", "complex_paper_calibrated", "HF_9MHz_full_depth"), "%", palette.goldLight],
    ["Rough VHF clutter", pctFormula("J", "rough_surface_clutter", "VHF_60MHz_shallow"), "%", palette.pinkLight],
  ];

  const cardAnchors = [
    ["A4:C7", "A4:C4", "A5:C5", "A6:C6"],
    ["D4:F7", "D4:F4", "D5:F5", "D6:F6"],
    ["G4:I7", "G4:I4", "G5:I5", "G6:I6"],
    ["J4:L7", "J4:L4", "J5:L5", "J6:L6"],
  ];
  cards.forEach((card, index) => {
    const [rangeAddressText, titleCell, valueCell, unitCell] = cardAnchors[index];
    const block = sheet.getRange(rangeAddressText);
    styleBlock(block, card[3]);
    for (const cardRangeText of [titleCell, valueCell, unitCell]) {
      try {
        sheet.getRange(cardRangeText).unmerge();
      } catch {}
      sheet.getRange(cardRangeText).merge();
    }
    sheet.getRange(titleCell).values = [[card[0]]];
    sheet.getRange(titleCell).format = { font: { bold: true, color: palette.ink }, wrapText: true };
    sheet.getRange(valueCell).formulas = [[card[1]]];
    sheet.getRange(valueCell).format = { font: { bold: true, color: palette.ink, size: 18 } };
    sheet.getRange(unitCell).values = [[card[2] === "dB" ? "dB margin" : "share of points"]];
    sheet.getRange(unitCell).format = { font: { color: palette.muted }, wrapText: true };
    if (card[2] === "%") sheet.getRange(valueCell).setNumberFormat("0.0%");
    else sheet.getRange(valueCell).setNumberFormat("0.0");
  });
  sheet.getRange("A4:L7").format.rowHeightPx = 30;

  writeMatrix(sheet, 8, 0, [["Summary note", null, null, null], ["Main interpretation", null, null, null], ["Important separation", null, null, null], ["Use limit", null, null, null]]);
  styleHeader(sheet.getRange("A9:D9"), palette.blue);
  try {
    sheet.getRange("B9:D9").unmerge();
  } catch {}
  sheet.getRange("B9:D9").merge();
  sheet.getRange("B9:D9").values = [["Interpretation"]];
  styleBlock(sheet.getRange("A10:D12"), palette.panel);
  const noteText = [
    "Dirty/warm ice can weaken the true deep ocean return; stacked dirty layers can produce deep false-boundary risk; rough surface clutter can confuse VHF shallow returns.",
    "Surface clutter is not counted as deep false-ocean risk. It is a separate VHF shallow-window ambiguity class.",
    "This is a source-backed sensitivity model, not real REASON Europa data and not final mission processing.",
  ];
  ["B10:D10", "B11:D11", "B12:D12"].forEach((rangeText, i) => {
    try {
      sheet.getRange(rangeText).unmerge();
    } catch {}
    sheet.getRange(rangeText).merge();
    sheet.getRange(rangeText).values = [[noteText[i]]];
  });
  sheet.getRange("A10:D12").format.wrapText = true;
  sheet.getRange("A10").format.rowHeightPx = 54;
  sheet.getRange("A11").format.rowHeightPx = 42;
  sheet.getRange("A12").format.rowHeightPx = 42;

  const hfStart = 14;
  const hfHeaders = ["Scenario", "Clear ocean", "Deep false risk", "Weak/no deep"];
  writeMatrix(sheet, hfStart, 0, [hfHeaders]);
  hfScenarioOrder.forEach((scenario, i) => {
    const row = hfStart + 1 + i;
    writeMatrix(sheet, row, 0, [[scenarioLabels[scenario], null, null, null]]);
    sheet.getRangeByIndexes(row, 1, 1, 3).formulas = [[
      pctFormula("E", scenario, "HF_9MHz_full_depth"),
      pctFormula("M", scenario, "HF_9MHz_full_depth"),
      pctFormula("L", scenario, "HF_9MHz_full_depth"),
    ]];
  });
  styleHeader(sheet.getRange("A15:D15"), palette.blue);
  styleBlock(sheet.getRange(`A16:D${15 + hfScenarioOrder.length}`), palette.panel);
  sheet.getRange(`B16:D${15 + hfScenarioOrder.length}`).setNumberFormat("0.0%");
  const hfChart = sheet.charts.add("bar", sheet.getRange(`A15:D${15 + hfScenarioOrder.length}`));
  hfChart.title = "HF 9 MHz Workbook-Depth Outcomes";
  hfChart.hasLegend = true;
  hfChart.xAxis = { axisType: "textAxis" };
  hfChart.yAxis = { numberFormatCode: "0%" };
  hfChart.setPosition("A25", "G43");

  const clutterStart = 14;
  const clutterHeaders = ["Scenario", "Surface clutter", "Internal feature", "Outside shallow window", "Weak/no detection"];
  writeMatrix(sheet, clutterStart, 6, [clutterHeaders]);
  clutterScenarioOrder.forEach((scenario, i) => {
    const row = clutterStart + 1 + i;
    writeMatrix(sheet, row, 6, [[scenarioLabels[scenario], null, null, null, null]]);
    sheet.getRangeByIndexes(row, 7, 1, 4).formulas = [[
      pctFormula("J", scenario, "VHF_60MHz_shallow"),
      pctFormula("I", scenario, "VHF_60MHz_shallow"),
      pctFormula("K", scenario, "VHF_60MHz_shallow"),
      pctFormula("L", scenario, "VHF_60MHz_shallow"),
    ]];
  });
  styleHeader(sheet.getRange("G15:K15"), palette.pink);
  styleBlock(sheet.getRange(`G16:K${15 + clutterScenarioOrder.length}`), palette.panel);
  sheet.getRange(`H16:K${15 + clutterScenarioOrder.length}`).setNumberFormat("0.0%");
  const clutterChart = sheet.charts.add("bar", sheet.getRange(`G15:K${15 + clutterScenarioOrder.length}`));
  clutterChart.title = "VHF 60 MHz Shallow Clutter Stress Test";
  clutterChart.hasLegend = true;
  clutterChart.xAxis = { axisType: "textAxis" };
  clutterChart.yAxis = { numberFormatCode: "0%" };
  clutterChart.setPosition("H25", "N43");

  const sourceNote = [
    ["Source CSV", "outputs/dirty_ice_research_simulation_v2/paper_calibrated_v2_summary.csv"],
    ["Report", "outputs/dirty_ice_research_simulation_v2/presentation_pack/europa_dirty_ice_v2_technical_report.html"],
    ["Main paper", "https://link.springer.com/article/10.1007/s11214-024-01072-3"],
  ];
  writeMatrix(sheet, 45, 0, [["Source", "Location"], ...sourceNote]);
  styleHeader(sheet.getRange("A46:B46"), palette.dark);
  styleBlock(sheet.getRange("A47:B49"), palette.surface);
  sheet.freezePanes.freezeRows(2);
  return sheet;
}

function addSummarySheet(workbook, summary) {
  const sheet = clearSheet(workbook, "V2_Summary");
  const headers = Object.keys(summary[0]);
  addTable(sheet, 0, 0, headers, summary, "V2SummaryTable");
  styleHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length), palette.blue);
  setColWidths(sheet, headers.map((h) => (h.includes("source") || h.includes("status") ? 230 : h.length > 24 ? 155 : 110)));
  const pctCols = ["clear_ocean_pct", "ambiguous_pct", "false_stronger_pct", "hidden_false_visible_pct", "internal_feature_only_pct", "surface_clutter_pct", "outside_band_depth_window_pct", "weak_no_deep_detection_pct", "deep_false_risk_pct", "surface_clutter_detected_pct"];
  pctCols.forEach((header) => {
    const idx = headers.indexOf(header);
    if (idx >= 0) sheet.getRangeByIndexes(1, idx, summary.length, 1).setNumberFormat("0.0");
  });
  headers.forEach((header, idx) => {
    if (header.endsWith("_db")) sheet.getRangeByIndexes(1, idx, summary.length, 1).setNumberFormat("0.0");
  });
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function addTrackExamples(workbook, results) {
  const sheet = clearSheet(workbook, "V2_Track_Examples");
  const keep = results.filter((row) => {
    if (row.shell_mode !== "workbook_mid_shell") return false;
    return (
      (row.scenario === "stacked_dirty_layers" && row.band === "HF_9MHz_full_depth") ||
      (row.scenario === "rough_surface_clutter" && row.band === "VHF_60MHz_shallow") ||
      (row.scenario === "complex_with_clutter" && row.band === "VHF_60MHz_shallow")
    );
  });
  const headers = [
    "x_km",
    "scenario",
    "band",
    "ocean_depth_m",
    "ocean_snr_margin_db",
    "false_snr_margin_db",
    "surface_clutter_snr_margin_db",
    "surface_clutter_apparent_depth_m",
    "classification",
    "inferred_depth_error_m",
    "layer_count",
    "surface_roughness_index",
  ];
  addTable(sheet, 0, 0, headers, keep, "V2TrackExamplesTable");
  styleHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length), palette.orange);
  setColWidths(sheet, [75, 175, 180, 115, 120, 120, 140, 140, 230, 135, 90, 120]);
  ["x_km", "ocean_depth_m", "surface_clutter_apparent_depth_m", "inferred_depth_error_m"].forEach((header) => {
    const idx = headers.indexOf(header);
    sheet.getRangeByIndexes(1, idx, keep.length, 1).setNumberFormat("0.0");
  });
  ["ocean_snr_margin_db", "false_snr_margin_db", "surface_clutter_snr_margin_db", "surface_roughness_index"].forEach((header) => {
    const idx = headers.indexOf(header);
    sheet.getRangeByIndexes(1, idx, keep.length, 1).setNumberFormat("0.00");
  });
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function addSensitivitySheet(workbook, sensitivity, summary) {
  const sheet = clearSheet(workbook, "V2_Sensitivity");
  title(sheet, "V2 Attenuation And Clutter Sensitivity", "Attenuation grid is for dirty-layer false-risk; clutter summary is for VHF shallow-window ambiguity.");
  const sensHeaders = Object.keys(sensitivity[0]);
  addTable(sheet, 4, 0, sensHeaders, sensitivity, "V2AttenuationSensitivityTable");
  styleHeader(sheet.getRangeByIndexes(4, 0, 1, sensHeaders.length), palette.orange);
  setColWidths(sheet, [80, 135, 170, 120, 135, 150, 150, 24, 160, 120, 120, 150, 170]);
  sensHeaders.forEach((header, idx) => {
    if (header.includes("pct")) sheet.getRangeByIndexes(5, idx, sensitivity.length, 1).setNumberFormat("0.0");
    if (header.includes("db")) sheet.getRangeByIndexes(5, idx, sensitivity.length, 1).setNumberFormat("0.0");
  });

  const clutterRows = summary
    .filter((row) => row.shell_mode === "workbook_mid_shell" && row.band === "VHF_60MHz_shallow")
    .filter((row) => clutterScenarioOrder.includes(row.scenario))
    .sort((a, b) => clutterScenarioOrder.indexOf(a.scenario) - clutterScenarioOrder.indexOf(b.scenario))
    .map((row) => ({
      scenario: scenarioLabels[row.scenario],
      surface_clutter_pct: row.surface_clutter_pct,
      internal_feature_only_pct: row.internal_feature_only_pct,
      outside_band_depth_window_pct: row.outside_band_depth_window_pct,
      median_surface_clutter_snr_margin_db: row.median_surface_clutter_snr_margin_db,
    }));
  const clutterHeaders = Object.keys(clutterRows[0]);
  addTable(sheet, 4, 8, clutterHeaders, clutterRows, "V2ClutterSummaryTable");
  styleHeader(sheet.getRangeByIndexes(4, 8, 1, clutterHeaders.length), palette.pink);
  clutterHeaders.forEach((header, idx) => {
    if (header.includes("pct")) sheet.getRangeByIndexes(5, 8 + idx, clutterRows.length, 1).setNumberFormat("0.0");
    if (header.includes("db")) sheet.getRangeByIndexes(5, 8 + idx, clutterRows.length, 1).setNumberFormat("0.0");
  });
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

function addSourcesSheet(workbook, calibration, materials, validation) {
  const sheet = clearSheet(workbook, "V2_Sources");
  title(sheet, "V2 Sources, Materials, And Validation", "Source-backed calibration table for the paper-calibrated dirty-ice and clutter sensitivity model.");
  setColWidths(sheet, [260, 140, 75, 330, 260, 220, 330]);

  const sourceRows = [
    ["NASA Europa Clipper instruments", "https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/"],
    ["Blankenship et al. 2024 REASON", "https://link.springer.com/article/10.1007/s11214-024-01072-3"],
    ["Lalich et al. 2021 radar interference analog", "https://arxiv.org/abs/2107.03497"],
    ["Castelletti et al. 2017 cross-track clutter detection", "https://doi.org/10.1109/TGRS.2017.2721433"],
    ["Scanlan et al. 2020 cross-track clutter discrimination", "https://doi.org/10.1017/aog.2020.20"],
    ["Pettinelli et al. 2015 dielectric review", "https://doi.org/10.1002/2014RG000463"],
  ];
  writeMatrix(sheet, 4, 0, [["Source anchor", "URL"], ...sourceRows]);
  styleHeader(sheet.getRange("A5:B5"), palette.dark);
  styleBlock(sheet.getRange("A6:B11"), palette.surface);

  const materialHeaders = ["key", "label", "eps_real", "attenuation_db_km_hf_min", "attenuation_db_km_hf_max", "source_status", "link"];
  addTable(sheet, 13, 0, materialHeaders, materials, "V2MaterialLibraryTable");
  styleHeader(sheet.getRangeByIndexes(13, 0, 1, materialHeaders.length), palette.blue);

  const validationHeaders = Object.keys(validation[0]);
  addTable(sheet, 24, 0, validationHeaders, validation, "V2PhysicsValidationTable");
  styleHeader(sheet.getRangeByIndexes(24, 0, 1, validationHeaders.length), palette.olive);

  const calibrationFocus = calibration.filter((row) =>
    [
      "REASON science role",
      "SNR detection threshold",
      "Clean compact ice permittivity",
      "Brine-filled ice permittivity",
      "Hydrated salt layer permittivity",
      "Attenuation variability anchor",
      "VHF off-nadir clutter mechanism",
      "VHF clutter discrimination",
      "Unresolved thin-layer solver",
    ].includes(row.parameter)
  );
  const calibrationHeaders = Object.keys(calibrationFocus[0]);
  addTable(sheet, 31, 0, calibrationHeaders, calibrationFocus, "V2CalibrationAnchorsTable");
  styleHeader(sheet.getRangeByIndexes(31, 0, 1, calibrationHeaders.length), palette.gold);
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

async function main() {
  await fs.mkdir(previewDir, { recursive: true });
  const [summary, results, sensitivity, calibration, materials, validation] = await Promise.all([
    readCsvRecords(files.summary),
    readCsvRecords(files.results),
    readCsvRecords(files.sensitivity),
    readCsvRecords(files.calibration),
    readCsvRecords(files.materials),
    readCsvRecords(files.validation),
  ]);

  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);

  addSummarySheet(workbook, summary);
  addTrackExamples(workbook, results);
  addSensitivitySheet(workbook, sensitivity, summary);
  addSourcesSheet(workbook, calibration, materials, validation);
  addDashboard(workbook, summary);

  const dashboardCheck = await workbook.inspect({
    kind: "table",
    range: "V2_Dashboard!A1:L20",
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 12,
    maxChars: 6000,
  });
  console.log(dashboardCheck.ndjson);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: "final formula error scan",
    maxChars: 4000,
  });
  console.log(errors.ndjson || "no formula errors found");

  const dashboardPreview = await workbook.render({ sheetName: "V2_Dashboard", autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, "V2_Dashboard.png"), new Uint8Array(await dashboardPreview.arrayBuffer()));
  const summaryPreview = await workbook.render({ sheetName: "V2_Summary", range: "A1:U25", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, "V2_Summary.png"), new Uint8Array(await summaryPreview.arrayBuffer()));

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  console.log(JSON.stringify({
    outputPath,
    addedSheets: ["V2_Dashboard", "V2_Summary", "V2_Track_Examples", "V2_Sensitivity", "V2_Sources"],
    headline: {
      clean_hf_margin_db: summaryLookup(summary, "clean_ice_control", "HF_9MHz_full_depth", "median_ocean_snr_margin_db"),
      stacked_hf_deep_false_risk_pct: summaryLookup(summary, "stacked_dirty_layers", "HF_9MHz_full_depth", "deep_false_risk_pct"),
      rough_vhf_clutter_pct: summaryLookup(summary, "rough_surface_clutter", "VHF_60MHz_shallow", "surface_clutter_pct"),
      complex_vhf_clutter_pct: summaryLookup(summary, "complex_with_clutter", "VHF_60MHz_shallow", "surface_clutter_pct"),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
