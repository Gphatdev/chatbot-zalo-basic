/**
 * [PORT TỪ NKNP] sendcard.js
 * Tự động chuyển đổi bởi codemod NKNP V3 — logic bên trong giữ nguyên vẹn,
 * chỉ thay đổi phần "vỏ bọc" (module.exports -> wrapLegacyCommand).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../LegacyBridge.js";

function escapeRegExp(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const __legacyConfig = {
  name: 'sendcard',
  version: '1.0.0',
  role: 0,
  author: 'NLam182',
  description: 'Gửi danh thiếp của người được tag',
  category: 'Tiện ích',
  usage: 'sendcard @user [nội dung tuỳ chọn]',
  cooldowns: 3,
  aliases: []
};
const __legacyRun = async ({ args, event, api }) => {
  const { threadId, type, data } = event;

  const mentions = data.mentions;
  const hasMention = mentions && mentions.length > 0;

  if (!hasMention) {
    return api.sendMessage(
      "❌ Vui lòng tag ít nhất một người để gửi danh thiếp.\nCú pháp: sc @user [nội dung tuỳ chọn]",
      threadId,
      type
    );
  }

  let optionalText = args.join(" ").trim();
  const removeOnce = (str, pattern) => {
    const re = new RegExp(`(^|\\s)${pattern}(?=\\s|$)`, "i");
    return str.replace(re, (m, p1) => p1 ? p1 : "").replace(/\s{2,}/g, " ").trim();
  };

  try {
    const nameCache = {};
    for (const m of mentions) {
      try {
        const info = await api.getUserInfo(m.uid);
        nameCache[m.uid] = info?.changed_profiles?.[m.uid]?.displayName || "";
      } catch { nameCache[m.uid] = ""; }
    }

  let cleanedText = optionalText;
    for (const uid in nameCache) {
      const displayName = nameCache[uid];
      if (displayName) {
        const escaped = escapeRegExp(`@${displayName}`);
        cleanedText = removeOnce(cleanedText, escaped);
      }
    }
  cleanedText = cleanedText.replace(/@[\S]+/g, "").replace(/\s{2,}/g, " ").trim();

    for (const m of mentions) {
      const targetId = m.uid;

      const payload = { userId: targetId };
      if (cleanedText.length > 0) {
        payload.phoneNumber = cleanedText;
      }

      await api.sendCard(payload, threadId, type);

    }
  } catch (err) {
    console.error("[sc] sendCard error:", err);
    return api.sendMessage("❌ Không thể gửi danh thiếp lúc này. Vui lòng thử lại sau.", threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
