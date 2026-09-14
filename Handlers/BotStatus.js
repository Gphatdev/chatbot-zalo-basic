import os from "node:os";

const START_TIME = Date.now();

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h} giờ ${m} phút ${s} giây`;
}

function formatDate(d) {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const dayName = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dayName}, ${dd}/${mm}/${yyyy}`;
}

function formatTime(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh} giờ ${mi} phút ${ss} giây`;
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * Trả về object chứa toàn bộ thông tin trạng thái bot.
 */
function getBotStatus({ botName = "NKNP V3 BOT", commandCount = 0 } = {}) {
  const now = new Date();
  const uptimeMs = Date.now() - START_TIME;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = ((usedMem / totalMem) * 100).toFixed(1);

  const botRamMB = formatMB(process.memoryUsage().rss);

  return {
    botName,
    uptimeText: formatUptime(uptimeMs),
    dateText: formatDate(now),
    timeText: formatTime(now),
    hostname: os.hostname(),
    platform: process.platform,
    botRamMB,
    usedMemMB: formatMB(usedMem),
    totalMemMB: formatMB(totalMem),
    memPercent,
    cpuCount: os.cpus().length,
    commandCount,
  };
}

/**
 * Trả về chuỗi text định dạng sẵn giống mẫu ảnh gửi kèm.
 */
function formatBotStatusText(status) {
  return (
    `✨ ${status.botName} ✨\n\n` +
    `🟢 Trạng thái: Đang hoạt động\n` +
    `⏱️ Uptime: ${status.uptimeText}\n` +
    `📅 Hôm nay: ${status.dateText}\n` +
    `🕐 Giờ: ${status.timeText}\n\n` +
    `💻 Server: ${status.hostname}(${status.platform})\n` +
    `📱 RAM Bot: ${status.botRamMB} MB\n` +
    `📊 RAM Hệ thống: ${status.usedMemMB} MB / ${status.totalMemMB} MB (${status.memPercent}%)\n` +
    `⚙️ CPU: ${status.cpuCount} lõi\n` +
    `📦 Lệnh đã tải: ${status.commandCount}\n\n` +
    `💬 Gõ "!menu" để xem danh sách lệnh`
  );
}

export { getBotStatus, formatBotStatusText };