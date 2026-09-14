/**
 * [PORT SANG NKNP V3 / zca-mt] lineup.js
 * Chuyển từ phong cách FCA (Facebook Messenger) sang zca-mt (Zalo), dùng
 * LegacyBridge (wrapLegacyCommand) — xem Core/LegacyBridge.js.
 *
 * Thay đổi chính:
 *   - event.threadID/messageID/senderID (FCA) -> event.threadId / event.data.uidFrom (zca)
 *   - global.client.handleReply.push(...) (mảng, FCA) -> global.client.handleReply.set(msgId, {...}) (Map, Zalo)
 *   - module.exports.handleReply({api,event,handleReply}) -> onReply tự tra cứu Map bằng quote msgId
 *   - api.sendMessage(body, threadID, cb, messageID) -> await api.sendMessage(msg, threadId, type)
 *   - event.attachments[0].url (ảnh reply, FCA) -> extractImageUrlFromEvent(event) (zca, xem key.js)
 *   - api.changeNickname(name, threadID, uid, cb) -> await api.changeNickname(name, threadId, uid)
 *
 * @author Dev by LEGI STUDIO - ZanHau | Upgraded by Gemini | Port zca-mt: NKNP STUDIO
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../LegacyBridge.js";

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage, registerFont } = require("canvas");
const moment = require("moment-timezone");

const REPLY_NAME = "lineup";

// 🆕 FIX (Zalo): Map toàn cục lưu state "đang chờ reply" theo msgId,
// thay cho global.client.handleReply.push(...) kiểu mảng (FCA).
global.client = global.client || {};
global.client.handleReply = global.client.handleReply instanceof Map
  ? global.client.handleReply
  : new Map();

// --- ĐƯỜNG DẪN DÙNG CHUNG ---
const limitPath = path.join(__dirname, '..', 'commands', 'cache', 'limit.json');
const turnsFilePath = path.join(__dirname, "data", "Luotdung", "bank_user_turns.json");

// Đảm bảo các file dữ liệu tồn tại
fs.ensureFileSync(turnsFilePath);

const LAYOUT_ROOT = path.join(__dirname, "data", "FREEFIRE", "Lineup");

let cache = {};

const posMap = {
  t: "Tanker",
  s: "Sniper",
  b: "Bomber",
  sp: "Supports",
  r: "Rifler",
  c: "Coach",
};

// 🔧 FIX (Zalo): trích URL ảnh từ event zca-mt — ảnh gửi trực tiếp hoặc
// ảnh nằm trong quote/reply. Xem Core/Commands/key.js (extractImageUrlFromEvent).
function extractImageUrlFromEvent(event) {
  const content = event?.data?.content;

  if (content && typeof content === "object") {
    const url = content.href || content.url || content.hdUrl || content.thumb || null;
    if (url) return url;
  }

  if (content && typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      const url = parsed?.href || parsed?.url || parsed?.hdUrl || parsed?.thumb || null;
      if (url) return url;
    } catch (_) { /* content là text thường */ }
  }

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

function readJSONSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    try {
      return JSON.parse(raw);
    } catch (err) {
      let msg = `Lỗi parse JSON: ${path.basename(filePath)}\n${err.message}`;
      throw new Error(msg);
    }
  } catch (e) {
    throw new Error(`Không thể đọc file JSON: ${filePath}\n${e.message}`);
  }
}

function drawText(ctx, text, cfg) {
  if (!text || !cfg) return;
  const weight = cfg.bold ? "bold" : "normal";
  const style = cfg.italic ? "italic" : "normal";
  const fontSize = cfg.size || 32;
  const fontFamily = cfg.font || "Arial";

  ctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = cfg.color || "#FFFFFF";
  ctx.textAlign = cfg.align || "left";
  ctx.textBaseline = "top";

  const lines = String(text).split("\n");
  const lineHeight = cfg.lineHeight || fontSize;

  ctx.save();
  if (cfg.rotate) {
    ctx.translate(cfg.x, cfg.y);
    ctx.rotate((cfg.rotate * Math.PI) / 180);
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, i * lineHeight);
    });
  } else {
    lines.forEach((line, i) => {
      ctx.fillText(line, cfg.x, cfg.y + i * lineHeight);
    });
  }
  ctx.restore();
}

