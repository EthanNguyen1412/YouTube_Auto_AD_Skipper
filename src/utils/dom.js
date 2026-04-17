(function () {
  function isAdPlaying() {
    const moviePlayer = document.getElementById("movie_player");
    return (
      document.documentElement.classList.contains("ad-showing") ||
      (moviePlayer && moviePlayer.classList.contains("ad-showing")) ||
      document.querySelector(".video-ads.ytp-ad-module") !== null ||
      document.querySelector(".ytp-ad-player-overlay") !== null
    );
  }

  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.pointerEvents === "none"
    ) {
      return false;
    }

    const opacity = parseFloat(style.opacity || "1");
    if (!Number.isNaN(opacity) && opacity < 0.99) return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** YouTube skip <button>: countdown uses opacity ~0.5; only treat as clickable when ~1. */
  function isYtSkipButtonReady(button) {
    if (!button || button.tagName !== "BUTTON") return false;
    const cls = (button.className && String(button.className)) || "";
    if (!/ytp-skip-ad-button|ytp-ad-skip-button|ytp-ad-skip-button-modern/i.test(cls)) {
      return false;
    }

    const style = window.getComputedStyle(button);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.pointerEvents === "none"
    ) {
      return false;
    }

    if (button.hasAttribute("disabled")) return false;
    if (button.getAttribute("aria-disabled") === "true") return false;

    const opacity = parseFloat(style.opacity || "1");
    if (!Number.isNaN(opacity) && opacity < 0.92) return false;

    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isMostlyInViewport(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;

    const r = element.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;

    const vh = window.innerHeight;
    const vw = window.innerWidth;
    return r.bottom > 4 && r.top < vh - 4 && r.right > 4 && r.left < vw - 4;
  }

  function isElementInteractive(element) {
    if (!element) return false;
    if (element.hasAttribute("disabled")) return false;
    if (element.getAttribute("aria-disabled") === "true") return false;

    return isElementVisible(element);
  }

  function safeClick(element) {
    try {
      if (!isElementInteractive(element)) return false;

      element.click();
      return true;
    } catch (error) {
      console.error("[YT Auto Skip] Failed to click skip button:", error);
      return false;
    }
  }

  /** Prefer inner <button> / role=button so we do not click a decorative wrapper. */
  function resolvePrimaryClickTarget(container) {
    if (!container) return null;

    const innerSelectors = [
      "button.ytp-skip-ad-button",
      "button.ytp-ad-skip-button",
      "button[class*='skip']",
      "button",
      "[role='button']"
    ];

    for (const sel of innerSelectors) {
      const inner = container.querySelector?.(sel);
      if (
        inner &&
        inner !== container &&
        isElementVisible(inner) &&
        isElementInteractive(inner)
      ) {
        return inner;
      }
    }

    if (container.tagName === "BUTTON" || container.getAttribute("role") === "button") {
      return container;
    }

    return container;
  }

  /** `bubbles: false` so full-screen ad overlay does not receive bubble → pause. */
  function dispatchMouseChain(target, x, y) {
    const mouseInit = {
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
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...mouseInit,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true
        })
      );
    } catch (_) {
      /* PointerEvent unsupported */
    }

    target.dispatchEvent(new MouseEvent("mousedown", mouseInit));

    try {
      target.dispatchEvent(
        new PointerEvent("pointerup", {
          ...mouseInit,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true
        })
      );
    } catch (_) {
      /* ignore */
    }

    target.dispatchEvent(new MouseEvent("mouseup", mouseInit));
    target.dispatchEvent(new MouseEvent("click", mouseInit));

    if (typeof target.click === "function") {
      target.click();
    }
  }

  function closestYtSkipButton(fromNode) {
    if (!fromNode || typeof fromNode.closest !== "function") return null;
    return (
      fromNode.closest("button.ytp-skip-ad-button") ||
      fromNode.closest("button.ytp-ad-skip-button") ||
      fromNode.closest("button.ytp-ad-skip-button-modern") ||
      null
    );
  }

  /**
   * Pick a point inside the skip button where hit-testing stays inside the skip subtree
   * (avoids transparent "holes" hitting the video layer → pause).
   */
  function pickLeafHitInSkipButton(btn) {
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
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
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

  /**
   * Resolve to the skip <button>; hit-test only to validate / refine leaf for dispatch.
   */
  function resolveHitTestTarget(container) {
    const resolved = resolvePrimaryClickTarget(container);
    if (!resolved) return null;

    if (resolved.tagName === "BUTTON" && isYtSkipButtonReady(resolved)) {
      return resolved;
    }

    const rect = resolved.getBoundingClientRect();
    const pts = [
      [Math.floor(rect.left + rect.width / 2), Math.floor(rect.top + rect.height / 2)],
      [Math.floor(rect.left + rect.width * 0.72), Math.floor(rect.top + rect.height * 0.55)]
    ];

    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      const btn = closestYtSkipButton(top);
      if (btn && isYtSkipButtonReady(btn)) return btn;
    }

    return isYtSkipButtonReady(resolved) ? resolved : null;
  }

  function performKeyboardActivate(target) {
    if (!target || !isYtSkipButtonReady(target)) return false;
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }

    const seq = [
      { key: "Enter", code: "Enter", keyCode: 13, which: 13 },
      { key: " ", code: "Space", keyCode: 32, which: 32 }
    ];

    for (const k of seq) {
      const opts = {
        key: k.key,
        code: k.code,
        keyCode: k.keyCode,
        which: k.which,
        bubbles: false,
        cancelable: true,
        view: window
      };
      target.dispatchEvent(new KeyboardEvent("keydown", opts));
      target.dispatchEvent(new KeyboardEvent("keyup", opts));
    }
    return true;
  }

  function performRobustClick(container) {
    const btn = resolveHitTestTarget(container);
    if (!btn || !isYtSkipButtonReady(btn)) return false;

    try {
      btn.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }

    const { leaf, x, y } = pickLeafHitInSkipButton(btn);
    dispatchMouseChain(leaf, x, y);
    if (leaf !== btn && typeof btn.click === "function") {
      btn.click();
    }
    return true;
  }

  function performFullSkipAttempt(container) {
    const btn = resolveHitTestTarget(container);
    if (!btn || !isYtSkipButtonReady(btn)) return false;

    performRobustClick(container);
    performKeyboardActivate(btn);
    return true;
  }

  function querySelectorAllDeep(root, selector, out) {
    if (!root || !root.querySelectorAll) return out;
    try {
      root.querySelectorAll(selector).forEach((el) => out.push(el));
    } catch (_) {
      /* ignore */
    }
    const children = root.querySelectorAll("*");
    children.forEach((el) => {
      if (el.shadowRoot) {
        querySelectorAllDeep(el.shadowRoot, selector, out);
      }
    });
    return out;
  }

  window.YTSkipperDom = {
    isAdPlaying,
    isElementVisible,
    isElementInteractive,
    isYtSkipButtonReady,
    isMostlyInViewport,
    safeClick,
    resolvePrimaryClickTarget,
    performRobustClick,
    performFullSkipAttempt,
    querySelectorAllDeep
  };
})();
