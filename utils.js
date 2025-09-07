const readline = require("readline");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const c = require("ansi-colors");

function makeAsk() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
  const close = () => rl.close();
  return { ask, close };
}

async function askNumberInRange(ask, q, min, max) {
  while (true) {
    const a = await ask(q);
    const n = Number(a);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    console.log(c.yellow(`Please enter a number between ${min} and ${max}.\n`));
  }
}

async function askYesNo(ask, prompt, def = "y") {
  const ans = (await ask(`${prompt} [y/n] (${def}): `)).trim().toLowerCase();
  if (!ans) return def.toLowerCase() === "y";
  return ["y","yes"].includes(ans);
}

async function askCommaList(ask, prompt) {
  const raw = await ask(prompt);
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function asISO(sec) {
  if (!sec) return "—";
  try { return new Date(sec * 1000).toISOString(); } catch { return "—"; }
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v).replace(/\r?\n/g, "\r\n");
  const needsQuotes = /[",\r\n]/.test(s);
  const esc = s.replace(/"/g, '""');
  return needsQuotes ? `"${esc}"` : esc;
}

async function writeUtf8WithBom(filePath, content) {
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const buf = Buffer.from(content, "utf8");
  await fsp.writeFile(filePath, Buffer.concat([bom, buf]));
  return filePath;
}

module.exports = {
  makeAsk,
  askNumberInRange,
  askYesNo,
  askCommaList,
  asISO,
  csvEscape,
  writeUtf8WithBom,
  c,
  path,
  fs,
  fsp
};
