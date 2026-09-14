/**
 * [PORT SANG NKNP V3 / zca-mt] qrin.js (lệnh "qr")
 * Chuyển từ phong cách FCA (Facebook Messenger) sang zca-mt (Zalo), dùng
 * LegacyBridge (wrapLegacyCommand) — xem Core/LegacyBridge.js.
 *
 * Thay đổi chính: xem đầu file boxscrim.js / lineup.js đã port (cùng chuẩn):
 *   - event.threadID/messageID/senderID -> event.threadId / event.data.uidFrom
 *   - global.client.handleReply.push(...) (mảng) -> .set(msgId, {...}) (Map)
 *   - module.exports.handleReply -> onReply tự tra Map bằng quote msgId
 *   - api.sendMessage(body, threadID, cb, messageID) -> await api.sendMessage(msg, threadId, type)
 *   - attachment: fs.createReadStream(path) (FCA) -> attachments: path (zca, string/mảng path cục bộ)
 *   - api.unsendMessage(id, cb) -> await api.deleteMessage({data:{...}, threadId, type})
 *   - messageReply.attachments (FCA, khi gọi lệnh kèm reply ảnh) -> extractImageUrlFromEvent(event) (zca)
 *
 * @author HNHANN STUDIO — port zca-mt: NKNP STUDIO
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
const moment = require("moment-timezone");
const { createCanvas, loadImage, registerFont } = require("canvas");

const REPLY_NAME = "qr";

// 🆕 FIX (Zalo): Map toàn cục lưu state "đang chờ reply" theo msgId.
global.client = global.client || {};
global.client.handleReply = global.client.handleReply instanceof Map
  ? global.client.handleReply
  : new Map();

// 🔧 FIX (Zalo): trích URL ảnh từ event (ảnh gửi trực tiếp hoặc trong quote).
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

// 🔧 FIX (Zalo): xoá tin nhắn trạng thái của bot (thay api.unsendMessage(id, cb)).
async function tryDeleteOwnMessage(api, threadId, type, sentInfo) {
  if (!api || typeof api.deleteMessage !== "function" || !sentInfo) return false;
  const msgId = sentInfo?.message?.msgId || sentInfo?.msgId;
  const cliMsgId = sentInfo?.message?.cliMsgId || sentInfo?.cliMsgId;
  if (!msgId && !cliMsgId) return false;
  try {
    let ownId;
    try { ownId = typeof api.getOwnId === "function" ? api.getOwnId() : undefined; } catch {}
    await api.deleteMessage({ data: { cliMsgId, msgId, uidFrom: ownId }, threadId, type });
    return true;
  } catch (e) {
    console.error("[QR] Lỗi khi xóa tin nhắn trạng thái:", e?.message);
    return false;
  }
}

// ============================================================================
// 1. HỆ THỐNG ĐĂNG KÝ FONT
// ============================================================================
const FONT_DIR = path.join(__dirname, "fonts");
const NAME_FONT_PATH = path.join(FONT_DIR, "name-font.ttf");
const STK_FONT_PATH = path.join(FONT_DIR, "stk-font.ttf");

if (fs.existsSync(NAME_FONT_PATH)) {
    registerFont(NAME_FONT_PATH, { family: "NameX" });
}
if (fs.existsSync(STK_FONT_PATH)) {
    registerFont(STK_FONT_PATH, { family: "StkX" });
}

// Danh sách ~50 ngân hàng và ví điện tử mapping code VietQR
const bankMapping = {
    "MB": "970422", "VCB": "970436", "VIETTIN": "970415", "CTG": "970415",
    "BIDV": "970418", "TCB": "970407", "AGRI": "970405", "TPB": "970423",
    "VPB": "970432", "ACB": "970416", "STB": "970403", "VIB": "970441",
    "HDB": "970437", "SHB": "970443", "MSB": "970426", "LPB": "970449",
    "LPBANK": "970449", "ABB": "970425", "VAB": "970427", "NCB": "970419",
    "OJB": "970442", "BVB": "970440", "PGB": "970430", "VRB": "970421",
    "EXIM": "970431", "SEA": "970448", "OCB": "970448", "SCB": "970429",
    "PVB": "970412", "BAB": "970409", "SGB": "970406", "VCCB": "970454",
    "KLB": "970452", "NAMA": "970428", "UOB": "970458", "HSBC": "970447",
    "WVN": "970457", "CIMB": "422589", "KB": "970456", "BIDC": "970417",
    "SHINHAN": "970424", "IVB": "970434", "VIETTELMONEY": "971005",
    "VNPAY": "971011", "CAKE": "546034", "TIMO": "963388", "MBV": "970414"
};

const bankListMenu = [
    { code: "MB", name: "MB Bank (Ngân hàng Quân Đội)" },
    { code: "VCB", name: "Vietcombank" },
    { code: "VIETTIN", name: "VietinBank" },
    { code: "BIDV", name: "BIDV (Đầu Tư và Phát Triển)" },
    { code: "TCB", name: "Techcombank" },
    { code: "AGRI", name: "Agribank (Nông Nghiệp)" },
    { code: "TPB", name: "TPBank (Tiên Phong)" },
    { code: "VPB", name: "VPBank (Việt Nam Thịnh Vượng)" },
    { code: "ACB", name: "ACB (Á Châu)" },
    { code: "STB", name: "Sacombank" },
    { code: "VIB", name: "VIB (Quốc Tế)" },
    { code: "HDB", name: "HDBank" },
    { code: "SHB", name: "SHB" },
    { code: "MSB", name: "MSB (Hàng Hải)" },
    { code: "LPB", name: "LPBank (Bưu Điện Liên Việt)" },
    { code: "ABB", name: "ABBANK (An Bình)" },
    { code: "VAB", name: "VietBank" },
    { code: "NCB", name: "NCB (Quốc Dân)" },
    { code: "OJB", name: "OceanBank (Đại Dương)" },
    { code: "BVB", name: "BaoVietBank" },
    { code: "PGB", name: "PGBank" },
    { code: "VRB", name: "VRB (Việt - Nga)" },
    { code: "EXIM", name: "Eximbank" },
    { code: "SEA", name: "SeABank" },
    { code: "OCB", name: "OCB (Phương Đông)" },
    { code: "SCB", name: "SCB (Sài Gòn)" },
    { code: "PVB", name: "PVcomBank" },
    { code: "BAB", name: "BacABank" },
    { code: "SGB", name: "SaigonBank" },
    { code: "VCCB", name: "BVBank (Bản Việt)" },
    { code: "KLB", name: "Kienlongbank" },
    { code: "NAMA", name: "NamABank" },
    { code: "UOB", name: "UOB" },
    { code: "HSBC", name: "HSBC" },
    { code: "WVN", name: "Woori Bank" },
    { code: "CIMB", name: "CIMB" },
    { code: "KB", name: "KB Kookmin" },
    { code: "BIDC", name: "BIDC" },
    { code: "SHINHAN", name: "Shinhan Bank" },
    { code: "IVB", name: "Indovina Bank" },
    { code: "VIETTELMONEY", name: "Viettel Money" },
    { code: "VNPAY", name: "Ví VNPay" },
    { code: "CAKE", name: "Cake by VPBank" },
    { code: "TIMO", name: "Timo Digital Bank" }
];

// ============================================================================
// 2. ĐƯỜNG DẪN DỮ LIỆU
// ============================================================================
const DATA_DIR = path.join(__dirname, 'data', 'Luotdung');
const USER_TURNS_FILE = path.join(DATA_DIR, 'bank_user_turns.json');

function readJsonFile(filePath, defaultValue = {}) {
    if (!fs.existsSync(filePath)) return defaultValue;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch(e) { return defaultValue; }
}

function writeJsonFile(filePath, data) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
}

// ============================================================================
// 3. CẤU HÌNH LAYOUTS
// ============================================================================
const qrLayouts = {
    luffy: { img: "/layout/luffy1.png", qr: { x: 54, y: 245, size: 196, angle: -14 }, name: { x: 408, y: 412, size: 13, color: "#65696c", angle: 0, outline: true, outlineWidth: 5 }, stk: { x: 490, y: 459, size: 18, color: "#65696c", angle: 0, outline: true, outlineWidth: 5 } },
    luffyG5: { img: "/layout/luffy2.png", qr: { x: 54, y: 245, size: 196, angle: -14 }, name: { x: 408, y: 412, size: 13, color: "#939393", angle: 0, outline: true, outlineWidth: 5 }, stk: { x: 490, y: 459, size: 18, color: "#939393", angle: 0, outline: true, outlineWidth: 5 } },
    demon: { img: "/layout/demon.png", qr: { x: 54, y: 245, size: 196, angle: -14 }, name: { x: 408, y: 410, size: 13, color: "#4a7fa9", angle: 0, outline: true, outlineWidth: 5 }, stk: { x: 497, y: 459, size: 18, color: "#325e90", angle: 0, outline: true, outlineWidth: 5} },
    tretrau: { img: "/layout/docquyen.png", qr: { x: 50, y: 210, size: 200, angle: -10}, name: { x: 430, y: 350, size: 13, color: "#5aa529", angle: 0, outline: true, outlineWidth: 5 }, stk: { x: 430, y: 404, size: 18, color: "#5aa529", angle: 0, outline: true, outlineWidth: 5  } },
    naruto: { img: "/layout/naruto.jpg", qr: { x: 57, y: 250, size: 196, angle: -14 }, name: { x: 510, y: 422, size: 13, color: "#ffffff", angle: 8, outline: false }, stk: { x: 516, y: 397, size: 18, color: "#fe8201", angle: 8, outline: false } },
    nasuke: { img: "/layout/nasuke.png", qr: { x: 97, y: 215, size: 200, angle: -14 }, name: { x: 457, y: 369, size: 13, color: "#FFFFFF", angle: 0, outline: false }, stk: { x: 496, y: 414, size: 18, color: "#FFFFFF", angle: 4, outline: false } },
    nagi: { img: "/layout/nagi.png", qr: { x: 432, y: 175, size: 175, angle: 8 }, name: { x: 320, y: 270, size: 13, color: "#ffffff", angle: 8, outline: false }, stk: { x: 322, y: 243, size: 18, color: "#09fac6", angle: 8, outline: false } },
    tatsumaki: { img: "/layout/tatsumaki.jpg", qr: { x: 440, y: 179, size: 165, angle: 8 }, name: { x: 328, y: 291, size: 13, color: "#ffffff", angle: 8, outline: false }, stk: { x: 330, y: 267, size: 18, color: "#09fa9a", angle: 8, outline: false } },
    anime: { img: "/layout/anime2.png", qr: { x: 1355, y: 547, size: 550, angle: 8 }, name: { x: 982, y: 855, size: 30, color: "#ffffff", angle: 8, outline: false }, stk: { x: 998, y: 790, size: 40, color: "#f08bd0", angle: 8, outline: false } },
    goku: { img: "/layout/goku.png", qr: { x: 54, y: 245, size: 196, angle: -14 }, name: { x: 408, y: 412, size: 13, color: "#e68ac5", angle: 0, outline: true, outlineWidth: 5 }, stk: { x: 490, y: 458, size: 18, color: "#e68ac5", angle: 0, outline: true, outlineWidth: 5 } },
    gojo: { img: "/layout/gojo.png", qr: { x: 52, y: 245, size: 196, angle: -14 }, name: { x: 510, y: 423, size: 13, color: "#ffffff", angle: 9, outline: false }, stk: { x: 510, y: 397, size: 18, color: "#8f78d0", angle: 9, outline: false } },
    gojo2: { img: "/layout/gojo2.png", qr: { x: 246, y: 1686, size:1100, angle: -14 }, name: { x: 3141, y: 2616, size: 85, color: "#ffffff", angle: 9, outline: false }, stk: { x: 3164, y: 2545, size: 100, color: "#8f78d0", angle: 9, outline: false } },
    itachi: { img: "/layout/itachi.png", qr: { x: 52, y: 245, size: 200, angle: -15 }, name: { x: 510, y: 423, size: 13, color: "#ffffff", angle: 9, outline: false }, stk: { x: 515, y: 397, size: 18, color: "#ff0000", angle: 9, outline: false } },
    sukuna: { img: "/layout/sukuna.png", qr: { x: 52, y: 245, size: 200, angle: -15 }, name: { x: 510, y: 420, size: 13, color: "#ffffff", angle: 9, outline: false }, stk: { x: 510, y: 397, size: 18, color: "#fd77d1", angle: 9, outline: false } },
    wibu: { img: "/layout/gaianime.png", qr: { x: 432, y: 174, size: 175, angle: 8 }, name: { x: 315, y: 275, size: 13, color: "#ffffff", angle: 8, outline: false }, stk: { x: 322, y: 243, size: 18, color: "#87ceeb", angle: 8, outline: false } },
    kelly: { img: "/layout/kelly.png", qr: { x: 385, y: 80, size: 210, angle: 0 }, name: { x: 331, y: 344, size: 13, color: "#ffffff", angle: 8, outline: false }, stk: { x: 333, y: 322, size: 18, color: "#ff0000", angle: 9, outline: false } },
    ghedep: { img: "/layout/ghedepditbu.png", qr: { x: 262, y: 178, size: 185, angle: 1 }, name: { x: 430, y: 695, size: 13, color: "#ffffff", angle: 0, outline: false }, stk: { x: 430, y: 694, size: 18, color: "#ffffff", angle: 0, outline: false } },
    pikachu: { img: "/layout/pikachu.png", qr: { x: 192, y: 729, size: 680, angle: -10 }, name: { x: 1517, y: 1475, size: 50, color: "#ffffff", angle: 0, outline: false }, stk: { x: 1517, y: 1400, size: 68, color: "#ffef00", angle: 0, outline: false } },
    kitty: { img: "/layout/kitty.png", qr: { x: 140, y: 600, size: 470, angle: 0 } },
    lilyCheerleader: { img: "/layout/LilyCheerleader.png", qr: { x: 703, y: 650, size: 450, angle: 0 }, name: { x: 365, y: 1075, size: 55, color: "#ffffff", angle: 0, outline: false, outlineWidth: 5 }, stk: { x: 350, y: 855, size: 50, color: "#ffffff", angle: 0, outline: true, outlineWidth: 5 } },
    doclap: { img: "/layout/doclap.png", qr: { x: 656, y: 447, size: 550, angle: 7 } },
    rimuru: { img: "/layout/rimuru.png", qr: { x: 100, y: 350, size: 560, angle: 0 } },
    nagi2: { img: "/layout/nagi2.png", qr: { x: 710, y: 545, size: 475, angle: 0 } },
    kaitokid: { img: "/layout/kaitokid.png", qr: { x: 90, y: 620, size: 535, angle: -5 }, name: { x: 950, y: 885, size: 50, color: "#ffffff", angle: 0, outline: false, outlineWidth: 5 }, stk: { x: 950, y: 760, size: 60, color: "#ffffff", angle: 0, outline: true, outlineWidth: 5 } },
    hutao: { img: "/layout/hutao.png", qr: { x: 77, y: 530, size: 550, angle: 0 } },
    rem: { img: "/layout/rem.png", qr: { x: 87, y: 555, size: 570, angle: 0 } },
    waguri: { img: "/layout/waguri.png", qr: { x: 371, y: 544, size: 628, angle: 0 } },
    furina: { img: "/layout/furina.png", qr: { x: 597, y: 475, size: 500, angle: 0 }, stk: { x: 950, y: 1160, size: 45, color: "#ffffff", angle: 0, outline: true, outlineWidth: 5 } },
    wag: { img: "/layout/wag.png", qr: { x: 670, y: 440, size: 510, angle: 3 }, name: { x: 900, y: 1075, size: 50, color: "#ff0000", angle: 1, outline: false }, stk: { x: 900, y: 1155, size: 50, color: "#ff0000", angle: 1, outline: false } }
};

const layoutKeys = Object.keys(qrLayouts);
const displayNames = {
    luffy: "🏴‍☠️ Luffy Gear 5", luffyG5: "🏴‍☠️ Luffy Gear 5 (G5)", demon: "⚔️ Demon Slayer", tretau: "🔥 Trẻ Trâu Độc Quyền", naruto: "🦊 Uzumaki Naruto",
    nasuke: "🎭 Naruto × Sasuke", nagi: "⚽️ Nagi Bluelock", tatsumaki: "⛰ Tatsumaki", anime: "📌 Anime", goku: "☢ Goku",
    gojo: "🔮 Gojo", gojo2: "🔮 Gojo V2", itachi: "🎈 Uchiha Itachi", sukuna: "🔴 Sukuna", wibu: "👙 Gái Anime",
    kelly: "💨 Kelly FF", ghedep: "💃 Ghệ Đẹp", pikachu: "⚡ PikaChu", kitty: "🐱 Hello Kitty", lilyCheerleader: "📣 Lily Cheerleader",
    doclap: "🇻🇳 Độc Lập", rimuru: "💧 Rimuru Tempest", nagi2: "⚽ Nagi Seishiro B&W", kaitokid: "🃏 Kaito Kid", hutao: "🦋 Hutao", rem: "💙 Rem Waifu",
    waguri: "🔮 Waguri Haoruko", furina: "💧 Thủy Thần Furina", wag: "🏆 Wag Vô Địch 2026"
};

const __legacyConfig = {
    name: "qr",
    version: "7.0.1",
    role: 0,
    author: "HNHANN STUDIO 🇻🇳",
    description: "Tạo VietQR nghệ thuật tích hợp khung Waguri với QR Đen tách nền",
    category: "Game",
    usages: ".qr [số_layout] [mã_bank] [stk] [tên] HOẶC gõ .qr làm từng bước",
    cooldowns: 3
};

let bankMenuText = "";
bankListMenu.forEach((b, i) => {
    bankMenuText += `  » ${i + 1}. ${b.name}\n`;
});

const __legacyRun = async function ({ api, event, args, Users, Threads }) {
    const { threadId, type, data } = event;
    const senderID = data.uidFrom;

    const menuLayout = `HNHANN STUDIO 🇻🇳\n[ 📜 DANH SÁCH GIAO DIỆN ]\n\n${layoutKeys.map((k, i) => `${i + 1}. ${displayNames[k] || k}`).join("\n")}\n━━━━━━━━━━━━━━━━━━━━\n➭ Gõ .qr để làm từng bước một cách dễ dàng!`;

    if (args.length === 0) {
        const info = await api.sendMessage(`${menuLayout}\n\n📌 Bước 1: Vui lòng REPLY tin nhắn này kèm SỐ THỨ TỰ giao diện bạn chọn:`, threadId, type);
        const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
        if (replyMsgId) global.client.handleReply.set(replyMsgId, { name: REPLY_NAME, author: senderID, step: 1 });
        return;
    }

    if (args.length < 4) return api.sendMessage("❌ Lỗi cú pháp nhanh! Bạn nên gõ lệnh `.qr` không kèm tham số để hệ thống hướng dẫn từng bước trực quan hơn.", threadId, type);

    let layoutName = args[0];
    if (!isNaN(layoutName)) {
        const index = parseInt(layoutName) - 1;
        if (index >= 0 && index < layoutKeys.length) layoutName = layoutKeys[index];
        else return api.sendMessage("❌ Số giao diện không tồn tại!", threadId, type);
    } else {
        layoutName = layoutName.toLowerCase();
    }

    const bankInput = args[1].toUpperCase();
    const stkNumber = args[2].replace(/\s/g, "");
    const accountName = args.slice(3).join(" ").toUpperCase();

    // 🔧 FIX (Zalo): trước đây (FCA) kiểm tra event.type === "message_reply" +
    // messageReply.attachments[0]. Ở zca dùng extractImageUrlFromEvent(event)
    // để lấy ảnh trong quote (nếu người dùng reply kèm ảnh QR khi gọi lệnh).
    const repliedImage = extractImageUrlFromEvent(event);

    await processQRGeneration({ api, event, senderID, Users, Threads, layoutName, bankInput, stkNumber, accountName, repliedImage });
};

// ============================================================================
// 4. XỬ LÝ HANDLE REPLY (QUY TRÌNH TỪNG BƯỚC THÔNG MINH)
// ============================================================================
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
    const body = String(data?.content ?? "");
    if (handleReply.author !== senderID) return;

    const Users = params?.Users;
    const Threads = params?.Threads;

    const setNextReply = (sentInfo, payload) => {
        const newReplyMsgId = String(sentInfo?.message?.msgId || sentInfo?.message?.cliMsgId || sentInfo?.msgId || sentInfo?.cliMsgId || "");
        if (newReplyMsgId) global.client.handleReply.set(newReplyMsgId, payload);
    };

    switch (handleReply.step) {
        case 1: {
            let layoutName = body.toLowerCase().trim();
            if (!isNaN(layoutName)) {
                const index = parseInt(layoutName) - 1;
                if (index >= 0 && index < layoutKeys.length) layoutName = layoutKeys[index];
                else return api.sendMessage("❌ Số thứ tự không hợp lệ! Vui lòng chọn lại.", threadId, type);
            }

            if (!qrLayouts[layoutName]) return api.sendMessage("❌ Giao diện không tồn tại! Vui lòng chọn lại.", threadId, type);

            const msg = `HNHANN STUDIO 🇻🇳\n✓ Giao diện: ${displayNames[layoutName]}\n━━━━━━━━━━━━━━━━━━━━\n[ 🏦 DANH SÁCH NGÂN HÀNG & VÍ ]\n\n${bankMenuText}━━━━━━━━━━━━━━━━━━━━\n📌 Bước 2: Vui lòng REPLY tin nhắn này nhập SỐ THỨ TỰ hoặc MÃ viết tắt của Ngân hàng.\n\n👉 Nếu không thấy ngân hàng của bạn, hãy REPLY tin nhắn này VÀ GỬI KÈM ẢNH QR của bạn vào đây!`;

            const info = await api.sendMessage(msg, threadId, type);
            setNextReply(info, { name: REPLY_NAME, author: senderID, step: 2, data: { layoutName } });
            break;
        }

        case 2: {
            let bankInput = body ? body.trim() : "";
            let repliedImage = extractImageUrlFromEvent(event);

            if (!isNaN(bankInput) && bankInput !== "") {
                const bIdx = parseInt(bankInput) - 1;
                if (bIdx >= 0 && bIdx < bankListMenu.length) {
                    bankInput = bankListMenu[bIdx].code;
                } else if (!repliedImage) {
                    return api.sendMessage("❌ Số thứ tự ngân hàng không hợp lệ! Vui lòng chọn lại.", threadId, type);
                }
            }

            bankInput = bankInput.toUpperCase();

            if (!repliedImage && !bankInput) {
                return api.sendMessage("❌ Vui lòng nhập tên ngân hàng hoặc gửi kèm ảnh mã QR!", threadId, type);
            }

            const findBank = bankListMenu.find(b => b.code === bankInput);
            const displayBankName = findBank ? findBank.name : bankInput;

            const info = await api.sendMessage(`HNHANN STUDIO 🇻🇳\n✓ Ngân hàng đã chọn: ${repliedImage ? "Sử dụng mã QR đính kèm" : displayBankName}\n━━━━━━━━━━━━━━━━━━━━\n📌 Bước 3: Vui lòng REPLY tin nhắn này nhập SỐ TÀI KHOẢN (hoặc SĐT ví điện tử):`, threadId, type);
            setNextReply(info, { name: REPLY_NAME, author: senderID, step: 3, data: { ...handleReply.data, bankInput, repliedImage } });
            break;
        }

        case 3: {
            const stkNumber = body.replace(/\s/g, "");
            const info = await api.sendMessage(`HNHANN STUDIO 🇻🇳\n✓ STK: ${stkNumber}\n━━━━━━━━━━━━━━━━━━━━\n📌 Bước 4: Vui lòng REPLY tin nhắn này nhập TÊN CHỦ TÀI KHOẢN (In hoa/Thường đều được):`, threadId, type);
            setNextReply(info, { name: REPLY_NAME, author: senderID, step: 4, data: { ...handleReply.data, stkNumber } });
            break;
        }

        case 4: {
            const accountName = body.toUpperCase();
            const statusInfo = await api.sendMessage("⏳ Đang khởi tạo mã QR nghệ thuật. Vui lòng chờ trong giây lát...", threadId, type);
            await processQRGeneration({
                api, event, senderID, Users, Threads,
                layoutName: handleReply.data.layoutName,
                bankInput: handleReply.data.bankInput,
                stkNumber: handleReply.data.stkNumber,
                accountName: accountName,
                repliedImage: handleReply.data.repliedImage,
                statusInfo,
            });
            break;
        }
    }
};

// ============================================================================
// 5. CORE TẠO ẢNH QR VÀ DRAW CANVAS
// ============================================================================
async function processQRGeneration({ api, event, senderID, Users, Threads, layoutName, bankInput, stkNumber, accountName, repliedImage, statusInfo }) {
    const { threadId, type } = event;
    const layout = qrLayouts[layoutName];

    if (!layout) return api.sendMessage("❌ Giao diện không tồn tại!", threadId, type);

    try {
        const userTurnsData = readJsonFile(USER_TURNS_FILE);
        let userTurns = userTurnsData[senderID] || 0;

        if (userTurns < 1) {
            if (statusInfo) await tryDeleteOwnMessage(api, threadId, type, statusInfo);
            return api.sendMessage("🚫 Bạn đã hết lượt sử dụng lệnh này.\n⚠️ Lệnh tạo QR không áp dụng gói vô hạn.\n👉 Vui lòng nạp thêm lượt để tiếp tục!", threadId, type);
        }

        let qrImg;
        if (repliedImage) {
            const rawImg = await loadImage(repliedImage);
            qrImg = rawImg;
            try {
                const jsQR = require("jsqr");
                const tempCanvas = createCanvas(rawImg.width, rawImg.height);
                const tempCtx = tempCanvas.getContext("2d");
                tempCtx.drawImage(rawImg, 0, 0);
                const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const code = jsQR(imgData.data, imgData.width, imgData.height);

                if (code) {
                    const loc = code.location;
                    const padding = 15;
                    const minX = Math.max(0, Math.min(loc.topLeftCorner.x, loc.bottomLeftCorner.x) - padding);
                    const minY = Math.max(0, Math.min(loc.topLeftCorner.y, loc.topRightCorner.y) - padding);
                    const maxX = Math.min(rawImg.width, Math.max(loc.topRightCorner.x, loc.bottomRightCorner.x) + padding);
                    const maxY = Math.min(rawImg.height, Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y) + padding);
                    const w = maxX - minX; const h = maxY - minY;

                    const cropCanvas = createCanvas(w, h);
                    const cropCtx = cropCanvas.getContext("2d");
                    cropCtx.drawImage(rawImg, minX, minY, w, h, 0, 0, w, h);
                    qrImg = await loadImage(cropCanvas.toBuffer());
                }
            } catch (e) {
                console.log("Không thể tự động cắt QR, dùng ảnh gốc.");
            }
        } else {
            const bankId = bankMapping[bankInput] || bankInput;
            const qrRes = await axios.post("https://api.vietqr.io/v2/generate", {
                accountNo: stkNumber, accountName: accountName, acqId: bankId, amount: 0, addInfo: "NKNP STUDIO", format: "png", template: "qr_only"
            });
            qrImg = await loadImage(Buffer.from(qrRes.data.data.qrDataURL.split(',')[1], 'base64'));
        }

        // ĐỔI MÀU CƠ BẢN VÀ XOÁ NỀN TRẮNG
        if (["doclap", "rimuru", "nagi2", "kaitokid", "hutao", "rem", "waguri", "furina", "wag"].includes(layoutName)) {
            try {
                const tintCanvas = createCanvas(qrImg.width, qrImg.height);
                const tintCtx = tintCanvas.getContext("2d");
                tintCtx.drawImage(qrImg, 0, 0);

                const imgData = tintCtx.getImageData(0, 0, tintCanvas.width, tintCanvas.height);
                const data = imgData.data;

                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] < 140 && data[i+1] < 140 && data[i+2] < 140) {
                        if (layoutName === "doclap") {
                            data[i] = 74; data[i+1] = 51; data[i+2] = 25;
                        } else if (layoutName === "rimuru") {
                            data[i] = 10; data[i+1] = 88; data[i+2] = 202;
                        } else if (layoutName === "nagi2") {
                            data[i] = 0; data[i+1] = 0; data[i+2] = 0;
                        } else if (layoutName === "kaitokid") {
                            data[i] = 10; data[i+1] = 88; data[i+2] = 202;
                        } else if (layoutName === "hutao") {
                            data[i] = 185; data[i+1] = 0; data[i+2] = 6;
                        } else if (layoutName === "rem") {
                            data[i] = 0; data[i+1] = 132; data[i+2] = 255;
                        } else if (layoutName === "waguri") {
                            data[i] = 0; data[i+1] = 0; data[i+2] = 0;
                        } else if (layoutName === "furina") {
                            data[i] = 0; data[i+1] = 112; data[i+2] = 255;
                        } else if (layoutName === "wag") {
                            data[i] = 0; data[i+1] = 0; data[i+2] = 0;
                        }
                    } else {
                        data[i+3] = 0;
                    }
                }
                tintCtx.putImageData(imgData, 0, 0);
                qrImg = await loadImage(tintCanvas.toBuffer());
            } catch (tintError) {
                console.error(`Lỗi khi xử lý nhuộm màu QR mẫu ${layoutName}:`, tintError);
            }
        }

        const bgImg = await loadImage(path.join(__dirname, layout.img));
        const adminLogoPath = path.join(__dirname, "/layout/ADMIN_LOGO.png");
        let adminLogo = null;
        if (fs.existsSync(adminLogoPath)) adminLogo = await loadImage(adminLogoPath);

        const scale = 4;
        const canvas = createCanvas(bgImg.width * scale, bgImg.height * scale);
        const canvasCtx = canvas.getContext("2d");
        canvasCtx.imageSmoothingEnabled = true;
        canvasCtx.imageSmoothingQuality = "high";
        canvasCtx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

        const qrSizeS = layout.qr.size * scale;
        canvasCtx.save();
        canvasCtx.translate((layout.qr.x + layout.qr.size / 2) * scale, (layout.qr.y + layout.qr.size / 2) * scale);
        canvasCtx.rotate((layout.qr.angle || 0) * Math.PI / 180);
        canvasCtx.drawImage(qrImg, -qrSizeS / 2, -qrSizeS / 2, qrSizeS, qrSizeS);

        const isWalletImage = repliedImage && (bankInput === "VIETTELMONEY" || bankInput === "VNPAY");
        if (adminLogo && !isWalletImage) {
            const lS = qrSizeS * 0.125;
            canvasCtx.drawImage(adminLogo, -lS / 2, -lS / 2, lS, lS);
        }
        canvasCtx.restore();

        const renderText = (data, text, font, useShadow = false) => {
            if (!data) return;
            const fSize = data.size * scale;
            canvasCtx.save();
            canvasCtx.translate(data.x * scale, data.y * scale);
            canvasCtx.rotate((data.angle || 0) * Math.PI / 180);
            canvasCtx.textAlign = "center";
            canvasCtx.textBaseline = "middle";

            const prefixStyle = data.isItalic ? "italic bold" : "bold";
            canvasCtx.font = `${prefixStyle} ${fSize}px "${font}"`;

            if (useShadow) {
                canvasCtx.shadowColor = "rgba(0,0,0,0.4)";
                canvasCtx.shadowBlur = 3 * scale;
                canvasCtx.shadowOffsetX = 1.5 * scale;
                canvasCtx.shadowOffsetY = 1.5 * scale;
            }

            if (data.outline) {
                canvasCtx.strokeStyle = typeof data.outline === 'string' ? data.outline : "#ffffff";
                canvasCtx.lineWidth = (data.outlineWidth || 6) * scale;
                canvasCtx.lineJoin = "round";
                canvasCtx.miterLimit = 2;
                canvasCtx.strokeText(text, 0, 0);
            }

            canvasCtx.shadowColor = "transparent";
            canvasCtx.fillStyle = data.color || "#000000";
            canvasCtx.fillText(text, 0, 0);
            canvasCtx.restore();
        };

        renderText(layout.name, accountName, "NameX", false);
        renderText(layout.stk, stkNumber, "StkX", true);

        const cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
        const cachePath = path.join(cacheDir, `qr_${Date.now()}.png`);
        fs.writeFileSync(cachePath, canvas.toBuffer("image/png"));

        const remainingTurns = userTurns - 1;
        userTurnsData[senderID] = remainingTurns;
        writeJsonFile(USER_TURNS_FILE, userTurnsData);

        let userName = "Người Dùng";
        try { userName = (await Users.getData(senderID))?.name || userName; } catch (e) {}

        const nickname = `${userName} | ${remainingTurns} lượt`;
        try { await api.changeNickname(nickname, threadId, senderID); } catch (e) {}

        if (statusInfo) await tryDeleteOwnMessage(api, threadId, type, statusInfo);

        await api.sendMessage({
            msg: `HNHANN STUDIO 🇻🇳\n\n✅ Tác phẩm QR nghệ thuật của bạn đã hoàn tất thành công!\n🎫 Số lượt tài khoản: Còn lại ${remainingTurns} lượt`,
            attachments: cachePath
        }, threadId, type);

        try { if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch {}

    } catch (e) {
        console.error(e);
        if (statusInfo) await tryDeleteOwnMessage(api, threadId, type, statusInfo);

        api.sendMessage(`❌ Đã xảy ra lỗi khi tạo mã QR. Vui lòng kiểm tra kỹ lại thông tin và thử lại!`, threadId, type);
    }
}

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
