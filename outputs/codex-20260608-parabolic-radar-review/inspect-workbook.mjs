import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/manual-20260607-parameter-model/spreadsheets/parabolic-radar-model/output/parabolic-motion-radar-model-baseline-and-runs.xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

async function dump(label, options) {
  console.log(`\n--- ${label} ---`);
  const result = await workbook.inspect(options);
  console.log(result.ndjson);
}

await dump("workbook overview", {
  kind: "workbook,sheet,table,drawing",
  include: "id,name,title,type,range,formula,categoryFormula,series",
  tableMaxRows: 8,
  tableMaxCols: 10,
  tableMaxCellChars: 100,
  maxChars: 20000,
});

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 6000,
});

const sheetNames = [];
for (const line of sheets.ndjson.trim().split(/\r?\n/)) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line);
    if (row.name) sheetNames.push(row.name);
  } catch {}
}

for (const sheetName of sheetNames) {
  await dump(`${sheetName} A1:Z45 values/formulas`, {
    kind: "table,formula",
    sheetId: sheetName,
    range: "A1:Z45",
    include: "values,formulas",
    tableMaxRows: 45,
    tableMaxCols: 26,
    tableMaxCellChars: 140,
    maxChars: 30000,
    options: { maxResults: 150 },
  });
}

await dump("formula error scan", {
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
  options: { useRegex: true, maxResults: 300 },
  maxChars: 12000,
});
