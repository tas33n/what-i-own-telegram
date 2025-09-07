require("dotenv").config();
const boxen = require("boxen");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
let LogLevel;
try {
  ({ LogLevel } = require("telegram/extensions/Logger"));
} catch {}

const { makeAsk, askNumberInRange, c, fsp, fs, path } = require("./utils");

const APP = {
  name: "whats-i-own-telegram",
  version: "2.0.0",
  author: "tas33n",
  github: "https://github.com/tas33n/what-i-own-telegram",
  channel: "https://t.me/misfitdev",
};
const SESSION_FILE = process.env.TELEGRAM_SESSION_FILE || path.join(__dirname, "session.txt");
const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

function clearScreen() {
  process.stdout.write("\x1Bc");
}
function header() {
  const title = c.bold.cyan(APP.name) + " " + c.gray(`v${APP.version}`);
  const body =
    `${c.white("Author:")} ${c.bold(APP.author)}\n` +
    `${c.white("GitHub:")} ${c.underline(APP.github)}\n` +
    `${c.white("Telegram:")} ${c.underline(APP.channel)}`;

  const box = boxen(`${title}\n${body}`, {
    padding: 1,
    borderStyle: "round",
    borderColor: "cyan",
    dimBorder: false,
  });

  console.log(box);
}

function loadModules(dir) {
  const loaded = [];
  if (!fs.existsSync(dir)) return loaded;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    try {
      const mod = require(path.join(dir, file));
      if (!mod || typeof mod.run !== "function" || !mod.label) {
        console.log(c.yellow(`Skipped ${file} (missing {label, run})`));
        continue;
      }
      loaded.push({ ...mod, _file: file });
    } catch (e) {
      console.log(c.red(`Failed to load ${file}: ${e.message}`));
    }
  }
  loaded.sort((a, b) => (a.order || 999) - (b.order || 999) || a.label.localeCompare(b.label));
  return loaded;
}

async function main() {
  clearScreen();
  header();
  if (!API_ID || !API_HASH) {
    console.error(
      c.red("ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH env vars (from my.telegram.org).")
    );
    process.exit(1);
  }

  const { ask, close } = makeAsk();
  let saved = "";
  try {
    saved = (await fsp.readFile(SESSION_FILE, "utf8")).trim();
  } catch {}
  const client = new TelegramClient(new StringSession(saved), API_ID, API_HASH, {
    connectionRetries: 5,
  });
  try {
    if (typeof client.setLogLevel === "function") {
      if (LogLevel) client.setLogLevel(LogLevel.NONE);
      else client.setLogLevel("none");
    }
  } catch {}

  // Auth
  try {
    await client.start({
      phoneNumber: async () => await ask("  Phone (+country code): "),
      phoneCode: async () => await ask("  Code from Telegram/SMS: "),
      password: async () => await ask("  2FA password (if set): "),
      onError: (e) => {},
    });
    await fsp.writeFile(SESSION_FILE, client.session.save(), "utf8");
    const me = await client.getMe();
    const uname = me?.username ? `@${me.username}` : me?.firstName || "me";
    console.log(c.green(`Connected as ${uname} (id: ${me?.id || "?"})\n`));
  } catch (err) {
    console.error(c.red(`Failed to connect: ${err && (err.message || err)}`));
    close();
    process.exit(1);
  }

  // Load modules dynamically
  const modulesDir = path.join(__dirname, "modules");
  const modules = loadModules(modulesDir);
  if (!modules.length) {
    console.log(c.red("No modules found in ./modules"));
    close();
    process.exit(1);
  }
  console.log(c.gray("Loaded modules:"), modules.map((m) => m.id || m.label).join(", "));

  // Shared context for modules
  const ctx = {
    app: APP,
    client,
    utils: require("./utils"),
    cache: { groups: null, channels: null },
    config: { sessionFile: SESSION_FILE },
  };

  while (true) {
    console.log(c.bold("\n──── MENU ─────────────────────────────────────────────"));
    modules.forEach((m, i) => console.log(c.white(`${i + 1}) ${m.menu || m.label}`)));
    console.log(c.white(`${modules.length + 1}) Exit`));
    const choice = await askNumberInRange(ask, "Choose an option: ", 1, modules.length + 1);
    if (choice === modules.length + 1) break;

    const mod = modules[choice - 1];
    try {
      await mod.run(ctx, ask);
    } catch (e) {
      console.log(c.red(`Module "${mod.label}" failed: ${e && (e.message || e)}`));
    }
  }

  close();
  process.exit(0);
}

main().catch((err) => {
  console.error(c.red(`Fatal error: ${err && (err.message || err)}`));
  process.exit(1);
});
