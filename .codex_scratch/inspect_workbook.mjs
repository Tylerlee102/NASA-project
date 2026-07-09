import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/Downloads/parabolic-motion-radar-model-baseline-and-runs-dashboard-native-excel-charts-fixed (1).xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

async function logInspect(label, request) {
  try {
    const result = await workbook.inspect(request);
    console.log(`\n### ${label}`);
    console.log(result.ndjson ?? JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(`\n### ${label} ERROR`);
    console.log(error?.message ?? error);
  }
}

await logInspect("Sheets", { kind: "sheet", include: "id,name" });
await logInspect("Workbook labels", {
  kind: "match",
  searchTerm: "chart|graph|surface|height|radar|doppler|nadir|off-nadir|off nadir|trajectory|path|satellite|reference",
  options: { useRegex: true, matchCase: false, maxResults: 250 },
  summary: "key labels across workbook",
});

const sheetNames = [
  "Dashboard",
  "Inputs",
  "Model_Data",
  "Chart_Data",
  "Scenario_Data",
  "PRF_Results",
  "Formula_Guide",
  "Topography_Formulas",
  "Checks",
  "Graph_Guide",
  "Dashboard_Live_Data",
  "Native_Chart_Data",
];

console.log("\n### Charts");
for (const sheetName of sheetNames) {
  try {
    const sheet = workbook.worksheets.getItem(sheetName);
    const chartItems = sheet.charts?.items ?? [];
    if (chartItems.length === 0) continue;
    console.log(`${sheetName}: ${chartItems.length}`);
    for (const chart of chartItems) {
      const seriesNames = chart.series?.items?.map((series) => series.name).join(" | ");
      console.log(
        JSON.stringify({
          title: chart.title,
          type: chart.type,
          series: seriesNames,
        })
      );
    }
  } catch (error) {
    console.log(`${sheetName}: ${error?.message ?? error}`);
  }
}

await logInspect("Graph guide", {
  kind: "table",
  sheetId: "Graph_Guide",
  range: "A1:G20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 7,
});

await logInspect("Dashboard guide", {
  kind: "table",
  sheetId: "Dashboard",
  range: "A122:F128",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 6,
});

await logInspect("Model headers", {
  kind: "table",
  sheetId: "Model_Data",
  range: "A1:AS3",
  include: "values,formulas",
  tableMaxRows: 3,
  tableMaxCols: 45,
});

await logInspect("Chart headers", {
  kind: "table",
  sheetId: "Chart_Data",
  range: "A1:AB3",
  include: "values,formulas",
  tableMaxRows: 3,
  tableMaxCols: 28,
});

await logInspect("Dashboard KPIs", {
  kind: "table",
  sheetId: "Dashboard",
  range: "A6:F23",
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 6,
});
