/**
 * [PORT TỪ NKNP] hs.js
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

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");

const DATA_ROOT = path.join(__dirname, "datateam");
const limitPath = path.join(__dirname, '..', 'commands', 'cache', 'limit.json');
const REPLY_NAME = "hs";

// ============================================================
// 🆕 FIX (Zalo): Map toàn cục lưu state "đang chờ reply" theo msgId,
// thay cho global.client.handleReply.push(...) kiểu mảng (FCA/Facebook).
// ============================================================
global.client = global.client || {};
global.client.handleReply = global.client.handleReply instanceof Map
  ? global.client.handleReply
  : new Map();

// ============================================================
// CODE TÁCH NỀN (dùng cho lệnh adds)
// ============================================================
const REMOVEBG_API_KEYS = [
    'MRhAgWnTQEzyHp7VxNNWnns3',
    '', '', '', '', ''
];

async function removeBackground(imageUrl) {
    if (!REMOVEBG_API_KEYS || REMOVEBG_API_KEYS.length === 0 || !REMOVEBG_API_KEYS[0]) {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            return { buffer: response.data, success: false };
        } catch (e) {
            return { buffer: null, success: false };
        }
    }
    for (const key of REMOVEBG_API_KEYS) {
        if (!key) continue;
        try {
            const response = await axios.post(
                'https://api.remove.bg/v1.0/removebg',
                { image_url: imageUrl, size: 'auto' },
                { headers: { 'X-Api-Key': key }, responseType: 'arraybuffer' }
            );
            return { buffer: Buffer.from(response.data, 'binary'), success: true };
        } catch (error) {
            if (error.response && (error.response.status === 402 || error.response.status === 429)) {
                console.warn(`[BG] Key hết quota: ...${key.slice(-4)}`);
            }
        }
    }
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return { buffer: response.data, success: false };
    } catch (e) {
        return { buffer: null, success: false };
    }
}

// ============================================================
// HÀM DÙNG CHUNG
// ============================================================
async function fetchImageBuffer(url) {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(res.data);
}

function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
        ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
        : { r: 255, g: 255, b: 255 };
}

function getRainbowColor(t) {
    const colors = ["#FF0000","#FF7700","#FFFF00","#00FF00","#00FFFF","#0000FF","#FF00FF","#FF0000"];
    const scaled = t * (colors.length - 1);
    const idx = Math.floor(scaled);
    const frac = scaled - idx;
    const c1 = hexToRgb(colors[idx]);
    const c2 = hexToRgb(colors[Math.min(idx + 1, colors.length - 1)]);
    return {
        r: Math.round(c1.r + (c2.r - c1.r) * frac),
        g: Math.round(c1.g + (c2.g - c1.g) * frac),
        b: Math.round(c1.b + (c2.b - c1.b) * frac)
    };
}

function drawStar(ctx, cx, cy, points, outerR, innerR, color) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function drawFlag(ctx, x, y, w, h) {
    ctx.fillStyle = "#DA251D";
    ctx.fillRect(x, y, w, h);
    const outer = h * 0.38;
    drawStar(ctx, x + w / 2, y + h / 2, 5, outer, outer * 0.4, "#FFFF00");
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
}

// ============================================================
// ADDVIEN: Viền Rainbow VUÔNG + Cờ VN góc trên phải sát mép
// ============================================================
async function applyRainbowBorderAndFlag(sourceBuffer) {
    const SIZE   = 512;
    const BORDER = 26;
    const FLAG_W = 112;
    const FLAG_H = Math.round(FLAG_W * 2 / 3);

    const canvas = createCanvas(SIZE, SIZE);
    const ctx    = canvas.getContext("2d");

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, SIZE, SIZE);

    const STEPS = SIZE * 4;
    for (let i = 0; i < STEPS; i++) {
        const { r, g, b } = getRainbowColor(i / STEPS);
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth   = BORDER;
        const seg = SIZE;
        let x1, y1, x2, y2;
        if (i < seg) {
            x1 = i;           y1 = 0;    x2 = i + 1;       y2 = 0;
        } else if (i < seg * 2) {
            const s = i - seg;
            x1 = SIZE;        y1 = s;    x2 = SIZE;         y2 = s + 1;
        } else if (i < seg * 3) {
            const s = i - seg * 2;
            x1 = SIZE - s;    y1 = SIZE; x2 = SIZE - s - 1; y2 = SIZE;
        } else {
            const s = i - seg * 3;
            x1 = 0;           y1 = SIZE - s; x2 = 0; y2 = SIZE - s - 1;
        }
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    const inner   = BORDER;
    const imgSize = SIZE - inner * 2;
    const srcImg  = await loadImage(sourceBuffer);
    ctx.drawImage(srcImg, inner, inner, imgSize, imgSize);

    // Cờ VN góc trên phải sát mép
    ctx.save();
    ctx.beginPath();
    ctx.rect(SIZE - FLAG_W, 0, FLAG_W, FLAG_H);
    ctx.clip();
    drawFlag(ctx, SIZE - FLAG_W, 0, FLAG_W, FLAG_H);
    ctx.restore();

    return canvas.toBuffer("image/png");
}

// ============================================================
// ADDTRON: Logo TRÒN + viền trắng (KHÔNG có Cờ VN)
// ============================================================
async function applyCircleLogo(sourceBuffer) {
    const SIZE   = 512;
    const BORDER = 10;

    const canvas = createCanvas(SIZE, SIZE);
    const ctx    = canvas.getContext("2d");

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, SIZE, SIZE);

    const cx     = SIZE / 2;
    const cy     = SIZE / 2;
    const radius = SIZE / 2 - BORDER;

    ctx.beginPath();
    ctx.arc(cx, cy, radius + BORDER, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const srcImg = await loadImage(sourceBuffer);
    ctx.drawImage(srcImg, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    // KHÔNG vẽ cờ VN

    return canvas.toBuffer("image/png");
}

// ============================================================
// HÀM TIỆN ÍCH
// ============================================================
function getUserDir(uid)  { return path.join(DATA_ROOT, uid.toString()); }
function getDataFile(uid) { return path.join(getUserDir(uid), "datateam.json"); }

function readData(uid) {
    const file = getDataFile(uid);
    if (!fs.existsSync(file)) return {};
    try { return fs.readJsonSync(file); } catch { return {}; }
}

function writeData(uid, data) {
    fs.writeJsonSync(getDataFile(uid), data, { spaces: 2 });
}

function maskID(id) { return id.slice(0, -2) + "**"; }

function removeVietnameseAccent(str) {
    if (!str) return "team";
    return str.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .replace(/[^a-zA-Z0-9\s_-]/g, "")
        .trim().replace(/\s+/g, "_");
}

/**
 * 🆕 FIX (Zalo): thay cho "event.messageReply.attachments" (Facebook Messenger
 * cho phép nhiều ảnh đính kèm 1 tin nhắn, map theo index). Zalo (zca-js) thường
 * chỉ mang 1 ảnh mỗi tin nhắn quote/gửi trực tiếp, nên hàm này trả về TỐI ĐA
 * 1 url ảnh — lấy từ quote (reply lại ảnh có sẵn) hoặc từ tin nhắn gửi kèm trực
 * tiếp (content). Logic parse giống extractImageUrlFromEvent trong key.js.
 */
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
    } catch (_) {}
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

