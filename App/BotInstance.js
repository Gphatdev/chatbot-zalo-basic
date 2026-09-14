/**
 * App/BotInstance.js
 *
 * Giữ trạng thái dùng chung của bot: config, database, adapter, danh sách
 * command đã load, cooldown, và thời điểm khởi động (cho !uptime / dashboard).
 * Đây là một singleton đơn giản được khởi tạo một lần trong zalo.js.
 */

function createBotInstance({ config, db, adapter, logger }) {
  const startedAt = Date.now();
  // Gắn vào config để mọi command (chỉ nhận { config, ... }) có thể đọc
  // thời điểm khởi động mà không cần thay đổi chữ ký run().
  config.startedAt = startedAt;

  /** Map<commandName, commandObject> — chỉ chứa tên chính, không alias */
  const commands = new Map();
  /** Map<alias, commandName> */
  const aliases = new Map();
  /** Danh sách command có hook nền (onMessage / onGroupEvent) */
  const backgroundHooks = [];

  /** Map<"threadId:senderId:commandName", timestampHếtCooldown> */
  const cooldowns = new Map();

  function isOnCooldown(threadId, senderId, commandName, cooldownSeconds) {
    if (!cooldownSeconds) return 0;
    const key = `${threadId}:${senderId}:${commandName}`;
    const now = Date.now();
    const expiresAt = cooldowns.get(key) || 0;
    if (now < expiresAt) {
      return Math.ceil((expiresAt - now) / 1000);
    }
    cooldowns.set(key, now + cooldownSeconds * 1000);
    return 0;
  }

  function isOwner(uid) {
    return Boolean(uid) && String(uid) === String(config.ownerZaloId || "");
  }

  function isBotAdmin(uid) {
    if (!uid) return false;
    const adminIds = Array.isArray(config.legacyAdminBot)
      ? config.legacyAdminBot
      : [];
    return adminIds.some((adminId) => String(adminId) === String(uid));
  }

  return {
    config,
    db,
    adapter,
    logger,
    startedAt,
    commands,
    aliases,
    backgroundHooks,
    isOnCooldown,
    isOwner,
    isBotAdmin,
  };
}

export { createBotInstance };
