import { safeHandler } from "../Utils/Safe.js";
import { createHandleMessage } from "./HandleMessage.js";
import { createHandleReaction } from "./HandleReaction.js";
import { createHandleUndo } from "./HandleUndo.js";
import { createHandleGroup } from "./HandleGroup.js";
import { getBotStatus, formatBotStatusText } from "./BotStatus.js";
import { dispatchLegacyReply, dispatchLegacyEvent } from "../Core/LegacySystem.js";

const RENTAL_KEY = "bot:rental:expires";
const WARNING_COOLDOWN_MS = 30_000;
const UNKNOWN_CMD_COOLDOWN_MS = 5_000;

// Tránh gửi thông báo liên tục trong cùng một box.
const warningCooldowns = new Map();
const unknownCmdCooldowns = new Map();

function getSetting(db, threadId, key, defaultValue = "") {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key = ?",
    [threadId, key],
  );

  return rows.length > 0 ? rows[0].value : defaultValue;
}

function getCommandName(text, prefix) {
  if (typeof text !== "string") return "";
  if (!text.startsWith(prefix)) return "";

  return (
    text
      .slice(prefix.length)
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase() || ""
  );
}

function isRentalCommand(commandName) {
  return [
    "thuebot",
    "rent",
    "giahan",
    "thanhtoan",
    "pay",
    "transfer",
  ].includes(commandName);
}

function isRentalActive(db, threadId) {
  const expireMs = Number(
    getSetting(db, threadId, RENTAL_KEY, "0"),
  );

  return Number.isFinite(expireMs) && expireMs > Date.now();
}

async function sendRentalWarning(adapter, threadId) {
  const lastWarning = warningCooldowns.get(threadId) || 0;
  const now = Date.now();

  if (now - lastWarning < WARNING_COOLDOWN_MS) {
    return;
  }

  warningCooldowns.set(threadId, now);

  await adapter.sendText({
    threadId,
    threadType: "group",
    text:
      "⚠️ Box này chưa thuê bot hoặc đã hết hạn sử dụng.\n" +
      "💳 Quản trị viên hãy dùng: !thanhtoan thuebot\n" +
      "🔎 Kiểm tra thời hạn: !thuebot check",
  });
}

/**
 * Kiểm tra command có tồn tại trong router không.
 * Hỗ trợ 3 kiểu lưu trữ phổ biến: Map, plain object, hoặc mảng { name, aliases }.
 */
function commandExistsInRouter(router, commandName) {
  const store = router?.commands;
  if (!store) return true; // Không xác định được -> không chặn để tránh false positive.

  if (store instanceof Map) {
    if (store.has(commandName)) return true;
    const aliases = router?.aliases;
    return aliases instanceof Map && aliases.has(commandName);
  }

  if (Array.isArray(store)) {
    return store.some(
      (cmd) =>
        cmd?.name?.toLowerCase() === commandName ||
        cmd?.aliases?.map((a) => a.toLowerCase()).includes(commandName),
    );
  }

  if (typeof store === "object") {
    return Object.prototype.hasOwnProperty.call(store, commandName);
  }

  return true;
}

function getCommandCount(router) {
  const store = router?.commands;
  if (!store) return 0;
  if (store instanceof Map) return store.size;
  if (Array.isArray(store)) return store.length;
  if (typeof store === "object") return Object.keys(store).length;
  return 0;
}

async function sendUnknownCommandStatus(adapter, router, threadId, threadType) {
  const lastSent = unknownCmdCooldowns.get(threadId) || 0;
  const now = Date.now();

  if (now - lastSent < UNKNOWN_CMD_COOLDOWN_MS) {
    return;
  }

  unknownCmdCooldowns.set(threadId, now);

  const status = getBotStatus({
    botName: "NKNP V3 BOT",
    commandCount: getCommandCount(router),
  });

  await adapter.sendText({
    threadId,
    threadType,
    text: formatBotStatusText(status),
  });
}

function createRentalGuard({
  adapter,
  db,
  logger,
  handleMessage,
}) {
  return async function rentalGuard(message) {
    // Tin nhắn riêng không áp dụng kiểm tra thuê box.
    if (message?.type !== 1) {
      return handleMessage(message);
    }

    // Không xử lý lại tin nhắn của bot.
    if (message?.isSelf) {
      return handleMessage(message);
    }

    const threadId = message.threadId;
    const content = message?.data?.content;

    if (typeof content !== "string") {
      return handleMessage(message);
    }

    const prefix = process.env.BOT_PREFIX || "!";
    const commandName = getCommandName(content.trim(), prefix);

    // Không phải command thì không cần cảnh báo.
    if (!commandName) {
      return handleMessage(message);
    }

    // Luôn cho phép kiểm tra thuê bot và thanh toán.
    if (isRentalCommand(commandName)) {
      return handleMessage(message);
    }

    if (isRentalActive(db, threadId)) {
      return handleMessage(message);
    }

    logger?.info?.("[Rental] Đã chặn command tại box hết hạn.", {
      threadId,
      commandName,
    });

    await sendRentalWarning(adapter, threadId);

    // Không gọi handleMessage nên command bị chặn hoàn toàn.
    return undefined;
  };
}

