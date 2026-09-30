import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(projectRoot, "data");
const sourceUrl =
  "https://raw.githubusercontent.com/datasets/country-codes/main/data/country-codes.csv";

const response = await fetch(sourceUrl, { headers: { Accept: "text/csv" } });
if (!response.ok) throw new Error(`数据请求失败：HTTP ${response.status}`);

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift();
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
};

const clean = (value) => String(value ?? "").replaceAll("\u00a0", "").trim();
const displayNamesZh = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const displayNamesEn = new Intl.DisplayNames(["en"], { type: "region" });

const normalizeDialingCodes = (value) =>
  clean(value)
    .split(/[,;/]+/)
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => (code.startsWith("+") ? code : `+${code}`));

const countries = parseCsv(await response.text())
  .filter((row) => /^[A-Z]{2}$/.test(clean(row["ISO3166-1-Alpha-2"])))
  .map((row) => {
    const alpha2 = clean(row["ISO3166-1-Alpha-2"]);
    const numeric = clean(row["ISO3166-1-numeric"]).padStart(3, "0");
    return {
      name_zh:
        displayNamesZh.of(alpha2) ||
        clean(row["UNTERM Chinese Short"]) ||
        clean(row.official_name_cn) ||
        clean(row["CLDR display name"]),
      name_en:
        displayNamesEn.of(alpha2) ||
        clean(row["UNTERM English Short"]) ||
        clean(row["CLDR display name"]) ||
        clean(row.official_name_en),
      official_name_en:
        clean(row["UNTERM English Formal"]) || clean(row.official_name_en) || clean(row["CLDR display name"]),
      alpha2,
      alpha3: clean(row["ISO3166-1-Alpha-3"]),
      numeric,
      dialing_codes: normalizeDialingCodes(row.Dial),
      region: clean(row["Region Name"]),
      subregion: clean(row["Sub-region Name"]),
    };
  })
  .sort((a, b) => a.name_zh.localeCompare(b.name_zh, "zh-CN"));

const csvColumns = [
  "name_zh",
  "name_en",
  "official_name_en",
  "alpha2",
  "alpha3",
  "numeric",
  "dialing_codes",
  "region",
  "subregion",
];

const escapeCsv = (value) => {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csv = [
  csvColumns.join(","),
  ...countries.map((country) =>
    csvColumns.map((column) => escapeCsv(country[column])).join(","),
  ),
].join("\n");

const compactDialingCodes = (codes) => {
  if (codes.length <= 3) return codes.join("、") || "—";
  return `${codes.slice(0, 3).join("、")} 等 ${codes.length} 个`;
};

const tableRows = countries
  .map(
    (country) =>
      `| ${country.name_zh} | ${country.name_en} | ${country.alpha2} | ${country.alpha3} | ${country.numeric} | ${compactDialingCodes(country.dialing_codes)} | ${country.region || "—"} |`,
  )
  .join("\n");

const today = new Date().toISOString().slice(0, 10);
const readme = `# 国家/地区代码列表

一份便于查询和程序使用的国家/地区代码列表，包含中文名、英文名、ISO 3166-1 代码、国际电话区号和所属区域。

## 数据格式

- [CSV](./data/country-region-codes.csv)：适合 Excel、数据库导入和快速筛选。
- [JSON](./data/country-region-codes.json)：适合前端、后端和 API 项目直接使用。
- 本页 Markdown 表格：适合在 GitHub 上快速浏览。

字段说明：

| 字段 | 含义 |
| --- | --- |
| \`name_zh\` | 常用中文名 |
| \`name_en\` | 常用英文名 |
| \`official_name_en\` | 官方英文名 |
| \`alpha2\` | ISO 3166-1 两位字母代码 |
| \`alpha3\` | ISO 3166-1 三位字母代码 |
| \`numeric\` | ISO 3166-1 三位数字代码（字符串） |
| \`dialing_codes\` | 国际电话拨号前缀数组；CSV 中以 \`|\` 分隔 |
| \`region\` / \`subregion\` | 区域与次区域 |

## 完整列表

共 ${countries.length} 个国家或地区。数据更新时间：${today}。

| 中文名 | 英文名 | Alpha-2 | Alpha-3 | 数字代码 | 国际电话区号 | 区域 |
| --- | --- | --- | --- | --- | --- | --- |
${tableRows}

## 更新数据

需要 Node.js 18 或更高版本：

\`\`\`powershell
npm run update
npm run check
\`\`\`

## 数据来源与注意事项

- 数据基于 [DataHub Country Codes](https://github.com/datasets/country-codes)，该数据集汇总 ISO、UN M49、ITU 等公开来源。
- ISO 3166-1 的权威定义以 [ISO 官方页面](https://www.iso.org/iso-3166-country-codes.html) 为准。
- 国际电话编号会出现共享编号区和多个前缀，\`dialing_codes\` 因此使用数组保存。
- 国家和地区名称可能涉及不同语言、政治与行政口径；用于合规、支付或身份验证前，请结合业务所在司法辖区复核。
`;

await mkdir(dataDir, { recursive: true });
await Promise.all([
  writeFile(path.join(dataDir, "country-region-codes.json"), `${JSON.stringify(countries, null, 2)}\n`, "utf8"),
  writeFile(path.join(dataDir, "country-region-codes.csv"), `${csv}\n`, "utf8"),
  writeFile(path.join(projectRoot, "README.md"), readme, "utf8"),
]);

console.log(`已生成 ${countries.length} 条国家/地区数据。`);

