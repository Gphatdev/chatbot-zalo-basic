import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "Data", "help-cache");
const CACHE_VERSION = "5";
const WIDTH = 2400;
const COLORS = {
  background: "#0b1020",
  panel: "#121a2e",
  panelAlt: "#17223b",
  border: "#263756",
  primary: "#62e6ff",
  secondary: "#ffbd69",
  text: "#f4f7fb",
  muted: "#9eacc4",
  success: "#6ee7b7",
};

let canvasModulePromise;

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function getCanvasModule() {
  canvasModulePromise ||= import("canvas");
  return canvasModulePromise;
}

function commandFingerprint(commands, prefix) {
  const values = [...commands.values()]
    .map((command) => ({
      name: command.name,
      description: command.description || "",
      group: command.group || "general",
      role: command.role || 0,
      cooldown: command.cooldown || 0,
      aliases: command.aliases || [],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return crypto
    .createHash("sha1")
    .update(JSON.stringify({ version: CACHE_VERSION, prefix, values }))
    .digest("hex")
    .slice(0, 16);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBackground(ctx, width, height) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(98, 230, 255, 0.12)");
  gradient.addColorStop(0.5, "rgba(11, 16, 32, 0)");
  gradient.addColorStop(1, "rgba(255, 189, 105, 0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawHeader(ctx, width, title, subtitle, height = 210) {
  roundRect(ctx, 55, 45, width - 110, height, 24, COLORS.panel, COLORS.border);
  ctx.fillStyle = COLORS.primary;
  ctx.fillRect(55, 45, 14, height);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 30px sans-serif";
  ctx.fillStyle = COLORS.secondary;
  ctx.fillText("NKNP STUDIO  /  COMMAND CENTER", 105, 105);
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = COLORS.text;
  ctx.fillText(title, 105, 175);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(subtitle, 105, 220);
}

function fitText(ctx, value, maxWidth) {
  const text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 0 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function groupCommands(commands) {
  const groups = new Map();
  for (const command of commands.values()) {
    const group = command.group || "general";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(command);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, items]) => [name, items.sort((left, right) => left.name.localeCompare(right.name))]);
}

function roleLabel(role) {
  if (role >= 2) return "BOT ADMIN";
  if (role === 1) return "GROUP ADMIN";
  return "MEMBER";
}

async function renderToCache(cacheName, draw) {
  ensureCacheDir();
  const outputPath = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(outputPath)) return outputPath;

  const { createCanvas } = await getCanvasModule();
  const { canvas, width, height } = draw(createCanvas);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

async function renderHelpImage({ botName, prefix, commands }) {
  const fingerprint = commandFingerprint(commands, prefix);
  const items = [...commands.values()].sort((left, right) => {
    const groupOrder = (left.group || "general").localeCompare(right.group || "general");
    return groupOrder || left.name.localeCompare(right.name);
  });
  const cardWidth = 545;
  const cardHeight = 112;
  const columnGap = 35;
  const startX = 65;
  const headerHeight = 360;
  const rowHeight = 145;
  const rows = Math.ceil(items.length / 4);
  const height = headerHeight + rows * rowHeight + 100;

  return renderToCache(`help-main-${fingerprint}.png`, (createCanvas) => {
    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx, WIDTH, height);
    ctx.strokeStyle = "#20243a";
    ctx.lineWidth = 7;
    ctx.strokeRect(30, 30, WIDTH - 60, height - 60);
    ctx.strokeStyle = "#ff3d81";
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 45, WIDTH - 90, height - 90);

    ctx.fillStyle = "#111526";
    ctx.fillRect(70, 62, WIDTH - 140, 112);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "bold 40px monospace";
    ctx.fillStyle = "#53f59d";
    ctx.fillText("SYSTEM: ONLINE", 110, 118);
    ctx.fillStyle = "#ffea61";
    ctx.fillText(`PREFIX: ${prefix}`, 650, 118);
    ctx.fillStyle = "#c56cff";
    ctx.fillText("CORE: NKNP V3", 1120, 118);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff3d81";
    ctx.fillText(`${commands.size} COMMANDS`, WIDTH - 110, 118);

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 78px sans-serif";
    ctx.fillText(`${botName} HELP CORE`, WIDTH / 2, 260);

    items.forEach((command, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = startX + column * (cardWidth + columnGap);
      const y = headerHeight + row * rowHeight;
      const centerY = y + cardHeight / 2;
      const number = `${String(index + 1).padStart(2, "0")}.`;

      roundRect(ctx, x, y, cardWidth, cardHeight, 16, "#111526", "#29355b");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 42px monospace";
      ctx.fillStyle = "#ff3d81";
      ctx.fillText(number, x + 25, centerY - 15);
      const numberWidth = ctx.measureText(number).width;

      ctx.font = "bold 37px sans-serif";
      ctx.fillStyle = COLORS.primary;
      ctx.fillText(`${prefix}${command.name}`, x + 38 + numberWidth, centerY - 16);
      ctx.font = "20px sans-serif";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(fitText(ctx, command.description || "Chưa có mô tả", 440), x + 38 + numberWidth, centerY + 25);
      ctx.textAlign = "right";
      ctx.font = "bold 17px sans-serif";
      ctx.fillStyle = command.role >= 1 ? COLORS.secondary : COLORS.success;
      ctx.fillText(roleLabel(command.role), x + cardWidth - 22, y + 25);
    });

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "22px sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Dùng ${prefix}help <tên lệnh> để xem thông tin chi tiết`, 80, height - 45);
    return { canvas, width: WIDTH, height };
  });
}

async function renderHelpDetail({ botName, prefix, command }) {
  const fingerprint = crypto
    .createHash("sha1")
    .update(JSON.stringify({ version: CACHE_VERSION, command }))
    .digest("hex")
    .slice(0, 16);
  const aliases = command.aliases?.length ? command.aliases.join(", ") : "Không có";
  const rows = [
    ["COMMAND", `${prefix}${command.name}`],
    ["MÔ TẢ", command.description || "Chưa có mô tả"],
    ["NHÓM", command.group || "general"],
    ["ALIAS", aliases],
    ["QUYỀN", roleLabel(command.role)],
    ["COOLDOWN", `${command.cooldown || 0} giây`],
  ];

  return renderToCache(`help-detail-${command.name}-${fingerprint}.png`, (createCanvas) => {
    const width = 1600;
    const height = 860;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx, width, height);
    drawHeader(ctx, width, `${prefix}${command.name}`, `${botName}  •  Chi tiết command`, 190);

    let y = 285;
    for (const [label, value] of rows) {
      roundRect(ctx, 80, y, 330, 68, 14, "#1a2742", COLORS.border);
      roundRect(ctx, 440, y, 1080, 68, 14, COLORS.panel, COLORS.border);
      ctx.font = "bold 24px sans-serif";
      ctx.fillStyle = COLORS.secondary;
      ctx.fillText(label, 110, y + 43);
      ctx.font = "26px sans-serif";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(fitText(ctx, value, 1020), 475, y + 43);
      y += 78;
    }

    ctx.font = "22px sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Dùng ${prefix}help để quay lại danh sách command`, 80, height - 42);
    return { canvas, width, height };
  });
}

