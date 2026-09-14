function extractText(message) {
  const content = message?.data?.content;
  return typeof content === "string" ? content : null;
}

function parseCommand(text, prefix) {
  if (!text.startsWith(prefix)) return null;
  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) return null;
  const [rawName, ...args] = withoutPrefix.split(/\s+/);
  return { name: rawName.toLowerCase(), args };
}

function normalizeCommandKey(value) {
  return String(value || "").trim().toLowerCase();
}

async function resolveSenderRole(bot, message, senderId) {
  if (bot.isOwner(senderId) || bot.isBotAdmin(senderId)) return 2;
  if (message.type !== 1) return 0;

  const groupAdmins = await bot.adapter.getGroupAdmins(message.threadId);
  if (!groupAdmins) return 0;
  if (
    String(groupAdmins.creatorId) === String(senderId) ||
    groupAdmins.adminIds.some((id) => String(id) === String(senderId))
  ) return 1;
  return 0;
}

function createCommandRouter(bot) {
  const { logger } = bot;

  async function runBackgroundHooks(message) {
    // Snapshot giúp !load có thể thay mảng hook an toàn trong lúc đang xử lý tin nhắn.
    for (const cmd of [...bot.backgroundHooks]) {
      if (!cmd.onMessage) continue;
      try {
        await cmd.onMessage({ adapter: bot.adapter, message, config: bot.config, db: bot.db, logger });
      } catch (err) {
        logger.error(`[CommandRouter] Lỗi hook onMessage của '${cmd.name}':`, { message: err?.message });
      }
    }
  }

  async function runBackgroundGroupHooks(event) {
    for (const cmd of [...bot.backgroundHooks]) {
      if (!cmd.onGroupEvent) continue;
      try {
        await cmd.onGroupEvent({ adapter: bot.adapter, event, config: bot.config, db: bot.db, logger });
      } catch (err) {
        logger.error(`[CommandRouter] Lỗi hook onGroupEvent của '${cmd.name}':`, { message: err?.message });
      }
    }
  }

  async function handleMessage(message) {
    if (message?.isSelf) return;
    await runBackgroundHooks(message);

    const text = extractText(message);
    if (text === null) return;
    const parsed = parseCommand(text, bot.config.botPrefix);
    if (!parsed) return;

    const commandName =
      bot.aliases.get(normalizeCommandKey(parsed.name)) ||
      normalizeCommandKey(parsed.name);
    const cmd = bot.commands.get(commandName);
    if (!cmd) return;

    const senderId = message.data?.uidFrom;
    if (!senderId || !message.threadId) return;
    const senderRole = await resolveSenderRole(bot, message, senderId);
    if (senderRole < cmd.role) {
      await safeReply(message, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    const waitSeconds = bot.isOnCooldown(message.threadId, senderId, cmd.name, cmd.cooldown);
    if (waitSeconds > 0) {
      await safeReply(message, `Vui lòng chờ ${waitSeconds}s trước khi dùng lại lệnh này.`);
      return;
    }

    try {
      await cmd.run({
        adapter: bot.adapter,
        message,
        args: parsed.args,
        commands: bot.commands,
        aliases: bot.aliases,
        backgroundHooks: bot.backgroundHooks,
        config: bot.config,
        db: bot.db,
        logger,
      });
      recordCommandUse(bot.db, cmd.name);
    } catch (err) {
      logger.error(`[CommandRouter] Lỗi khi chạy lệnh '${cmd.name}':`, { message: err?.message });
      await safeReply(message, "Đã xảy ra lỗi khi thực hiện lệnh. Vui lòng thử lại sau.");
    }
  }

  async function safeReply(message, text) {
    try {
      await bot.adapter.sendText({
        threadId: message.threadId,
        threadType: message.type === 1 ? "group" : "user",
        text,
      });
    } catch (err) {
      logger.error("[CommandRouter] Không gửi được phản hồi:", { message: err?.message });
    }
  }

  function recordCommandUse(db, commandName) {
    try {
      db.query(
        `INSERT INTO command_stats (command_name, uses, last_used_at)
         VALUES (?, 1, ?)
         ON CONFLICT(command_name) DO UPDATE SET
           uses = uses + 1,
           last_used_at = excluded.last_used_at`,
        [commandName, Date.now()],
      );
    } catch (err) {
      logger.error("[CommandRouter] Lỗi khi ghi command_stats:", { message: err?.message });
    }
  }

  return {
    handleMessage,
    runBackgroundGroupHooks,
    commands: bot.commands,
    aliases: bot.aliases,
  };
}

export { createCommandRouter, extractText, parseCommand, resolveSenderRole };
