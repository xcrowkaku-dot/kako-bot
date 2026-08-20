"use strict";

const config = require("../config.json");

module.exports = {
  name: "help",
  aliases: ["h", "cmds", "commands"],
  description: "عرض قائمة جميع الأوامر أو تفاصيل أمر معين.",
  usage: "help [command]",
  category: "General",

  async execute({ api, event, args, commands }) {
    const prefix = config.prefix;

    // ── تفاصيل أمر واحد ────────────────────────────────────────────────────
    if (args[0]) {
      const name = args[0].toLowerCase().replace(/^-+/, "");
      const cmd  = commands.get(name) ||
        [...new Set(commands.values())].find(c => c.aliases?.includes(name));
      if (!cmd) {
        return api.sendMessage(`❌ الأمر "${name}" غير موجود.`, event.threadID);
      }
      const lines = [
        `📖 الأمر     : ${prefix}${cmd.name}`,
        `📝 الوصف     : ${cmd.description}`,
        `🏷️ الفئة     : ${cmd.category || "General"}`,
        `📌 الاستخدام : ${prefix}${cmd.usage || cmd.name}`,
      ];
      if (cmd.aliases?.length) {
        lines.push(`🔁 الاختصارات: ${cmd.aliases.map(a => prefix + a).join("  ")}`);
      }
      if (cmd.adminOnly)  lines.push(`🔒 يتطلب صلاحية مشرف`);
      if (cmd.groupOnly)  lines.push(`👥 للمجموعات فقط`);
      return api.sendMessage(lines.join("\n"), event.threadID);
    }

    // ── قائمة كل الأوامر (بدون تكرار) ────────────────────────────────────
    const unique     = [...new Set(commands.values())];
    const categories = {};

    for (const cmd of unique) {
      const cat = cmd.category || "General";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(cmd.name);
    }

    // ترتيب الفئات
    const ORDER = ["General", "Utility", "Admin"];
    const sorted = [
      ...ORDER.filter(c => categories[c]),
      ...Object.keys(categories).filter(c => !ORDER.includes(c)),
    ];

    const ICONS = {
      General  : "🔹",
      Info     : "🔹",
      Utility  : "🔧",
      Group    : "🔸",
      Fun      : "🎮",
    };

    let msg = `┌──── 🤖 ${config.bot.name} Commands ────\n│\n`;

    for (const cat of sorted) {
      const cmds = categories[cat].map(n => `${prefix}${n}`);
      const icon = ICONS[cat] || "▪️";
      msg += `│ ${icon} 【${cat}】\n`;
      // كل أمر في سطر منفصل لسهولة القراءة
      for (const c of cmds) {
        msg += `│    ${c}\n`;
      }
      msg += `│\n`;
    }

    msg += `└─ اكتب ${prefix}help <أمر> لتفاصيل أي أمر`;

    api.sendMessage(msg, event.threadID);
  },
};
