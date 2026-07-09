import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/europa_ice_subsurface_simulation/v25_paper_calibrated_dirty_ice_v3_streamlined.xlsx";
const outputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/europa_ice_subsurface_simulation/v26_paper_calibrated_dirty_ice_v3_streamlined_plus.xlsx";

const palette = {
  ink: "#293241",
  blue: "#3F70B5",
  green: "#3E8B5B",
  amber: "#C26B36",
  red: "#B24C4C",
  paleBlue: "#EAF1FB",
  paleGreen: "#EAF6EE",
  paleAmber: "#FFF2CC",
  paleRed: "#FCE8E8",
  grid: "#D9E2EF",
  text: "#1F2937",
  muted: "#667085",
};

function setRange(sheet, address, values, format = undefined) {
  const range = sheet.getRange(address);
  range.values = values;
  if (format) range.format = format;
  return range;
}

function mergeAndWrite(sheet, address, value, format = undefined) {
  const range = sheet.getRange(address);
  range.merge();
  range.values = [[value]];
  if (format) range.format = format;
  return range;
}

function panelTitle(sheet, address, title, fill = palette.ink) {
  return mergeAndWrite(sheet, address, title, {
    fill,
    font: { bold: true, color: "#FFFFFF", size: 12 },
    alignment: { horizontal: "left", vertical: "center" },
    wrapText: true,
  });
}

function bodyPanel(sheet, address, value, fill = "#FFFFFF") {
  return mergeAndWrite(sheet, address, value, {
    fill,
    font: { color: palette.text, size: 11 },
    alignment: { horizontal: "left", vertical: "top" },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: palette.grid },
  });
}

function formatHeader(range, fill = palette.blue) {
  range.format = {
    fill,
    font: { bold: true, color: "#FFFFFF" },
    alignment: { horizontal: "left", vertical: "center" },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#FFFFFF" },
  };
}

function formatBody(range, fill = "#FFFFFF") {
  range.format = {
    fill,
    font: { color: palette.text },
    alignment: { horizontal: "left", vertical: "top" },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: palette.grid },
  };
}

function mergedCell(sheet, address, value, fill = "#FFFFFF", bold = false) {
  return mergeAndWrite(sheet, address, value, {
    fill,
    font: { bold, color: palette.text, size: 10 },
    alignment: { horizontal: "left", vertical: "top" },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: palette.grid },
  });
}

