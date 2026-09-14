/**
 * [PORT TỪ NKNP] luotdung.js
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

const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// ============================================================
// 📁 ĐỌC / GHI FILE JSON
// ============================================================
function readJsonFile(filePath, defaultValue = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return defaultValue;
        }
        const rawData = fs.readFileSync(filePath);
        return rawData.length > 0 ? JSON.parse(rawData) : defaultValue;
    } catch (error) {
        console.error(`Lỗi khi đọc file ${filePath}:`, error);
        return defaultValue;
    }
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Lỗi khi ghi file ${filePath}:`, error);
    }
}

// ============================================================
// 🆕 Zalo (zca-js) reply-state store — dùng chung kiểu với td.js
// Zalo không có handleReply gốc như FCA, nên ta lưu state theo
// msgId của tin nhắn hỏi, đối chiếu khi có người "quote/reply" tới.
// ============================================================
global.client = global.client || {};
global.client.handleReply = global.client.handleReply instanceof Map
    ? global.client.handleReply
    : new Map();

// ============================================================
// 👤 LẤY TÊN NGƯỜI DÙNG (Zalo)
// ============================================================
async function getUserName(api, uid) {
    try {
        // zca-js: api.getUserInfo trả về object chứa thông tin hồ sơ người dùng.
        // Tuỳ phiên bản thư viện, field tên có thể là displayName / zaloName / name.
        const info = await api.getUserInfo(uid);
        const profile =
            info?.changed_profiles?.[uid] ||
            info?.unchanged_profiles?.[uid] ||
            info?.[uid] ||
            null;
        const name = profile?.displayName || profile?.zaloName || profile?.name;
        if (name) return name;
    } catch (error) {
        console.error(`[luotdung] Lỗi lấy tên user ${uid}:`, error.message);
    }
    return `Người dùng (UID: ${uid})`;
}

// ============================================================
// ♾️ KIỂM TRA VÔ HẠN
// ============================================================
function isUserUnlimited(uid, vohanData) {
    if (!vohanData[uid]) return false;
    const expiry = moment(vohanData[uid]).tz("Asia/Ho_Chi_Minh");
    return moment().tz("Asia/Ho_Chi_Minh").isBefore(expiry);
}

// ============================================================
// 🎯 XÁC ĐỊNH targetID TỪ MENTION / QUOTE / UID NHẬP TAY (Zalo)
// ============================================================
function resolveTargetId(event, args) {
    const data = event?.data || {};

    // 1) Mention trong tin nhắn (zca-js thường trả mảng mentions: [{ uid, pos, len }, ...])
    const mentions = data.mentions;
    if (Array.isArray(mentions) && mentions.length > 0 && mentions[0]?.uid) {
        return String(mentions[0].uid);
    }

    // 2) Quote/reply tới tin nhắn của người khác
    const quote = data.quote;
    if (quote) {
        const quoteOwnerId = quote.ownerId || quote.uidFrom || quote.senderId;
        if (quoteOwnerId) return String(quoteOwnerId);
    }

    // 3) Nhập UID trực tiếp trong args (UID Zalo thường là chuỗi số dài)
    if (args[1] && /^\d{9,}$/.test(args[1])) {
        return String(args[1]);
    }

    return null;
}

// ============================================================
// 🔐 KIỂM TRA QUYỀN ADMIN BOT
// ============================================================
function isAdminBot(id) {
    const list = (global.users && global.users.admin) || [];
    return list.map(String).includes(String(id));
}

// ============================================================
// 📌 CONFIG LỆNH
// ============================================================


// ============================================================
// 🆕 XỬ LÝ REPLY / QUOTE TRÊN ZALO
// Framework cần tự gọi module.exports.onReply({api, event, quoteMsgId})
// khi phát hiện 1 tin nhắn là quote/reply tới tin nhắn mà lệnh này
// đã gửi ra và có lưu state trong global.client.handleReply.
// ============================================================


// ============================================================
// 🚀 RUN
// ============================================================

const __legacyConfig = {
    name: "luotdung",
    version: "5.0.0-zalo",
    hasPermssion: 0,
    credits: "NNMTBOT-GBNT (Zalo port)",
    description: "Quản lý lượt dùng - Thanh toán theo mệnh giá tiền (Zalo)",
    commandCategory: "game",
    cooldowns: 3
};
const __legacyRun = async function ({ api, event, args }) {
    const { threadId, type, data } = event;
    const senderID = data?.uidFrom;

    const DATA_DIR = path.join(__dirname, 'data', 'Luotdung');
    const USER_TURNS_FILE = path.join(DATA_DIR, 'bank_user_turns.json');
    const VOHAN_FILE = path.join(DATA_DIR, 'tinhdiem_vohan.json');
    const AUTH_FILE = path.join(DATA_DIR, 'authorized_users.json');
    const subCommand = args[0]?.toLowerCase();

    const targetID = resolveTargetId(event, args);

    switch (subCommand) {
        case 'check': {
            const checkID = targetID || senderID;
            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const vohanData = readJsonFile(VOHAN_FILE, {});
            const userName = await getUserName(api, checkID);
            const turns = userTurnsData[checkID] || 0;
            const unlimited = isUserUnlimited(checkID, vohanData);

            let statusText = unlimited ? "🌟 VÔ HẠN (VIP)" : `${turns} lượt`;
            let expiryText = "";

            if (unlimited) {
                const expiry = moment(vohanData[checkID]).tz("Asia/Ho_Chi_Minh");
                expiryText = `│ ⏰ Hết hạn VIP: ${expiry.format('DD/MM/YYYY HH:mm')}\n`;
            }

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ 👤 THÔNG TIN LƯỢT DÙNG\n` +
                `├──────────────⭓\n` +
                `│ 📛 Tên: ${userName}\n` +
                `│ 🆔 UID: ${checkID}\n` +
                `│ 🔄 Trạng thái: ${statusText}\n` +
                expiryText +
                `╰──────────────⭓`,
                threadId, type
            );
        }

        case 'auth': {
            if (!isAdminBot(senderID)) {
                return api.sendMessage("⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.", threadId, type);
            }
            if (!targetID) {
                return api.sendMessage("❌ Vui lòng tag, reply hoặc nhập UID người cần cấp quyền.", threadId, type);
            }

            let authData = readJsonFile(AUTH_FILE, []);
            if (!authData.map(String).includes(String(targetID))) {
                authData.push(String(targetID));
                writeJsonFile(AUTH_FILE, authData);
                const userName = await getUserName(api, targetID);
                return api.sendMessage(
                    `╭──────────────⭓\n` +
                    `│ ✅ CẤP QUYỀN THÀNH CÔNG\n` +
                    `├──────────────⭓\n` +
                    `│ 👤 Người nhận: ${userName}\n` +
                    `│ 🆔 UID: ${targetID}\n` +
                    `│ 🔐 Quyền: Thanh toán lượt\n` +
                    `╰──────────────⭓`,
                    threadId, type
                );
            }
            return api.sendMessage("⚠️ Người dùng này đã có quyền thanh toán.", threadId, type);
        }

        case 'delauth': {
            if (!isAdminBot(senderID)) {
                return api.sendMessage("⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.", threadId, type);
            }
            if (!targetID) {
                return api.sendMessage("❌ Vui lòng tag, reply hoặc nhập UID người cần gỡ quyền.", threadId, type);
            }

            let authData = readJsonFile(AUTH_FILE, []);
            const hadAuth = authData.map(String).includes(String(targetID));
            authData = authData.filter(id => String(id) !== String(targetID));
            writeJsonFile(AUTH_FILE, authData);

            const userName = await getUserName(api, targetID);
            if (hadAuth) {
                return api.sendMessage(
                    `╭──────────────⭓\n` +
                    `│ ✅ GỠ QUYỀN THÀNH CÔNG\n` +
                    `├──────────────⭓\n` +
                    `│ 👤 Người bị gỡ: ${userName}\n` +
                    `│ 🆔 UID: ${targetID}\n` +
                    `╰──────────────⭓`,
                    threadId, type
                );
            }
            return api.sendMessage("⚠️ Người dùng này không có quyền để gỡ.", threadId, type);
        }

        case 'thanhtoan': {
            const authData = readJsonFile(AUTH_FILE, []);
            if (!isAdminBot(senderID) && !authData.map(String).includes(String(senderID))) {
                return api.sendMessage("⚠️ Bạn không có quyền sử dụng lệnh này.", threadId, type);
            }

            const moneyInput = parseInt(args[args.length - 1]);
            if (!targetID || isNaN(moneyInput) || moneyInput < 250) {
                return api.sendMessage(
                    "❌ Cú pháp sai hoặc số tiền quá thấp!\n\n" +
                    "📝 Cách dùng:\n" +
                    "luotdung thanhtoan [@tag/reply/UID] [số tiền]\n\n" +
                    "💡 Ví dụ (250đ = 1 lượt):\n" +
                    "luotdung thanhtoan @user 2500 (sẽ cộng 10 lượt)",
                    threadId, type
                );
            }

            const rate = 250;
            const amount = Math.floor(moneyInput / rate);

            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const vohanData = readJsonFile(VOHAN_FILE, {});
            const name = await getUserName(api, targetID);

            userTurnsData[targetID] = (userTurnsData[targetID] || 0) + amount;
            writeJsonFile(USER_TURNS_FILE, userTurnsData);

            const newTurns = userTurnsData[targetID];
            const isUnlimited = isUserUnlimited(targetID, vohanData);

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ ✅ THANH TOÁN THÀNH CÔNG\n` +
                `├──────────────⭓\n` +
                `│ 👤 Người nhận: ${name}\n` +
                `│ 🆔 UID: ${targetID}\n` +
                `│ 💵 Số tiền: ${moneyInput.toLocaleString()}đ\n` +
                `│ ➕ Quy đổi: +${amount} lượt\n` +
                `│ 💰 Tổng số dư: ${newTurns} lượt\n` +
                `${isUnlimited ? '│ 🌟 Trạng thái: VIP (Vô hạn)\n' : ''}` +
                `╰──────────────⭓`,
                threadId, type
            );
        }

        case 'tru': {
            if (!isAdminBot(senderID)) {
                return api.sendMessage("⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.", threadId, type);
            }

            const amount = parseInt(args[args.length - 1]);
            if (!targetID || isNaN(amount) || amount <= 0) {
                return api.sendMessage(
                    "❌ Cú pháp sai!\n\n" +
                    "📝 Cách dùng:\n" +
                    "luotdung tru [@tag/reply/UID] [số lượt]\n\n" +
                    "💡 Ví dụ:\n" +
                    "luotdung tru @user 1000",
                    threadId, type
                );
            }

            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const vohanData = readJsonFile(VOHAN_FILE, {});
            const name = await getUserName(api, targetID);

            const oldTurns = userTurnsData[targetID] || 0;
            const newTurns = Math.max(0, oldTurns - amount);
            userTurnsData[targetID] = newTurns;
            writeJsonFile(USER_TURNS_FILE, userTurnsData);

            const isUnlimited = isUserUnlimited(targetID, vohanData);

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ ➖ TRỪ LƯỢT THÀNH CÔNG\n` +
                `├──────────────⭓\n` +
                `│ 👤 Người bị trừ: ${name}\n` +
                `│ 🆔 UID: ${targetID}\n` +
                `│ ➖ Đã trừ: ${amount} lượt\n` +
                `│ 💰 Số dư trước: ${oldTurns} lượt\n` +
                `│ 💰 Số dư còn lại: ${newTurns} lượt\n` +
                `${isUnlimited ? '│ 🌟 Trạng thái: VIP (Vô hạn)\n' : ''}` +
                `╰──────────────⭓`,
                threadId, type
            );
        }

        case 'cong': {
            if (!isAdminBot(senderID)) {
                return api.sendMessage("⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.", threadId, type);
            }

            const amount = parseInt(args[args.length - 1]);
            if (!targetID || isNaN(amount) || amount <= 0) {
                return api.sendMessage(
                    "❌ Cú pháp sai!\n\n" +
                    "📝 Cách dùng:\n" +
                    "luotdung cong [@tag/reply/UID] [số lượt]\n\n" +
                    "💡 Ví dụ:\n" +
                    "luotdung cong @user 1000",
                    threadId, type
                );
            }

            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const vohanData = readJsonFile(VOHAN_FILE, {});
            const name = await getUserName(api, targetID);

            const oldTurns = userTurnsData[targetID] || 0;
            const newTurns = oldTurns + amount;
            userTurnsData[targetID] = newTurns;
            writeJsonFile(USER_TURNS_FILE, userTurnsData);

            const isUnlimited = isUserUnlimited(targetID, vohanData);

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ ➕ CỘNG LƯỢT THÀNH CÔNG\n` +
                `├──────────────⭓\n` +
                `│ 👤 Người được cộng: ${name}\n` +
                `│ 🆔 UID: ${targetID}\n` +
                `│ ➕ Đã cộng: ${amount} lượt\n` +
                `│ 💰 Số dư trước: ${oldTurns} lượt\n` +
                `│ 💰 Số dư còn lại: ${newTurns} lượt\n` +
                `${isUnlimited ? '│ 🌟 Trạng thái: VIP (Vô hạn)\n' : ''}` +
                `╰──────────────⭓`,
                threadId, type
            );
        }

        case 'vohan': {
            if (!isAdminBot(senderID)) {
                return api.sendMessage("⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.", threadId, type);
            }
            if (!targetID) {
                return api.sendMessage(
                    "❌ Cú pháp sai!\n\n" +
                    "📝 Cách dùng:\n" +
                    "luotdung vohan [@tag/reply/UID] [số ngày (nếu có)]\n\n" +
                    "💡 Ví dụ:\n" +
                    "luotdung vohan @user (Vĩnh viễn)\n" +
                    "luotdung vohan @user 30 (30 ngày)",
                    threadId, type
                );
            }

            // Lấy số ngày từ đối số cuối cùng, nếu không có mặc định là 100 năm (36500 ngày)
            const daysInput = parseInt(args[args.length - 1]);
            const daysToAdd = (!isNaN(daysInput) && args.length > 2) ? daysInput : 36500;

            const vohanData = readJsonFile(VOHAN_FILE, {});
            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const expiryDate = moment().tz("Asia/Ho_Chi_Minh").add(daysToAdd, 'days').toISOString();
            vohanData[targetID] = expiryDate;
            writeJsonFile(VOHAN_FILE, vohanData);

            const userName = await getUserName(api, targetID);

            const expiryText = daysToAdd >= 36500 ? "Vĩnh viễn" : `${daysToAdd} ngày`;
            const preciseExpiry = moment(expiryDate).tz("Asia/Ho_Chi_Minh").format('DD/MM/YYYY HH:mm');

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ ✅ CẤP VÔ HẠN THÀNH CÔNG\n` +
                `├──────────────⭓\n` +
                `│ 👤 Người nhận: ${userName}\n` +
                `│ 🆔 UID: ${targetID}\n` +
                `│ 🌟 Thời hạn: ${expiryText}\n` +
                `│ ⏰ Hết hạn: ${preciseExpiry}\n` +
                `╰──────────────⭓`,
                threadId, type
            );
        }

        case 'vohanbox': {
            if (!isAdminBot(senderID)) {
                return api.sendMessage("⚠️ Chỉ Admin Bot mới có quyền sử dụng lệnh này.", threadId, type);
            }
            const days = parseInt(args[1]);
            if (isNaN(days)) {
                return api.sendMessage("❌ Vui lòng nhập số ngày hợp lệ.", threadId, type);
            }

            const info = await api.sendMessage(
                {
                    msg:
                        `╭──────────────⭓\n` +
                        `│ 🎁 KÍCH HOẠT BOX MIỄN PHÍ\n` +
                        `├──────────────⭓\n` +
                        `│ 📅 Thời hạn: ${days} ngày\n` +
                        `│ \n` +
                        `│ Chọn phạm vi áp dụng:\n` +
                        `│ 1️⃣ Chỉ QTV box\n` +
                        `│ 2️⃣ Tất cả thành viên\n` +
                        `│ \n` +
                        `│ 💬 Phản hồi (reply/quote) số để chọn\n` +
                        `╰──────────────⭓`,
                },
                threadId,
                type
            );

            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId);
            global.client.handleReply.set(replyMsgId, {
                name: __legacyConfig.name,
                author: senderID,
                type: 'vohanbox',
                days
            });
            setTimeout(() => global.client.handleReply.delete(replyMsgId), 10 * 60 * 1000);
            return;
        }

        case 'chuyenluot': {
            const amount = parseInt(args[args.length - 1]);
            if (!targetID || isNaN(amount) || targetID === senderID) {
                return api.sendMessage(
                    "❌ Cú pháp sai!\n\n" +
                    "📝 Cách dùng:\n" +
                    "luotdung chuyenluot [@tag/reply/UID] [số lượt]\n\n" +
                    "💡 Ví dụ:\n" +
                    "luotdung chuyenluot @user 50\n\n" +
                    "⚠️ Lưu ý: Không thể chuyển cho chính mình",
                    threadId, type
                );
            }

            const dataFile = readJsonFile(USER_TURNS_FILE, {});
            const senderTurns = dataFile[senderID] || 0;

            if (senderTurns < amount) {
                return api.sendMessage(
                    `❌ Không đủ lượt để chuyển!\n\n` +
                    `💰 Số lượt hiện có: ${senderTurns} lượt\n` +
                    `📤 Số lượt muốn chuyển: ${amount} lượt\n` +
                    `❗ Thiếu: ${amount - senderTurns} lượt`,
                    threadId, type
                );
            }

            const targetName = await getUserName(api, targetID);
            const info = await api.sendMessage(
                {
                    msg:
                        `╭──────────────⭓\n` +
                        `│ 💸 XÁC NHẬN CHUYỂN LƯỢT\n` +
                        `├──────────────⭓\n` +
                        `│ 👤 Người nhận: ${targetName}\n` +
                        `│ 🆔 UID: ${targetID}\n` +
                        `│ 📤 Số lượt: ${amount} lượt\n` +
                        `│ 💰 Số dư sau khi chuyển: ${senderTurns - amount} lượt\n` +
                        `│ \n` +
                        `│ 💬 Phản hồi (reply/quote) "yes" hoặc "có" để xác nhận\n` +
                        `╰──────────────⭓`,
                },
                threadId,
                type
            );

            const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId);
            global.client.handleReply.set(replyMsgId, {
                name: __legacyConfig.name,
                author: senderID,
                type: 'chuyenluot',
                targetID,
                amount,
                targetName
            });
            setTimeout(() => global.client.handleReply.delete(replyMsgId), 10 * 60 * 1000);
            return;
        }

        default: {
            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const vohanData = readJsonFile(VOHAN_FILE, {});
            const myTurns = userTurnsData[senderID] || 0;
            const isUnlimited = isUserUnlimited(senderID, vohanData);
            const statusText = isUnlimited ? "∞ VIP (Vô hạn)" : `${myTurns} lượt`;

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ 📋 HƯỚNG DẪN LỆNH LƯỢT DÙNG\n` +
                `├──────────────⭓\n` +
                `│ 💰 Trạng thái của bạn: ${statusText}\n` +
                `├──────────────⭓\n` +
                `│ \n` +
                `│ 👤 LỆNH NGƯỜI DÙNG:\n` +
                `│ ▸ check [tag/reply/uid]\n` +
                `│   → Kiểm tra số lượt & VIP\n` +
                `│ \n` +
                `│ ▸ chuyenluot [tag/reply/uid] [số]\n` +
                `│   → Chuyển lượt (auto nickname)\n` +
                `│ \n` +
                `├──────────────⭓\n` +
                `│ 🔐 LỆNH ADMIN/AUTH:\n` +
                `│ ▸ thanhtoan [tag/reply/uid] [số tiền]\n` +
                `│   → Nạp tiền (250đ = 1 lượt)\n` +
                `│ \n` +
                `├──────────────⭓\n` +
                `│ ⚡ LỆNH ADMIN BOT:\n` +
                `│ ▸ cong [tag/reply/uid] [số lượt]\n` +
                `│   → Cộng lượt cho người dùng\n` +
                `│ \n` +
                `│ ▸ tru [tag/reply/uid] [số lượt]\n` +
                `│   → Trừ lượt của người dùng\n` +
                `│ \n` +
                `│ ▸ vohan [tag/reply/uid] [ngày]\n` +
                `│   → Cấp VIP (bỏ trống ngày = vĩnh viễn)\n` +
                `│ \n` +
                `│ ▸ vohanbox [ngày]\n` +
                `│   → Cấp vô hạn cho box\n` +
                `│ \n` +
                `│ ▸ auth [tag/reply/uid]\n` +
                `│   → Cấp quyền thanh toán\n` +
                `│ \n` +
                `│ ▸ delauth [tag/reply/uid]\n` +
                `│   → Gỡ quyền thanh toán\n` +
                `├──────────────⭓\n` +
                `│ 🎯 NKNP-BOT CAM ON QUY KHACH!\n` +
                `╰──────────────⭓`,
                threadId, type
            );
        }
    }
};
const __legacyOnReply = async function ({ api, event, quoteMsgId }) {
    const { threadId, type, data } = event;
    const senderID = data?.uidFrom;
    const body = String(
        data?.content?.text || data?.content || event?.msg || ""
    ).trim();

    const qid = String(
        quoteMsgId ||
        data?.quote?.globalMsgId ||
        data?.quote?.cliMsgId ||
        ""
    );

    if (!qid || !global.client.handleReply.has(qid)) return; // Không phải reply của lệnh này

    const handleReply = global.client.handleReply.get(qid);
    const { author, type: replyType } = handleReply;

    if (senderID !== author) {
        return api.sendMessage("⚠️ Chỉ người dùng đã ra lệnh mới có thể trả lời.", threadId, type);
    }

    if (replyType === 'vohanbox') {
        const { days } = handleReply;
        const choice = parseInt(body);
        if (isNaN(choice) || (choice !== 1 && choice !== 2)) {
            return api.sendMessage("❌ Lựa chọn không hợp lệ. Vui lòng chọn 1 hoặc 2.", threadId, type);
        }

        const VOHAN_BOX_FILE = path.join(__dirname, 'data', 'Luotdung', 'vohan_box.json');
        const vohanBoxData = readJsonFile(VOHAN_BOX_FILE, {});
        const scope = (choice === 1) ? 'admin' : 'all';
        const expiryDate = moment().tz("Asia/Ho_Chi_Minh").add(days, 'days').toISOString();

        vohanBoxData[threadId] = { expiry: expiryDate, scope: scope };
        writeJsonFile(VOHAN_BOX_FILE, vohanBoxData);

        global.client.handleReply.delete(qid);

        const scopeText = (scope === 'admin') ? "QTV" : "toàn bộ thành viên";
        return api.sendMessage(
            `╭──────────────⭓\n` +
            `│ 🎁 BOX MIỄN PHÍ\n` +
            `├──────────────⭓\n` +
            `│ ✅ Kích hoạt thành công!\n` +
            `│ 📅 Thời hạn: ${days} ngày\n` +
            `│ 👥 Phạm vi: ${scopeText}\n` +
            `│ ⏰ Hết hạn: ${moment(expiryDate).tz("Asia/Ho_Chi_Minh").format('DD/MM/YYYY HH:mm')}\n` +
            `╰──────────────⭓`,
            threadId, type
        );
    }

    if (replyType === 'chuyenluot') {
        const { targetID, amount, targetName } = handleReply;
        const confirmation = body.toLowerCase();

        global.client.handleReply.delete(qid);

        if (confirmation === 'yes' || confirmation === 'có' || confirmation === 'y') {
            const USER_TURNS_FILE = path.join(__dirname, 'data', 'Luotdung', 'bank_user_turns.json');
            const VOHAN_FILE = path.join(__dirname, 'data', 'Luotdung', 'tinhdiem_vohan.json');
            const userTurnsData = readJsonFile(USER_TURNS_FILE, {});
            const vohanData = readJsonFile(VOHAN_FILE, {});

            if ((userTurnsData[senderID] || 0) < amount) {
                return api.sendMessage("❌ Bạn không đủ lượt để thực hiện giao dịch này.", threadId, type);
            }

            userTurnsData[senderID] = (userTurnsData[senderID] || 0) - amount;
            userTurnsData[targetID] = (userTurnsData[targetID] || 0) + amount;
            writeJsonFile(USER_TURNS_FILE, userTurnsData);

            const receiverName = await getUserName(api, targetID);

            return api.sendMessage(
                `╭──────────────⭓\n` +
                `│ 💸 CHUYỂN LƯỢT THÀNH CÔNG\n` +
                `├──────────────⭓\n` +
                `│ 📤 Số lượt: ${amount} lượt\n` +
                `│ 👤 Người nhận: ${receiverName}\n` +
                `│ 💰 Số dư còn lại: ${userTurnsData[senderID]} lượt\n` +
                `╰──────────────⭓`,
                threadId, type
            );
        } else {
            return api.sendMessage("❌ Đã hủy giao dịch chuyển lượt.", threadId, type);
        }
    }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
