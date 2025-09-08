const { c, askNumberInRange, askYesNo, askCommaList } = require("../utils");
const { Api } = require("telegram/tl");
const fsp = require("fs/promises");
const path = require("path");

const DELAY_MS = 800;
const DEFAULT_POST_DELAY_MS = Number(process.env.CREATOR_POST_INTERVAL_MS || 1500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------- helpers --------------------
async function loadWordlist(filePath) {
  if (!filePath) return [];
  try {
    const text = await fsp.readFile(path.resolve(filePath), "utf8");
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
function randomWords(count) {
  const bank = [
    "Astra",
    "Nova",
    "Pulse",
    "Echo",
    "Quanta",
    "Vertex",
    "Arc",
    "Sigma",
    "Flux",
    "Zenith",
    "Nimbus",
    "Helix",
    "Ion",
    "Vector",
    "Orion",
    "Lyra",
    "Quantum",
    "Aegis",
    "Cipher",
    "Atlas",
  ];
  const out = [];
  for (let i = 0; i < count; i++)
    out.push(
      `${bank[Math.floor(Math.random() * bank.length)]} ${
        bank[Math.floor(Math.random() * bank.length)]
      }`
    );
  return out;
}
function serializeName(base, idx, pad) {
  const n = String(idx + 1).padStart(pad, "0");
  return `${base} (${n})`;
}
async function toInputUsers(client, ids) {
  const users = [];
  for (const id of ids) {
    try {
      users.push(await client.getInputEntity(id));
    } catch {}
  }
  return users;
}

// -------------------- creation methods --------------------
// Supergroup (always, for visibility control)
async function createSupergroup(client, title, about = "") {
  const res = await client.invoke(
    new Api.channels.CreateChannel({
      title,
      about,
      megagroup: true,
      broadcast: false,
    })
  );
  const created = res?.chats?.[0];
  if (!created) throw new Error("Failed to create supergroup");
  // Make history visible
  // await client.invoke(new Api.channels.TogglePreHistoryHidden({
  //   channel: created,
  //   enabled: false
  // }));
  // console.log(c.green(`✓ History visibility set for ${title}`));
  return created;
}

// Channel
async function createBroadcastChannel(client, title, about = "") {
  const res = await client.invoke(
    new Api.channels.CreateChannel({
      title,
      about,
      broadcast: true,
      megagroup: false,
    })
  );
  const created = res?.chats?.[0];
  if (!created) throw new Error("Failed to create channel");
  // await client.invoke(
  //   new Api.channels.TogglePreHistoryHidden({
  //     channel: created,
  //     enabled: false,
  //   })
  // );
  // console.log(c.green(`✓ History visibility set for ${title}`));
  return created;
}

async function inviteToChannelOrSupergroup(client, channel, inputUsers) {
  if (!inputUsers?.length) return;
  try {
    await client.invoke(new Api.channels.InviteToChannel({ channel, users: inputUsers }));
  } catch {}
}

async function postSeedMessage(client, peer, text, tags = []) {
  const tagLine = tags.length
    ? `\n\n${tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}`
    : "";
  await client.sendMessage(peer, { message: `${text}${tagLine}` });
}

// Send a message while respecting Telegram flood waits
async function floodSafeSend(client, peer, message) {
  try {
    await client.sendMessage(peer, { message, parseMode: "html" });
    return true;
  } catch (e) {
    const msg = e && (e.message || e.toString());
    // Try to parse FLOOD_WAIT seconds
    let waitSec = 0;
    if (typeof e?.seconds === "number" && e.seconds > 0) waitSec = e.seconds;
    else if (msg && /FLOOD_WAIT_(\d+)/.test(msg)) {
      try {
        waitSec = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)[1], 10) || 0;
      } catch {}
    }
    if (waitSec > 0) {
      console.log(c.yellow(`Flood wait ${waitSec}s — pausing then retrying...`));
      await sleep((waitSec + 1) * 1000);
      try {
        await client.sendMessage(peer, { message });
        return true;
      } catch (e2) {
        console.log(c.red(`Retry failed: ${e2 && (e2.message || e2)}`));
        return false;
      }
    }
    // Not a known flood wait error; bubble up as failure (but don't throw)
    console.log(c.red(`Send failed: ${msg}`));
    return false;
  }
}

async function postMultipleMessages({
  client,
  peer,
  count,
  firstMessage,
  followupMessage,
  hashtags = [],
}) {
  const total = Math.max(1, Number(count || 1));
  for (let i = 0; i < total; i++) {
    const base = i === 0 ? firstMessage : followupMessage;
    const tagLine = hashtags.length
      ? `\n\n${hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}`
      : "";
    const text = `${base}${tagLine}`;
    await floodSafeSend(client, peer, text);
    if (i < total - 1) await sleep(DEFAULT_POST_DELAY_MS);
  }
}

// -------------------- orchestrator --------------------
async function makeEntities({
  client,
  type, // "group" | "channel"
  count,
  wordlistPath,
  inviteIds = [],
  seedMessage = "Welcome! This space was created automatically.",
  hashtags = ["misfitdev", "autocreated", "finder"],
  app,
}) {
  const wl = await loadWordlist(wordlistPath);
  const bases = wl.length ? wl : randomWords(count);
  const pad = String(count).length;
  const inputUsers = await toInputUsers(client, inviteIds);

  // How many messages to send per newly created entity
  const postCount = Math.max(
    1,
    Number(process.env.CREATOR_POST_COUNT || process.env.POST_MESSAGE_COUNT || 1)
  );

  const made = [];
  let ok = 0,
    fail = 0;

  for (let i = 0; i < count; i++) {
    const base = bases[i % bases.length];
    const title = serializeName(base, i, pad);
    process.stdout.write(c.gray(`Creating ${type} ${i + 1}/${count}: ${title} ... `));

    try {
      let created;
      if (type === "group") {
        created = await createSupergroup(client, title);
        await inviteToChannelOrSupergroup(client, created, inputUsers);
      } else {
        created = await createBroadcastChannel(client, title);
        await inviteToChannelOrSupergroup(client, created, inputUsers);
      }
      // Compose promotional first message
      const promo =
        `This space was created with ${app?.name || "our CLI"} — it\'s free!` +
        `Promo: Join <a href="${app?.channel || "https://t.me/misfitdev"}">${
          app?.channel || "@misfitdev"
        }</a> — subscribe and please ⭐ the repo: <a href="${
          app?.repo || "https://github.com/misfitdev/what-i-own-telegram"
        }">${app?.repo || "GitHub repo"}</a>.`;
      await postMultipleMessages({
        client,
        peer: created,
        count: postCount,
        firstMessage: `${promo}\n\n${seedMessage}`,
        followupMessage: seedMessage,
        hashtags,
      });
      console.log(c.green(`OK (id: ${created.id})`));
      made.push({ id: String(created.id), title, type });
      ok++;
    } catch (e) {
      console.log(c.red(`FAILED — ${e.message || e}`));
      fail++;
    }

    await sleep(DELAY_MS);
  }

  console.log(c.cyan(`\nSummary: created ${ok}, failed ${fail}, total attempted ${ok + fail}`));
  return made;
}

// -------------------- module API --------------------
module.exports = {
  id: "creator",
  label: "Create groups/channels (bulk)",
  menu: "Create groups/channels (bulk)",
  order: 30,
  async run(ctx, ask) {
    console.log(c.cyan("\n=== CREATE ENTITIES ==="));
    console.log("1) Create GROUPS (supergroups, with history visible)");
    console.log("2) Create CHANNELS (broadcast, with history visible)");
    const t = await askNumberInRange(ask, "Choose type (1-2): ", 1, 2);
    const type = t === 1 ? "group" : "channel";

    const n = await askNumberInRange(ask, "How many to create: ", 1, 500);
    const wordlistPath = await ask("Wordlist file path (optional): ");
    const inviteIds = await askCommaList(
      ask,
      "Invite user IDs or @usernames (comma-separated; optional): "
    );

    const useCustomMsg = await askYesNo(ask, "Add a custom seed message?", "n");
    let seedMessage = "This space was created automatically.";
    if (useCustomMsg) seedMessage = await ask("Enter message: ");

    const tagLine = await ask(
      "Hashtags (space-separated, e.g. 'misfitdev autocreated finder'; optional): "
    );
    const hashtags = tagLine
      ? tagLine
          .split(/\s+/)
          .map((s) => s.replace(/^#/, ""))
          .filter(Boolean)
      : ["misfitdev", "autocreated", "finder"];

    console.log(c.gray("\nCreating... please wait.\n"));
    await makeEntities({
      client: ctx.client,
      type,
      count: n,
      wordlistPath,
      inviteIds,
      seedMessage,
      hashtags,
      app: ctx.app,
    });
  },
};
