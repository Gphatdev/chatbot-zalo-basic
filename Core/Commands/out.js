/**
 * [PORT TỪ NKNP] out.js
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

// plugins/commands/out.js
// Lệnh cho bot TỰ RỜI KHỎI NHÓM hiện tại khi gõ ".out".
//
// Cách dùng:
//   .out            -> bot gửi lời chào tạm biệt rồi rời nhóm ngay
//   .out xacnhan    -> (tuỳ chọn) bắt buộc gõ thêm "xacnhan" mới thực sự out,
//                      tránh trường hợp gõ nhầm/troll khiến bot rời nhóm oan.
//                      Có thể tắt yêu cầu này bằng cách đặt REQUIRE_CONFIRM = false.
//
// ⚠️ LƯU Ý QUAN TRỌNG:
// - role: 1 -> CHỈ admin bot / support mới được dùng lệnh này (tránh member
//   thường tự ý đá bot ra khỏi nhóm). Nếu muốn giới hạn chặt hơn (chỉ trưởng
//   nhóm/phó nhóm của CHÍNH nhóm đó, không phải admin bot toàn cục), có thể
//   bật kiểm tra isGroupAdmin() bên dưới (đã viết sẵn, đang comment).
// - api.leaveGroup(threadId) là tên hàm phổ biến trong zca-js để bot tự rời
//   nhóm, nhưng tuỳ phiên bản có thể khác chữ ký (vd cần thêm tham số thứ 2).
//   Nếu chạy lỗi ở dòng gọi hàm này, hãy đối chiếu lại
//   node_modules/zca-js/index.d.ts để sửa cho khớp bản bạn đang cài.
// - Sau khi bot đã rời nhóm, MỌI lệnh khác trong nhóm đó (bao gồm cả lời
//   chào tạm biệt) sẽ không gửi được nữa nếu gọi SAU leaveGroup, nên đoạn
//   gửi lời chào phải chạy TRƯỚC khi gọi leaveGroup.

const { ThreadType } = require("zca-js");

const DEBUG = false;
function dbg(...args) {
  if (!DEBUG) return;
  console.log("[out][DEBUG]", ...args);
}

// Đặt true nếu muốn bắt buộc gõ ".out xacnhan" mới thực sự rời nhóm
// (an toàn hơn, tránh out nhầm). Đặt false nếu muốn ".out" là out luôn.
const REQUIRE_CONFIRM = false;
const CONFIRM_WORD = "xacnhan";

const __legacyConfig = {
  name: "out",
  version: "1.0.0",
  role: 1, // chỉ admin bot / support mới được dùng lệnh này
  author: "ShinTHL09",
  description: "Bot tự động rời khỏi nhóm đang chat.",
  category: "Nhóm",
  usage: REQUIRE_CONFIRM ? "out xacnhan" : "out",
  cooldowns: 5,
};
const __legacyRun = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (type !== ThreadType.Group) {
    return api.sendMessage("🏠 Lệnh này chỉ có thể sử dụng trong nhóm.", threadId, type);
  }

  // --- (Tuỳ chọn) Chỉ trưởng/phó nhóm CỦA CHÍNH NHÓM ĐÓ mới được out bot ---
  // Bỏ comment đoạn dưới nếu muốn kiểm tra chặt hơn ngoài role admin bot:
  //
  // try {
  //   const info = await api.getGroupInfo(threadId);
  //   const groupInfo = info.gridInfoMap[threadId];
  //   const userId = event.data.uidFrom;
  //   const isCreator = groupInfo.creatorId === userId;
  //   const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(userId);
  //   if (!isCreator && !isDeputy) {
  //     return api.sendMessage("🚫 Chỉ trưởng/phó nhóm mới được dùng lệnh này.", threadId, type);
  //   }
  // } catch (e) {
  //   dbg("Lỗi kiểm tra quyền trưởng/phó nhóm:", e.message);
  // }

  if (REQUIRE_CONFIRM) {
    const confirm = (args[0] || "").toLowerCase();
    if (confirm !== CONFIRM_WORD) {
      return api.sendMessage(
        `⚠️ Bạn có chắc muốn bot rời khỏi nhóm này không?\nNhập ".out ${CONFIRM_WORD}" để xác nhận.`,
        threadId,
        type
      );
    }
  }

  // 1) Gửi lời chào tạm biệt TRƯỚC khi rời nhóm (phải gửi trước, vì sau khi
  //    leaveGroup thành công bot sẽ không còn gửi được tin nhắn vào nhóm này nữa).
  try {
    await api.sendMessage("👋 Bot xin phép rời khỏi nhóm. Hẹn gặp lại!", threadId, type);
  } catch (e) {
    dbg("Không gửi được lời chào tạm biệt:", e.message);
  }

  // 2) Rời nhóm
  try {
    await api.leaveGroup(threadId);
    dbg(`Đã rời nhóm threadId=${threadId} thành công.`);
  } catch (err) {
    console.error("[out] Lỗi khi rời nhóm:", err.message);
    // Nếu lỗi, cố gắng báo lại trong nhóm (nếu vẫn còn gửi được)
    try {
      await api.sendMessage(
        `❌ Rời nhóm thất bại: ${err.message}\n(Có thể do bot không đủ quyền hoặc chữ ký api.leaveGroup không khớp bản zca-js đang dùng.)`,
        threadId,
        type
      );
    } catch (_) {}
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
