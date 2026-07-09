import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-dashboard-fixed-generated-topography.xlsx";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const dashboard = workbook.worksheets.getItem("Dashboard");
console.log("DASHBOARD_CHARTS");
dashboard.charts.items.forEach((chart, chartIndex) => {
  console.log(
    JSON.stringify({
      chartIndex,
      type: chart.type,
      title: chart.title,
      series: chart.series.items.map((series) => ({
        name: series.name,
        formula: series.formula,
        categoryFormula: series.categoryFormula,
      })),
    }),
  );
});

for (const range of [
  "Dashboard_Chart_Data!A1:Q3",
  "Dashboard_Chart_Data!S1:U3",
  "Dashboard_Chart_Data!W1:X3",
  "Dashboard_Chart_Data!Z1:AB3",
  "Dashboard_Chart_Data!AD1:AF3",
  "Dashboard_Chart_Data!AH1:AL3",
  "Graph_Guide!A1:F9",
]) {
  const result = await workbook.inspect({
    kind: "table,formula",
    range,
    include: "values,formulas",
    tableMaxRows: 9,
    tableMaxCols: 20,
    maxChars: 10000,
  });
  console.log(`\n${range}`);
  console.log(result.ndjson);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 10000,
});
console.log("\nFORMULA_ERRORS");
console.log(errors.ndjson || "(none)");
