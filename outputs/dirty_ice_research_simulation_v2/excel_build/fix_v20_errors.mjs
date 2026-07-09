import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const projectRoot = "C:/Users/tyboy/OneDrive/Documents/Nasa project";
const inputPath = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v20_paper_calibrated_dirty_ice_with_clutter.xlsx"
);
const outputPath = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v21_paper_calibrated_dirty_ice_with_clutter_cleaned.xlsx"
);
const previewDir = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v2/excel_build/previews");

const palette = {
  ink: "#1F2430",
  muted: "#5E6678",
  grid: "#DDE3EE",
  surface: "#F7F9FC",
  dark: "#2E3440",
  blue: "#5477C4",
  passBg: "#EAF7EC",
  passText: "#146C43",
  checkBg: "#FFF2CC",
  checkText: "#7A4D00",
};

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function approxEqual(left, right, tolerance = 1e-6) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
}

function getValue(sheet, address) {
  return sheet.getRange(address).values?.[0]?.[0] ?? null;
}

function getNumber(sheet, address) {
  return numberOrNull(getValue(sheet, address));
}

function meanAbsIncludingBlanksAsZero(sheet, address) {
  const matrix = sheet.getRange(address).values;
  let total = 0;
  let cells = 0;
  for (const row of matrix) {
    for (const value of row) {
      cells += 1;
      const numeric = numberOrNull(value);
      total += Math.abs(numeric ?? 0);
    }
  }
  return cells ? total / cells : 0;
}

function countFormulas(sheet, address) {
  const formulas = sheet.getRange(address).formulas;
  let count = 0;
  for (const row of formulas) {
    for (const formula of row) {
      if (typeof formula === "string" && formula.trim().startsWith("=")) count += 1;
    }
  }
  return count;
}

function setCellValue(sheet, address, value) {
  const cell = sheet.getRange(address);
  cell.clear({ applyTo: "contents" });
  cell.values = [[value]];
  return cell;
}

function styleStatusCell(cell, value) {
  const pass = value === "PASS";
  cell.format = {
    fill: pass ? palette.passBg : palette.checkBg,
    font: { bold: true, color: pass ? palette.passText : palette.checkText },
    borders: { preset: "all", style: "thin", color: palette.grid },
  };
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
  const range = sheet.getRangeByIndexes(startRow, startCol, matrix.length, matrix[0].length);
  range.values = matrix;
  return range;
}

function status(pass) {
  return pass ? "PASS" : "CHECK";
}

