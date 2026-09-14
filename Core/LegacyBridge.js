/**
 * Core/LegacyBridge.js
 *
 * ==========================================================================
 *  NKNP V3 — LỚP CẦU NỐI (LEGACY BRIDGE)
 * ==========================================================================
 * Đây là "trái tim" của việc hợp nhất 2 framework:
 *   - EMPHAT (BOT-ZALO) : hệ thống lõi (Config/Database/Session/Adapter/
 *     CommandLoader/CommandRouter/Handlers) — được giữ nguyên làm nền.
 *   - NKNP (botzalo2026)  : kho lệnh phong phú (~44 lệnh) viết theo phong
 *     cách `module.exports.config` + `module.exports.run({api, event, ...})`.
 *
 * Vì hai bên có "chữ ký command" khác nhau, LegacyBridge cung cấp:
 *   1. wrapLegacyCommand()  — biến 1 command kiểu NKNP thành command chuẩn
 *      của CommandLoader (EMPHAT) mà KHÔNG cần viết lại logic bên trong.
 *   2. initLegacyGlobals()  — dựng lại đúng "môi trường global" mà code NKNP
 *      kỳ vọng (global.config, global.users, global.api, global.client,
 *      global.data...), để hàng ngàn dòng logic cũ chạy được nguyên vẹn.
 *   3. Users / Threads controller (SQLite riêng, xem Utils/LegacyDb.cjs).
 *   4. Hệ thống onReply / handleEvent (xem Core/LegacySystem.js).
 *
 * Toàn bộ phần này được cô lập trong Core/ — không đụng vào code gốc của
 * EMPHAT, nên nếu sau này muốn gỡ bỏ, chỉ cần xoá các file liên quan.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { Users, Threads } = require("../Utils/LegacyControllers.cjs");
const legacyLogger = require("../Utils/LegacyLogger.cjs");

/** Map<key(globalMsgId/cliMsgId/msgId), { name, author, ...bất kỳ dữ liệu nào }> */
const legacyReplyStore = new Map();
/** Map<eventName, legacyEventModule> — các "plugins/events" được port (nếu có) */
const legacyEventStore = new Map();
/** Map<commandName, cooldownMapCon> — dự phòng, song song với cooldown của EMPHAT */
const legacyCooldownStore = new Map();

/**
 * Dựng "môi trường global" tương thích NKNP. Gọi 1 lần duy nhất, ngay sau khi
 * bot instance + adapter đã sẵn sàng (trong zalo.js).
 */
function initLegacyGlobals({ config, adapter, logger }) {
  const adminList = (config.legacyAdminBot || []).map(String);
  const supportList = (config.legacySupportBot || []).map(String);

  global.config = {
    // ----- các khoá NKNP hay dùng -----
    prefix: config.botPrefix,
    PREFIX: config.botPrefix,
    name_bot: config.botName,
    version: config.legacyVersion || "3.0.0",
    admin_bot: adminList,
    ADMINBOT: adminList,
    support_bot: supportList,
    allow_private_command: config.legacyAllowPrivateCommand !== false,
    default_money: config.legacyDefaultMoney ?? 0,
    login_qrcode: true,
    save_cookie: true,
    studio: "NKNP STUDIO",
  };

  global.users = { admin: adminList, support: supportList };
  global.api = adapter.raw;

  // global.client: registry "bóng" (shadow) song song với bot.commands của
  // EMPHAT, dùng cho các command đọc/duyệt danh sách lệnh kiểu NKNP
  // (vd: !menu, !cmd). Được đồng bộ lại mỗi khi CommandLoader nạp xong.
  global.client = {
    commands: new Map(),
    events: legacyEventStore,
    cooldowns: legacyCooldownStore,
    handleReply: legacyReplyStore,
    handleReaction: new Map(),
    handleEvent: new Map(),
  };

  global.data = {
    threadData: new Map(), // được "prime" (nạp trước) mỗi lần có tin nhắn — xem wrapLegacyCommand()
  };

  logger?.info?.("[LegacyBridge] ✓ Đã khởi tạo môi trường tương thích NKNP (global.config/users/api/client/data).");
}

/**
 * Đồng bộ lại global.client.commands sau khi CommandLoader nạp xong toàn bộ
 * lệnh (cả lệnh gốc EMPHAT lẫn lệnh được port từ NKNP), để các lệnh kiểu
 * NKNP (vd menu.js gốc, nếu được bật lại) có thể duyệt danh sách đầy đủ.
 */
