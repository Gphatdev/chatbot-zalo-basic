import { resolveSenderRole } from "../CommandRouter.js";
import jsQR from "jsqr";
import { createCanvas, loadImage } from "canvas";
import { renderAntiImage } from "../../Utils/HelpImageRenderer.js";
import { legacyReplyStore } from "../LegacyBridge.js";

const SPAM_WINDOW_MS = 5_000;
const SPAM_THRESHOLD = 5;
const SPAM_WARN_LIMIT = 2;
const CLEANUP_INTERVAL_MS = 60_000;

const URL_REGEX = /\b((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>()]*)?)/g;

const spamWindows = new Map();
const spamViolations = new Map();
let cleanupStarted = false;

function ensureCleanupTimer() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of spamWindows.entries()) {
      const kept = timestamps.filter((ts) => now - ts < SPAM_WINDOW_MS);
      if (kept.length === 0) spamWindows.delete(key);
      else spamWindows.set(key, kept);
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function recordAndCheckSpam(threadId, senderId) {
  ensureCleanupTimer();
  const key = `${threadId}:${senderId}`;
  const now = Date.now();
  const timestamps = (spamWindows.get(key) || []).filter((ts) => now - ts < SPAM_WINDOW_MS);
  timestamps.push(now);
  spamWindows.set(key, timestamps);
  return timestamps.length >= SPAM_THRESHOLD;
}

function bumpSpamViolation(threadId, senderId) {
  const key = `${threadId}:${senderId}`;
  const count = (spamViolations.get(key) || 0) + 1;
  spamViolations.set(key, count);
  return count;
}

function resetSpamViolation(threadId, senderId) {
  spamViolations.delete(`${threadId}:${senderId}`);
  spamWindows.delete(`${threadId}:${senderId}`);
}

function extractDomains(text) {
  const matches = text.match(URL_REGEX) || [];
  const domains = [];
  for (const raw of matches) {
    try {
      const withScheme = raw.startsWith("http") ? raw : `http://${raw}`;
      const url = new URL(withScheme);
      domains.push(url.hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // ignore
    }
  }
  return domains;
}

function isDomainAllowed(domain, globalAllowlist, groupAllowlist) {
  const globalList = Array.isArray(globalAllowlist) ? globalAllowlist : [];
  const groupList = Array.isArray(groupAllowlist) ? groupAllowlist : [];
  return (
    globalList.includes(domain) ||
    groupList.includes(domain) ||
    globalList.some((d) => domain.endsWith(`.${d}`)) ||
    groupList.some((d) => domain.endsWith(`.${d}`))
  );
}

const TAGALL_TEXT_REGEX = /@all\b|@moi\s*nguoi|@mọi\s*người/i;

function hasTagAllText(message) {
  const raw =
    (typeof message?.data?.content === "string" && message.data.content) ||
    (typeof message?.data?.content?.title === "string" && message.data.content.title) ||
    (typeof message?.data?.content?.text === "string" && message.data.content.text) ||
    "";
  return TAGALL_TEXT_REGEX.test(raw);
}

/**
 * Nhận diện tin nhắn có phải ảnh không, dựa theo cấu trúc thật của zca-mt
 * (đã xác nhận qua module AntiQR gốc của @GwenDev).
 */
function isImageMessage(data) {
  if (!data) return false;
  if (data.msgType === "chat.photo") return true;
  if (data.msgType === "chat.recommended" && data.content?.action === "photo.send") return true;
  if (
    data.msgType === "chat.photo.multi" ||
    (Array.isArray(data.content?.items) && data.content.items.length)
  ) {
    return true;
  }
  return false;
}

/**
 * Trích danh sách URL ảnh trong tin nhắn (chịu được cả tin nhắn nhiều ảnh).
 * Cấu trúc field (content.href/hdUrl/thumbUrl, content.items[]) đã được
 * xác nhận thật từ log, không còn đoán mò như trước.
 */
function extractImageUrls(message) {
  const data = message?.data;
  if (!data) return [];
  const urls = [];
  const single =
    data.content?.href ||
    data.content?.hdUrl ||
    data.content?.thumbUrl ||
    (typeof data.content === "string" ? data.content : null);
  if (single) urls.push(single);

  if (Array.isArray(data.content?.items)) {
    for (const item of data.content.items) {
      const u = item?.href || item?.hdUrl || item?.thumbUrl;
      if (u) urls.push(u);
    }
  }
  return urls.filter(Boolean);
}

/**
 * Tải ảnh về và decode QR bằng jsqr. Trả về nội dung QR (chuỗi) nếu có,
 * hoặc null nếu ảnh không chứa QR / lỗi khi tải.
 */
async function decodeQrFromUrl(url, logger) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = await loadImage(buf);
    // Ảnh Zalo có thể rất lớn. Giữ cạnh tối đa 2000px giúp jsQR chạy ổn định
    // mà vẫn đủ chi tiết cho QR nhỏ trong ảnh.
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return decoded?.data || null;
  } catch (err) {
    logger?.warn?.("[anti] Lỗi khi tải/giải mã ảnh QR:", { message: err?.message });
    return null;
  }
}