function computeSubsurfaceAudit(workbook) {
  const live = workbook.worksheets.getItem("Subsurface_Live_Data");
  const chart = workbook.worksheets.getItem("Subsurface_Chart_Data");
  const inputs = workbook.worksheets.getItem("Subsurface_Inputs");
  const rows = live.getRange("A2:AA242").values;

  const chartRanges = [
    "A3:H243",
    "A248:F488",
    "A493:F733",
    "A738:F978",
    "A983:H1223",
    "A1228:F1468",
    "A1473:B1477",
    "A1492:B1495",
  ];
  const chartFormulaCount = chartRanges.reduce((sum, address) => sum + countFormulas(chart, address), 0);
  const liveFormulaCount = countFormulas(live, "A2:AA242");

  const c34 = getNumber(inputs, "C34");
  const c35 = getNumber(inputs, "C35");
  const c36 = getNumber(inputs, "C36");
  const c37 = getNumber(inputs, "C37");
  const c38 = getNumber(inputs, "C38");
  const c39 = getNumber(inputs, "C39");
  const c40 = getNumber(inputs, "C40");
  const c41 = getNumber(inputs, "C41");
  const averageOceanElevation =
    rows.reduce((sum, row) => sum + (numberOrNull(row[11]) ?? 0), 0) / Math.max(rows.length, 1);

  const elevationPass = rows.every(
    (row) =>
      approxEqual(row[6], (numberOrNull(row[1]) ?? NaN) - (numberOrNull(row[5]) ?? NaN)) &&
      approxEqual(row[9], (numberOrNull(row[1]) ?? NaN) - (numberOrNull(row[8]) ?? NaN)) &&
      approxEqual(row[11], (numberOrNull(row[1]) ?? NaN) - (numberOrNull(row[10]) ?? NaN))
  );

  const delayPass =
    c34 !== null &&
    c35 !== null &&
    rows.every((row) => {
      const upperDepth = numberOrNull(row[5]);
      const lensDepth = numberOrNull(row[8]);
      const oceanDepth = numberOrNull(row[10]);
      if (upperDepth === null || lensDepth === null || oceanDepth === null) return false;
      return (
        approxEqual(row[12], (2 * c34 * upperDepth) / c35 * 1000000) &&
        approxEqual(row[13], (2 * c34 * lensDepth) / c35 * 1000000) &&
        approxEqual(row[14], (2 * c34 * oceanDepth) / c35 * 1000000)
      );
    });

  const echoPass =
    [c36, c37, c38, c39, c40, c41].every((value) => value !== null) &&
    rows.every((row) => {
      const upperDepth = numberOrNull(row[5]);
      const lensStrength = numberOrNull(row[7]);
      const lensDepth = numberOrNull(row[8]);
      const oceanDepth = numberOrNull(row[10]);
      const oceanElevation = numberOrNull(row[11]);
      if (
        upperDepth === null ||
        lensStrength === null ||
        lensDepth === null ||
        oceanDepth === null ||
        oceanElevation === null
      ) {
        return false;
      }
      return (
        approxEqual(row[15], c37 - 2 * c36 * (upperDepth / 1000)) &&
        approxEqual(row[16], c38 + c39 * lensStrength - 2 * c36 * (lensDepth / 1000)) &&
        approxEqual(
          row[17],
          c40 - 2 * c36 * (oceanDepth / 1000) - c41 * Math.abs(oceanElevation - averageOceanElevation)
        )
      );
    });

  const marginPass = rows.every(
    (row) =>
      approxEqual(row[23], (numberOrNull(row[16]) ?? NaN) - (numberOrNull(row[22]) ?? NaN)) &&
      approxEqual(row[24], (numberOrNull(row[17]) ?? NaN) - (numberOrNull(row[22]) ?? NaN)) &&
      approxEqual(row[26], 0)
  );

  return {
    D5: {
      value: status(chartFormulaCount === 9658),
      detail: `${chartFormulaCount.toLocaleString()} chart-source formulas found; expected 9,658.`,
    },
    D6: {
      value: status(liveFormulaCount >= 6200),
      detail: `${liveFormulaCount.toLocaleString()} formulas found in Subsurface_Live_Data; threshold is 6,200.`,
    },
    D9: {
      value: status(elevationPass),
      detail: "Checked surface height minus layer depth for upper ice, lens, and ocean boundary.",
    },
    D11: {
      value: status(delayPass),
      detail: "Checked delay = 2*n*depth/c*1e6 for all three subsurface reflectors.",
    },
    D12: {
      value: status(echoPass),
      detail: "Checked echo strength formulas against attenuation, lens strength, depth, and roughness terms.",
    },
    D13: {
      value: status(marginPass),
      detail: "Checked lens/ocean margins against echo strength minus detection threshold, plus zero reference.",
    },
  };
}

function buildAuditSheet(workbook, rows) {
  const sheet = clearSheet(workbook, "Workbook_Error_Audit");
  sheet.getRange("A1:F1").merge();
  sheet.getRange("A1").values = [["Workbook Error Audit"]];
  sheet.getRange("A1").format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF", size: 18 },
  };
  sheet.getRange("A2:F2").merge();
  sheet.getRange("A2").values = [
    [
      "Cleaned copy of v20. The new v2 science tabs were left unchanged; this sheet documents legacy blank/error-prone summary cells that were converted to explicit computed values.",
    ],
  ];
  sheet.getRange("A2").format = { fill: palette.surface, font: { color: palette.muted }, wrapText: true };
  const headers = ["Sheet", "Cell(s)", "Previous condition", "Cleaned value", "How it was computed", "Status"];
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header]))];
  const tableRange = writeMatrix(sheet, 3, 0, matrix);
  tableRange.format = {
    borders: { preset: "all", style: "thin", color: palette.grid },
    wrapText: true,
  };
  sheet.getRange("A4:F4").format = {
    fill: palette.blue,
    font: { bold: true, color: "#FFFFFF" },
    borders: { preset: "all", style: "thin", color: palette.grid },
    wrapText: true,
  };
  const address = rangeAddress(3, 0, matrix.length, headers.length);
  try {
    const table = sheet.tables.add(address, true, "WorkbookErrorAuditTable");
    table.style = "TableStyleMedium2";
    table.showFilterButton = true;
  } catch {}
  [220, 80, 260, 120, 520, 80].forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
  sheet.getRange("A1").format.rowHeightPx = 30;
  sheet.getRange("A2").format.rowHeightPx = 48;
  sheet.freezePanes.freezeRows(4);
}

