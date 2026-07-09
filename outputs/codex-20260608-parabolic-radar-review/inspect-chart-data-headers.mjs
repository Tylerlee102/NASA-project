import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-checked-generated-topography.xlsx";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const range of [
  "Chart_Data!A1:AD3",
  "Scenario_Data!AQ1:BC3",
  "Scenario_Data!BE1:BJ3",
  "Model_Data!A1:AC3",
]) {
  const result = await workbook.inspect({
    kind: "table,formula",
    range,
    include: "values,formulas",
    tableMaxRows: 3,
    tableMaxCols: 30,
    maxChars: 12000,
  });
  console.log(`\n${range}`);
  console.log(result.ndjson);
}