function drawImageRotated(ctx, img, x, y, w, h, rotate = 0) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

const API_KEYS = [
  "Trug5SQwGYqrkRS5feFkTQtf", "gjxFfEicdq51h7ogoqWKfTpY", "2YVqySEhaeRwnTEsDX4pjDNx",
  "XFCvZYUJqoRmY9UdmrBr5siS", "JpDZB34DUULhD4oMo3d7oFZG", "VrJX2mS4PoT4Sqf16ZSUMHa8",
  "K1VF347LdTY3RgHHEgbrEaY6", "U9riSWLTNnAKxkatp1mh9viX", "ovGqHVLg2b7urSzN9BwZ895N",
  "1QHhzGaPPjb84kJUfcueyBKM", "UdN1nnFzaWRiRtbq6jqtbuFe",
];
let currentKeyIndex = 0;

async function removeBackground(imageUrl) {
  if (!API_KEYS || API_KEYS.length === 0) throw new Error("Chưa cấu hình API key nào cho remove.bg!");
  let lastErr = null;

  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[currentKeyIndex];
    try {
      const response = await axios({
        method: "post",
        url: "https://api.remove.bg/v1.0/removebg",
        data: { image_url: imageUrl, size: "auto" },
        headers: { "X-Api-Key": key },
        responseType: "arraybuffer",
        timeout: 30000,
      });
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      return response.data;
    } catch (err) {
      console.warn(`❌ Key lỗi: ${key} → thử key khác...`);
      lastErr = err;
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    }
  }
  throw lastErr || new Error("Tất cả API key remove.bg đều lỗi!");
}

async function tryRemoveBgOrNull(imageUrl) {
  try {
    const buf = await removeBackground(imageUrl);
    return buf;
  } catch (e) {
    console.warn("⚠️ Không xoá được nền, dùng ảnh gốc. Lý do:", e?.message || e);
    return null;
  }
}

async function drawLineup(state) {
  const layoutPath = path.join(LAYOUT_ROOT, state.layoutName);
  const cfgPath = path.join(layoutPath, `layout-${state.num}.json`);
  const layoutConfig = readJSONSafe(cfgPath);

  let bgCandidates = [];
  const extensions = ['.png', '.jpg', '.jpeg'];

  if (state.useAvatar) {
    extensions.forEach(ext => {
        bgCandidates.push(path.join(layoutPath, `nhanvat-${state.num}${ext}`));
    });
  }

  extensions.forEach(ext => {
      bgCandidates.push(path.join(layoutPath, `${state.num}${ext}`));
  });

  const bgPath = bgCandidates.find(p => fs.existsSync(p));

  if (!bgPath) {
    const missingFiles = state.useAvatar
      ? `nhanvat-${state.num}.png/jpg hoặc ${state.num}.png/jpg`
      : `${state.num}.png/jpg`;
    throw new Error(`Không tìm thấy background phù hợp cho ${state.num} người trong layout "${state.layoutName}".\nVui lòng kiểm tra lại sự tồn tại của file: ${missingFiles}`);
  }

  const bg = await loadImage(bgPath);
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(bg, 0, 0, bg.width, bg.height);

  if (layoutConfig.tengiai) {
    drawText(ctx, state.tengiai, layoutConfig.tengiai);
  }

  if (layoutConfig.tenteam) {
    drawText(ctx, state.team, layoutConfig.tenteam);
  }

  if (state.logo && layoutConfig.logo) {
    try {
      const logoBuf = await tryRemoveBgOrNull(state.logo);
      const logoImg = await loadImage(logoBuf || state.logo);
      drawImageRotated(
        ctx,
        logoImg,
        layoutConfig.logo.x,
        layoutConfig.logo.y,
        layoutConfig.logo.w,
        layoutConfig.logo.h,
        layoutConfig.logo.rotate || 0
      );
    } catch (e) {
      console.error("Lỗi load/xoá nền logo:", e?.message || e);
    }
  }

  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const conf = layoutConfig.thanhvien?.[i];
    if (!conf) continue;

    if (conf.name) drawText(ctx, player.name, conf.name);

    if (conf.pos && player.pos) {
      const fullPos = posMap[player.pos.toLowerCase()] || player.pos || "";
      drawText(ctx, fullPos, conf.pos);
    }

    if (state.logo && conf.logo) {
      try {
        const logoBuf = await tryRemoveBgOrNull(state.logo);
        const logoImg = await loadImage(logoBuf || state.logo);
        drawImageRotated(
          ctx,
          logoImg,
          conf.logo.x,
          conf.logo.y,
          conf.logo.w,
          conf.logo.h,
          conf.logo.rotate || 0
        );
      } catch (e) { console.error(`Lỗi logo thành viên #${i + 1}:`, e?.message || e); }
    }

    if (player.avatar && conf.avatar) {
      try {
        const avaBuf = await tryRemoveBgOrNull(player.avatar);
        const avaImg = await loadImage(avaBuf || player.avatar);
        drawImageRotated(
          ctx,
          avaImg,
          conf.avatar.x,
          conf.avatar.y,
          conf.avatar.w,
          conf.avatar.h,
          conf.avatar.rotate || 0
        );
      } catch (e) { console.error(`Lỗi avatar thành viên #${i + 1}:`, e?.message || e); }
    }
  }

  return canvas.toBuffer("image/png");
}