async function main() {
  await fs.mkdir(previewDir, { recursive: true });
  const input = await FileBlob.load(inputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);

  const dopplerInversion = workbook.worksheets.getItem("Doppler_Depth_Inversion");
  const dopplerData = workbook.worksheets.getItem("Doppler_Depth_Data");
  const subsurfaceAudit = workbook.worksheets.getItem("Subsurface_Model_Audit");

  const rawMeanError = meanAbsIncludingBlanksAsZero(dopplerData, "N4:N244");
  const correctedMeanError = meanAbsIncludingBlanksAsZero(dopplerData, "O4:O244");
  const depthStatus = correctedMeanError < 0.000001 ? "PASS" : "CHECK";

  setCellValue(dopplerInversion, "B6", rawMeanError).format.numberFormat = "0.000000";
  setCellValue(dopplerInversion, "B7", correctedMeanError).format.numberFormat = "0.000000";
  const b9 = setCellValue(dopplerInversion, "B9", depthStatus);
  styleStatusCell(b9, depthStatus);

  const computedAudit = computeSubsurfaceAudit(workbook);
  const changedAuditCells = ["D5", "D6", "D9", "D11", "D12", "D13"];
  for (const address of changedAuditCells) {
    const cell = setCellValue(subsurfaceAudit, address, computedAudit[address].value);
    styleStatusCell(cell, computedAudit[address].value);
  }

  const auditRows = [
    {
      Sheet: "Doppler_Depth_Inversion",
      "Cell(s)": "B6",
      "Previous condition": "Range ABS/SUMPRODUCT result did not display a cached value in inspection.",
      "Cleaned value": rawMeanError.toFixed(6),
      "How it was computed": "Mean absolute uncorrected ocean-depth error from Doppler_Depth_Data!N4:N244.",
      Status: "FIXED",
    },
    {
      Sheet: "Doppler_Depth_Inversion",
      "Cell(s)": "B7",
      "Previous condition": "Range ABS/SUMPRODUCT result did not display a cached value in inspection.",
      "Cleaned value": correctedMeanError.toExponential(3),
      "How it was computed": "Mean absolute corrected ocean-depth error from Doppler_Depth_Data!O4:O244.",
      Status: "FIXED",
    },
    {
      Sheet: "Doppler_Depth_Inversion",
      "Cell(s)": "B9",
      "Previous condition": "Status formula depended on the blank corrected-error result.",
      "Cleaned value": depthStatus,
      "How it was computed": "PASS when corrected mean error is less than 0.000001 m.",
      Status: "FIXED",
    },
    ...changedAuditCells.map((address) => ({
      Sheet: "Subsurface_Model_Audit",
      "Cell(s)": address,
      "Previous condition": "Audit formula did not display a cached result in the imported workbook view.",
      "Cleaned value": computedAudit[address].value,
      "How it was computed": computedAudit[address].detail,
      Status: "FIXED",
    })),
  ];

  buildAuditSheet(workbook, auditRows);

  const errorScan = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    maxChars: 12000,
  });
  const auditPreview = await workbook.render({
    sheetName: "Workbook_Error_Audit",
    range: "A1:F14",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, "v21_workbook_error_audit.png"),
    new Uint8Array(await auditPreview.arrayBuffer())
  );
  const subsurfacePreview = await workbook.render({
    sheetName: "Subsurface_Model_Audit",
    range: "A1:E18",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, "v21_subsurface_model_audit.png"),
    new Uint8Array(await subsurfacePreview.arrayBuffer())
  );

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        rawMeanError,
        correctedMeanError,
        depthStatus,
        computedAudit,
        errorScan: errorScan.ndjson,
      },
      null,
      2
    )
  );
}

await main();
