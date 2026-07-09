import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const targets = [
  { sheet: "Inputs", range: "A1:N54" },
  { sheet: "Model_Data", range: "A1:AS3" },
  { sheet: "Model_Data", range: "A121:AS123" },
  { sheet: "Chart_Data", range: "A1:AB3" },
  { sheet: "Chart_Data", range: "A121:AB123" },
  { sheet: "Scenario_Data", range: "A1:BJ3" },
  { sheet: "Scenario_Data", range: "A121:BJ123" },
  { sheet: "Dashboard", range: "A55:I63" },
  { sheet: "Checks", range: "A1:C23" },
];

for (const target of targets) {
  console.log(`\n--- ${target.sheet}!${target.range} ---`);
  const result = await workbook.inspect({
    kind: "table,formula",
    sheetId: target.sheet,
    range: target.range,
    include: "values,formulas",
    tableMaxRows: 60,
    tableMaxCols: 70,
    tableMaxCellChars: 400,
    options: { maxResults: 300 },
    maxChars: 60000,
  });
  console.log(result.ndjson);
}
