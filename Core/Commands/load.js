import { readdir } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const COMMAND_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

function removeOldAliases(aliases, commandName) {
  for (const [alias, target] of aliases.entries()) {
    if (target === commandName || alias === commandName) aliases.delete(alias);
  }
}

function replaceBackgroundHook(backgroundHooks, oldName, nextCommand) {
  for (let i = backgroundHooks.length - 1; i >= 0; i -= 1) {
    if (backgroundHooks[i]?.name === oldName || backgroundHooks[i]?.name === nextCommand.name) {
      backgroundHooks.splice(i, 1);
    }
  }

  if (typeof nextCommand.onMessage === "function" || typeof nextCommand.onGroupEvent === "function") {
    backgroundHooks.push(nextCommand);
  }
}

async function importFresh(filePath) {
  const url = pathToFileURL(filePath);
  url.searchParams.set("reload", `${Date.now()}-${Math.random()}`);
  const module = await import(url.href);
  const command = module.default;

  if (!command || typeof command !== "object") {
    throw new Error("File không export default một command object");
  }
  if (typeof command.name !== "string" || !command.name.trim()) {
    throw new Error("Command thiếu thuộc tính name");
  }
  if (typeof command.run !== "function") {
    throw new Error("Command thiếu hàm run");
  }
  return command;
}

async function reloadOne(fileName, { commands, aliases, backgroundHooks }) {
  const filePath = path.join(COMMAND_DIR, fileName);
  const oldStem = path.basename(fileName, ".js").toLowerCase();
  const nextCommand = await importFresh(filePath);
  const nextName = nextCommand.name.toLowerCase();

  const previous = commands.get(oldStem) || commands.get(nextName);
  const previousName = previous?.name?.toLowerCase() || oldStem;

  commands.delete(oldStem);
  commands.delete(previousName);
  removeOldAliases(aliases, previousName);
  removeOldAliases(aliases, nextName);

  commands.set(nextName, nextCommand);
  for (const alias of Array.isArray(nextCommand.aliases) ? nextCommand.aliases : []) {
    const normalized = String(alias).toLowerCase().trim();
    if (normalized) aliases.set(normalized, nextName);
  }

  replaceBackgroundHook(backgroundHooks, previousName, nextCommand);
  return `${nextName} v${nextCommand.version || "?"}`;
}

export default {
  name: "load",
  description: "Nạp lại command mà không cần restart bot",
  version: "1.0.0",
  author: "NKNP V3",
  group: "system",
  role: 2,
  cooldown: 2,
  aliases: ["reload"],
  noPrefix: false,

  async run({ adapter, message, args, commands, aliases, backgroundHooks, logger }) {
    const target = (args[0] || "").toLowerCase().replace(/\.js$/i, "");
    const reply = async (text) =>
      adapter.sendText({
        threadId: message.threadId,
        threadType: message.type === 1 ? "group" : "user",
        text,
      });

    if (!target) {
      await reply("Cú pháp: !load <tên_lệnh> hoặc !load all");
      return;
    }
    if (target !== "all" && !SAFE_NAME.test(target)) {
      await reply("Tên lệnh không hợp lệ.");
      return;
    }

    const files = (await readdir(COMMAND_DIR))
      .filter((name) => name.endsWith(".js"))
      .sort();
    const selected = target === "all" ? files : files.filter((name) => path.basename(name, ".js").toLowerCase() === target);

    if (selected.length === 0) {
      await reply(`Không tìm thấy file lệnh '${target}.js'.`);
      return;
    }

    const loaded = [];
    const failed = [];
    for (const fileName of selected) {
      try {
        loaded.push(await reloadOne(fileName, { commands, aliases, backgroundHooks }));
      } catch (err) {
        failed.push(`${fileName}: ${err?.message || "lỗi không xác định"}`);
        logger?.error?.(`[load] Không thể nạp ${fileName}:`, { message: err?.message });
      }
    }

    let text = loaded.length ? `✅ Đã nạp: ${loaded.join(", ")}` : "❌ Không nạp được lệnh nào.";
    if (failed.length) text += `\n⚠️ Lỗi:\n${failed.join("\n")}`;
    await reply(text);
  },
};
