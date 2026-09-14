const { createCanvas, loadImage } = require("canvas");

async function createLuffyImage({ title, roomType, subtitle, line1, line2, bankingInfo, imagePath }) {
  return createScrimImage({
    title,
    roomType,
    subtitle,
    line1,
    line2,
    bankingInfo,
    imagePath,
    accent: "#e63946",
    label: "LUFFY SCRIM",
  });
}

async function createScrimImage({ title, roomType, subtitle, line1, line2, bankingInfo, imagePath, accent, label }) {
  const width = 1600;
  const height = 900;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.fillStyle = "#111827";
  context.fillRect(0, 0, width, height);
  if (imagePath) {
    try {
      const background = await loadImage(imagePath);
      context.globalAlpha = 0.42;
      context.drawImage(background, 0, 0, width, height);
      context.globalAlpha = 1;
    } catch {
      // Background assets are optional; the generated card remains usable.
    }
  }

  context.fillStyle = "rgba(0, 0, 0, 0.62)";
  context.fillRect(70, 70, width - 140, height - 140);
  context.fillStyle = accent;
  context.fillRect(70, 70, 18, height - 140);
  context.fillStyle = "#ffffff";
  context.font = "bold 54px sans-serif";
  context.fillText(label, 130, 165);
  context.font = "bold 46px sans-serif";
  context.fillText(String(title || "BOX SCRIM"), 130, 255);
  context.font = "30px sans-serif";
  const rows = [roomType, subtitle, line1, line2, bankingInfo].filter(Boolean);
  rows.forEach((row, index) => context.fillText(String(row), 130, 340 + index * 70));
  context.font = "24px sans-serif";
  context.fillStyle = "#d1d5db";
  context.fillText("NKNP STUDIO", 130, 790);

  return canvas.toBuffer("image/png");
}

module.exports = createLuffyImage;
module.exports.createScrimImage = createScrimImage;