async function renderAntiImage({ botName, prefix, settings }) {
  const state = [
    settings.spamEnabled ? "on" : "off",
    settings.linkEnabled ? "on" : "off",
    settings.tagallEnabled ? "on" : "off",
    settings.qrEnabled ? "on" : "off",
  ].join("-");
  const cacheName = `anti-main-${CACHE_VERSION}-${state}.png`;

  return renderToCache(cacheName, (createCanvas) => {
    const width = 1800;
    const height = 980;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx, width, height);

    ctx.strokeStyle = "#20243a";
    ctx.lineWidth = 7;
    ctx.strokeRect(30, 30, width - 60, height - 60);
    ctx.strokeStyle = "#ff3d81";
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 45, width - 90, height - 90);

    ctx.fillStyle = "#111526";
    ctx.fillRect(70, 65, width - 140, 105);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "bold 34px monospace";
    ctx.fillStyle = "#53f59d";
    ctx.fillText("SYSTEM: ONLINE", 110, 118);
    ctx.fillStyle = "#c56cff";
    ctx.fillText("CORE: NKNP ANTI", 620, 118);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff3d81";
    ctx.fillText("GROUP SECURITY", width - 110, 118);

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 68px sans-serif";
    ctx.fillText("HỆ THỐNG ANTI NKNP", width / 2, 250);
    ctx.font = "26px sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Prefix: ${prefix}  •  Reply số để xem hướng dẫn tính năng`, width / 2, 305);

    const cards = [
      ["01", "AntiSpam", settings.spamEnabled],
      ["02", "AntiLink", settings.linkEnabled],
      ["03", "AntiTagAll", settings.tagallEnabled],
      ["04", "AntiQR", settings.qrEnabled],
      ["05", "Trạng thái", null],
    ];
    cards.forEach(([number, title, enabled], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 100 + column * 810;
      const y = 365 + row * 150;
      roundRect(ctx, x, y, 760, 112, 18, "#111526", "#29355b");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 40px monospace";
      ctx.fillStyle = "#ff3d81";
      ctx.fillText(`${number}.`, x + 28, y + 55);
      ctx.font = "bold 34px sans-serif";
      ctx.fillStyle = COLORS.primary;
      ctx.fillText(title, x + 100, y + 45);
      ctx.font = "22px sans-serif";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(enabled === null ? "Xem cấu hình hiện tại" : "ĐANG " + (enabled ? "BẬT" : "TẮT"), x + 100, y + 82);
    });

    return { canvas, width, height };
  });
}

export { renderHelpImage, renderHelpDetail, renderAntiImage };
