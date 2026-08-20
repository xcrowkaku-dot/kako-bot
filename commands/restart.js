"use strict";

const fs     = require("fs");
const path   = require("path");
const config = require("../config.json");

const APP_STATE_PATH = path.resolve(__dirname, "..", config.appStatePath);

module.exports = {
  name: "restart",
  aliases: ["reboot", "rs"],
  description: "حفظ الكوكيز وإعادة تشغيل البوت.",
  usage: "restart",
  category: "Admin",
  adminOnly: true,

  async execute({ api, event }) {
    const { threadID } = event;

    await api.sendMessage(
      "🔄 جارٍ حفظ الجلسة وإعادة التشغيل...\nسيعود البوت خلال ثوانٍ.",
      threadID
    ).catch(() => {});

    try {
      const state = api.getAppState();
      if (Array.isArray(state) && state.length > 0) {
        fs.writeFileSync(APP_STATE_PATH, JSON.stringify(state, null, 2));
      }
    } catch {}

    // Railway restarts the process automatically on exit
    setTimeout(() => process.exit(0), 1500);
  },
};
