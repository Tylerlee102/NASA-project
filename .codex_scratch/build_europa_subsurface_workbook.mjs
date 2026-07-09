import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourceWorkbook =
  "C:/Users/tyboy/Downloads/parabolic-motion-radar-model-baseline-and-runs-dashboard-native-excel-charts-fixed (1).xlsx";
const simulationDir =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/europa_ice_subsurface_simulation";
const outputWorkbook = path.join(
  simulationDir,
  "parabolic-motion-radar-model-with-europa-ice-subsurface.xlsx"
);

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

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(","));
  const header = rows[0];
  const values = rows.slice(1).map((row) =>
    row.map((value) => {
      const number = Number(value);
      return Number.isFinite(number) && value.trim() !== "" ? number : value;
    })
  );
  return { header, values };
}

async function imageDataUrl(fileName) {
  const bytes = await fs.readFile(path.join(simulationDir, fileName));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function writeTitle(sheet, cell, title, subtitle) {
  sheet.getRange(cell).values = [[title]];
  sheet.getRange(cell).format = {
    font: { bold: true, color: "#1F2937" },
  };
  const row = Number(cell.match(/\d+/)[0]) + 1;
  const col = cell.match(/[A-Z]+/)[0];
  sheet.getRange(`${col}${row}`).values = [[subtitle]];
  sheet.getRange(`${col}${row}`).format = {
    font: { color: "#526174" },
    wrapText: true,
  };
}

const input = await FileBlob.load(sourceWorkbook);
const workbook = await SpreadsheetFile.importXlsx(input);

const csvText = await fs.readFile(path.join(simulationDir, "europa_ice_subsurface_model.csv"), "utf8");
const assumptions = JSON.parse(
  await fs.readFile(path.join(simulationDir, "europa_ice_subsurface_assumptions.json"), "utf8")
);
const { header, values } = parseCsv(csvText);

const dataSheet = workbook.worksheets.getOrAdd("Subsurface_Model");
dataSheet.getRange(`A1:${colName(header.length - 1)}${values.length + 1}`).values = [header, ...values];
dataSheet.getRange(`A1:${colName(header.length - 1)}1`).format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
};
dataSheet.getRange(`A2:${colName(header.length - 1)}${values.length + 1}`).format.numberFormat = "0.000";
dataSheet.getRange("A:A").format.numberFormat = "0.0";
dataSheet.getRange("A:N").format.columnWidthPx = 128;
dataSheet.getRange("A1:N1").format.rowHeightPx = 48;

const assumptionSheet = workbook.worksheets.getOrAdd("Subsurface_Assumptions");
assumptionSheet.getRange("A1:C1").values = [["Europa Ice Subsurface Simulation Assumptions", null, null]];
assumptionSheet.getRange("A1:C1").format = {
  fill: "#1F2937",
  font: { bold: true, color: "#FFFFFF" },
};
assumptionSheet.getRange("A3:C3").values = [["Item", "Value", "Why it matters"]];
assumptionSheet.getRange("A3:C3").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#1F2937" },
};
const assumptionRows = [
  ["Surface material", assumptions.surface, "Keeps the generated topography as icy terrain, not rock."],
  [
    "Upper internal ice layer",
    `${assumptions.upper_ice_layer_mean_depth_m} m mean depth`,
    "Represents shallow ice structure, fractures, impurities, or layer boundaries.",
  ],
  [
    "Possible briny/warm-ice lens",
    assumptions.possible_briny_warm_lens_depth_m,
    "A localized material contrast inside ice; treated as possible, not proven.",
  ],
  [
    "Possible ice-ocean boundary",
    `${assumptions.nominal_ice_ocean_boundary_depth_m} m nominal depth`,
    "Deep reflector where ice may meet liquid water or warmer basal ice.",
  ],
  ["Ice refractive index", assumptions.ice_refractive_index, "Converts depth into radar two-way delay."],
  [
    "One-way ice attenuation",
    `${assumptions.attenuation_db_per_km_one_way} dB/km`,
    "Weakens deeper radar returns as the signal travels through ice.",
  ],
  ["Model warning", assumptions.note, "Prevents this from being mistaken for measured mission data."],
];
assumptionSheet.getRange(`A4:C${assumptionRows.length + 3}`).values = assumptionRows;
assumptionSheet.getRange("A:C").format.columnWidthPx = 230;
assumptionSheet.getRange("B:B").format.columnWidthPx = 410;
assumptionSheet.getRange("C:C").format.columnWidthPx = 430;
assumptionSheet.getRange(`A3:C${assumptionRows.length + 3}`).format.wrapText = true;
assumptionSheet.getRange(`A3:C${assumptionRows.length + 3}`).format.borders = {
  preset: "all",
  style: "thin",
  color: "#D4DAE3",
};

const dashboard = workbook.worksheets.getOrAdd("Subsurface_Graphs");
dashboard.deleteAllDrawings();
writeTitle(
  dashboard,
  "A1",
  "Europa Ice Subsurface Simulation",
  "Python-generated previews added after checking that the outputs are coherent. Existing dashboard graphs are unchanged."
);
dashboard.getRange("A4:D7").values = [
  ["Graph", "What it shows", "Interpretation", "Source"],
  [
    "Subsurface truth model",
    "Synthetic icy layers below the generated surface topography.",
    "Topography is ice; deeper features are internal ice, possible warm/briny ice, and possible ocean boundary.",
    "Subsurface_Model",
  ],
  [
    "Simulated radargram",
    "Radar two-way delay after surface return.",
    "Brighter bands are stronger reflectors; deeper returns are weaker because of ice attenuation.",
    "Python preview",
  ],
  [
    "Delay and echo strength",
    "Layer return timing and relative signal strength.",
    "Ocean boundary appears late in time; lens strength is localized and hypothetical.",
    "Subsurface_Model",
  ],
];
dashboard.getRange("A4:D4").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF" },
};
dashboard.getRange("A4:D7").format.wrapText = true;
dashboard.getRange("A9:D11").values = [
  ["Embedded preview image", "File used", "Workbook section", "Purpose"],
  ["Subsurface truth model", "01_europa_ice_subsurface_truth.png", "Left", "Shows the hidden icy layers."],
  ["Radargram + response charts", "02_simulated_ice_radargram.png and 03_layer_delays_and_echo_strength.png", "Right / below", "Shows simulated radar return timing and strength."],
];
dashboard.getRange("A9:D9").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#1F2937" },
};
dashboard.getRange("A9:D11").format.wrapText = true;
dashboard.getRange("A:D").format.columnWidthPx = 230;
dashboard.getRange("B:B").format.columnWidthPx = 380;
dashboard.getRange("C:C").format.columnWidthPx = 420;
dashboard.getRange("D:D").format.columnWidthPx = 170;

dashboard.images.add({
  dataUrl: await imageDataUrl("01_europa_ice_subsurface_truth.png"),
  anchor: { from: { row: 13, col: 0 }, extent: { widthPx: 900, heightPx: 552 } },
});
dashboard.images.add({
  dataUrl: await imageDataUrl("02_simulated_ice_radargram.png"),
  anchor: { from: { row: 13, col: 7 }, extent: { widthPx: 900, heightPx: 540 } },
});
dashboard.images.add({
  dataUrl: await imageDataUrl("03_layer_delays_and_echo_strength.png"),
  anchor: { from: { row: 46, col: 0 }, extent: { widthPx: 900, heightPx: 672 } },
});

await fs.mkdir(simulationDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputWorkbook);

console.log(outputWorkbook);
