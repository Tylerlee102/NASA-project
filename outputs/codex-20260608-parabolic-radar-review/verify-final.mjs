import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx";
const outputDir =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const target of [
  { sheet: "Dashboard", range: "A65:I72" },
  { sheet: "Geometry_View", range: "A1:R45" },
  { sheet: "Graph_Guide", range: "A1:G21" },
  { sheet: "Checks", range: "A1:C27" },
]) {
  console.log(`\n--- ${target.sheet}!${target.range} ---`);
  const result = await workbook.inspect({
    kind: "table,formula",
    sheetId: target.sheet,
    range: target.range,
    include: "values,formulas",
    tableMaxRows: 30,
    tableMaxCols: 9,
    tableMaxCellChars: 160,
    options: { maxResults: 80 },
    maxChars: 18000,
  });
  console.log(result.ndjson);
}

console.log("\n--- formula errors ---");
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#N/A",
  options: { useRegex: true, maxResults: 300 },
  maxChars: 12000,
});
console.log(errors.ndjson);

for (const sheetName of ["Dashboard", "Geometry_View", "Graph_Guide", "Checks"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    `${outputDir}/final-${sheetName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}
