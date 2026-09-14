/**
 * [PORT TỪ NKNP] key.js
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

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const fse = require("fs-extra");
const FormData = require("form-data"); // npm install form-data

const LOGO_DIR = path.join(__dirname, "data", "FREEFIRE", "logokey");
const KEYS_FILE = path.join(__dirname, "data", "keys.json");
const limitPath = path.join(__dirname, '..', 'commands', 'cache', 'limit.json');

// Danh sách API key remove.bg - bot sẽ thử lần lượt từ trên xuống dưới nếu key trước lỗi
const REMOVEBG_API_KEYS = [
    'BKWi4LdDvwEDJfSBXHq6gpYJ',
    'G83ZiDq1uF7YmxSjqUAjoALU',
    'r3FjcYnXdn43CJVKjjv3xsCJ',
    '2yhxkfp5MUSXfFwxikezUz9Q',
    'Km5F36mZKENpMk6YDRJ5j7Hc',
    'DnXMn432RjxFHCJjyAh1TQ6Z',
    'HrY2mRovgp7vNwxUEgG3gvnS',
    '6hE4e3KV6FBxfgMPUwv3c7vi',
    'PNN9Utg9gmXjM7CMkzbU99ZF',
    '65NPNJpRg1qRec6JbfjmKKLC'
];

function loadData() {
  if (!fs.existsSync(KEYS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch (e) {
    console.error("Lỗi đọc keys.json:", e);
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(url || "");
}

async function removeBackground(imageUrl) {
  for (let i = 0; i < REMOVEBG_API_KEYS.length; i++) {
    const apiKey = REMOVEBG_API_KEYS[i];
    try {
      const form = new FormData();
      form.append("image_url", imageUrl);
      form.append("size", "auto");

      const response = await axios.post(
        "https://api.remove.bg/v1.0/removebg",
        form,
        {
          headers: {
            ...form.getHeaders(),
            "X-Api-Key": apiKey,
          },
          responseType: "arraybuffer",
          timeout: 30000,
        }
      );

      if (response.status === 200) {
        console.log(`[RemoveBG] Thành công với key index ${i}: ${apiKey.slice(0,8)}...`);
        return Buffer.from(response.data);
      }
    } catch (err) {
      console.error(`[RemoveBG] Key ${apiKey.slice(0,8)}... lỗi:`, err.message);
    }
  }
  console.error("[RemoveBG] Đã thử hết tất cả key mà không thành công.");
  return null;
}

async function getAdminName(api, uid) {
  try {
    const info = await api.getUserInfo(uid);
    return (
      info?.[uid]?.name ||
      info?.changed_profiles?.[uid]?.zaloName ||
      info?.changed_profiles?.[uid]?.displayName ||
      uid
    );
  } catch {
    return uid;
  }
}

/**
 * 🔧 FIX: check admin bot chính xác hơn.
 * - Gộp CẢ 2 nguồn cấu hình admin có thể tồn tại trong project: global.config.ADMINBOT
 *   và global.users.admin (nguồn mà các module khác như stk.js đang dùng), tránh trường hợp
 *   admin đã khai báo ở 1 trong 2 nơi nhưng bị từ chối vì module chỉ đọc 1 nguồn.
 * - Ép toàn bộ phần tử về String trước khi so sánh, vì mảng cấu hình có thể chứa number
 *   (VD: ADMINBOT: [123456789]) khiến includes(String(id)) luôn trả về false dù đúng admin.
 * - Trim + loại bỏ phần tử rỗng để tránh lỗi so sánh do khoảng trắng/giá trị rác.
 */
function getBotAdminIds() {
  const fromConfig = (global.config && Array.isArray(global.config.ADMINBOT)) ? global.config.ADMINBOT : [];
  const fromUsers  = (global.users && Array.isArray(global.users.admin)) ? global.users.admin : [];
  return [...fromConfig, ...fromUsers]
    .map(v => String(v).trim())
    .filter(Boolean);
}

function isAdminBot(id) {
  if (!id) return false;
  return getBotAdminIds().includes(String(id).trim());
}

/**
 * 🆕 Map toàn cục lưu trạng thái "đang chờ ảnh logo" theo threadId + senderID
 * (KHÔNG phụ thuộc msgId), để cho phép user gửi ảnh trực tiếp mà không cần
 * quote/reply lại đúng tin nhắn bot vừa gửi.
 * value: { keyName, subStep: "logo" | "all_logo" }
 */
function getWaitingLogoMap() {
  if (!global.keyWaitingLogo) global.keyWaitingLogo = new Map();
  return global.keyWaitingLogo;
}

function waitKeyOf(threadId, senderID) {
  return `${threadId}_${senderID}`;
}

