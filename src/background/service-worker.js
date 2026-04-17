const YOUTUBE_URL_PATTERN = /^https:\/\/(www\.|m\.)?youtube\.com\//i;
const HEARTBEAT_ALARM = "YT_SKIPPER_HEARTBEAT";
const HEARTBEAT_MINUTES = 1;
const DEBUG = false;

function log(message, extra = null) {
  if (!DEBUG) return;
  if (extra) {
    console.log(`[YT Auto Skip] ${message}`, extra);
    return;
  }
  console.log(`[YT Auto Skip] ${message}`);
}

chrome.runtime.onInstalled.addListener(() => {
  log("Extension installed and active.");
  chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: HEARTBEAT_MINUTES
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: HEARTBEAT_MINUTES
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !YOUTUBE_URL_PATTERN.test(tab.url)) return;

  chrome.tabs.sendMessage(tabId, { type: "YT_SKIPPER_PING" }).catch(() => {
    // Content script may not be ready yet; this is non-fatal.
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;
  chrome.tabs.query({ url: ["*://www.youtube.com/*", "*://m.youtube.com/*"] }, (tabs) => {
    const err = chrome.runtime.lastError;
    if (err || !tabs?.length) return;
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "YT_SKIPPER_PING" }).catch(() => {
        // Page may not have content script yet.
      });
    }
  });
});

/**
 * MAIN world: only skip button inside the in-player ad module (avoids wrong global matches).
 * Uses elementsFromPoint to pick a pixel where the top hit belongs to the skip subtree
 * (avoids "hole" through transparent button hitting video → pause).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "YT_SKIP_CLICK_MAIN_WORLD") {
    return false;
  }

  const tabId = sender.tab?.id;
  if (tabId == null) {
    sendResponse({ ok: false, error: "no-tab" });
    return false;
  }

  const target = { tabId };
  if (typeof sender.frameId === "number") {
    target.frameIds = [sender.frameId];
  }

  chrome.scripting
    .executeScript({
      target,
      world: "MAIN",
      func: () => {
        function ready(btn) {
          if (!btn || btn.tagName !== "BUTTON") return false;
          const st = getComputedStyle(btn);
          if (st.display === "none" || st.pointerEvents === "none") return false;
          if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
          const op = parseFloat(st.opacity || "1");
          if (!Number.isNaN(op) && op < 0.88) return false;
          const r = btn.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }

        function findSkipButtonInAdModule() {
          const mod = document.querySelector(".video-ads.ytp-ad-module");
          if (!mod) return null;
          return (
            mod.querySelector(".ytp-skip-ad button.ytp-skip-ad-button") ||
            mod.querySelector(".ytp-ad-player-overlay-layout__skip-or-preview-container button.ytp-skip-ad-button") ||
            mod.querySelector("button.ytp-skip-ad-button") ||
            mod.querySelector("button.ytp-ad-skip-button") ||
            mod.querySelector("button.ytp-ad-skip-button-modern") ||
            null
          );
        }

        function pickLeafUnderPoint(btn) {
          const r = btn.getBoundingClientRect();
          const fracs = [
            [0.22, 0.52],
            [0.35, 0.5],
            [0.45, 0.55],
            [0.55, 0.48],
            [0.72, 0.52],
            [0.5, 0.35],
            [0.5, 0.72],
            [0.85, 0.45],
            [0.15, 0.45]
          ];
          for (const [fx, fy] of fracs) {
            const x = Math.floor(r.left + r.width * fx);
            const y = Math.floor(r.top + r.height * fy);
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const stack = document.elementsFromPoint(x, y);
            for (const el of stack) {
              if (el === btn || btn.contains(el)) {
                return { leaf: el, x, y };
              }
            }
          }
          return {
            leaf: btn,
            x: Math.floor(r.left + r.width * 0.45),
            y: Math.floor(r.top + r.height * 0.5)
          };
        }

        function fireUntrustedClick(el, x, y) {
          const init = {
            bubbles: false,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x + window.screenX,
            screenY: y + window.screenY,
            button: 0,
            buttons: 1
          };
          try {
            el.dispatchEvent(
              new PointerEvent("pointerdown", {
                ...init,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true
              })
            );
          } catch (_) {
            /* ignore */
          }
          el.dispatchEvent(new MouseEvent("mousedown", init));
          try {
            el.dispatchEvent(
              new PointerEvent("pointerup", {
                ...init,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true
              })
            );
          } catch (_) {
            /* ignore */
          }
          el.dispatchEvent(new MouseEvent("mouseup", init));
          el.dispatchEvent(new MouseEvent("click", init));
          if (typeof el.click === "function") el.click();
        }

        const btn = findSkipButtonInAdModule();
        if (!btn || !ready(btn)) return { ok: false, reason: "no-ready-btn" };

        const { leaf, x, y } = pickLeafUnderPoint(btn);
        fireUntrustedClick(leaf, x, y);
        if (leaf !== btn && typeof btn.click === "function") btn.click();

        return { ok: true, mode: "scoped-ad-module" };
      }
    })
    .then((results) => {
      const r = results?.[0]?.result;
      sendResponse(r && typeof r === "object" ? r : { ok: false });
    })
    .catch((e) => {
      sendResponse({
        ok: false,
        error: String(e?.message ?? e)
      });
    });

  return true;
});

