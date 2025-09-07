const APP_NAME = "Whats i own";
const APP_VERSION = "1.0.0";
const AUTHOR = "tas33n";
const GITHUB_URL = "https://github.com/tas33n/whats-i-own-telegram";
const TG_CHANNEL = "https://t.me/misfitdev";

// ──────────────────────────────────────────────────────────────────────────────
require("dotenv").config();
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const readline = require("readline");
const c = require("ansi-colors");
const boxen = require("boxen");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

let LogLevel;
let LoggerBase;
try {
  ({ LogLevel } = require("telegram/extensions/Logger"));
  ({ Logger: LoggerBase } = require("telegram/extensions/Logger"));
} catch {}

class SilentLogger extends (LoggerBase || class {}) {
  constructor() {
    super();
    this.level = LogLevel ? LogLevel.NONE : "none";
  }
  setLevel() {
    /* ignore */
  }
  log() {
    /* swallow everything */
  }
}

// ──────────────────────────────────────────────────────────────────────────────
const SESSION_FILE =
  process.env.TELEGRAM_SESSION_FILE || path.join(__dirname, "session.txt");
const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

// version flag
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`${APP_NAME} v${APP_VERSION}`);
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Pretty header + console cleanup
// ──────────────────────────────────────────────────────────────────────────────
function clearScreen() {
  // clears scrollback nicely on most terminals
  process.stdout.write("\x1Bc");
}

function header() {
  const title = c.bold.cyan(APP_NAME) + " " + c.gray(`v${APP_VERSION}`);
  const body =
    `${c.white("Author:")} ${c.bold(AUTHOR)}\n` +
    `${c.white("GitHub:")} ${c.underline(GITHUB_URL)}\n` +
    `${c.white("Telegram:")} ${c.underline(TG_CHANNEL)}`;

  const box = boxen(`${title}\n${body}`, {
    padding: 1,
    borderStyle: "round",
    borderColor: "cyan",
    dimBorder: false,
  });

  console.log(box);
}

