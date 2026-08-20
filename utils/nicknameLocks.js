"use strict";

const logger = require("./logger");

// Map<threadID, Map<userID, nickname>>
const lockedNicknames = new Map();

let _apiRef         = null;
let _enforceTimer   = null;
let _enforcing      = false;

const ENFORCE_INTERVAL = 90_000;  // run enforce every 90 s (was 60 s)
const CALL_DELAY_MS    = 800;     // 800 ms between individual API calls (rate-limit safety)

function setApi(api) {
  _apiRef = api;
  if (!_enforceTimer) {
    _enforceTimer = setInterval(_enforce, ENFORCE_INTERVAL);
    _enforceTimer.unref();
  }
}

async function _enforce() {
  if (!_apiRef || lockedNicknames.size === 0 || _enforcing) return;
  _enforcing = true;
  try {
    for (const [threadID, members] of lockedNicknames.entries()) {
      for (const [userID, nickname] of members.entries()) {
        try {
          // nkxfca uses changeNickname; some forks use nickname — try both
          if (typeof _apiRef.changeNickname === "function") {
            await _apiRef.changeNickname(nickname, threadID, userID);
          } else if (typeof _apiRef.nickname === "function") {
            await _apiRef.nickname(nickname, threadID, userID);
          }
        } catch (e) {
          logger.debug("NickLock", `Re-enforce failed [${threadID}/${userID}]: ${e.message}`);
        }
        // Throttle API calls to avoid hitting Facebook rate limits
        await new Promise(r => setTimeout(r, CALL_DELAY_MS));
      }
    }
  } finally {
    _enforcing = false;
  }
}

module.exports = { lockedNicknames, setApi };
