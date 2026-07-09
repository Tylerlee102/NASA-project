import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-checked-generated-topography.xlsx";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "name",
  maxChars: 6000,
});

const sheetNames = sheets.ndjson
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    try {
      return JSON.parse(line).name;
    } catch {
      return null;
    }
  })
  .filter(Boolean);

console.log("SHEETS");
console.log(sheetNames.join("\n"));

for (const sheetName of sheetNames) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const charts = sheet.charts?.items ?? [];
  if (!charts.length) continue;
  console.log(`\nSHEET ${sheetName}`);
  charts.forEach((chart, chartIndex) => {
    console.log(
      JSON.stringify(
        {
          chartIndex,
          type: chart.type,
          title: chart.title,
          hasLegend: chart.hasLegend,
          series: chart.series.items.map((series) => ({
            name: series.name,
            formula: series.formula,
            categoryFormula: series.categoryFormula,
            line: series.line,
          })),
        },
        null,
        2,
      ),
    );
  });
}
