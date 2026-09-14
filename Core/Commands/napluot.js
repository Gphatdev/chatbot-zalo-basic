/**
 * [PORT TỪ NKNP] napluot.js
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

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// ─── CẤU HÌNH ────────────────────────────────────────────
const TOKEN_TPB    = 'e8cbed1f7d8de7d69e04dd079ff3d784';
const STK          = '0368422305';
const BANK_NAME    = 'Mb Bank';
const ACCOUNT_NAME = 'NGUYEN NGOC THIET';
const RATE         = 250;
const TIMEOUT_MS   = 10 * 60 * 1000;   // 10 phút
const SCAN_MS      = 90 * 1000;        // quét mỗi 90s

const TURN_DATA_DIR   = path.join(__dirname, 'data', 'Luotdung');
const pathPending     = path.join(TURN_DATA_DIR, 'napluot_pending.json');
const pathHistory     = path.join(TURN_DATA_DIR, 'napluot_history.json');
const USER_TURNS_FILE = path.join(TURN_DATA_DIR, 'bank_user_turns.json');
const VOHAN_FILE      = path.join(TURN_DATA_DIR, 'vohan.json');
const PROCESSED_FILE  = path.join(TURN_DATA_DIR, 'napluot_processed.json');
const QR_DIR          = path.join(TURN_DATA_DIR, 'qr_cache');

// ─── CONFIG THEO CHUẨN ZALO (giống key.js) ──────────────


// ─── TIỆN ÍCH ────────────────────────────────────────────
function ensureDataExists() {
    const dir = TURN_DATA_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });
    [pathPending, pathHistory, USER_TURNS_FILE, VOHAN_FILE, PROCESSED_FILE].forEach(f => {
        if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({}, null, 4));
    });
}

function readJson(fp, def = {}) {
    try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
    catch { return def; }
}

function writeJson(fp, data) {
    try { fs.writeFileSync(fp, JSON.stringify(data, null, 4), 'utf-8'); }
    catch (e) { console.error('[NAPLUOT] write error:', e.message); }
}

function generateRandomContent() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `NAP${code}`;
}

function generateQR(content) {
    return `https://api.vietqr.io/image/970422-${STK}-rXgMnlC.jpg?amount=0&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

function calcTurns(amount) {
    return Math.floor(amount / RATE);
}

/**
 * 🔧 FIX (Zalo): Zalo không có plugin "Users.getData" như GoatBot (Facebook).
 * Lấy tên trực tiếp qua api.getUserInfo, giống cách key.js đang làm (getAdminName).
 */
async function getUserName(api, uid) {
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

async function updateNickname(api, threadId, userID, name, turns, vohanData) {
    try {
        const isVip = vohanData[userID] === true;
        await api.changeNickname(isVip ? `${name} • VIP` : `${name} • ${turns}`, threadId, userID);
    } catch (e) {
        console.error('[NAPLUOT] Không đổi được biệt danh:', e.message);
    }
}

/**
 * 🔧 FIX (Zalo): Zalo gửi ảnh bằng file cục bộ (attachments: [filePath]),
 * không gửi thẳng stream URL như Facebook Messenger. Tải QR về ổ đĩa trước.
 */
async function downloadQR(url, destPath) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    fs.writeFileSync(destPath, Buffer.from(res.data));
    return destPath;
}

// ─── XỬ LÝ LỆNH ─────────────────────────────────────────


// ─── AUTO SCAN ───────────────────────────────────────────
// 🔧 FIX (Zalo): bỏ tham số "Users" (plugin riêng của GoatBot/Facebook, Zalo không có).