function mergedHeader(sheet, address, value, fill = palette.blue) {
  return mergeAndWrite(sheet, address, value, {
    fill,
    font: { bold: true, color: "#FFFFFF", size: 10 },
    alignment: { horizontal: "left", vertical: "center" },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#FFFFFF" },
  });
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const main = workbook.worksheets.getItem("00_MAIN_GRAPHS");
const details = workbook.worksheets.getItem("03_DETAILS_SOURCES");

// Keep existing charts/tables, but clear only the empty spaces reserved for v26 context.
main.getRange("J4:N18").clear({ applyTo: "all" });
main.getRange("A43:N61").clear({ applyTo: "all" });
details.getRange("A30:K60").clear({ applyTo: "all" });

main.getRange("J4:N18").format.columnWidthPx = 132;
main.getRange("A43:N61").format.rowHeightPx = 26;
details.getRange("A30:K60").format.rowHeightPx = 24;
details.getRange("I1:K60").format.columnWidthPx = 150;
details.getRange("A40:K45").format.rowHeightPx = 34;

panelTitle(main, "J4:N4", "Research Question", palette.ink);
bodyPanel(
  main,
  "J5:N7",
  "Can dirty or complex ice inside Europa create radar echoes that mimic, hide, or weaken a true ocean-boundary return?",
  palette.paleBlue,
);
panelTitle(main, "J9:N9", "Best One-Line Claim", palette.blue);
bodyPanel(
  main,
  "J10:N13",
  "This is a paper-calibrated sensitivity simulation showing how Europa dirty-ice mixtures could bias REASON-style ocean detection, especially by creating false or ambiguous bottom echoes.",
);
panelTitle(main, "J15:N15", "Do Not Overclaim", palette.red);
bodyPanel(
  main,
  "J16:N18",
  "It does not prove Europa has these exact layers. It shows which radar interpretations become risky under the tested assumptions.",
  palette.paleRed,
);

panelTitle(main, "A43:N43", "How to Read This Workbook", palette.ink);
mergedHeader(main, "A44:B44", "Signal outcome", palette.blue);
mergedHeader(main, "C44:F44", "Meaning in the model", palette.blue);
mergedHeader(main, "G44:J44", "How to describe it", palette.blue);
mergedHeader(main, "K44:N44", "Why it matters for REASON interpretation", palette.blue);
const readingRows = [
  [
    "High-confidence ocean",
    "The ocean echo is deep, detectable, and stronger than competing echoes.",
    "A potential ocean detection under this simplified model.",
    "This is the cleanest case, but still needs cross-instrument checks.",
  ],
  [
    "Ambiguous / false / clutter",
    "A dirty-ice, brine, roughness, or clutter echo rivals or exceeds the ocean echo.",
    "Do not trust the brightest echo by itself.",
    "This is the main research gap your workbook is trying to expose.",
  ],
  [
    "Not interpretable",
    "Attenuation or clutter prevents a clean deep return.",
    "The radar could miss the ocean even if the model ocean exists.",
    "A weak result is not automatically evidence of no ocean.",
  ],
  [
    "Depth error",
    "The trusted echo depth differs from the true model ocean depth.",
    "Shows how bottom-depth interpretation can be biased.",
    "This makes the project about decision risk, not only signal strength.",
  ],
];
for (let index = 0; index < readingRows.length; index += 1) {
  const row = 45 + index;
  const [outcome, meaning, describe, matters] = readingRows[index];
  mergedCell(main, `A${row}:B${row}`, outcome, "#FFFFFF", true);
  mergedCell(main, `C${row}:F${row}`, meaning);
  mergedCell(main, `G${row}:J${row}`, describe);
  mergedCell(main, `K${row}:N${row}`, matters);
}

mergedHeader(main, "A50:G50", "What This Supports", palette.green);
mergedHeader(main, "H50:N50", "What This Does Not Support", palette.red);
const supportsRows = [
  [
    "Dirty ice can create radar ambiguity in a REASON-like sensitivity model.",
    "It does not prove Europa's real subsurface has these exact layers.",
  ],
  [
    "HF 9 MHz and VHF 60 MHz behavior should be interpreted separately.",
    "It does not replace NASA's future REASON processing pipeline.",
  ],
  [
    "A bright/deep echo is not automatically the ocean boundary.",
    "It does not use real REASON subsurface data from Europa, because that data does not exist yet.",
  ],
  [
    "Cross-instrument checks would reduce false confidence.",
    "It does not give a final map of Europa's ocean depth.",
  ],
  [
    "Lab validation and full-wave modeling are the strongest next upgrades.",
    "It is a sensitivity simulation, not a mission-final physical model.",
  ],
];
for (let index = 0; index < supportsRows.length; index += 1) {
  const row = 51 + index;
  const [supports, notSupports] = supportsRows[index];
  mergedCell(main, `A${row}:G${row}`, supports, palette.paleGreen);
  mergedCell(main, `H${row}:N${row}`, notSupports, palette.paleRed);
}

panelTitle(main, "A58:N58", "30-Second Explanation", palette.amber);
bodyPanel(
  main,
  "A59:N61",
  "I am testing how dirty ice, brines, salts, rough layers, and attenuation could confuse Europa Clipper's REASON radar. The point is not to prove a specific Europa structure; it is to show when an ocean-looking radar return could be ambiguous and what evidence would be needed to trust it.",
  palette.paleAmber,
);

panelTitle(details, "A30:K30", "Research Defense Notes", palette.ink);
const defenseRows = [
  [
    "Project focus",
    "Simulate how dirty ice or clutter can bias REASON-style detection by mimicking, hiding, or weakening the ocean boundary.",
  ],
  [
    "Core research gap",
    "Systematic modeling, and eventually laboratory validation, of how realistic dirty-ice mixtures could create ambiguous echoes.",
  ],
  [
    "Method",
    "Paper-calibrated sensitivity simulation using REASON-like 9 MHz and 60 MHz bands, attenuation assumptions, dielectric contrasts, and false-boundary rules.",
  ],
  [
    "Strongest finding",
    "Ambiguous or false echoes can appear even when the model includes a true ocean boundary.",
  ],
  [
    "Main limitation",
    "This is first-order modeling, not a full-wave electromagnetic solver and not real REASON Europa subsurface data.",
  ],
  [
    "Best next validation",
    "Add lab dielectric measurements for salts/brines/dirty ice at Europa-like temperatures, then compare with a full-wave radar forward model.",
  ],
];
for (let index = 0; index < defenseRows.length; index += 1) {
  const row = 31 + index;
  const [label, note] = defenseRows[index];
  mergedCell(details, `A${row}:B${row}`, label, palette.paleBlue, true);
  mergedCell(details, `C${row}:K${row}`, note);
}

panelTitle(details, "A38:K38", "Model Strength / Upgrade Matrix", palette.blue);
mergedHeader(details, "A39:B39", "Model piece", palette.blue);
mergedHeader(details, "C39:D39", "Current strength", palette.blue);
mergedHeader(details, "E39:H39", "Why", palette.blue);
mergedHeader(details, "I39:K39", "Best upgrade", palette.blue);
const matrixRows = [
  [
    "REASON radar bands",
    "Strong",
    "Uses the mission-relevant 9 MHz and 60 MHz framing.",
    "Keep citations current and separate HF/VHF conclusions.",
  ],
  [
    "Attenuation through dirty ice",
    "Medium",
    "Captures the known direction that warm/dirty ice increases radar loss.",
    "Add lab-derived attenuation by impurity type and temperature.",
  ],
  [
    "Dielectric contrasts",
    "Medium",
    "Includes ice, salts, brine-like layers, void-like changes, and rough interfaces as categories.",
    "Replace category values with measured permittivity and loss tangent ranges.",
  ],
  [
    "Surface/subsurface clutter",
    "Medium-low",
    "Included as an ambiguity stressor, but simplified.",
    "Tie clutter to rough-surface scattering and topographic slope models.",
  ],
  [
    "Ocean-boundary confidence",
    "Medium",
    "Explicitly compares true ocean returns with competing false echoes.",
    "Test confidence rules against synthetic full-wave radargrams.",
  ],
  [
    "Validation",
    "Low for now",
    "No real Europa REASON subsurface data exists yet.",
    "Use lab analogs, peer-reviewed forward models, and future mission data.",
  ],
];
for (let index = 0; index < matrixRows.length; index += 1) {
  const row = 40 + index;
  const [piece, strength, why, upgrade] = matrixRows[index];
  mergedCell(details, `A${row}:B${row}`, piece, "#FFFFFF", true);
  mergedCell(details, `C${row}:D${row}`, strength);
  mergedCell(details, `E${row}:H${row}`, why);
  mergedCell(details, `I${row}:K${row}`, upgrade);
}

panelTitle(details, "A47:K47", "Version Purpose", palette.green);
const versionRows = [
  [
    "v1",
    "Baseline fake/simplified radar behavior: useful for showing the idea, weak for research defense.",
  ],
  [
    "v2",
    "Paper-calibrated dirty-ice simulation: better frequencies, attenuation, materials, and ambiguity cases.",
  ],
  [
    "v3",
    "Confidence and cross-instrument framing: turns echoes into cautious interpretation categories.",
  ],
  [
    "v26",
    "Streamlined presentation workbook: same preserved data, clearer front story, stronger defense notes.",
  ],
];
for (let index = 0; index < versionRows.length; index += 1) {
  const row = 48 + index;
  const [version, purpose] = versionRows[index];
  mergedCell(details, `A${row}:B${row}`, version, palette.paleGreen, true);
  mergedCell(details, `C${row}:K${row}`, purpose, palette.paleGreen);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "v26 formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir(
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/europa_ice_subsurface_simulation",
  { recursive: true },
);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);