// ──────────────────────────────────────────────────────────────────────────────
// Console helpers
// ──────────────────────────────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function ask(q) {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}
async function askNumberInRange(q, min, max) {
  while (true) {
    const a = await ask(q);
    const n = Number(a);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    console.log(c.yellow(`Please enter a number between ${min} and ${max}.\n`));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────────────────────
function asISO(sec) {
  if (!sec) return "—";
  try {
    return new Date(sec * 1000).toISOString();
  } catch {
    return "—";
  }
}
function pickUsername(entity) {
  if (entity.username) return entity.username;
  if (
    Array.isArray(entity.usernames) &&
    entity.usernames.length > 0 &&
    entity.usernames[0]?.username
  )
    return entity.usernames[0].username;
  return "";
}
function classify(entity) {
  const className = entity?.className; // "Chat" | "Channel"
  const creator = !!entity?.creator;
  const admin = creator || !!entity?.adminRights;

  const state = [];
  if (entity?.deactivated) state.push("deactivated");
  if (entity?.left) state.push("left");
  if (entity?.kicked) state.push("kicked");
  if (entity?.min) state.push("min");

  if (className === "Chat") {
    return { kind: "group", owner: creator, admin, state };
  }
  if (className === "Channel") {
    const isMega = !!entity.megagroup;
    const isBroadcast = !!entity.broadcast;
    if (isMega) return { kind: "group", owner: creator, admin, state };
    if (isBroadcast) return { kind: "channel", owner: creator, admin, state };
  }
  return { kind: "other", owner: creator, admin, state };
}
function visibleStatus(state, inaccessibleFlag) {
  const s = [...state];
  if (inaccessibleFlag) s.push("inaccessible");
  return s.length ? s.join(", ") : "active";
}
function colorizeTitle(title, { owner, admin }, statusStr) {
  const hasIssue = /inaccessible|deactivated|kicked|left/i.test(statusStr);
  if (hasIssue) return c.red(title);
  if (owner) return c.green(title);
  if (admin) return c.yellow(title);
  return title;
}

// ──────────────────────────────────────────────────────────────────────────────
// Creation date resolver
// ──────────────────────────────────────────────────────────────────────────────
async function getCreationDate(client, peerEntity, classification) {
  try {
    const entityDate = peerEntity?.date
      ? new Date(peerEntity.date * 1000)
      : null;
    if (classification.owner && entityDate) return entityDate.toISOString();
  } catch {}

  try {
    const it = client.iterMessages(peerEntity, { reverse: true, limit: 1 });
    for await (const msg of it) {
      if (msg?.date) return new Date(msg.date * 1000).toISOString();
    }
  } catch (err) {
    const msg = (err && (err.message || String(err))) || "";
    if (
      /CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|AUTH_KEY_PERM_EMPTY|SESSION_PASSWORD_NEEDED/i.test(
        msg
      )
    ) {
      const e = new Error("INACCESSIBLE");
      e.code = "INACCESSIBLE";
      throw e;
    }
  }
  return "unknown";
}

// ──────────────────────────────────────────────────────────────────────────────
// Data collection
// ──────────────────────────────────────────────────────────────────────────────
async function collectMyAdminChats(client) {
  const dialogs = await client.getDialogs({});
  const groups = [];
  const channels = [];

  for (const d of dialogs) {
    const entity = d.entity;
    const info = classify(entity);
    if (!info.admin) continue;

    const idStr = entity?.id ? String(entity.id) : d.id ? String(d.id) : "";
    const title = entity?.title || d.title || d.name || "";
    const uname = pickUsername(entity);
    const lastInteractionISO = asISO(d?.date || d?.message?.date);

    const base = {
      id: idStr,
      title,
      username: uname,
      owner: info.owner,
      admin: info.admin,
      state: info.state,
      status: "active",
      lastInteraction: lastInteractionISO,
      createdAt: "unknown",
      _entity: entity,
      _kind: info.kind,
    };

    if (info.kind === "group") groups.push(base);
    else if (info.kind === "channel") channels.push(base);
  }
  return { groups, channels };
}

async function hydrateCreationDates(client, list) {
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    try {
      const created = await getCreationDate(client, it._entity, {
        owner: it.owner,
      });
      it.createdAt = created;
      it.status = visibleStatus(it.state, false);
    } catch (e) {
      if (e && e.code === "INACCESSIBLE") {
        it.createdAt = "inaccessible";
        it.status = visibleStatus(it.state, true);
      } else {
        it.status = visibleStatus(it.state, false);
      }
    } finally {
      delete it._entity;
    }
  }
  return list;
}

// ──────────────────────────────────────────────────────────────────────────────
// Presentation
// ──────────────────────────────────────────────────────────────────────────────
function printList(list, headerText) {
  console.log(c.cyan(`\n=== ${headerText} ===`));
  if (!list.length) {
    console.log(c.gray("(none)\n"));
    return;
  }
  list.forEach((x, idx) => {
    const ownerMark = x.owner
      ? c.green(" [OWNER]")
      : x.admin
      ? c.yellow(" [ADMIN]")
      : "";
    const titleCol = colorizeTitle(
      `${x.title}`,
      { owner: x.owner, admin: x.admin },
      x.status
    );
    console.log(
      `${c.white(`${idx + 1}.`)} ${titleCol}${ownerMark}\n` +
        `   ${c.gray("id:")} ${x.id}\n` +
        `   ${c.gray("username:")} ${x.username || "—"}\n` +
        `   ${c.gray("status:")} ${x.status}\n` +
        `   ${c.gray("created:")} ${x.createdAt}\n` +
        `   ${c.gray("last interaction:")} ${x.lastInteraction}\n`
    );
  });
}

async function askDumpFormat() {
  console.log(c.white("\nChoose dump format:"));
  console.log(c.white("1) TXT"));
  console.log(c.white("2) CSV"));
  const n = await askNumberInRange(c.white("Format (1-2): "), 1, 2);
  return n === 1 ? "txt" : "csv";
}

async function dumpToTxtFile(list, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(
    process.cwd(),
    `telegram_${label}_admin_${stamp}.txt`
  );
  const lines = [];

  lines.push(`${APP_NAME} v${APP_VERSION}`);
  lines.push(
    `Author=${AUTHOR} | GitHub=${GITHUB_URL} | Telegram=${TG_CHANNEL}`
  );
  lines.push(`Dumped=${new Date().toISOString()}`);
  lines.push(`=== ${label.toUpperCase()} (owner/admin) ===`);

  if (!list.length) {
    lines.push("(none)");
  } else {
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
  }
  await fsp.writeFile(outfile, lines.join("\n"), "utf8");
  return outfile;
}
function writeUtf8WithBom(filePath, content) {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const buf = Buffer.from(content, "utf8");
  return fsp.writeFile(filePath, Buffer.concat([bom, buf]));
}
// CSV writer
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v).replace(/\r?\n/g, "\r\n");
  const needsQuotes = /[",\r\n]/.test(s);
  const esc = s.replace(/"/g, '""');
  return needsQuotes ? `"${esc}"` : esc;
}

async function dumpToCsvFile(list, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(
    process.cwd(),
    `telegram_${label}_admin_${stamp}.csv`
  );

  const lines = [];
  // Header
  lines.push(
    [
      "title",
      "role",
      "id",
      "username",
      "status",
      "created",
      "lastInteraction",
    ].join(",")
  );

  // Rows
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

  // Write with UTF-8 BOM
  await writeUtf8WithBom(outfile, content);
  return outfile;
}

// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  clearScreen();
  header();

  if (!API_ID || !API_HASH) {
    console.error(
      c.red(
        "ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH env vars (from my.telegram.org)."
      )
    );
    process.exit(1);
  }

  // session bootstrap
  let saved = "";
  try {
    saved = (await fsp.readFile(SESSION_FILE, "utf8")).trim();
  } catch {}
  const client = new TelegramClient(
    new StringSession(saved),
    API_ID,
    API_HASH,
    { connectionRetries: 5, baseLogger: new SilentLogger() }
  );

  try {
    if (typeof client.setLogLevel === "function") {
      if (LogLevel) client.setLogLevel(LogLevel.NONE);
      else client.setLogLevel("none"); // older string API
    }
  } catch {}

  console.log(c.gray("Authenticate your Telegram user (MTProto)."));
  await client.start({
    phoneNumber: async () => await ask(c.white("  Phone (+country code): ")),
    phoneCode: async () => await ask(c.white("  Code from Telegram/SMS: ")),
    password: async () => await ask(c.white("  2FA password (if set): ")),
    onError: (e) => console.error(c.red(`Auth error: ${e.message || e}`)),
  });

  // persist session
  try {
    await fsp.writeFile(SESSION_FILE, client.session.save(), "utf8");
  } catch {}

  // Fetch your user & print one clean line
  const me = await client.getMe();
  const uname = me?.username
    ? `@${me.username}`
    : me?.firstName
    ? me.firstName
    : "me";
  const id = me?.id ? String(me.id) : "unknown-id";
  console.log(`Connected as ${uname} (id: ${id})`);

  console.log(
    c.gray("\nFetching your dialogs (owner/admin)... this may take a moment.")
  );
  let { groups, channels } = await collectMyAdminChats(client);

  groups = await hydrateCreationDates(client, groups);
  channels = await hydrateCreationDates(client, channels);

  // main loop
  while (true) {
    console.log(
      c.bold("\n──── MENU ─────────────────────────────────────────────")
    );
    console.log(c.white("1) Show my groups (owner/admin)"));
    console.log(c.white("2) Show my channels (owner/admin)"));
    console.log(c.white("3) Dump groups (choose TXT/CSV)"));
    console.log(c.white("4) Dump channels (choose TXT/CSV)"));
    console.log(c.white("5) Exit"));
    const choice = await askNumberInRange(
      c.white("Choose an option (1-5): "),
      1,
      5
    );

    if (choice === 1) {
      printList(groups, "MY GROUPS");
    } else if (choice === 2) {
      printList(channels, "MY CHANNELS");
    } else if (choice === 3) {
      const fmt = await askDumpFormat();
      const file =
        fmt === "csv"
          ? await dumpToCsvFile(groups, "groups")
          : await dumpToTxtFile(groups, "groups");
      console.log(c.green(`\nSaved: ${file}\n`));
    } else if (choice === 4) {
      const fmt = await askDumpFormat();
      const file =
        fmt === "csv"
          ? await dumpToCsvFile(channels, "channels")
          : await dumpToTxtFile(channels, "channels");
      console.log(c.green(`\nSaved: ${file}\n`));
    } else if (choice === 5) {
      break;
    }
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(c.red(`Fatal error: ${err && (err.message || err)}`));
  rl.close();
  process.exit(1);
});