function getSetting(db, threadId, key, defaultValue) {
  const rows = db.query("SELECT value FROM settings WHERE thread_id = ? AND key = ?", [
    threadId,
    key,
  ]);
  return rows.length > 0 ? rows[0].value : defaultValue;
}

function setSetting(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [threadId, key, value],
  );
}

function getGroupSettings(db, threadId) {
  return {
    spamEnabled: getSetting(db, threadId, "anti:spam:enabled", "0") === "1",
    linkEnabled: getSetting(db, threadId, "anti:link:enabled", "0") === "1",
    tagallEnabled: getSetting(db, threadId, "anti:tagall:enabled", "0") === "1",
    qrEnabled: getSetting(db, threadId, "anti:qr:enabled", "0") === "1",
    linkAllowlist: getSetting(db, threadId, "anti:link:allowlist", "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
}

function isBanned(db, threadId, uid) {
  return getSetting(db, threadId, `anti:ban:${uid}`, "") === "1";
}

function banUser(db, threadId, uid) {
  setSetting(db, threadId, `anti:ban:${uid}`, "1");
}

function unbanUser(db, threadId, uid) {
  db.query("DELETE FROM settings WHERE thread_id = ? AND key = ?", [threadId, `anti:ban:${uid}`]);
}

async function warnSender({ adapter, message }, text) {
  await adapter.sendText({ threadId: message.threadId, threadType: "group", text });
}

function antiCaption(prefix) {
  return `HỆ THỐNG ANTI NKNP\nPrefix: ${prefix}\nREPLY SỐ BẠN CHỌN ĐỂ MỞ TÍNH NĂNG ANTI ĐÓ`;
}

function antiFeatureText(choice, prefix) {
  const texts = {
    "1": `🛡️ AntiSpam\nCú pháp: ${prefix}anti spam on|off\nTự cảnh báo khi thành viên gửi tin quá nhanh.`,
    "2": `🔗 AntiLink\nCú pháp: ${prefix}anti link on|off\nThêm domain cho phép: ${prefix}anti link allow <domain>`,
    "3": `🏷️ AntiTagAll\nCú pháp: ${prefix}anti tagall on|off\nXử lý tin nhắn tag toàn bộ thành viên.`,
    "4": `🔳 AntiQR\nCú pháp: ${prefix}anti qr on|off\nPhát hiện và xử lý QR không được cho phép.`,
    "5": `📊 Trạng thái Anti\nDùng ${prefix}anti status để xem cấu hình bảo vệ hiện tại.`,
  };
  return texts[choice] || null;
}

async function handleAntiReply({ api, event, Reply }) {
  const choice = String(event?.data?.content || "").trim();
  if (String(Reply.author) !== String(event?.data?.uidFrom)) return;
  const text = antiFeatureText(choice, Reply.prefix);
  if (!text) return;
  await api.sendMessage(text, event.threadId, event.type);
  legacyReplyStore.delete(String(Reply.messageId));
}

async function tryDeleteMessage({ adapter, logger }, message) {
  try {
    await adapter.deleteMessage(message);
    return true;
  } catch (err) {
    if (err?.code !== "FEATURE_UNAVAILABLE") {
      logger?.warn?.("[anti] Không thể xóa tin nhắn:", { message: err?.message });
    }
    return false;
  }
}

async function tryKickSender({ adapter, logger }, senderId, threadId) {
  try {
    await adapter.removeUsersFromGroup([senderId], threadId);
    return true;
  } catch (err) {
    if (err?.code !== "FEATURE_UNAVAILABLE") {
      logger?.warn?.("[anti] Không thể kick thành viên:", { message: err?.message });
    }
    return false;
  }
}

async function punishSpamViolation(ctx, senderId, threadId) {
  const violationCount = bumpSpamViolation(threadId, senderId);

  if (violationCount <= SPAM_WARN_LIMIT) {
    await warnSender(
      ctx,
      `⚠️ Bạn đang gửi tin nhắn quá nhanh (cảnh báo ${violationCount}/${SPAM_WARN_LIMIT}). ` +
        `Vi phạm thêm lần nữa sẽ bị kick khỏi nhóm.`,
    );
    return;
  }

  const kicked = await tryKickSender(ctx, senderId, threadId);
  resetSpamViolation(threadId, senderId);

  if (kicked) {
    await warnSender(ctx, `🚫 Đã kick thành viên vì tiếp tục spam sau ${SPAM_WARN_LIMIT} lần cảnh báo.`);
  } else {
    await warnSender(
      ctx,
      `⚠️ Thành viên tiếp tục spam sau ${SPAM_WARN_LIMIT} lần cảnh báo, ` +
        `nhưng bot không đủ quyền để tự kick. Vui lòng nhờ quản trị viên xử lý.`,
    );
  }
}

async function punishSevereViolation(ctx, senderId, threadId, reasonText) {
  const { logger } = ctx;

  const deleted = await tryDeleteMessage(ctx, ctx.message);
  const kicked = await tryKickSender(ctx, senderId, threadId);

  banUser(ctx.db, threadId, senderId);

  if (kicked) {
    await warnSender(
      ctx,
      `🚫 ${reasonText} Đã xóa tin nhắn và kick thành viên vi phạm. ` +
        `Thành viên này đã bị cấm vĩnh viễn khỏi nhóm.`,
    );
  } else {
    await warnSender(
      ctx,
      `⚠️ ${reasonText} Đã xóa tin nhắn và đánh dấu cấm vĩnh viễn, ` +
        `nhưng bot không đủ quyền để tự kick khỏi nhóm. Vui lòng nhờ quản trị viên xử lý thủ công.`,
    );
  }

  if (!deleted) {
    logger?.warn?.("[anti] Không xóa được tin nhắn vi phạm (đã kick/ban).");
  }
}

export default {
  name: "anti",
  description: "Quản lý AntiSpam, AntiLink, AntiTagAll và AntiQR cho từng nhóm",
  version: "5.1.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    const isGroup = message.type === 1;

    if (!isGroup) {
      await adapter.sendText({
        threadId,
        threadType: "user",
        text: "🛡️ Lệnh !anti chỉ có thể sử dụng trong nhóm.",
      });
      return;
    }

    const sub = (args[0] || "").toLowerCase();

    if (!sub) {
      try {
        const imagePath = await renderAntiImage({
          botName: config.botName,
          prefix: config.botPrefix,
          settings: getGroupSettings(db, threadId),
        });
        const sent = await adapter.raw.sendMessage(
          { msg: antiCaption(config.botPrefix), attachments: imagePath },
          threadId,
          message.type,
        );
        const messageId = String(sent?.message?.msgId || sent?.message?.cliMsgId || sent?.msgId || "");
        if (messageId) {
          legacyReplyStore.set(messageId, {
            name: "anti",
            author: message.data.uidFrom,
            prefix: config.botPrefix,
            messageId,
          });
        }
      } catch {
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: `${antiCaption(config.botPrefix)}\n\n1. AntiSpam\n2. AntiLink\n3. AntiTagAll\n4. AntiQR\n5. Trạng thái`,
        });
      }
      return;
    }

    if (sub === "status") {
      const s = getGroupSettings(db, threadId);
      await adapter.sendText({
        threadId,
        threadType: "group",
        text:
          `🛡️ Trạng thái bảo vệ của nhóm:\n` +
          `• AntiSpam: ${s.spamEnabled ? "BẬT" : "TẮT"} ` +
          `(ngưỡng: ${SPAM_THRESHOLD} tin/${SPAM_WINDOW_MS / 1000}s, ` +
          `cảnh báo ${SPAM_WARN_LIMIT} lần rồi kick)\n` +
          `• AntiLink: ${s.linkEnabled ? "BẬT" : "TẮT"} (action: xóa tin + kick + cấm vĩnh viễn)\n` +
          `• AntiTagAll: ${s.tagallEnabled ? "BẬT" : "TẮT"} ` +
          `(hễ tin nhắn chứa @all/@mọi người là phạt ngay)\n` +
          `• AntiQR: ${s.qrEnabled ? "BẬT" : "TẮT"} ` +
          `(chặn mọi QR; chỉ miễn QR URL có domain trong allowlist)\n` +
          `• Allowlist domain (nhóm): ${s.linkAllowlist.join(", ") || "(trống)"}\n` +
          `• Allowlist domain (toàn cục): ${config.antiLinkAllowlist.join(", ") || "(trống)"}`,
      });
      return;
    }

    const senderRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => uid === config.ownerZaloId },
      message,
      message.data.uidFrom,
    );

    if (senderRole < 1) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "🔐 Bạn cần là quản trị viên nhóm đã xác minh hoặc owner để thay đổi cấu hình bảo vệ.",
      });
      return;
    }

    switch (sub) {
      case "spam": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:spam:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `✅ Đã ${action === "on" ? "BẬT" : "TẮT"} AntiSpam cho nhóm.` +
              (action === "on"
                ? ` Ngưỡng: ${SPAM_THRESHOLD} tin/${SPAM_WINDOW_MS / 1000}s, ` +
                  `cảnh báo ${SPAM_WARN_LIMIT} lần rồi tự kick.`
                : ""),
          });
        } else {
          await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti spam on|off\nVí dụ: !anti spam on" });
        }
        break;
      }

      case "link": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:link:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `✅ Đã ${action === "on" ? "BẬT" : "TẮT"} AntiLink cho nhóm.` +
              (action === "on"
                ? " Vi phạm sẽ bị xóa tin nhắn, kick và cấm vĩnh viễn ngay lập tức."
                : ""),
          });
        } else if (action === "allow") {
          const domain = (args[2] || "").toLowerCase().trim();
          if (!domain) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti link allow <domain>\nVí dụ: !anti link allow example.com" });
            return;
          }
          const current = getGroupSettings(db, threadId).linkAllowlist;
          if (!current.includes(domain)) current.push(domain);
          setSetting(db, threadId, "anti:link:allowlist", current.join(","));
          await adapter.sendText({ threadId, threadType: "group", text: `Đã thêm "${domain}" vào allowlist của nhóm.` });
        } else if (action === "remove") {
          const domain = (args[2] || "").toLowerCase().trim();
          const current = getGroupSettings(db, threadId).linkAllowlist.filter((d) => d !== domain);
          setSetting(db, threadId, "anti:link:allowlist", current.join(","));
          await adapter.sendText({ threadId, threadType: "group", text: `Đã xóa "${domain}" khỏi allowlist của nhóm (nếu có).` });
        } else if (action === "unban") {
          const uid = (args[2] || "").trim();
          if (!uid) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti link unban <uid>" });
            return;
          }
          unbanUser(db, threadId, uid);
          await adapter.sendText({ threadId, threadType: "group", text: `Đã gỡ cấm cho UID ${uid} khỏi nhóm này.` });
        } else {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: "Cú pháp: !anti link on|off | allow <domain> | remove <domain> | unban <uid>",
          });
        }
        break;
      }

      case "tagall": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:tagall:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `Đã ${action === "on" ? "BẬT" : "TẮT"} AntiTagAll cho nhóm này.` +
              (action === "on"
                ? ` Hễ tin nhắn có chứa @all hoặc @mọi người sẽ bị xóa, ` +
                  `người gửi bị kick và cấm vĩnh viễn ngay lập tức.`
                : ""),
          });
        } else if (action === "unban") {
          const uid = (args[2] || "").trim();
          if (!uid) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti tagall unban <uid>" });
            return;
          }
          unbanUser(db, threadId, uid);
          await adapter.sendText({ threadId, threadType: "group", text: `Đã gỡ cấm cho UID ${uid} khỏi nhóm này.` });
        } else {
          await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti tagall on|off | unban <uid>" });
        }
        break;
      }

      case "qr": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:qr:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `Đã ${action === "on" ? "BẬT" : "TẮT"} AntiQR cho nhóm này.` +
              (action === "on"
                ? " Mọi ảnh có QR (kể cả VietQR/QR thanh toán) sẽ bị xử lý. " +
                  "Chỉ QR URL có toàn bộ domain trong allowlist AntiLink mới được miễn."
                : ""),
          });
        } else if (action === "unban") {
          const uid = (args[2] || "").trim();
          if (!uid) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti qr unban <uid>" });
            return;
          }
          unbanUser(db, threadId, uid);
          await adapter.sendText({ threadId, threadType: "group", text: `Đã gỡ cấm cho UID ${uid} khỏi nhóm này.` });
        } else {
          await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti qr on|off | unban <uid>" });
        }
        break;
      }

      default:
        await adapter.sendText({
          threadId,
          threadType: "group",
          text:
            "Lệnh con không hợp lệ. Dùng: status, spam on|off, " +
            "link on|off, link allow, link remove, link unban, " +
            "tagall on|off, tagall unban, qr on|off, qr unban.",
        });
    }
  },

  __legacyOnReply: handleAntiReply,

  async onMessage({ adapter, message, config, db, logger }) {
    if (message.type !== 1) return;
    if (message.isSelf) return;

    const text = typeof message.data.content === "string" ? message.data.content : null;
    const threadId = message.threadId;
    const senderId = message.data.uidFrom;
    const settings = getGroupSettings(db, threadId);

    if (!settings.spamEnabled && !settings.linkEnabled && !settings.tagallEnabled && !settings.qrEnabled) {
      return;
    }

    const senderRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => uid === config.ownerZaloId },
      message,
      senderId,
    );
    if (senderRole >= 1) return; // admin/phó nhóm/owner miễn trừ toàn bộ Anti

    const ctx = { adapter, message, logger, db };

    // --- AntiTagAll: hễ tin nhắn chứa @all / @mọi người là phạt ngay ---
    if (settings.tagallEnabled) {
      if (hasTagAllText(message)) {
        await punishSevereViolation(
          ctx,
          senderId,
          threadId,
          `Phát hiện tag toàn bộ nhóm (@all).`,
        );
        return;
      }
    }

    // --- AntiQR: chặn mọi QR, chỉ miễn QR URL có toàn bộ domain trong allowlist ---
    if (settings.qrEnabled && isImageMessage(message.data)) {
      const imageUrls = extractImageUrls(message);

      for (const imageUrl of imageUrls) {
        const qrContent = await decodeQrFromUrl(imageUrl, logger);
        if (!qrContent) continue; // ảnh thường (không phải QR) thì bỏ qua

        const domains = extractDomains(qrContent);
        // VietQR/QR thanh toán thường là chuỗi EMV, không chứa URL. Bản cũ
        // yêu cầu domains.length > 0 nên loại QR này luôn lọt qua.
        const isAllowlistedUrlQr =
          domains.length > 0 &&
          domains.every((d) =>
            isDomainAllowed(d, config.antiLinkAllowlist, settings.linkAllowlist),
          );

        if (!isAllowlistedUrlQr) {
          await punishSevereViolation(
            ctx,
            senderId,
            threadId,
            domains.length > 0
              ? "Phát hiện mã QR chứa link không được phép."
              : "Phát hiện mã QR (bao gồm QR thanh toán/VietQR).",
          );
          return;
        }
      }
    }

    if (text === null) return;

    // --- AntiSpam ---
    if (settings.spamEnabled) {
      const isSpamming = recordAndCheckSpam(threadId, senderId);
      if (isSpamming) {
        await punishSpamViolation(ctx, senderId, threadId);
        return;
      }
    }

    // --- AntiLink ---
    if (settings.linkEnabled) {
      const domains = extractDomains(text);
      const hasDisallowedLink = domains.some(
        (d) => !isDomainAllowed(d, config.antiLinkAllowlist, settings.linkAllowlist),
      );
      if (hasDisallowedLink) {
        await punishSevereViolation(ctx, senderId, threadId, "Phát hiện link không được phép.");
      }
    }
  },

  async onGroupEvent({ adapter, event, db, logger }) {
    if (!event || event.type !== "join") return;

    const threadId = event.threadId;
    const uids = Array.isArray(event.data?.uids)
      ? event.data.uids
      : event.data?.uid
        ? [event.data.uid]
        : [];

    for (const uid of uids) {
      if (isBanned(db, threadId, uid)) {
        try {
          await adapter.removeUsersFromGroup([uid], threadId);
          logger?.info?.("[anti] Đã tự động kick lại UID bị cấm vĩnh viễn:", { uid, threadId });
        } catch (err) {
          if (err?.code !== "FEATURE_UNAVAILABLE") {
            logger?.warn?.("[anti] Không thể tự động kick lại UID bị cấm:", {
              uid,
              message: err?.message,
            });
          }
        }
      }
    }
  },
};