function syncShadowCommandRegistry(bot) {
  global.client.commands.clear();
  for (const [name, cmd] of bot.commands.entries()) {
    global.client.commands.set(name, {
      config: {
        name: cmd.name,
        aliases: cmd.aliases || [],
        version: cmd.version,
        role: cmd.role,
        author: cmd.author,
        description: cmd.description,
        category: cmd.group,
        usage: cmd.usage || "",
        cooldowns: cmd.cooldown,
      },
      run: cmd.run,
      onReply: cmd.__legacyOnReply,
      handleEvent: cmd.__legacyHandleEvent,
    });
  }
}

/** replyData rút gọn giống hệt bản NKNP gốc (dùng trong onReply/handleEvent) */
function buildReplyData(message) {
  const d = message?.data || {};
  return {
    content: d.content,
    msgType: d.msgType,
    propertyExt: d.propertyExt,
    uidFrom: d.uidFrom,
    msgId: d.msgId,
    cliMsgId: d.cliMsgId,
    ts: d.ts,
    ttl: d.ttl,
  };
}

/**
 * Nạp trước (prime) dữ liệu box hiện tại vào global.data.threadData để các
 * command cũ (đọc đồng bộ qua .get(threadId)) vẫn hoạt động đúng như khi
 * chạy trên NKNP gốc (nơi listener luôn gọi Threads.getData trước handleCommand).
 */
async function primeThreadData(threadId) {
  try {
    const threadData = await Threads.getData(threadId);
    global.data.threadData.set(threadId, threadData?.data || {});
    return threadData?.data || {};
  } catch {
    return {};
  }
}

/**
 * Biến 1 command kiểu NKNP (`{ name, aliases, role, cooldowns, ... }` +
 * `run({ args, event, api, Users, Threads, replyData })`) thành 1 command
 * chuẩn CommandLoader của EMPHAT (`{ name, run({ adapter, message, args,
 * config, db, logger }) }`).
 *
 * @param {object} legacyConfig  Nội dung `module.exports.config` gốc.
 * @param {Function} legacyRun   Nội dung `module.exports.run` gốc.
 * @param {Function} [legacyOnLoad] Nội dung `module.exports.onLoad` gốc (nếu có).
 * @param {Function} [legacyOnReply] Nội dung `module.exports.onReply` gốc (nếu có).
 * @param {Function} [legacyHandleEvent] Nội dung `module.exports.handleEvent` gốc (nếu có).
 */
function wrapLegacyCommand(legacyConfig, legacyRun, legacyOnLoad, legacyOnReply, legacyHandleEvent) {
  const normalized = {
    name: String(legacyConfig.name || "").toLowerCase(),
    description: legacyConfig.description || "",
    version: legacyConfig.version || "1.0.0",
    author: legacyConfig.author || "NKNP STUDIO (port từ NKNP)",
    group: legacyConfig.category || "Khác",
    role: legacyConfig.role ?? 0,
    cooldown: legacyConfig.cooldowns ?? legacyConfig.cooldown ?? 0,
    aliases: Array.isArray(legacyConfig.aliases) ? legacyConfig.aliases : [],
    noPrefix: Boolean(legacyConfig.noPrefix),
    usage: legacyConfig.usage || "",
    __legacyOnReply: legacyOnReply,
    __legacyHandleEvent: legacyHandleEvent,

    async run(ctx) {
      const { adapter, message, args, logger } = ctx;
      const api = adapter.raw;
      const event = message; // shape giống hệt event gốc của zca-js/zca-mt (threadId, type, data.*)
      const replyData = buildReplyData(message);

      // Prime global.data.threadData cho box hiện tại (đồng bộ hành vi NKNP gốc)
      if (event?.threadId) {
        await primeThreadData(event.threadId);
      }

      try {
        return await legacyRun({ args, event, api, Users, Threads, replyData });
      } catch (err) {
        logger?.error?.(`[LegacyBridge] Lỗi khi chạy lệnh di sản '${normalized.name}':`, {
          message: err?.message,
        });
        throw err;
      }
    },
  };

  if (typeof legacyOnLoad === "function") {
    // onLoad của NKNP chỉ nhận { api, Users, Threads } — sẽ được gọi thủ công
    // ngay sau khi tất cả lệnh đã nạp xong (xem zalo.js bước "Legacy onLoad").
    normalized.__legacyOnLoad = async () => {
      try {
        await legacyOnLoad({ api: global.api, Users, Threads });
      } catch (err) {
        legacyLogger.log(`Lỗi onLoad của lệnh di sản '${normalized.name}': ${err?.message}`, "error");
      }
    };
  }

  return normalized;
}

export {
  initLegacyGlobals,
  syncShadowCommandRegistry,
  wrapLegacyCommand,
  primeThreadData,
  buildReplyData,
  legacyReplyStore,
  legacyEventStore,
  Users,
  Threads,
};
