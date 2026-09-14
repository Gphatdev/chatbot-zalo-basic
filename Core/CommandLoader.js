import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Core/CommandLoader.js
 *
 * Tự động load các file command trực tiếp trong Core/Commands (không đệ quy
 * vào thư mục con). Validate cấu trúc từng command, phát hiện trùng tên/alias,
 * và đảm bảo một command lỗi không làm hỏng toàn bộ bot.
 */

const VALID_ROLES = [0, 1, 2];

function validateCommand(cmd, fileName) {
  const errors = [];

  if (!cmd || typeof cmd !== "object") {
    errors.push("export default phải là một object.");
    return errors;
  }
  if (typeof cmd.name !== "string" || !cmd.name.trim()) {
    errors.push("thiếu hoặc sai kiểu trường 'name' (string).");
  }
  if (typeof cmd.run !== "function") {
    errors.push("thiếu hoặc sai kiểu trường 'run' (function).");
  }
  if (cmd.aliases !== undefined) {
    if (
      !Array.isArray(cmd.aliases) ||
      !cmd.aliases.every((a) => typeof a === "string")
    ) {
      errors.push("'aliases' phải là mảng string.");
    }
  }
  if (cmd.role !== undefined && !VALID_ROLES.includes(cmd.role)) {
    errors.push("'role' phải là 0, 1 hoặc 2.");
  }
  if (
    cmd.cooldown !== undefined &&
    (typeof cmd.cooldown !== "number" || cmd.cooldown < 0)
  ) {
    errors.push("'cooldown' phải là số >= 0.");
  }
  if (cmd.onMessage !== undefined && typeof cmd.onMessage !== "function") {
    errors.push("'onMessage' phải là function nếu được khai báo.");
  }
  if (cmd.onGroupEvent !== undefined && typeof cmd.onGroupEvent !== "function") {
    errors.push("'onGroupEvent' phải là function nếu được khai báo.");
  }

  return errors;
}

/**
 * @param {string} commandsDir Đường dẫn tuyệt đối tới Core/Commands
 * @param {ReturnType<import('../App/BotInstance.js').createBotInstance>} bot
 * @param {{ info:Function, warn:Function, error:Function }} logger
 */
async function loadCommands(commandsDir, bot, logger) {
  const entries = fs
    .readdirSync(commandsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .sort((a, b) => a.name.localeCompare(b.name));

  let loaded = 0;
  let failed = 0;

  for (const entry of entries) {
    const filePath = path.join(commandsDir, entry.name);
    try {
      const moduleUrl = pathToFileURL(filePath).href;
      const mod = await import(moduleUrl);
      const cmd = mod.default;

      const errors = validateCommand(cmd, entry.name);
      if (errors.length > 0) {
        logger.error(`[CommandLoader] Bỏ qua ${entry.name}: ${errors.join(" ")}`);
        failed++;
        continue;
      }

      if (bot.commands.has(cmd.name)) {
        logger.error(
          `[CommandLoader] Bỏ qua ${entry.name}: tên command '${cmd.name}' đã tồn tại.`,
        );
        failed++;
        continue;
      }

      const commandName = cmd.name.trim().toLowerCase();
      const aliasList = [...new Set(
        (cmd.aliases || [])
          .map((alias) => alias.trim().toLowerCase())
          .filter(Boolean),
      )];
      const conflictingAlias = aliasList.find(
        (alias) =>
          alias === commandName ||
          bot.aliases.has(alias) ||
          bot.commands.has(alias),
      );
      if (conflictingAlias) {
        logger.error(
          `[CommandLoader] Bỏ qua ${entry.name}: alias '${conflictingAlias}' bị trùng.`,
        );
        failed++;
        continue;
      }

      const normalized = {
        name: commandName,
        description: cmd.description || "",
        version: cmd.version || "1.0.0",
        author: cmd.author || "NKNP V3",
        group: cmd.group || "general",
        role: cmd.role ?? 0,
        cooldown: cmd.cooldown ?? 0,
        aliases: aliasList,
        noPrefix: Boolean(cmd.noPrefix),
        usage: cmd.usage || cmd.usages || "",
        run: cmd.run,
        onMessage: cmd.onMessage,
        onGroupEvent: cmd.onGroupEvent,
        __legacyOnLoad: cmd.__legacyOnLoad,
        __legacyOnReply: cmd.__legacyOnReply,
        __legacyHandleEvent: cmd.__legacyHandleEvent,
      };

      bot.commands.set(normalized.name, normalized);
      for (const alias of aliasList) {
        bot.aliases.set(alias, normalized.name);
      }
      if (normalized.onMessage || normalized.onGroupEvent) {
        bot.backgroundHooks.push(normalized);
      }

      loaded++;
    } catch (err) {
      logger.error(`[CommandLoader] Lỗi khi load ${entry.name}:`, {
        message: err?.message,
      });
      failed++;
    }
  }

  logger.info(`[CommandLoader] Đã load ${loaded} command, ${failed} thất bại.`);
  return { loaded, failed };
}

export { loadCommands, validateCommand };