// ============================================================
// HÀM XỬ LÝ CHUNG CHO TEAM (addtron / addvien)
// 🔧 FIX (Zalo): "attachments" giờ là mảng 0-1 phần tử { url } (thay vì mảng
// nhiều ảnh của Facebook Messenger) — chỉ team đầu tiên (i === 0) có thể nhận logo.
// ============================================================
async function processTeam({ input, attachments, data, userDir, processFn, logoLabel }) {
    const updates = [];
    for (let i = 0; i < input.length; i++) {
        const parts = input[i].split(",").map(p => p.trim()).filter(Boolean);
        let teamName = "";
        let memberIDs = [];
        parts.forEach(p => {
            if (/^\d{8,20}$/.test(p)) memberIDs.push(maskID(p));
            else if (!teamName) teamName = p.toUpperCase();
        });

        if (!teamName) { updates.push("⚠️ Không xác định được tên team: " + input[i]); continue; }
        if (memberIDs.length > 8) { updates.push(`⚠️ Team ${teamName}: Tối đa 8 ID!`); continue; }

        let logoPath = null;
        let logoStatus = "Không";

        if (attachments[i]?.url) {
            try {
                const cleanName = removeVietnameseAccent(teamName);
                const dest = path.join(userDir, `${Date.now()}_${cleanName}_${logoLabel}.png`);
                const srcBuffer = await fetchImageBuffer(attachments[i].url);
                const resultBuffer = await processFn(srcBuffer);
                fs.writeFileSync(dest, resultBuffer);
                logoPath = dest;
                logoStatus = logoLabel === "tron"
                    ? "Có (logo tròn ⭕ ✅)"
                    : "Có (viền Rainbow 🌈 + Cờ VN 🇻🇳 ✅)";
            } catch (err) {
                console.error(`[${logoLabel.toUpperCase()}] Lỗi canvas:`, err);
                logoStatus = "Lỗi xử lý ảnh";
            }
        }

        if (!data[teamName]) {
            data[teamName] = [{ accountID: memberIDs, logo: logoPath }];
            updates.push(
                `✅ Đã Tạo Thành Công\n⭐ Team: ${teamName}\n📋 ID: ${memberIDs.join(", ")}\n🖼 Logo: ${logoStatus}`
            );
        } else {
            const team = data[teamName][0];
            team.accountID = Array.from(new Set([...team.accountID, ...memberIDs]));
            let updateLogoStatus = "Giữ nguyên";
            if (logoPath) {
                if (team.logo && fs.existsSync(team.logo)) fs.unlinkSync(team.logo);
                team.logo = logoPath;
                updateLogoStatus = logoStatus;
            }
            data[teamName][0] = team;
            updates.push(
                `♻️ Đã Cập Nhật\n⭐ Team: ${teamName}\n📋 ID mới: ${memberIDs.length ? memberIDs.join(", ") : "Không thêm"}\n🖼 Logo: ${updateLogoStatus}\n👤 Tổng: ${team.accountID.length} thành viên`
            );
        }
    }
    return updates;
}

