/**
 * Utils/LegacyLogger.cjs
 * Logger tối giản dùng nội bộ bởi các command "di sản" (port từ NKNP) — giữ
 * cùng chữ ký log(data, option) như bản gốc để code các command không cần sửa.
 */
function ts() {
  return `[${new Date().toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" })}]`;
}
function log(data, option) {
  const prefix = `${ts()} [NKNP-LEGACY]`;
  if (option === "error") console.error(`${prefix} ✖`, data);
  else if (option === "warn") console.warn(`${prefix} ▲`, data);
  else console.log(`${prefix} ℹ`, data);
}
module.exports = { log };