/**
 * Guard mới: nếu user gõ prefix + tên lệnh không tồn tại trong router,
 * gửi bảng trạng thái bot (uptime/RAM/CPU/...) thay vì im lặng.
 */
function createUnknownCommandGuard({
  adapter,
  router,
  logger,
  handleMessage,
}) {
  return async function unknownCommandGuard(message) {
    const content = message?.data?.content;

    if (typeof content !== "string") {
      return handleMessage(message);
    }

    const prefix = process.env.BOT_PREFIX || "!";
    const trimmed = content.trim();

    // Không gõ prefix -> bỏ qua, không phải là lệnh.
    if (!trimmed.startsWith(prefix)) {
      return handleMessage(message);
    }

    const commandName = getCommandName(trimmed, prefix);

    // Gõ mỗi prefix (vd chỉ gõ "!") hoặc lệnh không tồn tại -> hiện trạng thái.
    if (!commandName || !commandExistsInRouter(router, commandName)) {
      logger?.info?.("[UnknownCommand] Lệnh không tồn tại.", {
        threadId: message.threadId,
        commandName,
      });

      await sendUnknownCommandStatus(
        adapter,
        router,
        message.threadId,
        message.type === 1 ? "group" : "user",
      );

      return undefined;
    }

    return handleMessage(message);
  };
}

/**
 * Đăng ký toàn bộ event handler qua adapter.
 */
function registerHandlers({ adapter, router, db, logger }) {
  const originalHandleMessage = createHandleMessage(router);

  const withUnknownCommandGuard = createUnknownCommandGuard({
    adapter,
    router,
    logger,
    handleMessage: originalHandleMessage,
  });

  const withRentalGuard = createRentalGuard({
    adapter,
    db,
    logger,
    handleMessage: withUnknownCommandGuard,
  });

  // [NKNP V3] Gắn thêm dispatch cho hệ thống "di sản" (NKNP): onReply +
  // handleEvent(eventType="message") — chạy song song (không chặn), không
  // ảnh hưởng luồng xử lý lệnh gốc của EMPHAT phía trên.
  const handleMessage = async (message) => {
    dispatchLegacyReply(message, adapter.raw, logger).catch(() => {});
    dispatchLegacyEvent("message", message, adapter.raw, logger);
    return withRentalGuard(message);
  };

  const originalHandleReaction = createHandleReaction(logger);
  const handleReaction = async (reaction) => {
    dispatchLegacyEvent("reaction", reaction, adapter.raw, logger);
    return originalHandleReaction(reaction);
  };

  const originalHandleUndo = createHandleUndo(logger);
  const handleUndo = async (undo) => {
    dispatchLegacyEvent("undo", undo, adapter.raw, logger);
    return originalHandleUndo(undo);
  };

  const originalHandleGroup = createHandleGroup(router, db, logger);
  const handleGroup = async (groupEvent) => {
    dispatchLegacyEvent("group_event", groupEvent, adapter.raw, logger);
    return originalHandleGroup(groupEvent);
  };

  adapter.startListener({
    onMessage: safeHandler(
      "message",
      handleMessage,
      logger,
    ),

    onReaction: safeHandler(
      "reaction",
      handleReaction,
      logger,
    ),

    onUndo: safeHandler(
      "undo",
      handleUndo,
      logger,
    ),

    onGroupEvent: safeHandler(
      "group_event",
      handleGroup,
      logger,
    ),

    onError: safeHandler(
      "error",
      async (err) => {
        logger.error("[Listener] Lỗi listener:", {
          message: err?.message ?? String(err),
        });
      },
      logger,
    ),

    onConnected: safeHandler(
      "connected",
      async () => {
        logger.info("[Listener] Đã kết nối realtime.");
      },
      logger,
    ),

    onDisconnected: safeHandler(
      "disconnected",
      async (code, reason) => {
        logger.warn("[Listener] Mất kết nối realtime.", {
          code,
          reason,
        });
      },
      logger,
    ),

    onClosed: safeHandler(
      "closed",
      async (code, reason) => {
        logger.warn("[Listener] Listener đã đóng.", {
          code,
          reason,
        });
      },
      logger,
    ),
  });

  logger.info(
    "[Handlers] Đã đăng ký event handler và kiểm tra thuê bot.",
  );
}

export { registerHandlers };