// ============================================================
// CONFIG (chuẩn Zalo — role/author/category thay cho hasPermssion/credits/commandCategory)
// ============================================================


// ============================================================
// RUN
// 🔧 FIX (Zalo): event.threadId/type/data.uidFrom thay cho
// event.threadID/messageID/senderID; messageReply -> extractImageUrlFromEvent
// ============================================================


// ============================================================
// 🔧 FIX (Zalo): module.exports.onReply thay cho module.exports.handleReply
// - Core Zalo tự gọi khi phát hiện 1 tin nhắn là quote/reply.
// - Đối chiếu quoteMsgId (event.data.quote.globalMsgId / cliMsgId) với
//   global.client.handleReply (Map) thay vì handleReply.messageID do core FCA
//   tự tra cứu sẵn.
// ============================================================

const __legacyConfig = {
    name: "hs",
    version: "5.0.0-zalo",
    role: 0,
    author: "Dev by LEGI STUDIO - ZanHau | Chuyển sang logic Zalo (bỏ logic Facebook Messenger/GoatBot)",
    description: [
        "Quản lý hồ sơ team.",
        "• hs add [Tên], [ID]     → Thêm team, không xóa nền logo",
        "• hs adds [Tên], [ID]    → Thêm team, có xóa nền logo",
        "• hs addtron [Tên], [ID] → Thêm team + logo tròn",
        "• hs addvien [Tên], [ID] → Thêm team + viền Rainbow & Cờ VN",
        "• hs list                → Danh sách team",
        "• hs info [Tên]          → Xem thông tin team",
        "• hs remove [Tên]        → Xóa team",
        "• hs clear               → Xóa tất cả"
    ].join("\n"),
    category: "game",
    usage: "[add|adds|addtron|addvien|list|info|remove|clear]",
    cooldowns: 5
};
const __legacyRun = async function ({ api, event, args }) {
    const { threadId, type, data } = event;
    const senderID = data?.uidFrom;

    // Kiểm tra giới hạn thread
    try {
        const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
        if (limitData[threadId]?.game === false) {
            return api.sendMessage({ msg: "❎ Thánh Địa Của Bạn Không Được Phép Dùng Thuật Chú Trong 'Game'" }, threadId, type);
        }
    } catch (e) {}

    // Hiển thị hướng dẫn khi không có args
    if (!args[0]) {
        return api.sendMessage(
            {
                msg:
                    "📋 QUẢN LÝ HỒ SƠ TEAM\n" +
                    "━━━━━━━━━━━━━━━━━━━━\n" +
                    "🖼 Lệnh thêm team:\n" +
                    "• hs add [Tên], [ID]      → Thêm + không xóa nền logo\n" +
                    "• hs adds [Tên], [ID]     → Thêm + xóa nền logo ✂️\n" +
                    "• hs addtron [Tên], [ID]  → Thêm + logo tròn ⭕\n" +
                    "• hs addvien [Tên], [ID]  → Thêm + viền Rainbow 🌈 & Cờ VN 🇻🇳\n" +
                    "━━━━━━━━━━━━━━━━━━━━\n" +
                    "📌 Lệnh khác:\n" +
                    "• hs list                 → Danh sách team\n" +
                    "• hs info [Tên]           → Xem thông tin team\n" +
                    "• hs remove [Tên]         → Xóa team\n" +
                    "• hs clear                → Xóa tất cả\n" +
                    "━━━━━━━━━━━━━━━━━━━━\n" +
                    "💡 Gửi/quote ảnh kèm lệnh để thêm logo cho team!"
            },
            threadId, type
        );
    }

    const uid      = senderID;
    const userDir  = getUserDir(uid);
    const dataFile = getDataFile(uid);
    if (!fs.existsSync(userDir)) fs.mkdirpSync(userDir);
    if (!fs.existsSync(dataFile)) writeData(uid, {});
    let dataStore = readData(uid);

    const cmd = args[0].toLowerCase();

    // 🔧 FIX (Zalo): 1 url ảnh duy nhất thay cho mảng nhiều attachment của Messenger
    const singleImageUrl = extractImageUrlFromEvent(event);

    // ==================== ADD (ảnh gốc, KHÔNG tách nền) ====================
    if (["add", "them", "tao"].includes(cmd)) {
        const input = args.slice(1).join(" ").split("\n").map(i => i.trim()).filter(Boolean);
        if (!input[0]) return api.sendMessage(
            { msg: "📌 Cách dùng: hs add [Tên team], [ID1], [ID2]\nQuote/gửi ảnh kèm lệnh → lưu ảnh gốc (không xóa nền)" },
            threadId, type
        );

        const attachments = singleImageUrl ? [{ url: singleImageUrl }] : [];

        const updates = [];
        for (let i = 0; i < input.length; i++) {
            const parts = input[i].split(",").map(p => p.trim()).filter(Boolean);
            let teamName = "";
            let memberIDs = [];
            parts.forEach(p => {
                if (/^\d{8,20}$/.test(p)) memberIDs.push(maskID(p));
                else if (!teamName) teamName = p.toUpperCase();
            });

            if (!teamName) { updates.push("⚠️ Không xác định được tên team: " + input[i]); continue; }
            if (memberIDs.length > 8) { updates.push(`⚠️ Team ${teamName}: Tối đa 8 ID!`); continue; }

            let logoPath = null;
            let logoStatus = "Không";

            if (attachments[i]?.url) {
                try {
                    const dest = path.join(userDir, `${Date.now()}_${removeVietnameseAccent(teamName)}.png`);
                    const buffer = await fetchImageBuffer(attachments[i].url);
                    fs.writeFileSync(dest, buffer);
                    logoPath = dest;
                    logoStatus = "Có (ảnh gốc 🖼)";
                } catch (err) {
                    logoStatus = "Lỗi tải ảnh";
                }
            }

            if (!dataStore[teamName]) {
                dataStore[teamName] = [{ accountID: memberIDs, logo: logoPath }];
                updates.push(`✅ Đã Tạo Thành Công\n⭐ Team: ${teamName}\n📋 ID: ${memberIDs.join(", ")}\n🖼 Logo: ${logoStatus}`);
            } else {
                const team = dataStore[teamName][0];
                team.accountID = Array.from(new Set([...team.accountID, ...memberIDs]));
                let updateLogoStatus = "Giữ nguyên";
                if (logoPath) {
                    if (team.logo && fs.existsSync(team.logo)) fs.unlinkSync(team.logo);
                    team.logo = logoPath;
                    updateLogoStatus = logoStatus;
                }
                dataStore[teamName][0] = team;
                updates.push(`♻️ Đã Cập Nhật\n⭐ Team: ${teamName}\n📋 ID mới: ${memberIDs.length ? memberIDs.join(", ") : "Không thêm"}\n🖼 Logo: ${updateLogoStatus}\n👤 Tổng: ${team.accountID.length} thành viên`);
            }
        }

        writeData(uid, dataStore);
        return api.sendMessage({ msg: updates.join("\n\n") }, threadId, type);
    }

    // ==================== ADDS (tách nền) ====================
    if (["adds", "thems", "taos"].includes(cmd)) {
        const input = args.slice(1).join(" ").split("\n").map(i => i.trim()).filter(Boolean);
        if (!input[0]) return api.sendMessage(
            { msg: "📌 Cách dùng: hs adds [Tên team], [ID1], [ID2]\nQuote/gửi ảnh kèm lệnh → tách nền ảnh tự động ✂️" },
            threadId, type
        );

        const attachments = singleImageUrl ? [{ url: singleImageUrl }] : [];
        if (attachments.length > 0) api.sendMessage({ msg: "⏳ Đang tách nền ảnh..." }, threadId, type);

        const updates = [];
        for (let i = 0; i < input.length; i++) {
            const parts = input[i].split(",").map(p => p.trim()).filter(Boolean);
            let teamName = "";
            let memberIDs = [];
            parts.forEach(p => {
                if (/^\d{8,20}$/.test(p)) memberIDs.push(maskID(p));
                else if (!teamName) teamName = p.toUpperCase();
            });

            if (!teamName) { updates.push("⚠️ Không xác định được tên team: " + input[i]); continue; }
            if (memberIDs.length > 8) { updates.push(`⚠️ Team ${teamName}: Tối đa 8 ID!`); continue; }

            let logoPath = null;
            let logoStatus = "Không";

            if (attachments[i]?.url) {
                const dest = path.join(userDir, `${Date.now()}_${removeVietnameseAccent(teamName)}.png`);
                const { buffer, success } = await removeBackground(attachments[i].url);
                if (buffer) {
                    fs.writeFileSync(dest, buffer);
                    logoPath = dest;
                    logoStatus = success ? "Có (đã tách nền ✂️)" : "Có (ảnh gốc 🖼)";
                } else {
                    logoStatus = "Lỗi tải ảnh";
                }
            }

            if (!dataStore[teamName]) {
                dataStore[teamName] = [{ accountID: memberIDs, logo: logoPath }];
                updates.push(`✅ Đã Tạo Thành Công\n⭐ Team: ${teamName}\n📋 ID: ${memberIDs.join(", ")}\n🖼 Logo: ${logoStatus}`);
            } else {
                const team = dataStore[teamName][0];
                team.accountID = Array.from(new Set([...team.accountID, ...memberIDs]));
                let updateLogoStatus = "Giữ nguyên";
                if (logoPath) {
                    if (team.logo && fs.existsSync(team.logo)) fs.unlinkSync(team.logo);
                    team.logo = logoPath;
                    updateLogoStatus = logoStatus.replace("Có", "Đã cập nhật");
                }
                dataStore[teamName][0] = team;
                updates.push(`♻️ Đã Cập Nhật\n⭐ Team: ${teamName}\n📋 ID mới: ${memberIDs.length ? memberIDs.join(", ") : "Không thêm"}\n🖼 Logo: ${updateLogoStatus}\n👤 Tổng: ${team.accountID.length} thành viên`);
            }
        }

        writeData(uid, dataStore);
        return api.sendMessage({ msg: updates.join("\n\n") }, threadId, type);
    }

    // ==================== ADDTRON (logo tròn, KHÔNG có Cờ VN) ====================
    if (["addtron", "themtron"].includes(cmd)) {
        const input = args.slice(1).join(" ").split("\n").map(i => i.trim()).filter(Boolean);
        if (!input[0]) {
            return api.sendMessage(
                { msg: "📌 Cách dùng: hs addtron [Tên team], [ID1], [ID2]\nQuote/gửi ảnh kèm lệnh → logo hình tròn ⭕" },
                threadId, type
            );
        }
        const attachments = singleImageUrl ? [{ url: singleImageUrl }] : [];
        if (attachments.length > 0) api.sendMessage({ msg: "⏳ Đang xử lý logo tròn ⭕..." }, threadId, type);

        const updates = await processTeam({
            input, attachments, data: dataStore, userDir,
            processFn: applyCircleLogo,
            logoLabel: "tron"
        });
        writeData(uid, dataStore);
        return api.sendMessage({ msg: updates.join("\n\n") }, threadId, type);
    }

    // ==================== ADDVIEN (viền Rainbow + Cờ VN) ====================
    if (["addvien", "themvien"].includes(cmd)) {
        const input = args.slice(1).join(" ").split("\n").map(i => i.trim()).filter(Boolean);
        if (!input[0]) {
            return api.sendMessage(
                { msg: "📌 Cách dùng: hs addvien [Tên team], [ID1], [ID2]\nQuote/gửi ảnh kèm lệnh → viền Rainbow 🌈 + Cờ VN 🇻🇳 góc trên phải" },
                threadId, type
            );
        }
        const attachments = singleImageUrl ? [{ url: singleImageUrl }] : [];
        if (attachments.length > 0) api.sendMessage({ msg: "⏳ Đang xử lý viền Rainbow + Cờ VN 🇻🇳..." }, threadId, type);

        const updates = await processTeam({
            input, attachments, data: dataStore, userDir,
            processFn: applyRainbowBorderAndFlag,
            logoLabel: "vien"
        });
        writeData(uid, dataStore);
        return api.sendMessage({ msg: updates.join("\n\n") }, threadId, type);
    }

    // ==================== REMOVE ====================
    if (["remove", "rm", "delete", "del", "xoa"].includes(cmd)) {
        const teamName = args.slice(1).join(" ").toUpperCase();
        if (!teamName) return api.sendMessage({ msg: "Vui lòng nhập tên team cần xóa." }, threadId, type);
        if (!dataStore[teamName]) return api.sendMessage({ msg: `⚠️ Không tìm thấy team ${teamName}` }, threadId, type);
        if (dataStore[teamName][0].logo && fs.existsSync(dataStore[teamName][0].logo)) fs.unlinkSync(dataStore[teamName][0].logo);
        delete dataStore[teamName];
        writeData(uid, dataStore);
        return api.sendMessage({ msg: `🗑️ Đã xóa team ${teamName}` }, threadId, type);
    }

    // ==================== LIST ====================
    // 🔧 FIX (Zalo): thay handleReply.push(...) (mảng, FCA) bằng
    // global.client.handleReply.set(msgId, {...}) (Map), core Zalo sẽ tự
    // gọi module.exports.onReply khi phát hiện quote đúng msgId này.
    if (["list", "danhsach"].includes(cmd)) {
        const keys = Object.keys(dataStore);
        if (keys.length === 0) return api.sendMessage({ msg: "📌 Hiện không có team nào." }, threadId, type);

        const pageSize  = 15;
        let page        = parseInt(args[1]) || 1;
        const totalPage = Math.ceil(keys.length / pageSize);
        if (page < 1) page = 1;
        if (page > totalPage) page = totalPage;

        const start    = (page - 1) * pageSize;
        const showKeys = keys.slice(start, start + pageSize);

        let msg = `📋 Danh sách team (Trang ${page}/${totalPage}):\n`;
        showKeys.forEach((team, idx) => {
            msg += `${start + idx + 1}. ${team} — ${dataStore[team][0].accountID.join(", ")}\n`;
        });
        msg += "\nReply số thứ tự để xem info | del + stt để xóa | page [số] để chuyển trang.";

        const info = await api.sendMessage({ msg }, threadId, type);
        const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId);
        global.client.handleReply.set(replyMsgId, {
            name: REPLY_NAME,
            author: senderID,
            type: "list",
            data: keys,
            page, pageSize, totalPage
        });
        setTimeout(() => global.client.handleReply.delete(replyMsgId), 10 * 60 * 1000);
        return;
    }

    // ==================== INFO ====================
    if (["info", "thongtin"].includes(cmd)) {
        const teamName = args.slice(1).join(" ").toUpperCase();
        if (!teamName) return api.sendMessage({ msg: "Vui lòng nhập tên team." }, threadId, type);
        if (!dataStore[teamName]) return api.sendMessage({ msg: `⚠️ Không tìm thấy team ${teamName}` }, threadId, type);

        const team = dataStore[teamName][0];
        const msg  = `📌 Thông tin team ${teamName}\n👥 Số thành viên: ${team.accountID.length}\n🆔 ID: ${team.accountID.join(", ")}`;

        if (team.logo && fs.existsSync(team.logo)) {
            return api.sendMessage({ msg, attachments: [team.logo] }, threadId, type);
        }
        return api.sendMessage({ msg: msg + "\n🖼 Logo: Không có" }, threadId, type);
    }

    // ==================== CLEAR ====================
    if (["clear", "xoaall"].includes(cmd)) {
        fs.removeSync(userDir);
        return api.sendMessage({ msg: "🗑️ Đã xóa toàn bộ dữ liệu team của bạn!" }, threadId, type);
    }

    return api.sendMessage(
        { msg: "⚠️ Lệnh không hợp lệ!\n📌 Dùng: add | adds | addtron | addvien | list | info | remove | clear" },
        threadId, type
    );
};
const __legacyOnReply = async function (params) {
    const api = params?.api;
    const event = params?.event || {};
    const { threadId, type, data } = event;

    const quoteMsgId = String(
        params?.quoteMsgId ||
        event?.data?.quote?.globalMsgId ||
        event?.data?.quote?.cliMsgId ||
        ""
    );

    try {
        if (!api || typeof api.sendMessage !== "function") {
            console.error("❌ [hs] onReply: thiếu 'api' hoặc api.sendMessage không tồn tại.");
            return;
        }
        if (!quoteMsgId || !global.client.handleReply.has(quoteMsgId)) return;

        const handleReply = global.client.handleReply.get(quoteMsgId);
        if (handleReply.name !== REPLY_NAME || handleReply.type !== "list") return;

        const senderID = data?.uidFrom;
        if (senderID !== handleReply.author) return;

        try {
            const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
            if (limitData[threadId]?.game === false) return;
        } catch (e) {}

        const uid = senderID;
        let dataStore = readData(uid);
        const rawContent = String(data?.content || "").trim().toLowerCase();
        const pageSize = handleReply.pageSize || 15;

        // Chuyển trang
        if (rawContent.startsWith("page")) {
            let page = parseInt(rawContent.replace("page", "").trim());
            if (isNaN(page) || page < 1 || page > handleReply.totalPage) {
                return api.sendMessage({ msg: `⚠️ Trang không hợp lệ! Có ${handleReply.totalPage} trang.` }, threadId, type);
            }
            const start    = (page - 1) * pageSize;
            const showKeys = handleReply.data.slice(start, start + pageSize);
            let msg = `📋 Danh sách team (Trang ${page}/${handleReply.totalPage}):\n`;
            showKeys.forEach((team, idx) => {
                msg += `${start + idx + 1}. ${team} — ${dataStore[team][0].accountID.join(", ")}\n`;
            });
            msg += "\nReply số thứ tự để xem info | del + stt để xóa | page [số] để chuyển trang.";

            global.client.handleReply.delete(quoteMsgId);
            const info = await api.sendMessage({ msg }, threadId, type);
            const newReplyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId);
            global.client.handleReply.set(newReplyMsgId, { ...handleReply, page });
            setTimeout(() => global.client.handleReply.delete(newReplyMsgId), 10 * 60 * 1000);
            return;
        }

        // Xóa theo STT
        if (rawContent.startsWith("del")) {
            const indices = rawContent.replace("del", "").split(",").map(i => parseInt(i.trim())).filter(i => !isNaN(i));
            const deleted = [], invalid = [];
            for (const i of indices) {
                const idx = i - 1;
                if (idx >= 0 && idx < handleReply.data.length) {
                    const teamName = handleReply.data[idx];
                    if (dataStore[teamName]) {
                        if (dataStore[teamName][0].logo && fs.existsSync(dataStore[teamName][0].logo))
                            fs.unlinkSync(dataStore[teamName][0].logo);
                        delete dataStore[teamName];
                        deleted.push(teamName);
                    } else invalid.push(i);
                } else invalid.push(i);
            }
            writeData(uid, dataStore);
            let msg = "";
            if (deleted.length) msg += "🗑️ Đã xóa: " + deleted.join(", ");
            if (invalid.length) msg += "\n⚠️ Không hợp lệ: " + invalid.join(", ");
            global.client.handleReply.delete(quoteMsgId);
            return api.sendMessage({ msg }, threadId, type);
        }

        // Xem info theo STT
        const index = parseInt(rawContent) - 1;
        if (isNaN(index) || index < 0 || index >= handleReply.data.length) {
            if (/^\d+$/.test(rawContent) && parseInt(rawContent) <= handleReply.totalPage) return;
            return api.sendMessage({ msg: "⚠️ Số thứ tự không hợp lệ!" }, threadId, type);
        }

        const teamName = handleReply.data[index];
        const team     = dataStore[teamName][0];
        const msg      = `📌 Thông tin team ${teamName}\n👥 Thành viên: ${team.accountID.join(", ")}`;

        if (team.logo && fs.existsSync(team.logo)) {
            return api.sendMessage({ msg, attachments: [team.logo] }, threadId, type);
        }
        return api.sendMessage({ msg: msg + "\n🖼 Logo: Không có" }, threadId, type);
    } catch (err) {
        console.error("❌ [hs] onReply lỗi không mong muốn:", err);
        try {
            if (api && typeof api.sendMessage === "function") {
                await api.sendMessage({ msg: "❌ Lỗi xử lý reply: " + err.message }, threadId, type);
            }
        } catch (_) {}
    }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