const __legacyConfig = {
  name: "lineup",
  version: "1.7.1",
  role: 0,
  author: "Dev by LEGI STUDIO - ZanHau | Upgraded by Gemini",
  description: "Tạo lineup FreeFire (Bắt buộc dùng lượt lẻ bank user, không áp dụng vô hạn)",
  category: "game",
  usages: "Sử dụng để tạo ảnh lineup đội",
  cooldowns: 5,
};

async function generateAndSendImage(api, event, state) {
    const { threadId, type, data } = event;
    const senderID = data.uidFrom;

    // --- BƯỚC 1: KIỂM TRA LƯỢT BANK USER (BẮT BUỘC) ---
    try {
        const turnsData = fs.readJsonSync(turnsFilePath, { throws: false }) || {};
        const userTurns = turnsData[senderID] || 0;

        if (userTurns <= 0) {
            return api.sendMessage(
                `🚫 Bạn đã hết lượt sử dụng lệnh này.\n⚠️ Lệnh tạo Lineup yêu cầu xử lý đồ họa cao và API xóa nền nên KHÔNG áp dụng các gói Vô Hạn / Vô Hạn Box.\n👉 Vui lòng nạp thêm lượt (bank user) để tiếp tục!`,
                threadId,
                type
            );
        }
    } catch (e) {
        console.error("[LINEUP] Lỗi khi đọc file lượt bank_user_turns:", e);
        return api.sendMessage("❌ Đã có lỗi xảy ra với hệ thống lượt, vui lòng thử lại sau.", threadId, type);
    }

    // --- BƯỚC 2: TIẾN HÀNH TẠO ẢNH VÀ GỬI ---
    try {
        const outPath = path.join(__dirname, "cache", `lineup_${Date.now()}.png`);
        fs.ensureDirSync(path.dirname(outPath));

        const buffer = await drawLineup(state);
        fs.writeFileSync(outPath, buffer);

        try {
            await api.sendMessage({ attachments: outPath }, threadId, type);
        } catch (err) {
            console.error("[LINEUP] Lỗi khi gửi ảnh:", err);
            try { fs.unlinkSync(outPath); } catch {}
            return;
        }

        // --- BƯỚC 3: TRỪ 1 LƯỢT LẺ VÀ ĐỔI BIỆT DANH THÀNH VIÊN ---
        try {
            const currentTurnsData = fs.readJsonSync(turnsFilePath, { throws: false }) || {};
            const currentUserTurns = currentTurnsData[senderID] || 0;

            if (currentUserTurns > 0) {
                const newTurns = currentUserTurns - 1;
                currentTurnsData[senderID] = newTurns;
                fs.writeJsonSync(turnsFilePath, currentTurnsData, { spaces: 2 });

                let userName = "Người dùng";
                try {
                    const info = await api.getUserInfo(senderID);
                    const profile = info?.changed_profiles?.[senderID] || info?.unchanged_profiles?.[senderID] || info?.[senderID] || null;
                    userName = profile?.displayName || profile?.zaloName || profile?.name || userName;
                } catch {}
                const newNickname = `${userName} | ${newTurns} lượt`;

                try {
                    await api.changeNickname(newNickname, threadId, senderID);
                } catch (nickErr) {
                    console.log(`[LINEUP] Không thể đổi biệt danh cho ${senderID}:`, nickErr?.message);
                }
            }
        } catch (e) {
            console.error("[LINEUP] Lỗi khi trừ lượt hoặc đổi biệt danh:", e);
        }

        try { fs.unlinkSync(outPath); } catch {}
    } catch (e) {
        api.sendMessage("❌ Lỗi khi dựng ảnh lineup: " + (e?.message || e), threadId, type);
    } finally {
        delete cache[senderID];
    }
}

