import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(projectRoot, "data", "country-region-codes.json");
const countries = JSON.parse(await readFile(jsonPath, "utf8"));

const requiredFields = ["name_zh", "name_en", "alpha2", "alpha3", "numeric"];
const errors = [];
const seenAlpha2 = new Set();
const seenAlpha3 = new Set();

for (const [index, country] of countries.entries()) {
  for (const field of requiredFields) {
    if (!country[field]) errors.push(`第 ${index + 1} 条缺少字段：${field}`);
  }

  if (!/^[A-Z]{2}$/.test(country.alpha2)) errors.push(`${country.name_en}: alpha2 格式错误`);
  if (!/^[A-Z]{3}$/.test(country.alpha3)) errors.push(`${country.name_en}: alpha3 格式错误`);
  if (!/^\d{3}$/.test(country.numeric)) errors.push(`${country.name_en}: numeric 格式错误`);
  for (const dialingCode of country.dialing_codes) {
    if (!/^\+[0-9-]+$/.test(dialingCode)) {
      errors.push(`${country.name_en}: 国际电话区号格式错误（${dialingCode}）`);
    }
  }
  if (seenAlpha2.has(country.alpha2)) errors.push(`alpha2 重复：${country.alpha2}`);
  if (seenAlpha3.has(country.alpha3)) errors.push(`alpha3 重复：${country.alpha3}`);

  seenAlpha2.add(country.alpha2);
  seenAlpha3.add(country.alpha3);
}

if (countries.length < 240) errors.push(`记录数异常：仅 ${countries.length} 条`);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`校验通过：${countries.length} 条记录，ISO 代码无重复。`);
}

