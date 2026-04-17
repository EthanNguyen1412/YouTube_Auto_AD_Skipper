(function () {
  function getRuntimeIdSafe() {
    try {
      return chrome.runtime?.id ?? "";
    } catch (_) {
      return "";
    }
  }

  function extensionAlive() {
    return getRuntimeIdSafe().length > 0;
  }

  let observer = null;
  let pollTimer = null;
  let waitTimer = null;
  let waitingSince = 0;
  let skipAttemptedForCurrentAd = false;
  let verifyTimer = null;
  let watchdogNoSkipLogged = false;
  let nextAllowedSkipAt = 0;
  let onVisibilitySkip = null;
  let onNavigateFinish = null;
  let runtimeMessageListener = null;

  function tearDown() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (onVisibilitySkip) {
      document.removeEventListener("visibilitychange", onVisibilitySkip, true);
      onVisibilitySkip = null;
    }
    if (onNavigateFinish) {
      window.removeEventListener("yt-navigate-finish", onNavigateFinish);
      onNavigateFinish = null;
    }
    if (runtimeMessageListener) {
      try {
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      } catch (_) {
        /* ignore */
      }
      runtimeMessageListener = null;
    }
    clearWaitTimer();
    clearVerifyTimer();
    if (typeof window.__YT_SKIPPER_DESTROY === "function" && window.__YT_SKIPPER_DESTROY === tearDown) {
      window.__YT_SKIPPER_DESTROY = null;
    }
    window.__YT_SKIPPER_RUNTIME_ID = null;
  }

  if (typeof window.__YT_SKIPPER_DESTROY === "function") {
    try {
      window.__YT_SKIPPER_DESTROY();
    } catch (_) {
      /* ignore */
    }
  }

  const RUNTIME_ID = getRuntimeIdSafe();
  window.__YT_SKIPPER_RUNTIME_ID = RUNTIME_ID;
  window.__YT_SKIPPER_DESTROY = tearDown;

  const SKIP_BUTTON_SELECTORS = [
    "button.ytp-skip-ad-button",
    "button.ytp-ad-skip-button",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container",
    "button[aria-label*='Skip' i]",
    "button[aria-label*='Bỏ qua' i]"
  ];

  const POLL_INTERVAL_MS = 500;
  const MAX_SKIP_WAIT_MS = 30000;
  const VERIFY_SKIP_MS = 1600;
  const SKIP_FAIL_COOLDOWN_MS = 2200;
  const DEBUG = false;

  const domUtils = window.YTSkipperDom || {};
  const {
    isAdPlaying,
    isYtSkipButtonReady,
    isMostlyInViewport,
    performFullSkipAttempt,
    querySelectorAllDeep
  } = domUtils;

  function log(message, extra = null) {
    if (!DEBUG) return;
    if (extra) {
      console.log(`[YT Auto Skip] ${message}`, extra);
      return;
    }
    console.log(`[YT Auto Skip] ${message}`);
  }

  function clearVerifyTimer() {
    if (!verifyTimer) return;
    clearTimeout(verifyTimer);
    verifyTimer = null;
  }

  function resetAdState() {
    skipAttemptedForCurrentAd = false;
    waitingSince = 0;
    watchdogNoSkipLogged = false;
    nextAllowedSkipAt = 0;
    clearWaitTimer();
    clearVerifyTimer();
  }

  function clearWaitTimer() {
    if (!waitTimer) return;
    clearTimeout(waitTimer);
    waitTimer = null;
  }

  function collectSkipCandidates() {
    const seen = new Set();
    const list = [];

    function addAll(nodes) {
      nodes.forEach((el) => {
        if (el && !seen.has(el)) {
          seen.add(el);
          list.push(el);
        }
      });
    }

    const adModule = document.querySelector(".video-ads.ytp-ad-module");
    if (adModule) {
      const scoped = [
        ".ytp-skip-ad button.ytp-skip-ad-button",
        ".ytp-ad-player-overlay-layout__skip-or-preview-container button.ytp-skip-ad-button",
        "button.ytp-skip-ad-button",
        "button.ytp-ad-skip-button",
        "button.ytp-ad-skip-button-modern"
      ];
      for (const sel of scoped) {
        try {
          addAll(adModule.querySelectorAll(sel));
        } catch (_) {
          /* ignore */
        }
      }
    }

    for (const sel of SKIP_BUTTON_SELECTORS) {
      try {
        addAll(document.querySelectorAll(sel));
      } catch (_) {
        /* ignore */
      }
    }

    const movie = document.getElementById("movie_player");
    if (movie && querySelectorAllDeep) {
      for (const sel of SKIP_BUTTON_SELECTORS) {
        const deep = [];
        querySelectorAllDeep(movie, sel, deep);
        addAll(deep);
      }
    }

    return list;
  }

  function findBestSkipButton() {
    const candidates = collectSkipCandidates();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const viewArea = vw * vh;

    let best = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      const btn = el.tagName === "BUTTON" ? el : el.closest?.("button");
      if (!btn || !isYtSkipButtonReady(btn)) continue;
      if (!isMostlyInViewport(btn)) continue;

      const r = btn.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > viewArea * 0.35) continue;
      if (r.width < 36 || r.height < 14) continue;
      if (r.width > 520 || r.height > 180) continue;

      const score = area;
      if (score < bestScore) {
        bestScore = score;
        best = btn;
      }
    }

    return best;
  }

  function scheduleSkipVerify() {
    clearVerifyTimer();
    verifyTimer = setTimeout(() => {
      verifyTimer = null;
      if (!extensionAlive()) {
        tearDown();
        return;
      }
      const still = findBestSkipButton();
      const adOn = isAdPlaying();
      if (adOn && still && isYtSkipButtonReady(still)) {
        skipAttemptedForCurrentAd = false;
        nextAllowedSkipAt = Date.now() + SKIP_FAIL_COOLDOWN_MS;
        log("Skip still present after attempt; cooldown then retry.");
      }
    }, VERIFY_SKIP_MS);
  }

  function trySkipAd() {
    if (!extensionAlive()) {
      tearDown();
      return;
    }

    if (Date.now() < nextAllowedSkipAt) return;

    const skipButton = findBestSkipButton();
    const adPlaying = isAdPlaying();

    if (!skipButton) {
      if (!adPlaying) {
        resetAdState();
        return;
      }

      if (!waitingSince) {
        waitingSince = Date.now();
        scheduleWatchdog();
      }
      return;
    }

    if (!isYtSkipButtonReady(skipButton)) {
      return;
    }

    if (skipAttemptedForCurrentAd) return;

    skipAttemptedForCurrentAd = true;
    waitingSince = 0;
    clearWaitTimer();

    try {
      chrome.runtime.sendMessage({ type: "YT_SKIP_CLICK_MAIN_WORLD" }, (mainResult) => {
        try {
          if (!extensionAlive()) {
            tearDown();
            return;
          }
          const lastErr = chrome.runtime.lastError;
          const mainOk = !lastErr && mainResult && mainResult.ok === true;
          const isolatedOk = performFullSkipAttempt(skipButton);

          chrome.runtime.sendMessage({ type: "YT_SKIP_CLICK_TRUSTED_DEBUGGER" }, (dbgResult) => {
            const dbgErr = chrome.runtime.lastError;
            const dbgOk = !dbgErr && dbgResult && dbgResult.ok === true;
            const ver =
              typeof chrome !== "undefined" && chrome.runtime?.getManifest
                ? chrome.runtime.getManifest().version
                : "?";
            const mainDetail = mainOk
              ? "yes" + (mainResult.mode ? ":" + mainResult.mode : "")
              : "no" + (mainResult?.reason ? ":" + mainResult.reason : "");
            const dbgDetail = dbgOk
              ? "yes" + (dbgResult.mode ? ":" + dbgResult.mode : "")
              : "no" + (dbgResult?.reason ? ":" + dbgResult.reason : "");

            log(
              `[ext ${ver}] MAIN=${mainDetail}${lastErr ? " (" + lastErr.message + ")" : ""} | isolated=${isolatedOk} | debugger=${dbgDetail}${dbgErr ? " (" + dbgErr.message + ")" : ""}`
            );
            scheduleSkipVerify();
          });
        } catch (_) {
          tearDown();
        }
      });
    } catch (_) {
      skipAttemptedForCurrentAd = false;
      tearDown();
    }
  }

  function scheduleWatchdog() {
    clearWaitTimer();
    waitTimer = setTimeout(() => {
      waitTimer = null;
      if (!extensionAlive()) {
        tearDown();
        return;
      }
      if (!isAdPlaying()) {
        resetAdState();
        return;
      }

      const elapsed = Date.now() - waitingSince;
      if (elapsed >= MAX_SKIP_WAIT_MS) {
        if (!watchdogNoSkipLogged) {
          watchdogNoSkipLogged = true;
          log("No skip control yet (non-skippable ad or UI still loading).");
        }
        waitingSince = Date.now();
      }

      scheduleWatchdog();
    }, 1000);
  }

  function startMonitoring() {
    if (pollTimer) return;

    pollTimer = setInterval(trySkipAd, POLL_INTERVAL_MS);
    observer = new MutationObserver(() => {
      try {
        trySkipAd();
      } catch (_) {
        tearDown();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden", "disabled"]
    });

    onVisibilitySkip = () => {
      try {
        trySkipAd();
      } catch (_) {
        tearDown();
      }
    };
    document.addEventListener("visibilitychange", onVisibilitySkip, true);

    onNavigateFinish = () => {
      try {
        resetAdState();
        trySkipAd();
      } catch (_) {
        tearDown();
      }
    };
    window.addEventListener("yt-navigate-finish", onNavigateFinish);

    trySkipAd();
    try {
      const ver = chrome.runtime?.getManifest?.()?.version ?? "?";
      log(`Monitoring started (extension v${ver}).`);
    } catch (_) {
      tearDown();
    }
  }

  function init() {
    if (!RUNTIME_ID) {
      log("Extension runtime not available.");
      return;
    }
    if (
      !isAdPlaying ||
      !isYtSkipButtonReady ||
      !isMostlyInViewport ||
      !performFullSkipAttempt ||
      !querySelectorAllDeep
    ) {
      log("DOM utility bootstrap failed.");
      return;
    }
    startMonitoring();
  }

  try {
    runtimeMessageListener = (message, _sender, sendResponse) => {
      try {
        if (message?.type === "YT_SKIPPER_PING") {
          if (!extensionAlive()) {
            tearDown();
            return;
          }
          trySkipAd();
          sendResponse({ ok: true });
        }
      } catch (_) {
        tearDown();
      }
    };
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
  } catch (_) {
    /* ignore */
  }

  init();
})();
