import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/europa_ice_subsurface_simulation/parabolic-motion-radar-model-with-europa-ice-subsurface.xlsx";
const outputDir =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/europa_ice_subsurface_simulation";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

async function logInspect(label, request) {
  const result = await workbook.inspect(request);
  console.log(`\n### ${label}`);
  console.log(result.ndjson);
}

await logInspect("Sheets", { kind: "sheet", include: "id,name" });
await logInspect("Subsurface assumptions", {
  kind: "table",
  sheetId: "Subsurface_Assumptions",
  range: "A1:C10",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 3,
});
await logInspect("Subsurface graph guide", {
  kind: "table",
  sheetId: "Subsurface_Graphs",
  range: "A1:D7",
  include: "values,formulas",
  tableMaxRows: 7,
  tableMaxCols: 4,
});
await logInspect("Formula errors", {
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 200 },
  summary: "formula error scan after subsurface update",
});

const graphsPreview = await workbook.render({
  sheetName: "Subsurface_Graphs",
  range: "A1:P75",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "workbook_subsurface_graphs_preview.png"),
  Buffer.from(await graphsPreview.arrayBuffer())
);

const assumptionsPreview = await workbook.render({
  sheetName: "Subsurface_Assumptions",
  range: "A1:C11",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "workbook_subsurface_assumptions_preview.png"),
  Buffer.from(await assumptionsPreview.arrayBuffer())
);

console.log("\nRendered workbook previews.");
