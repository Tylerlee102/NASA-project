import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const target of [
  { sheet: "Model_Data", range: "A240:AS242" },
  { sheet: "Scenario_Data", range: "A240:BJ242" },
]) {
  console.log(`\n--- ${target.sheet}!${target.range} ---`);
  const result = await workbook.inspect({
    kind: "table,formula",
    sheetId: target.sheet,
    range: target.range,
    include: "values,formulas",
    tableMaxRows: 5,
    tableMaxCols: 70,
    tableMaxCellChars: 220,
    options: { maxResults: 300 },
    maxChars: 50000,
  });
  console.log(result.ndjson);
}