function extractTargetUid(event) {
  const quote = event?.data?.quote;
  if (quote && quote.ownerId) return String(quote.ownerId);

  const mentions = event?.data?.mentions;
  if (Array.isArray(mentions) && mentions.length > 0) {
    const m = mentions[0];
    const uid = m?.uid || m?.id || m?.data;
    if (uid) return String(uid);
  }
  return null;
}

/**
 * 🔧 FIX: bắt ảnh được gửi TRỰC TIẾP (không phải link, không phải quote).
 * - Trước đây chỉ xử lý event.data.content khi nó là object. Nhiều bản core Zalo trả
 *   content dạng STRING JSON khi user gửi ảnh trực tiếp (chưa được core parse sẵn),
 *   khiến ảnh gửi trực tiếp bị bỏ sót và rơi vào nhánh "không thấy ảnh hợp lệ".
 * - Bổ sung try/parse cho content dạng string, và cho quote.attach dạng object
 *   (không chỉ string) để bao quát mọi định dạng event có thể gặp.
 */
function extractImageUrlFromEvent(event) {
  const content = event?.data?.content;

  // Trường hợp 1: content là object (ảnh gửi trực tiếp, đã được core parse sẵn)
  if (content && typeof content === "object") {
    const url = content.href || content.url || content.hdUrl || content.thumb || null;
    if (url) return url;
  }

  // Trường hợp 2: content là string JSON (ảnh gửi trực tiếp nhưng core CHƯA parse)
  if (content && typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      const url = parsed?.href || parsed?.url || parsed?.hdUrl || parsed?.thumb || null;
      if (url) return url;
    } catch (_) {
      // content là string thường (VD: user gõ link) -> để isImageUrl() bên ngoài xử lý
    }
  }

  // Trường hợp 3: ảnh nằm trong quote (user reply lại 1 ảnh có sẵn trong đoạn chat)
  const quote = event?.data?.quote;
  if (quote) {
    if (typeof quote.attach === "string") {
      try {
        const parsed = JSON.parse(quote.attach);
        const url = parsed?.href || parsed?.url || parsed?.hdUrl || parsed?.thumb || null;
        if (url) return url;
      } catch (_) {}
    } else if (quote.attach && typeof quote.attach === "object") {
      const url = quote.attach.href || quote.attach.url || quote.attach.hdUrl || quote.attach.thumb || null;
      if (url) return url;
    }
  }

  return null;
}

const BangThuong = { 
  1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "11", 12: "12", 13: "13", 14: "14", 15: "15", 16: "16", 17: "17", 18: "18", 19: "19", 20: "20",
  21: "21", 22: "22", 23: "23", 24: "24", 25: "25", 26: "26", 27: "27", 28: "28", 29: "29", 30: "30",
  31: "31", 32: "32", 33: "33", 34: "34", 35: "35", 36: "36", 37: "37", 38: "38", 39: "39", 40: "40", 41: "41",
  42: "42", 43: "43", 44: "44", 45: "45",
  46: "46", 47: "47", 48: "48", 49: "49",  50: "50", 51: "51", 52: "52", 53: "53", 88: "88"
};

const DocQuyen = { 
  THINH1: "thinh1", PHONG1: "phong1", NT: "nt", LG2: "lg2", LY1: "ly1",
  LG6: "lg6", LG7: "lg7", HUY: "huy", BOT2: "bot2", NRE: "nre", GB1: "gb1", LG8: "lg8", BOT1: "bot1", TUAN1: "tuan1", LY2: "ly2", GB2: "gb2", QV1: "qv1", LG11: "lg11", thit: "thiet00", THIET1: "thiet1"
};





/**
 * 🆕 handleEvent: core gọi hàm này cho MỌI tin nhắn đến (không chỉ khi có prefix
 * hay khi user reply/quote) — giống cách file napluot.js dùng handleEvent để
 * lắng nghe liên tục. Ở đây dùng nó để bắt ảnh logo được gửi TRỰC TIẾP,
 * không cần quote lại tin nhắn "GỬI ẢNH LOGO..." của bot.
 *
 * Điều kiện xử lý:
 * - senderID đang có trạng thái chờ ảnh trong getWaitingLogoMap() (do run() set khi hỏi logo)
 * - Tin nhắn đến KHÔNG phải là quote/reply (event.data.quote rỗng) — vì nếu là quote,
 *   để module.exports.onReply xử lý như cũ, tránh xử lý trùng 2 lần cho cùng 1 ảnh.
 * - Tin nhắn phải chứa ảnh hợp lệ (extractImageUrlFromEvent tìm thấy url).
 */


// ĐỔI TÊN THÀNH module.exports.onReply ĐỂ KHỚP VỚI FILE CORE CỦA BẠN