const __legacyConfig = {
    name: "napluot",
    version: "8.0.0-zalo",
    role: 0,
    author: "edit | Chuyển sang logic Zalo (bỏ logic Facebook Messenger/GoatBot)",
    description: "Nạp lượt QR TPBank - Nội dung ngẫu nhiên",
    category: "Economy",
    usage: ".napluot | .napluot check | .napluot history",
    cooldowns: 5
};
const __legacyRun = async ({ api, event, args }) => {
    // 🔧 FIX (Zalo): threadId/uidFrom/type thay cho threadID/senderID/messageID của Facebook
    const threadId = event.threadId || event?.threadID || event?.data?.threadId;
    const type = event.type;
    const senderID = String(event?.data?.uidFrom || event?.senderID || event?.uid || "").trim();

    ensureDataExists();

    if (args[0] === 'check') {
        const pending = readJson(pathPending, {});
        const turns = readJson(USER_TURNS_FILE, {});
        if (!pending[senderID]) {
            return api.sendMessage(
                `╭──────────────⭓\n│ ℹ️ THÔNG TIN\n├──────────────⭓\n│ UID: ${senderID}\n│ Số dư: ${turns[senderID] || 0} lượt\n│ Không có GD chờ\n╰──────────────⭓`,
                threadId, type
            );
        }
        const p = pending[senderID];
        const left = Math.max(0, Math.floor((new Date(p.expiresAt) - Date.now()) / 1000));
        return api.sendMessage(
            `╭──────────────⭓\n│ ⏳ ĐANG CHỜ\n├──────────────⭓\n│ Nội dung: ${p.content}\n│ Còn: ${left}s\n╰──────────────⭓`,
            threadId, type
        );
    }

    if (args[0] === 'history') {
        const history = readJson(pathHistory, {});
        const list = history[senderID] || [];
        if (!list.length) return api.sendMessage(`📋 Chưa có lịch sử nạp!`, threadId, type);
        let msg = `╭──────────────⭓\n│ 📋 LỊCH SỬ (10 gần nhất)\n├──────────────⭓\n`;
        list.slice(-10).reverse().forEach((h, i) => {
            msg += `│ ${i + 1}. ${new Date(h.time).toLocaleString('vi-VN')} → +${h.turns} lượt\n`;
        });
        msg += `╰──────────────⭓`;
        return api.sendMessage(msg, threadId, type);
    }

    // Tạo nạp mới
    const userName = await getUserName(api, senderID);
    const content = generateRandomContent();
    const qrURL = generateQR(content);
    const now = Date.now();

    const pending = readJson(pathPending, {});
    if (pending[senderID] && now < new Date(pending[senderID].expiresAt).getTime()) {
        return api.sendMessage(`⚠️ Bạn đang có giao dịch chờ!\nNội dung: ${pending[senderID].content}`, threadId, type);
    }

    // 🔧 FIX (Zalo): lưu thêm "type" cùng "threadId" vì api.sendMessage của Zalo cần cả 2
    // khi bot tự gửi thông báo (auto scan) sau này, không chỉ threadID như Facebook.
    pending[senderID] = {
        content,
        threadId,
        type,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + TIMEOUT_MS).toISOString()
    };
    writeJson(pathPending, pending);

    const body = `CỔNG THANH TOÁN TỰ ĐỘNG\n━━━━━━━━━━━━━━━━━━━━━━\n👤 ${userName}\n🏦 ${BANK_NAME}\n💳 ${STK}\n👤 ${ACCOUNT_NAME}\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ NỘI DUNG BẮT BUỘC:\n   ${content}\n━━━━━━━━━━━━━━━━━━━━━━\n💡 Chuyển bao nhiêu = cộng bấy nhiêu\n⏱️ Hiệu lực: 10 phút`;

    // 🔧 FIX (Zalo): tải QR về file cục bộ thay vì gửi thẳng stream URL (kiểu Facebook)
    let qrPath = null;
    try {
        qrPath = path.join(QR_DIR, `${content}.jpg`);
        await downloadQR(qrURL, qrPath);
    } catch (e) {
        console.error('[NAPLUOT] Tải QR lỗi:', e.message);
        qrPath = null;
    }

    return api.sendMessage(
        qrPath ? { msg: body, attachments: [qrPath] } : { msg: body },
        threadId,
        type
    );
};
const __legacyHandleEvent = async ({ api }) => {
    if (global.napluot_autoscan) return;
    global.napluot_autoscan = true;
    console.log(`[NAPLUOT] 🚀 Auto scan started - quét mỗi ${SCAN_MS / 1000}s`);

    const scan = async () => {
        try {
            const now = Date.now();
            let pending = readJson(pathPending, {});
            let dirty = false;

            // Xóa hết hạn
            for (const uid in pending) {
                if (now > new Date(pending[uid].expiresAt).getTime()) {
                    console.log(`[NAPLUOT] 🗑️ Hết hạn: ${pending[uid].content}`);
                    delete pending[uid];
                    dirty = true;
                }
            }
            if (dirty) writeJson(pathPending, pending);

            if (!Object.keys(pending).length) return;

            const res = await axios.get(`https://thueapibank.vn/historyapitpb/${TOKEN_TPB}`, { timeout: 15000 });
            const txList = res.data?.transactionInfos || [];

            const processed = readJson(PROCESSED_FILE, {});
            const history = readJson(pathHistory, {});
            const userTurns = readJson(USER_TURNS_FILE, {});
            const vohan = readJson(VOHAN_FILE, {});

            for (const uid in pending) {
                const p = pending[uid];
                if (now > new Date(p.expiresAt).getTime()) continue;

                const matched = txList.filter(t => {
                    const refNo = t.reference || t.id;
                    if (processed[refNo]) return false;

                    const desc = (t.description || '').toLowerCase().trim();
                    const contentLower = p.content.toLowerCase();

                    return t.creditDebitIndicator === 'CRDT' &&
                        (desc === contentLower || desc.includes(contentLower));
                });

                if (!matched.length) continue;

                let totalAmount = 0;
                let totalTurns = 0;

                for (const tx of matched) {
                    const amt = Number(tx.amount) || 0;
                    const turns = calcTurns(amt);
                    if (turns < 1) continue;

                    totalAmount += amt;
                    totalTurns += turns;

                    const refNo = tx.reference || tx.id;
                    processed[refNo] = true;

                    if (!history[uid]) history[uid] = [];
                    history[uid].push({
                        content: p.content,
                        amount: amt,
                        turns,
                        time: new Date().toISOString(),
                        refNo
                    });

                    console.log(`[NAPLUOT] ✅ THÀNH CÔNG | ${p.content} | ${amt.toLocaleString()}đ → +${turns} lượt`);
                }

                if (totalTurns > 0) {
                    userTurns[uid] = (userTurns[uid] || 0) + totalTurns;

                    const name = await getUserName(api, uid);
                    // 🔧 FIX (Zalo): dùng p.threadId (đã lưu lúc tạo GD) thay vì p.threadID (Facebook)
                    await updateNickname(api, p.threadId, uid, name, userTurns[uid], vohan);

                    // 🔧 FIX (Zalo): api.sendMessage cần cả threadId và type, không chỉ threadID
                    api.sendMessage(
                        `╭──────────────⭓\n` +
                        `│ ✅ NẠP LƯỢT THÀNH CÔNG\n` +
                        `├──────────────⭓\n` +
                        `│ 👤 ${name}\n` +
                        `│ 💵 ${totalAmount.toLocaleString()}đ → +${totalTurns} lượt\n` +
                        `│ 💰 Số dư: ${userTurns[uid]} lượt\n` +
                        `╰──────────────⭓`,
                        p.threadId,
                        p.type
                    );

                    delete pending[uid];
                    dirty = true;
                }
            }

            if (dirty) {
                writeJson(PROCESSED_FILE, processed);
                writeJson(USER_TURNS_FILE, userTurns);
                writeJson(pathHistory, history);
                writeJson(pathPending, pending);
            }

        } catch (e) {
            console.error('[NAPLUOT SCAN ERROR]', e.message);
        }
    };

    setInterval(scan, SCAN_MS);
    scan();
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, __legacyHandleEvent);
