import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/manual-20260607-parameter-model/spreadsheets/parabolic-radar-model/output/parabolic-motion-radar-model-baseline-and-runs.xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetInfo = await workbook.inspect({
  kind: "sheet",
  include: "name",
  maxChars: 6000,
});

const sheetNames = sheetInfo.ndjson
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
          categories: chart.categories,
          xAxis: chart.xAxis,
          yAxis: chart.yAxis,
        },
        null,
        2,
      ),
    );
    const series = chart.series?.items ?? [];
    series.forEach((s, seriesIndex) => {
      console.log(
        JSON.stringify(
          {
            seriesIndex,
            name: s.name,
            formula: s.formula,
            categoryFormula: s.categoryFormula,
            fill: s.fill,
            line: s.line,
            marker: s.marker,
          },
          null,
          2,
        ),
      );
    });
  });
}
