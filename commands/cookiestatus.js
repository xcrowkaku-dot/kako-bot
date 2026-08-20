"use strict";

const cookieRefresher = require("../utils/cookieRefresher");

module.exports = {
  name: "cookiestatus",
  aliases: ["cookies", "cs"],
  description: "عرض حالة نظام تجديد الكوكيز التلقائي.",
  usage: "cookiestatus",
  category: "Admin",
  adminOnly: true,

  execute({ api, event }) {
    const { threadID } = event;
    const s = cookieRefresher.status();

    const statusIcon = s.active ? "🟢" : "🔴";
    const lastPush   = s.lastPushAt
      ? _timeAgo(s.lastPushAt)
      : "لم يتم الرفع بعد";

    const uptime = s.uptimeSec
      ? _fmt(s.uptimeSec)
      : "—";

    const msg = [
      "━━━━━━━━━━━━━━━━━━━━━",
      "🍪  نظام تجديد الكوكيز",
      "━━━━━━━━━━━━━━━━━━━━━",
      statusIcon + " الحالة      : " + (s.active ? "نشط" : "متوقف"),
      "⏱ كل           : " + s.intervalMinutes + " دقائق",
      "⬆️ مرات الرفع  : " + s.pushCount,
      "⏭ مرات التخطي : " + s.skipCount + " (لم تتغير)",
      "❌ الأخطاء     : " + s.errorCount,
      "🕐 آخر رفع     : " + lastPush,
      "🔁 وقت التشغيل : " + uptime,
      "━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n");

    api.sendMessage(msg, threadID);
  },
};

function _timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)  return "منذ " + sec + " ثانية";
  if (sec < 3600) return "منذ " + Math.floor(sec / 60) + " دقيقة";
  return "منذ " + Math.floor(sec / 3600) + " ساعة";
}

function _fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? h + "س " : "") + (m ? m + "د " : "") + s + "ث";
}