const __legacyRun = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderID = data.uidFrom;

  try {
      const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
      const threadLimit = limitData[threadId];
      if (threadLimit && threadLimit.game === false) {
          return api.sendMessage("❎ Thánh Địa Của Bạn Không Được Phép Dùng Thuật Chú Trong 'Game'", threadId, type);
      }
  } catch (e) {
      console.log("Lỗi khi đọc file limit.json trong lệnh lineup:", e);
  }

  if (!fs.existsSync(LAYOUT_ROOT)) {
    return api.sendMessage("⚠️ Thư mục `data/FREEFIRE/Lineup` không tồn tại. Vui lòng tạo thư mục và thêm layout.", threadId, type);
  }

  const layouts = fs.readdirSync(LAYOUT_ROOT).filter(f =>
    fs.statSync(path.join(LAYOUT_ROOT, f)).isDirectory()
  );

  if (layouts.length === 0) {
    return api.sendMessage("⚠️ Không có layout nào trong thư mục `Lineup`.", threadId, type);
  }

  let msg = "🤖 HHANN STUDIO LINEUP BOT 🤖\n\nChọn Layout LineUp Bạn Muốn\n━━━━━━━━━━━━━━━━━━━━\n";
  layouts.forEach((name, i) => {
    msg += `${i + 1}. ${name}\n`;
  });
  msg += "━━━━━━━━━━━━━━━━━━━━\n\nReply tin nhắn này bằng số thứ tự để chọn layout.";

  cache[senderID] = { step: "layout" };

  const info = await api.sendMessage(msg, threadId, type);
  const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
  if (replyMsgId) {
    global.client.handleReply.set(replyMsgId, {
      name: REPLY_NAME,
      author: senderID,
      type: "layout",
      layouts,
    });
  }
};