function executeScriptAsync(options) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(options, (results) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(results || []);
    });
  });
}

function debuggerAttachAsync(target, version = "1.3") {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, version, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function debuggerDetachAsync(target) {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => resolve());
  });
}

function debuggerSendAsync(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result);
    });
  });
}

async function getSkipButtonPoint(tabId, frameId) {
  const target = { tabId };
  if (typeof frameId === "number") {
    target.frameIds = [frameId];
  }

  const results = await executeScriptAsync({
    target,
    world: "MAIN",
    func: () => {
      const mod = document.querySelector(".video-ads.ytp-ad-module");
      if (!mod) return { ok: false, reason: "no-ad-module" };

      const btn =
        mod.querySelector(".ytp-skip-ad button.ytp-skip-ad-button") ||
        mod.querySelector(".ytp-ad-player-overlay-layout__skip-or-preview-container button.ytp-skip-ad-button") ||
        mod.querySelector("button.ytp-skip-ad-button") ||
        mod.querySelector("button.ytp-ad-skip-button") ||
        mod.querySelector("button.ytp-ad-skip-button-modern");

      if (!btn) return { ok: false, reason: "no-button" };

      const st = getComputedStyle(btn);
      if (st.display === "none" || st.visibility === "hidden" || st.pointerEvents === "none") {
        return { ok: false, reason: "hidden" };
      }
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") {
        return { ok: false, reason: "disabled" };
      }
      const op = parseFloat(st.opacity || "1");
      if (!Number.isNaN(op) && op < 0.88) {
        return { ok: false, reason: "opacity-low" };
      }

      const rect = btn.getBoundingClientRect();
      const x = Math.floor(rect.left + rect.width * 0.45);
      const y = Math.floor(rect.top + rect.height * 0.5);
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
        return { ok: false, reason: "point-outside" };
      }
      return { ok: true, x, y };
    }
  });

  return results?.[0]?.result || { ok: false, reason: "script-no-result" };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "YT_SKIP_CLICK_TRUSTED_DEBUGGER") {
    return false;
  }

  const tabId = sender.tab?.id;
  if (tabId == null) {
    sendResponse({ ok: false, reason: "no-tab" });
    return false;
  }

  const frameId = sender.frameId;
  const debugTarget = { tabId };

  (async () => {
    const point = await getSkipButtonPoint(tabId, frameId);
    if (!point.ok) return point;

    let attached = false;
    try {
      await debuggerAttachAsync(debugTarget);
      attached = true;
      await debuggerSendAsync(debugTarget, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
        button: "none"
      });
      await debuggerSendAsync(debugTarget, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: point.x,
        y: point.y,
        button: "left",
        clickCount: 1
      });
      await debuggerSendAsync(debugTarget, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: point.x,
        y: point.y,
        button: "left",
        clickCount: 1
      });
      return { ok: true, mode: "debugger-input" };
    } finally {
      if (attached) {
        await debuggerDetachAsync(debugTarget);
      }
    }
  })()
    .then((result) => sendResponse(result || { ok: false, reason: "unknown" }))
    .catch((error) => {
      sendResponse({
        ok: false,
        reason: String(error?.message ?? error)
      });
    });

  return true;
});
