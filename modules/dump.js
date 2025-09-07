const { c, path, fsp, writeUtf8WithBom, csvEscape } = require("../utils");

async function askDumpFormat(ask) {
  console.log(c.white("\nChoose dump format:"));
  console.log(c.white("1) TXT"));
  console.log(c.white("2) CSV"));
  const n = await require("../utils").askNumberInRange(ask, "Format (1-2): ", 1, 2);
  return n === 1 ? "txt" : "csv";
}

async function dumpToTxtFile(ctx, list, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(process.cwd(), `telegram_${label}_admin_${stamp}.txt`);
  const lines = [];
  lines.push(`${ctx.app.name} v${ctx.app.version}`);
  lines.push(`Author=${ctx.app.author} | GitHub=${ctx.app.github}`);
  lines.push(`Dumped=${new Date().toISOString()}`);
  lines.push(`=== ${label.toUpperCase()} (owner/admin) ===`);
  if (!list.length) lines.push("(none)");
  else
    for (const x of list) {
      const role = x.owner ? "[OWNER]" : x.admin ? "[ADMIN]" : "";
      lines.push(
        [
          `title=${x.title} ${role}`.trim(),
          `id=${x.id}`,
          `username=${x.username || ""}`,
          `status=${x.status}`,
          `created=${x.createdAt}`,
          `lastInteraction=${x.lastInteraction}`,
        ].join(" | ")
      );
    }
  await fsp.writeFile(outfile, lines.join("\n"), "utf8");
  return outfile;
}

async function dumpToCsvFile(ctx, list, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(process.cwd(), `telegram_${label}_admin_${stamp}.csv`);
  const lines = [];
  lines.push("sep=,"); // Excel hint
  lines.push(`App,${csvEscape(ctx.app.name)}`);
  lines.push(`Version,${csvEscape(ctx.app.version)}`);
  lines.push(`Author,${csvEscape(ctx.app.author)}`);
  lines.push(`GitHub,${csvEscape(ctx.app.github)}`);
  lines.push(`Dumped,${csvEscape(new Date().toISOString())}`);
  lines.push("");
  lines.push(["title", "role", "id", "username", "status", "created", "lastInteraction"].join(","));
  for (const x of list) {
    const role = x.owner ? "OWNER" : x.admin ? "ADMIN" : "";
    lines.push(
      [
        csvEscape(x.title),
        csvEscape(role),
        csvEscape(x.id),
        csvEscape(x.username || ""),
        csvEscape(x.status),
        csvEscape(x.createdAt),
        csvEscape(x.lastInteraction),
      ].join(",")
    );
  }
  const content = lines.join("\r\n");
  await writeUtf8WithBom(outfile, content);
  return outfile;
}

async function dumpFlow(ctx, ask, list, label) {
  const fmt = await askDumpFormat(ask);
  const file =
    fmt === "csv" ? await dumpToCsvFile(ctx, list, label) : await dumpToTxtFile(ctx, list, label);
  console.log(c.green(`\nSaved: ${file}\n`));
}

module.exports = {
  id: "dump",
  label: "Dump my groups/channels (TXT/CSV)",
  menu: "Dump my groups/channels (TXT/CSV)",
  order: 20,
  async run(ctx, ask) {
    // ensure cache from ownership module
    if (!ctx.cache.groups || !ctx.cache.channels) {
      const ownership = require("./ownership");
      await ownership.run(ctx, async () => "1");
    }
    console.log(c.bold("\n1) Dump groups\n2) Dump channels"));
    const choice = await require("../utils").askNumberInRange(ask, "Choose: ", 1, 2);
    if (choice === 1) await dumpFlow(ctx, ask, ctx.cache.groups, "groups");
    else await dumpFlow(ctx, ask, ctx.cache.channels, "channels");
  },
};
