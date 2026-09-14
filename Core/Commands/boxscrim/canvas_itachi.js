const { createScrimImage } = require("./canvas_luffy.js");

async function createItachiImage(data) {
  return createScrimImage({
    ...data,
    accent: "#8b5cf6",
    label: "ITACHI SCRIM",
  });
}

module.exports = createItachiImage;
