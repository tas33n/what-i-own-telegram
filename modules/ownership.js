const { c } = require("../utils");

function classify(entity) {
  const className = entity?.className;
  const creator = !!entity?.creator;
  const admin = creator || !!entity?.adminRights;
  const state = [];
  if (entity?.deactivated) state.push("deactivated");
  if (entity?.left) state.push("left");
  if (entity?.kicked) state.push("kicked");
  if (entity?.min) state.push("min");
  if (className === "Chat") return { kind: "group", owner: creator, admin, state };
  if (className === "Channel") {
    if (entity.megagroup) return { kind: "group", owner: creator, admin, state };
    if (entity.broadcast) return { kind: "channel", owner: creator, admin, state };
  }
  return { kind: "other", owner: creator, admin, state };
}

function pickUsername(e) {
  if (e.username) return e.username;
  if (Array.isArray(e.usernames) && e.usernames[0]?.username) return e.usernames[0].username;
  return "";
}

function colorizeTitle(title, { owner, admin }, status) {
  const bad = /inaccessible|deactivated|kicked|left/i.test(status);
  if (bad) return c.red(title);
  if (owner) return c.green(title);
  if (admin) return c.yellow(title);
  return title;
}

function visibleStatus(state, inaccessible) {
  const s = [...state];
  if (inaccessible) s.push("inaccessible");
  return s.length ? s.join(", ") : "active";
}

async function hydrate(ctx) {
  if (ctx.cache.groups && ctx.cache.channels) return;
  const { client, utils } = ctx;
  const dialogs = await client.getDialogs({});
  const groups = [],
    channels = [];
  for (const d of dialogs) {
    const e = d.entity;
    const info = classify(e);
    if (!info.admin) continue;
    const item = {
      id: e?.id ? String(e.id) : d.id ? String(d.id) : "",
      title: e?.title || d.title || d.name || "",
      username: pickUsername(e),
      owner: info.owner,
      admin: info.admin,
      state: info.state,
      status: "active",
      lastInteraction: utils.asISO(d?.date || d?.message?.date),
      createdAt: "unknown",
      _entity: e,
      _kind: info.kind,
    };
    if (info.kind === "group") groups.push(item);
    else if (info.kind === "channel") channels.push(item);
  }

  // creation date approximation + status
  for (const list of [groups, channels]) {
    for (const it of list) {
      try {
        const ent = it._entity;
        if (it.owner && ent?.date) {
          it.createdAt = new Date(ent.date * 1000).toISOString();
        } else {
          const iter = client.iterMessages(ent, { reverse: true, limit: 1 });
          for await (const msg of iter) {
            if (msg?.date) {
              it.createdAt = new Date(msg.date * 1000).toISOString();
              break;
            }
          }
        }
        it.status = visibleStatus(it.state, false);
      } catch (e) {
        it.createdAt = "inaccessible";
        it.status = visibleStatus(it.state, true);
      } finally {
        delete it._entity;
      }
    }
  }

  ctx.cache.groups = groups;
  ctx.cache.channels = channels;
}

function printList(list, header) {
  console.log(c.cyan(`\n=== ${header} ===`));
  if (!list.length) return console.log(c.gray("(none)\n"));
  list.forEach((x, i) => {
    const role = x.owner ? c.green(" [OWNER]") : x.admin ? c.yellow(" [ADMIN]") : "";
    const title = colorizeTitle(x.title, { owner: x.owner, admin: x.admin }, x.status);
    console.log(`${c.white(String(i + 1) + ".")} ${title}${role}
   ${c.gray("id:")} ${x.id}
   ${c.gray("username:")} ${x.username || "—"}
   ${c.gray("status:")} ${x.status}
   ${c.gray("created:")} ${x.createdAt}
   ${c.gray("last interaction:")} ${x.lastInteraction}
`);
  });
}

module.exports = {
  id: "ownership",
  label: "Show my groups/channels (owner/admin)",
  menu: "Show my groups/channels (owner/admin)",
  order: 10,
  async run(ctx, ask) {
    await hydrate(ctx);
    console.log(c.bold("\n1) Show groups\n2) Show channels"));
    const choice = await require("../utils").askNumberInRange(ask, "Choose: ", 1, 2);
    if (choice === 1) printList(ctx.cache.groups, "MY GROUPS");
    else printList(ctx.cache.channels, "MY CHANNELS");
  },
};
