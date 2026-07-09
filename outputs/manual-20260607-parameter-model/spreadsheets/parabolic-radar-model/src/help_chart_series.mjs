import { Workbook } from "@oai/artifact-tool";

const workbook = Workbook.create();
const help = workbook.help("chart.series", { include: "index,examples,notes", maxChars: 5000 });
console.log(help.ndjson);
