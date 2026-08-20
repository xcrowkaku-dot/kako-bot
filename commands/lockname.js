"use strict";

const { lockedNames } = require("../utils/lockedNames");
const { groupsCache }  = require("../state");

module.exports = {
  name: "lockname",
  aliases: ["lname", "namelock"],
  description: "قفل اسم المجموعة ومنع أي شخص من تغييره.",
  usage: "lockname [اسم اختياري]  |  lockname off",
  category: "Admin",
  adminOnly: true,
  groupOnly: true,

  async execute({ api, event, args }) {
    const { threadID } = event;
    const arg = args.join(" ").trim();

    // ── رفع القفل ─────────────────────────────────────────────────────────
    if (arg.toLowerCase() === "off" || arg === "نزع") {
      if (!lockedNames.has(threadID)) {
        return api.sendMessage("ℹ️ اسم المجموعة غير مقفل أصلاً.", threadID);
      }
      lockedNames.delete(threadID);
      return api.sendMessage("🔓 تم نزع قفل الاسم.\nيمكن الآن تغيير اسم المجموعة بحرية.", threadID);
    }

    // ── تحديد الاسم المراد قفله ───────────────────────────────────────────
    let nameToLock = arg;

    if (!nameToLock) {
      try {
        const info = await api.getThreadInfo(threadID);
        nameToLock = info.name || "";
        if (info.name) {
          const c = groupsCache.get(threadID) || {};
          groupsCache.set(threadID, { ...c, name: info.name });
        }
      } catch (e) {
        return api.sendMessage("❌ تعذّر جلب اسم المجموعة.\n" + e.message, threadID);
      }
    }

    if (!nameToLock) {
      return api.sendMessage(
        "❌ لم أتمكن من تحديد الاسم.\n" +
        "الاستخدام:\n" +
        "  -lockname         ← قفل الاسم الحالي\n" +
        "  -lockname [اسم]  ← تعيين اسم جديد وقفله\n" +
        "  -lockname off     ← نزع القفل",
        threadID
      );
    }

    // تغيير الاسم إذا طُلب ذلك صراحةً
    if (arg) {
      try {
        await api.gcname(nameToLock, threadID);
        const c = groupsCache.get(threadID) || {};
        groupsCache.set(threadID, { ...c, name: nameToLock });
      } catch (e) {
        return api.sendMessage(
          "❌ فشل تعيين الاسم. تأكد أن البوت مشرف.\n" + e.message,
          threadID
        );
      }
    }

    lockedNames.set(threadID, nameToLock);

    return api.sendMessage(
      "🏷️ تم قفل اسم المجموعة على:\n" +
      "«" + nameToLock + "»\n\n" +
      "أي محاولة لتغيير الاسم ستُلغى تلقائياً.\n" +
      "لنزع القفل: -lockname off",
      threadID
    );
  },
};