const __legacyOnReply = async function (params) {
  const api = params?.api;
  const event = params?.event || {};
  const { threadId, type, data } = event;

  const quoteMsgId = String(
    event?.data?.quote?.globalMsgId ||
    event?.data?.quote?.cliMsgId ||
    event?.data?.quote?.msgId ||
    ""
  );

  if (!quoteMsgId || !global.client.handleReply.has(quoteMsgId)) return;

  const handleReply = global.client.handleReply.get(quoteMsgId);
  if (handleReply.name !== REPLY_NAME) return;

  const senderID = data?.uidFrom;
  const messageID = data?.msgId || data?.cliMsgId;
  const body = String(data?.content ?? "");

  try {
      const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
      const threadLimit = limitData[threadId];
      if (threadLimit && threadLimit.game === false) return;
  } catch (e) { /* Lỗi thì bỏ qua */ }

  if (senderID !== handleReply.author) return;

  const state = cache[senderID];
  if (!state) return;

  const sendStep = async (msg, stepType, extra = {}) => {
    const sentInfo = await api.sendMessage(msg, threadId, type);
    const newReplyMsgId = String(sentInfo?.message?.msgId || sentInfo?.message?.cliMsgId || sentInfo?.msgId || sentInfo?.cliMsgId || "");
    if (newReplyMsgId) {
      global.client.handleReply.set(newReplyMsgId, {
        name: REPLY_NAME,
        author: senderID,
        type: stepType,
        ...extra,
      });
    }
  };

  try {
    switch (handleReply.type) {
      case "layout": {
        const idx = parseInt(body.trim(), 10) - 1;
        const layoutName = handleReply.layouts[idx];
        if (!layoutName) return api.sendMessage("❌ Lựa chọn không hợp lệ. Vui lòng reply lại bằng một số.", threadId, type);

        state.layoutName = layoutName;
        const layoutPath = path.join(LAYOUT_ROOT, layoutName);

        const nums = ["4", "5", "6"];
        const available = nums.filter(n => {
          const hasBg = [".png", ".jpg", ".jpeg"].some(ext =>
            fs.existsSync(path.join(layoutPath, `${n}${ext}`)) ||
            fs.existsSync(path.join(layoutPath, `nhanvat-${n}${ext}`))
          );
          const hasCfg = fs.existsSync(path.join(layoutPath, `layout-${n}.json`));
          return hasBg && hasCfg;
        });

        if (available.length === 0) {
          return api.sendMessage("❌ Layout này không có file background và/hoặc file cấu hình phù hợp (ví dụ: `5.png` và `layout-5.json`).", threadId, type);
        }

        let msg = "🔹 Vui lòng chọn số lượng thành viên:\n\n";
        available.forEach(n => { msg += `→ ${n} thành viên\n`; });
        msg += "\nReply tin nhắn này bằng số lượng bạn muốn.";

        await sendStep(msg, "num", { available });
        break;
      }

      case "num": {
        const choice = body.trim();
        if (!handleReply.available.includes(choice)) {
          return api.sendMessage("❌ Số lượng thành viên không hợp lệ cho layout này.", threadId, type);
        }
        state.num = choice;
        await sendStep("🔹 Vui lòng nhập tên giải đấu:", "tengiai");
        break;
      }

      case "tengiai": {
        state.tengiai = body.trim();
        await sendStep("🔹 Vui lòng nhập tên đội của bạn:", "tenteam");
        break;
      }

      case "tenteam": {
        state.team = body.trim();
        await sendStep("📷 Bạn có muốn thêm logo cho đội không? (Reply `có` hoặc `không`)", "askLogo");
        break;
      }

      case "askLogo": {
        const ans = body.toLowerCase().trim();
        if (ans === "có") {
          await sendStep("📷 Vui lòng reply tin nhắn này bằng ảnh logo của đội.", "logo");
        } else {
          state.logo = null;
          await sendStep("📷 Bạn có muốn thêm avatar cho các thành viên không? (Reply `có` hoặc `không`)", "askAvatar");
        }
        break;
      }

      case "logo": {
        const imageUrl = extractImageUrlFromEvent(event);
        if (!imageUrl) {
          return api.sendMessage("❌ Vui lòng reply bằng 1 ảnh logo.", threadId, type);
        }
        state.logo = imageUrl;
        await sendStep("📷 Bạn có muốn thêm avatar cho các thành viên không? (Reply `có` hoặc `không`)", "askAvatar");
        break;
      }

      case "askAvatar": {
        const ans = body.toLowerCase().trim();
        state.useAvatar = (ans === "có");
        state.players = [];
        await sendStep(`🔹 Vui lòng nhập tên của thành viên 1:`, "player", { idx: 1 });
        break;
      }

      case "player": {
        const idx = handleReply.idx;
        const name = body.trim();

        if (!name) {
          return api.sendMessage("❌ Tên thành viên không được để trống. Vui lòng nhập lại.", threadId, type);
        }

        state.players.push({ name, pos: null, avatar: null });

        if (state.useAvatar) {
          await sendStep(`📷 Vui lòng reply ảnh avatar cho '${name}' hoặc nhập "không" để bỏ qua.`, "playerAvatar", { idx });
        } else {
          if (idx < parseInt(state.num, 10)) {
            await sendStep(`🔹 Vui lòng nhập tên của thành viên ${idx + 1}:`, "player", { idx: idx + 1 });
          } else {
            await generateAndSendImage(api, event, state);
          }
        }
        break;
      }

      case "playerAvatar": {
        const idx = handleReply.idx;
        const sayNo = body.toLowerCase().trim() === "không";
        const imageUrl = extractImageUrlFromEvent(event);

        if (!sayNo && imageUrl) {
          state.players[idx - 1].avatar = imageUrl;
        }

        if (idx < parseInt(state.num, 10)) {
          await sendStep(`🔹 Vui lòng nhập tên của thành viên ${idx + 1}:`, "player", { idx: idx + 1 });
        } else {
            await generateAndSendImage(api, event, state);
        }
        break;
      }
    }
  } catch (err) {
    console.error(err);
    api.sendMessage("❌ Đã xảy ra lỗi trong quá trình xử lý: " + (err?.message || err), threadId, type);
    delete cache[senderID];
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
