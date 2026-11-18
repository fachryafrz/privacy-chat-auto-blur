/* Multi-Platform Privacy Auto-Blur                                  */
/* Original Copyright (c) 2024 Lukas Lenhardt - lukaslen.com         */
/* Fork & Maintenance Copyright (c) 2026 M Aryo Muzakki - muzakki.id */
/* Released under the MIT license, see LICENSE file for details      */

if (typeof browser == "undefined") {
  globalThis.browser = chrome;
}

const styleIdentifier = "pfwa";
const varStyleIdentifier = "pfwa-variables";
const settingsIdentifier = "settings";

const platformRegistry = globalThis.PRIVACY_BLUR_PLATFORMS;
const currentPlatform = platformRegistry?.detectPlatformByHostname(window.location.hostname) || null;

const timers = {};

const timer = (opts) => {
  const options = opts || {};
  const idleCallback = options.idleCallback || function () {};
  const activeCallback = options.activeCallback || function () {};
  const idleTime = options.idleTime || 1000;
  const events = options.events || ["pointermove", "pointerdown", "keydown"];
  let isActive = true;
  let isEnabled = true;
  let timerId;

  function addOrRemoveEvents(addOrRemove) {
    events.forEach((eventName) => {
      document[addOrRemove](eventName, triggerActive);
    });
  }

  function enable() {
    isEnabled = true;
    addOrRemoveEvents("addEventListener");
    triggerActive();
  }

  function triggerActive() {
    if (!isActive) {
      isActive = true;
      activeCallback();
    }
    clearTimeout(timerId);
    timerId = setTimeout(triggerIdle, idleTime);
  }

  function triggerIdle() {
    if (!isActive) return;
    isActive = false;
    idleCallback();
  }

  function disable() {
    isActive = true;
    isEnabled = false;
    clearTimeout(timerId);
    addOrRemoveEvents("removeEventListener");
  }

  return {
    isEnabled: () => isEnabled,
    enable,
    disable,
    triggerActive,
    triggerIdle
  };
};

const blurBody = () => {
  if (!document.body) return;
  document.body.style.filter = "blur(var(--wi-blur)) grayscale(1)";
  document.body.style.transition = "filter .3s linear";
};

const unblurBody = () => {
  if (!document.body) return;
  document.body.style.filter = "";
};

const removeTimer = () => {
  if (!timers.timerObj) return;
  timers.timerObj.triggerActive();
  timers.timerObj.disable();
  delete timers.timerObj;
};

const setBlurOnIdle = (previousSettings, currentSettings) => {
  const previousState = previousSettings?.blurOnIdle;
  const currentState = currentSettings?.blurOnIdle;
  const isPreviousEnabled = previousState?.isEnabled;
  const isCurrentEnabled = currentState?.isEnabled;
  const isBlurOnIdleChanged = isPreviousEnabled !== isCurrentEnabled;
  const isIdleTimeoutChanged = previousState?.idleTimeout !== currentState?.idleTimeout;

  const wasActive = previousSettings?.on && previousSettings?.enabledPlatforms?.[currentPlatform?.id] !== false;

  if (isCurrentEnabled && (isBlurOnIdleChanged || !wasActive || !timers.timerObj)) {
    if (timers.timerObj) {
      removeTimer();
    }
    const newTimer = timer({
      idleCallback: blurBody,
      activeCallback: unblurBody,
      idleTime: parseInt(currentState?.idleTimeout * 1000 || 15000, 10)
    });
    timers.timerObj = newTimer;
    timers.timerObj.enable();
  } else if (isCurrentEnabled && isIdleTimeoutChanged) {
    if (timers.timerObj) {
      removeTimer();
    }
    const newTimer = timer({
      idleCallback: blurBody,
      activeCallback: unblurBody,
      idleTime: parseInt(currentState?.idleTimeout * 1000 || 15000, 10)
    });
    timers.timerObj = newTimer;
    timers.timerObj.enable();
  } else if (isCurrentEnabled === false && timers.timerObj) {
    removeTimer();
  }
};

function getStyleDomId(id) {
  return `pfwa-style-${id}`;
}

function getVarDomId(varName) {
  return `pfwa-var-${varName}`;
}

function removeStyleById(id) {
  const el = document.getElementById(getStyleDomId(id));
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

function removeAllStyles() {
  const els = document.getElementsByClassName(styleIdentifier);
  while (els.length > 0) {
    els[0].parentNode.removeChild(els[0]);
  }
  const varEls = document.getElementsByClassName(varStyleIdentifier);
  while (varEls.length > 0) {
    varEls[0].parentNode.removeChild(varEls[0]);
  }
}

function addStyleById(id) {
  const domId = getStyleDomId(id);
  if (!currentPlatform || document.getElementById(domId)) return;

  const link = document.createElement("link");
  link.id = domId;
  link.className = styleIdentifier;
  link.href = browser.runtime.getURL(`${currentPlatform.cssBasePath}/${id}.css`);
  link.type = "text/css";
  link.rel = "stylesheet";
  (document.head || document.documentElement).appendChild(link);
}

function addVarStyle([varName, value]) {
  const kebabize = (str) =>
    str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, (s, ofs) => (ofs ? "-" : "") + s.toLowerCase());

  const innerText = `:root {\n  --${kebabize(varName)}: ${value};\n}\n`;
  const domId = getVarDomId(varName);

  const existing = document.getElementById(domId);
  if (existing) {
    existing.textContent = innerText;
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.id = domId;
  styleEl.className = varStyleIdentifier;
  styleEl.textContent = innerText;
  (document.head || document.documentElement).appendChild(styleEl);
}

function getNormalizedSettings(rawSettings) {
  if (!platformRegistry) return null;
  return platformRegistry.migrateAndMergeSettings(rawSettings);
}

function updateStyles(changes) {
  if (!currentPlatform) return;

  if (!currentPlatform.isActiveRoute(window.location)) {
    removeAllStyles();
    if (timers.timerObj) {
      removeTimer();
    }
    return;
  }

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const settings = getNormalizedSettings(result?.settings);
    const isPlatformEnabled = settings?.enabledPlatforms?.[currentPlatform.id] !== false;

    if (!settings || !settings.on || !isPlatformEnabled) {
      removeAllStyles();
      if (timers.timerObj) {
        removeTimer();
      }
      return;
    }

    const supported = currentPlatform.supportedStyles;
    Object.keys(settings.styles).forEach((style) => {
      if (supported.includes(style) && settings.styles[style]) {
        addStyleById(style);
      } else {
        removeStyleById(style);
      }
    });

    Object.entries(settings.varStyles).forEach((varStyle) => {
      addVarStyle(varStyle);
    });

    const oldSettings = changes?.settings?.oldValue
      ? getNormalizedSettings(changes.settings.oldValue)
      : null;
    setBlurOnIdle(oldSettings, settings);
  });
}

// Update styles on setting change
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings != null) {
    updateStyles(changes);
  }
});

// Watch SPA route changes (needed for Instagram /direct/* navigation)
let lastHref = window.location.href;
function handleRouteCheck() {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    updateStyles();
  }
}

window.addEventListener("popstate", handleRouteCheck);
if (currentPlatform?.id !== "whatsapp") {
  const routeObserver = new MutationObserver(handleRouteCheck);
  routeObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// Initial update once page loaded
updateStyles();

// Request schedule check from background on load and tab visibility change
function requestScheduleCheck() {
  try {
    browser.runtime.sendMessage({ action: "checkSchedule" });
  } catch (e) {}
}

requestScheduleCheck();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestScheduleCheck();
  }
});
