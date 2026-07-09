import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const projectRoot = "C:/Users/tyboy/OneDrive/Documents/Nasa project";
const inputWorkbook = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v24_paper_calibrated_dirty_ice_v3_complete_reordered.xlsx"
);
const outputWorkbook = path.join(
  projectRoot,
  "outputs/europa_ice_subsurface_simulation/v25_paper_calibrated_dirty_ice_v3_streamlined.xlsx"
);
const previewDir = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v3/excel_build/previews");

const palette = {
  dark: "#2E3440",
  surface: "#F7F9FC",
  muted: "#667085",
  grid: "#DDE3EE",
  blue: "#3F6FB5",
  orange: "#B96B3C",
  green: "#4C8B5F",
  red: "#A84E4E",
};

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

function title(sheet, text, note, range = "A1:K1", noteRange = "A2:K2") {
  sheet.getRange(range).merge();
  sheet.getRange("A1").values = [[text]];
  sheet.getRange("A1").format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF", size: 18 },
  };
  sheet.getRange(noteRange).merge();
  sheet.getRange("A2").values = [[note]];
  sheet.getRange("A2").format = { fill: palette.surface, font: { color: palette.muted }, wrapText: true };
  sheet.getRange("A1").format.rowHeightPx = 30;
  sheet.getRange("A2").format.rowHeightPx = 42;
}

function styleSection(range, fill) {
  range.format = {
    fill,
    font: { bold: true, color: "#FFFFFF" },
    borders: { preset: "all", style: "thin", color: palette.grid },
  };
}

function setColWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

async function renderToDataUrl(workbook, sheetName, range) {
  const blob = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function addGalleryImage(workbook, gallery, config) {
  const { label, sourceSheet, range, row, heightPx, color } = config;
  gallery.getRangeByIndexes(row, 0, 1, 9).merge();
  gallery.getCell(row, 0).values = [[label]];
  styleSection(gallery.getRangeByIndexes(row, 0, 1, 9), color);
  gallery.getRangeByIndexes(row + 1, 0, 1, 9).merge();
  gallery.getCell(row + 1, 0).values = [[`Preserved from ${sourceSheet}. Original editable sheet is still in the workbook, hidden to reduce tab clutter.`]];
  gallery.getRangeByIndexes(row + 1, 0, 1, 9).format = {
    fill: palette.surface,
    font: { color: palette.muted },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: palette.grid },
  };
  const dataUrl = await renderToDataUrl(workbook, sourceSheet, range);
  gallery.images.add({
    dataUrl,
    anchor: {
      from: { row: row + 3, col: 0 },
      extent: { widthPx: 1500, heightPx },
    },
  });
}

async function main() {
  await fs.mkdir(previewDir, { recursive: true });
  const input = await FileBlob.load(inputWorkbook);
  const workbook = await SpreadsheetFile.importXlsx(input);

  try {
    workbook.worksheets.getItem("01_ALL_NUMBERS").name = "02_ALL_NUMBERS";
  } catch {}
  try {
    workbook.worksheets.getItem("02_DETAILS_SOURCES").name = "03_DETAILS_SOURCES";
  } catch {}

  const main = workbook.worksheets.getItem("00_MAIN_GRAPHS");
  main.getRange("A2:H2").unmerge();
  main.getRange("A2:H2").merge();
  main.getRange("A2").values = [[
    "Streamlined front page. Open 01_GRAPH_GALLERY for all preserved v22/v3 charts, 02_ALL_NUMBERS for consolidated data, and 03_DETAILS_SOURCES for scoring and source notes.",
  ]];
  main.getRange("A2").format = { fill: palette.surface, font: { color: palette.muted }, wrapText: true };

  const gallery = clearSheet(workbook, "01_GRAPH_GALLERY");
  title(
    gallery,
    "Graph Gallery",
    "All major preserved graph views are collected here so the original v22/v3 sheets can stay hidden instead of crowding the tab bar.",
    "A1:K1",
    "A2:K2"
  );
  setColWidths(gallery, [180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180]);

  const galleryItems = [
    {
      label: "Front Story Graphs",
      sourceSheet: "00_MAIN_GRAPHS",
      range: "A1:N42",
      row: 4,
      heightPx: 520,
      color: palette.blue,
    },
    {
      label: "V3 Confidence Dashboard",
      sourceSheet: "V3_Dashboard",
      range: "A1:N49",
      row: 34,
      heightPx: 560,
      color: palette.green,
    },
    {
      label: "V2 Paper-Calibrated Dashboard",
      sourceSheet: "V2_Dashboard",
      range: "A1:N49",
      row: 66,
      heightPx: 560,
      color: palette.orange,
    },
    {
      label: "Original Subsurface Dashboard",
      sourceSheet: "Dashboard",
      range: "A1:R112",
      row: 98,
      heightPx: 950,
      color: palette.red,
    },
    {
      label: "Subsurface Model Dashboard",
      sourceSheet: "Subsurface_Dashboard",
      range: "A1:U112",
      row: 151,
      heightPx: 950,
      color: palette.blue,
    },
    {
      label: "Doppler Depth Inversion",
      sourceSheet: "Doppler_Depth_Inversion",
      range: "A1:Q55",
      row: 204,
      heightPx: 760,
      color: palette.green,
    },
  ];

  for (const item of galleryItems) {
    await addGalleryImage(workbook, gallery, item);
  }
  gallery.freezePanes.freezeRows(3);

  const preview = await workbook.render({ sheetName: "01_GRAPH_GALLERY", range: "A1:K34", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, "v25_graph_gallery_top.png"), new Uint8Array(await preview.arrayBuffer()));
  const mainPreview = await workbook.render({ sheetName: "00_MAIN_GRAPHS", range: "A1:N42", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, "v25_main_graphs.png"), new Uint8Array(await mainPreview.arrayBuffer()));

  const errors = await workbook.inspect({
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
        visibleSheetsIntended: ["00_MAIN_GRAPHS", "01_GRAPH_GALLERY", "02_ALL_NUMBERS", "03_DETAILS_SOURCES"],
        galleryItems: galleryItems.map((item) => item.sourceSheet),
        errorScan: errors.ndjson,
      },
      null,
      2
    )
  );
}

await main();