const __legacyConfig = {
  name: "key",
  version: "2.0.6-zalo",
  role: 0,
  author: "Văn Hậu (Nhok) | Tích hợp Limit & Multi-Key RemoveBG | Khớp Core onReply | Fix check admin | Fix bắt ảnh gửi trực tiếp | Fix quyền delete/addctv/addadmin chỉ Admin Bot",
  description: "Quản lý key tính điểm (tích hợp limit + tách nền logo với nhiều key).",
  category: "game",
  usage: `[tao|edit|info|addctv|addadmin|delete]`,
  cooldowns: 5
};
const __legacyRun = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const senderID = String(event?.data?.uidFrom || event?.senderID || event?.uid || "").trim();

  try {
    const limitData = fse.readJsonSync(limitPath, { throws: false }) || {};
    const threadLimit = limitData[threadId];
    if (threadLimit && threadLimit.game === false) {
      return api.sendMessage("❎ Thánh Địa Của Bạn Không Được Phép Dùng Thuật Chú Trong 'Game'", threadId, type);
    }
  } catch (e) {
    console.log("Lỗi đọc limit.json:", e);
  }

  let data = loadData();
  const [subcmd, ...params] = args;
  const modName = __legacyConfig.name;

  /**
   * 🔧 FIX: chuẩn hóa danh sách admin của key về String trước khi so sánh,
   * tránh trường hợp uid lưu lẫn number/string trong keys.json khiến includes() sai.
   * (Không còn dùng cho delete/addctv nữa - 2 lệnh này giờ chỉ Admin Bot mới dùng được,
   * xem isAdminBot() bên dưới.)
   */
  function isAdminKey(keyName, userID) {
    if (!data[keyName]) return false;
    const admins = (data[keyName].admins || []).map(v => String(v).trim());
    return admins.includes(String(userID).trim());
  }

  function canManageKey(keyName, userID) {
    return isAdminBot(userID) || isAdminKey(keyName, userID);
  }

  const subCommand = subcmd?.toLowerCase();

  switch (subCommand) {
    case "tao":
    case "create": {
      let keyName = params[0];
      if (!keyName) return api.sendMessage("📛 Vui lòng nhập tên key cần tạo.", threadId, type);
    
      if (!/^[a-zA-Z0-9]+$/.test(keyName)) {    
        return api.sendMessage("📛 Tên key chỉ được gồm chữ và số, không chứa ký tự đặc biệt.", threadId, type);
      }
      if (keyName.length > 7) {
        return api.sendMessage("📛 Tên key không được dài quá 7 ký tự.", threadId, type);
      }

      if (data[keyName]) return api.sendMessage("📛 Key này đã tồn tại, hãy chọn tên khác.", threadId, type);

      data[keyName] = {
        ct: "FREE FIRE VN",
        ct2: "FREE FIRE VN",
        idbang: "1", 
        logo: path.join(__dirname, "data", "logo", "default.png"),
        admins: [senderID],
        ctvs: [],
      };
      saveData(data);
      return api.sendMessage(`✅ Đã tạo key ${keyName} thành công. Bạn hiện là admin của key này.\n\n💬 Dùng .key edit để chỉnh sửa thông tin key.`, threadId, type);
    }

    case "info": {
      let userKeys = Object.entries(data).filter(
        ([, v]) => (v.admins || []).map(String).includes(senderID) || (v.ctvs || []).map(String).includes(senderID)
      );

      if (userKeys.length === 0) return api.sendMessage("📛 Bạn chưa được gán key nào.", threadId, type);

      async function getName(uid) {
        return getAdminName(api, uid);
      }

      const page = 1;
      const limit = 10;
      const totalPages = Math.ceil(userKeys.length / limit);
      const start = (page - 1) * limit;
      const end = start + limit;
      const sliceKeys = userKeys.slice(start, end);

      let msg = `📋 Danh Sách Key Của Bạn (Page ${page}/${totalPages}) 📋\n\n`;
      let i = start;
      for (const [keyName, val] of sliceKeys) {
        let adminNames = await Promise.all((val.admins || []).map(getName));
        let ctvNames = await Promise.all((val.ctvs || []).map(getName));

        msg += `------------------------------------\n${++i}. 🔖Tên Key: ${keyName}\n` +
               `✅ Tên Custom\n🔹 ${val.ct || "Chưa có"}\n` +
               `✅ Tên Custom Viết Tắt\n🔹 ${val.ct2 || "Chưa có"}\n` +
               `✅ ID Bảng Điểm\n🔹 ${val.idbang || "Chưa có"}\n\n` +
               `🛡 Admins: ${adminNames.length ? adminNames.join(", ") : "Chưa có"}\n` +
               `👤 CTVs: ${ctvNames.length ? ctvNames.join(", ") : "Chưa có"}\n`;
      }
      msg += `\n➡️ Reply: page {số} để chuyển trang.`;

      const info = await api.sendMessage({ msg }, threadId, type);
      const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
      global.client.handleReply.set(replyMsgId, {
        name: modName,
        step: "page_info",
        author: senderID,
        keys: userKeys
      });
      return;
    }

    case "edit": {
      let keyName = params[0];
      if (!keyName) return api.sendMessage("🗨 Vui lòng nhập tên key cần chỉnh sửa.", threadId, type);
      if (!data[keyName]) return api.sendMessage("📛 Không tìm thấy key này.", threadId, type);
      if (!canManageKey(keyName, senderID))
        return api.sendMessage("⚠ Bạn không có quyền chỉnh sửa key này.", threadId, type);

      const info = await api.sendMessage(
        {
          msg:
            `🔧 CHỈNH SỬA KEY: ${keyName}\n\n` +
            `Chọn thông tin muốn sửa:\n` +
            `1. Tên Custom\n` +
            `2. Tên Viết Tắt\n` +
            `3. ID Bảng Điểm [1-52]\n` +
            `4. Logo Custom\n` +
            `5. Sửa tất cả\n\n` +
            `Link xem bxh : https://grand-chebakia-ef5c49.netlify.app/\n` +
            `Reply số tương ứng`
        },
        threadId,
        type
      );

      const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
      global.client.handleReply.set(replyMsgId, {
        step: 1,
        name: modName,
        author: senderID,
        keyName,
      });
      return;
    }

    // 🔧 FIX: trước đây dùng canManageKey() (cho phép cả admin của riêng key đó thêm CTV),
    // giờ đổi thành CHỈ Admin Bot mới được thêm CTV, giống hệt quyền của addadmin.
    case "addctv": {
      if (!isAdminBot(senderID)) return api.sendMessage("💢 Chỉ Admin Bot dùng lệnh này!", threadId, type);

      let keyName = params[0];
      if (!keyName) return api.sendMessage("📛 Vui lòng nhập key!", threadId, type);

      const uid = extractTargetUid(event);
      if (!uid) return api.sendMessage("Vui lòng tag hoặc reply người cần thêm CTV!", threadId, type);

      if (!data[keyName]) return api.sendMessage("📛 Key không tồn tại!", threadId, type);
      if ((data[keyName].ctvs || []).map(String).includes(String(uid))) return api.sendMessage("🔹 Người này đã là CTV rồi!", threadId, type);

      data[keyName].ctvs.push(String(uid));
      saveData(data);
      return api.sendMessage(`✅ Đã thêm CTV ${uid} cho key ${keyName}`, threadId, type);
    }

    case "addadmin": {
      if (!isAdminBot(senderID)) return api.sendMessage("💢 Chỉ Admin Bot dùng lệnh này!", threadId, type);

      const keyName = params[0];
      if (!keyName) return api.sendMessage("📛 Nhập tên key!", threadId, type);
      if (!data[keyName]) return api.sendMessage("📛 Key không tồn tại!", threadId, type);

      let uid = extractTargetUid(event);
      if (!uid) return api.sendMessage("Reply hoặc tag người muốn thêm admin!", threadId, type);

      uid = String(uid).replace(/[^0-9]/g, "");

      if ((data[keyName].admins || []).map(String).includes(uid)) return api.sendMessage("🔹 Đã là admin rồi!", threadId, type);

      data[keyName].admins.push(uid);
      saveData(data);

      const targetName = await getAdminName(api, uid);
      return api.sendMessage(`✅ Đã thêm "${targetName}" (ID: ${uid}) làm admin key '${keyName}'.`, threadId, type);
    }

    // 🔧 FIX: trước đây dùng canManageKey() (cho phép cả admin của riêng key đó xóa key),
    // giờ đổi thành CHỈ Admin Bot mới được xóa key.
    case "delete": {
      if (!isAdminBot(senderID)) return api.sendMessage("💢 Chỉ Admin Bot dùng lệnh này!", threadId, type);

      let keyName = params[0];
      if (!keyName) return api.sendMessage("🔹 Nhập tên key muốn xóa!", threadId, type);
      if (!data[keyName]) return api.sendMessage("📛 Key không tồn tại!", threadId, type);

      delete data[keyName];
      saveData(data);
      return api.sendMessage(`🗑 Đã xóa key: ${keyName}`, threadId, type);
    }

    default:
      return api.sendMessage(
        "📌 Hướng dẫn lệnh .key\n\n" +
        ".key tao [tên] → Tạo key mới\n" +
        ".key edit [key] → Chỉnh sửa key\n" +
        ".key info → Xem key của bạn\n" +
        ".key addctv [key] [tag/reply] → Thêm CTV (chỉ Admin Bot)\n" +
        ".key addadmin [key] [tag/reply] → Thêm admin (chỉ Admin Bot)\n" +
        ".key delete [key] → Xóa key (chỉ Admin Bot)\n\n" +
        "Link xem bxh: https://grand-chebakia-ef5c49.netlify.app/",
        threadId,
        type
      );
  }
};
const __legacyOnReply = async function(context) {
  const api = context.api;
  const event = context.event;
  // Core truyền qua biến tên là "Reply", hứng tại đây
  const ReplyData = context.Reply;

  console.log("\n--- 🛠 BẮT ĐẦU VÀO ONREPLY CỦA LỆNH KEY ---");
  if (!ReplyData) {
      console.log("=> ❌ DỪNG LẠI: Không nhận được thông tin ReplyData từ Core.");
      return;
  }

  const { threadId, type } = event;
  const senderID = String(event?.data?.uidFrom || event?.senderID || event?.uid || "").trim();
  const rawContent = String(event?.data?.content || "").trim();
  const modName = __legacyConfig.name;

  try {
    const limitData = fse.readJsonSync(limitPath, { throws: false }) || {};
    if (limitData[threadId]?.game === false) {
       console.log("=> ❌ DỪNG LẠI: Box này bị cấm dùng lệnh game trong limit.json.");
       return;
    }
  } catch (e) { }

  if (ReplyData.step === "page_info" || ReplyData.step === "page_list") {
     if (senderID !== String(ReplyData.author).trim()) return;
     const match = rawContent.match(/^page\s+(\d+)$/i);
     if (!match) return;

     const page = parseInt(match[1]);
     const limit = 10;
     const keys = ReplyData.keys;
     const totalPages = Math.ceil(keys.length / limit);
     if (page < 1 || page > totalPages) return api.sendMessage(`❌ Trang không hợp lệ! Tổng: ${totalPages}`, threadId, type);

     async function getName(uid) { return getAdminName(api, uid); }

     const start = (page - 1) * limit;
     const end = start + limit;
     const sliceKeys = keys.slice(start, end);

     let msg = `📋 Danh Sách Key (Page ${page}/${totalPages}) 📋\n\n`;
     let index = start;
     for (const [keyName, val] of sliceKeys) {
       let adminNames = await Promise.all((val.admins || []).map(getName));
       let ctvNames = await Promise.all((val.ctvs || []).map(getName));

       msg += `------------------------------------\n${++index}. 🔖Tên Key: ${keyName}\n` +
              `✅ Tên Custom\n🔹 ${val.ct || "Chưa có"}\n` +
              `✅ Tên Viết Tắt\n🔹 ${val.ct2 || "Chưa có"}\n` +
              `✅ ID Bảng Điểm\n🔹 ${val.idbang || "Chưa có"}\n\n` +
              `🛡 Admins: ${adminNames.length ? adminNames.join(", ") : "Chưa có"}\n` +
              `👤 CTVs: ${ctvNames.length ? ctvNames.join(", ") : "Chưa có"}\n`;
     }
     msg += `\n➡️ Reply: page {số} để chuyển trang.`;

     const info = await api.sendMessage({ msg }, threadId, type);
     const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
     global.client.handleReply.set(replyMsgId, {
       name: modName,
       step: ReplyData.step,
       author: senderID,
       keys
     });
     return;
  }

  if (ReplyData.name !== modName || senderID !== String(ReplyData.author).trim()) {
      console.log("=> ❌ DỪNG LẠI: Tên lệnh không khớp hoặc người reply không phải chủ lệnh.");
      return;
  }

  let keyName = ReplyData.keyName;
  let data = loadData();
  if (!data[keyName]) {
      console.log("=> ❌ DỪNG LẠI: Key không tồn tại trong data.json.");
      return api.sendMessage("🔹 Key không tồn tại hoặc đã bị xóa!", threadId, type);
  }

  console.log("=> ✅ VƯỢT QUA MỌI RÀO CẢN. BẮT ĐẦU CHẠY STEP:", ReplyData.step);

  try {
      switch (ReplyData.step) {
        case 1: {
          let choose = rawContent;
          if (!["1","2","3","4","5"].includes(choose)) {
            const info = await api.sendMessage({ msg: "Reply số từ 1 đến 5 thôi nhé!" }, threadId, type);
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, { step: 1, name: modName, author: senderID, keyName });
            return;
          }

          if (choose === "5") {
            const info = await api.sendMessage({ msg: "Nhập Tên Custom mới:" }, threadId, type);
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, { step: 2, name: modName, author: senderID, keyName, subStep: "all_ct" });
          } else if (choose === "4") {
            const info = await api.sendMessage({ msg: "GỬI ẢNH/LOGO CUSTOM CỦA BẠN BẰNG ẢNH HOẶC LINK .PNG ☑️\n(Gửi ảnh trực tiếp luôn, không cần reply lại tin nhắn này)" }, threadId, type);
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, { step: 2, name: modName, author: senderID, keyName, subStep: "logo" });
            // 🆕 Cho phép gửi ảnh trực tiếp không cần reply
            getWaitingLogoMap().set(waitKeyOf(threadId, senderID), { keyName, subStep: "logo" });
          } else {
            const fields = {
              "1": { key: "ct",   text: "Tên Custom" },
              "2": { key: "ct2",  text: "Tên Viết Tắt" },
              "3": { key: "idbang", text: "ID Bảng Điểm [1-52]" }
            };
            let f = fields[choose];
            const info = await api.sendMessage({ msg: `Nhập ${f.text} mới:` }, threadId, type);
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, { step: 2, name: modName, author: senderID, keyName, subStep: f.key });
          }
          break;
        }

        case 2: {
          let { subStep } = ReplyData;
          let input = rawContent;

          if (subStep === "logo" || subStep === "all_logo") {
            // 🔧 FIX: ưu tiên lấy ảnh từ event (gửi trực tiếp), nếu không có mới fallback sang link text
            let imageUrl = extractImageUrlFromEvent(event);
            if (!imageUrl && isImageUrl(input)) imageUrl = input;

            if (!imageUrl) {
              const info = await api.sendMessage({ msg: "Không thấy ảnh hợp lệ. Gửi lại ảnh hoặc link nhé!" }, threadId, type);
              const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
              global.client.handleReply.set(replyMsgId, { ...ReplyData });
              return; // vẫn giữ trạng thái chờ ảnh trong getWaitingLogoMap() để user thử gửi lại
            }

            // 🆕 Đã nhận được ảnh -> không còn chờ ảnh trực tiếp nữa
            getWaitingLogoMap().delete(waitKeyOf(threadId, senderID));

            const info = await api.sendMessage(
              {
                msg: `Bạn có muốn **tách nền** (xóa nền trong suốt) cho logo này không?\n\n` +
                     `Reply: **yes** / **y** / **có** → tách nền\n` +
                     `Reply bất kỳ khác → giữ nguyên ảnh gốc`
              },
              threadId,
              type
            );
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, {
              step: 2,
              name: modName,
              author: senderID,
              keyName,
              subStep: subStep === "logo" ? "logo_confirm" : "all_logo_confirm",
              imageUrl
            });
            return;
          }

          else if (subStep === "logo_confirm" || subStep === "all_logo_confirm") {
            const wantRemove = ["yes", "y", "có", "ok", "được"].includes(rawContent.toLowerCase());

            let finalBuffer = null;
            let usedRemoveBg = false;

            if (wantRemove) {
              finalBuffer = await removeBackground(ReplyData.imageUrl);
              if (finalBuffer) usedRemoveBg = true;
              else {
                api.sendMessage("⚠ Không tách nền được (hết credit hoặc lỗi API). Dùng ảnh gốc.", threadId, type);
              }
            }

            if (!finalBuffer) {
              try {
                const res = await axios.get(ReplyData.imageUrl, { responseType: "arraybuffer" });
                finalBuffer = Buffer.from(res.data);
              } catch (err) {
                console.error(err);
                return api.sendMessage("❌ Không tải được ảnh gốc. Thử lại nhé!", threadId, type);
              }
            }

            const ext = usedRemoveBg ? ".png" : (path.extname(new URL(ReplyData.imageUrl).pathname) || ".png");
            const filePath = path.join(LOGO_DIR, `${keyName}${ext}`);

            if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
            fs.writeFileSync(filePath, finalBuffer);

            data[keyName].logo = filePath;
            saveData(data);

            const adminName = await getAdminName(api, data[keyName].admins[0]);

            let msg = `✨ Cập nhật logo thành công!\n🔑 Key: ${keyName}\n🛡 Admin: ${adminName}\n`;
            msg += usedRemoveBg ? "→ Đã tách nền logo custom" : "→ Giữ nguyên ảnh gốc";

            // Không kèm quote — gửi độc lập, không reply lại tin nhắn trước đó
            return api.sendMessage({ msg, attachments: [filePath] }, threadId, type);
          }

          else if (subStep === "all_ct") {
            data[keyName].ct = input;
            saveData(data);
            const info = await api.sendMessage({ msg: "Nhập Tên Viết Tắt mới:" }, threadId, type);
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, { step: 3, name: modName, author: senderID, keyName, subStep: "all_ct2" });
          } else if (subStep === "ct") {
            data[keyName].ct = input;
            saveData(data);
            const adminName = await getAdminName(api, data[keyName].admins[0]);
            return api.sendMessage(`✨ Cập nhật thành công!\nTên Custom: ${input}\nKey: ${keyName}\nAdmin: ${adminName}`, threadId, type);
          } else if (subStep === "ct2") {
            data[keyName].ct2 = input;
            saveData(data);
            const adminName = await getAdminName(api, data[keyName].admins[0]);
            return api.sendMessage(`✨ Cập nhật thành công!\nTên Viết Tắt: ${input}\nKey: ${keyName}\nAdmin: ${adminName}`, threadId, type);
          } else if (subStep === "idbang") {
            let val = input.toUpperCase();
            if (!/^[a-zA-Z0-9]+$/.test(val)) return api.sendMessage("❗ ID Bảng không hợp lệ (chỉ chữ+số).", threadId, type);

            if (BangThuong[val] || DocQuyen[val]) {
              if (DocQuyen[val] && !isAdminBot(senderID)) {
                return api.sendMessage("❗ Bảng độc quyền chỉ Admin Bot dùng được!", threadId, type);
              }
              data[keyName].idbang = val.toLowerCase();
              saveData(data);
              const adminName = await getAdminName(api, data[keyName].admins[0]);
              return api.sendMessage(`✨ Cập nhật thành công!\nID Bảng: ${data[keyName].idbang}\nKey: ${keyName}\nAdmin: ${adminName}`, threadId, type);
            }
            return api.sendMessage("❗ ID Bảng không tồn tại. Chọn đúng bảng!", threadId, type);
          }
          break;
        }

        case 3: {
          let { subStep } = ReplyData;
          let newVal = rawContent;
          if (!newVal) return api.sendMessage("Giá trị không được để trống!", threadId, type);

          if (subStep === "all_ct2") {
            data[keyName].ct2 = newVal;
            saveData(data);
            const info = await api.sendMessage({ msg: "Nhập giá trị mới cho ID Bảng Điểm [1-52]:" }, threadId, type);
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, {
              step: 4,
              name: modName,
              author: senderID,
              keyName,
              subStep: "all_idbang",
            });
          } else {
            return api.sendMessage("Lỗi không xác định trong quá trình sửa tất cả.", threadId, type);
          }
          break;
        }

        case 4: {
          let { subStep } = ReplyData;

          if (subStep === "all_idbang") {
            let newVal = rawContent.toUpperCase();

            if (!/^[a-zA-Z0-9]+$/.test(newVal)) {
              return api.sendMessage("❗ ID Bảng không hợp lệ. Chỉ được chứa chữ và số.", threadId, type);
            }

            if (BangThuong[newVal]) {
              data[keyName].idbang = newVal.toLowerCase();
            } 
            else if (DocQuyen[newVal]) {
              if (!isAdminBot(senderID)) {
                return api.sendMessage("❗ Bảng độc quyền chỉ admin mới có thể chọn!", threadId, type);
              }
              data[keyName].idbang = newVal.toLowerCase();
            } 
            else {
              return api.sendMessage("❗ Không tồn tại bảng này. Hãy chọn bảng hợp lệ!", threadId, type);
            }
        
            saveData(data);
            const info = await api.sendMessage(
              { msg: "Vui lòng gửi ảnh logo (gửi trực tiếp, không cần reply) hoặc gửi link ảnh hợp lệ (có đuôi):" },
              threadId,
              type
            );
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, {
              step: 5,
              name: modName,
              author: senderID,
              keyName,
              subStep: "all_logo",
            });
            // 🆕 Cho phép gửi ảnh trực tiếp không cần reply
            getWaitingLogoMap().set(waitKeyOf(threadId, senderID), { keyName, subStep: "all_logo" });
          } else {
            return api.sendMessage("Lỗi không xác định trong quá trình sửa tất cả.", threadId, type);
          }
          break;
        }

        case 5: {
          if (ReplyData.subStep === "all_logo") {
            // 🔧 FIX: ưu tiên ảnh gửi trực tiếp từ event
            let imageUrl = extractImageUrlFromEvent(event);
            if (!imageUrl && isImageUrl(rawContent)) imageUrl = rawContent;

            if (!imageUrl) return api.sendMessage("Không thấy ảnh hợp lệ. Thử lại!", threadId, type);

            // 🆕 Đã nhận được ảnh -> không còn chờ ảnh trực tiếp nữa
            getWaitingLogoMap().delete(waitKeyOf(threadId, senderID));

            const info = await api.sendMessage(
              {
                msg: `Bạn có muốn **tách nền** cho logo cuối cùng không?\n\n` +
                     `Reply: có hoặc không → tách nền\n` +
                     `Khác → giữ nguyên`
              },
              threadId,
              type
            );
            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
            global.client.handleReply.set(replyMsgId, {
              step: 5,
              name: modName,
              author: senderID,
              keyName,
              subStep: "all_logo_confirm",
              imageUrl
            });
            return;
          }

          else if (ReplyData.subStep === "all_logo_confirm") {
            const wantRemove = ["yes", "y", "có", "ok", "được"].includes(rawContent.toLowerCase());

            let finalBuffer = null;
            let usedRemoveBg = false;

            if (wantRemove) {
              finalBuffer = await removeBackground(ReplyData.imageUrl);
              if (finalBuffer) usedRemoveBg = true;
              else api.sendMessage("⚠ Không tách nền được. Dùng ảnh gốc.", threadId, type);
            }

            if (!finalBuffer) {
              try {
                const res = await axios.get(ReplyData.imageUrl, { responseType: "arraybuffer" });
                finalBuffer = Buffer.from(res.data);
              } catch {
                return api.sendMessage("❌ Không tải được ảnh cuối cùng!", threadId, type);
              }
            }

            const ext = usedRemoveBg ? ".png" : (path.extname(new URL(ReplyData.imageUrl).pathname) || ".png");
            const filePath = path.join(LOGO_DIR, `${keyName}${ext}`);

            if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
            fs.writeFileSync(filePath, finalBuffer);
            data[keyName].logo = filePath;
            saveData(data);

            const adminName = await getAdminName(api, data[keyName].admins[0]);

            // Không kèm quote — gửi độc lập
            return api.sendMessage(
              {
                msg: `✨ **Cập nhật toàn bộ key thành công!**\n\n` +
                     `Tên Custom: ${data[keyName].ct}\n` +
                     `Tên Viết Tắt: ${data[keyName].ct2}\n` +
                     `ID Bảng: ${data[keyName].idbang}\n` +
                     `Logo: ${usedRemoveBg ? "Đã tách nền" : "Giữ nguyên"}\n` +
                     `🔑 Key: ${keyName}\n🛡 Admin: ${adminName}`,
                attachments: [filePath]
              },
              threadId,
              type
            );
          }
          break;
        }

        default:
          api.sendMessage("Có lỗi trong handleReply.", threadId, type);
      }
  } catch (error) {
      console.error("\n[ERROR DỮ DỘI TRONG ONREPLY]", error);
      api.sendMessage("❌ Lỗi kĩ thuật khi Reply: " + error.message, threadId, type);
  }
};
const __legacyHandleEvent = async function ({ api, event }) {
  try {
    if (!event) return;
    const threadId = event.threadId || event?.threadID || event?.data?.threadId;
    const type = event.type;
    const senderID = String(event?.data?.uidFrom || event?.senderID || event?.uid || "").trim();
    if (!threadId || !senderID) return;

    const waitingMap = getWaitingLogoMap();
    const waitKey = waitKeyOf(threadId, senderID);
    if (!waitingMap.has(waitKey)) return; // không ai đang chờ gửi logo -> bỏ qua ngay

    // Nếu đây là 1 quote/reply thì để onReply xử lý, tránh trùng lặp
    if (event?.data?.quote) return;

    const imageUrl = extractImageUrlFromEvent(event);
    if (!imageUrl) return; // tin nhắn thường (text khác) -> bỏ qua, không phải ảnh

    const { keyName, subStep } = waitingMap.get(waitKey);
    waitingMap.delete(waitKey); // xoá ngay để tránh xử lý trùng nếu gửi liên tiếp nhiều ảnh

    const data = loadData();
    if (!data[keyName]) return; // key đã bị xoá trong lúc chờ

    const info = await api.sendMessage(
      {
        msg:
          `📸 Đã nhận ảnh bạn gửi trực tiếp!\n\n` +
          `Bạn có muốn **tách nền** (xóa nền trong suốt) cho logo này không?\n\n` +
          `Reply: **yes** / **y** / **có** → tách nền\n` +
          `Reply bất kỳ khác → giữ nguyên ảnh gốc`
      },
      threadId,
      type
    );
    const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.data?.msgId || info?.msgId);
    global.client.handleReply.set(replyMsgId, {
      step: 2,
      name: __legacyConfig.name,
      author: senderID,
      keyName,
      subStep: subStep === "logo" ? "logo_confirm" : "all_logo_confirm",
      imageUrl
    });
  } catch (e) {
    console.error("[KEY handleEvent] Lỗi khi bắt ảnh gửi trực tiếp:", e.message);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, __legacyHandleEvent);
