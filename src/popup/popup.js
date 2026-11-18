/* Multi-Platform Privacy Auto-Blur                                  */
/* Original Copyright (c) 2024 Lukas Lenhardt - lukaslen.com         */
/* Fork & Maintenance Copyright (c) 2026 M Aryo Muzakki - muzakki.id */
/* Released under the MIT license, see LICENSE file for details      */

if (typeof browser == "undefined") {
  globalThis.browser = chrome;
}

const settingsIdentifier = "settings";
const platformRegistry = globalThis.PRIVACY_BLUR_PLATFORMS;

const version = browser.runtime.getManifest().version;
document.getElementById("version").innerText = version;

document.querySelectorAll("[data-locale]").forEach((e) => {
  e.innerText = browser.i18n.getMessage(e.dataset.locale);
});
document.querySelectorAll("[data-localetitle]").forEach((e) => {
  e.title = browser.i18n.getMessage(e.dataset.localetitle);
});

const styleSwitches = document.querySelectorAll("input[type='checkbox'][data-style]");
const platformSwitches = document.querySelectorAll("input[type='checkbox'][data-platform-toggle]");
const forms = document.querySelectorAll("form.var-style");
const scheduleForm = document.querySelector("form.schedule-form");

function getNormalizedSettings(raw) {
  return platformRegistry.migrateAndMergeSettings(raw);
}

// Track global switch changes and save settings
function saveSettings() {
  const id = this.dataset.style;
  const checked = this.checked;

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const normalized = getNormalizedSettings(result?.settings);

    if (id === "on") {
      normalized.on = checked;
    } else if (id === "blurOnIdle") {
      normalized.blurOnIdle.isEnabled = checked;
    } else if (id === "schedule") {
      normalized.schedule.isEnabled = checked;
    } else {
      normalized.styles[id] = checked;
    }

    browser.storage.sync.set({ settings: normalized });
  });
}

styleSwitches.forEach((checkbox) => {
  checkbox.addEventListener("change", saveSettings);
});

// Track per-platform enable/disable toggles
function savePlatformToggle() {
  const platformId = this.dataset.platformToggle;
  const checked = this.checked;

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const normalized = getNormalizedSettings(result?.settings);
    normalized.enabledPlatforms[platformId] = checked;
    browser.storage.sync.set({ settings: normalized });
  });
}

platformSwitches.forEach((checkbox) => {
  checkbox.addEventListener("change", savePlatformToggle);
});

document.querySelectorAll(".platform-pill").forEach((pill) => {
  pill.addEventListener("click", (ev) => {
    if (ev.target.tagName === "INPUT") return;
    const cb = pill.querySelector("input[type='checkbox']");
    if (cb) {
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    }
  });
});

// Toggle open/close blur amount settings
const onClickOutside = (targetElement, callback, once = true) => {
  function handler(ev) {
    if (!ev.composedPath().includes(targetElement)) {
      callback(ev);
      if (once) {
        document.removeEventListener("click", handler);
      }
    }
  }

  setTimeout(() => {
    document.addEventListener("click", handler);
  }, 0);

  return () => document.removeEventListener("click", handler);
};

let removeOutsideListener = null;

const togglePopup = (ev) => {
  const popoverElement = ev.currentTarget.parentNode.querySelector(".popover");
  const trigger = ev.currentTarget;

  const closeSetting = () => {
    trigger.classList.remove("active");
    popoverElement.setAttribute("aria-hidden", "true");
    popoverElement.style.maxHeight = null;
  };

  if (!trigger.classList.contains("active")) {
    trigger.classList.add("active");
    popoverElement.removeAttribute("aria-hidden");
    popoverElement.style.maxHeight = popoverElement.scrollHeight + "px";
    removeOutsideListener = onClickOutside(popoverElement, () => {
      closeSetting();
    });
  } else {
    closeSetting();
    removeOutsideListener?.();
  }
};

const cancelAdvancedSetting = (ev) => {
  const popoverElement = ev.currentTarget.parentNode;

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const settings = getNormalizedSettings(result?.settings);

    popoverElement.querySelectorAll("input[type='number']").forEach((input) => {
      const varName = input.dataset.varName;
      input.value = parseInt(
        varName === "itBlur"
          ? settings.blurOnIdle?.idleTimeout ?? 15
          : settings.varStyles[varName],
        10
      );
    });

    popoverElement.querySelectorAll("input[type='time']").forEach((input) => {
      const name = input.name;
      if (name === "startTime" || name === "endTime") {
        input.value = settings.schedule?.[name] ?? (name === "startTime" ? "09:00" : "17:00");
      }
    });

    const savedDays = Array.isArray(settings.schedule?.days)
      ? settings.schedule.days
      : [0, 1, 2, 3, 4, 5, 6];
    popoverElement.querySelectorAll(".day-btn").forEach((btn) => {
      const dayNum = parseInt(btn.dataset.day, 10);
      btn.classList.toggle("active", savedDays.includes(dayNum));
    });

    popoverElement.parentNode.querySelector(".trigger-btn.active")?.classList.remove("active");
    popoverElement.setAttribute("aria-hidden", "true");
    popoverElement.style.maxHeight = null;
    removeOutsideListener?.();
  });
};

document.querySelectorAll(".trigger-btn").forEach((triggerBtn) => {
  triggerBtn.addEventListener("click", togglePopup);
});
document.querySelectorAll(".cancel-btn").forEach((cancelBtn) => {
  cancelBtn.addEventListener("click", cancelAdvancedSetting);
});

document.querySelectorAll(".day-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
  });
});

// Toast utility
const showToast = (message, duration = 3000, persistent = false) => {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";

  const p = document.createElement("p");
  p.className = "msg";
  p.textContent = message;
  toast.appendChild(p);

  if (persistent) {
    const btn = document.createElement("button");
    btn.className = "toast-close-btn";
    btn.textContent = "×";
    toast.appendChild(btn);
  }

  container.appendChild(toast);

  const removeToast = (toastEl) => {
    toastEl.classList.remove("show");
    setTimeout(() => toastEl.remove(), 300);
  };

  setTimeout(() => toast.classList.add("show"), 10);

  if (!persistent) {
    setTimeout(() => {
      removeToast(toast);
    }, duration < 0 ? 3000 : duration);
  } else {
    toast.querySelector(".toast-close-btn").addEventListener("click", () => {
      removeToast(toast);
    });
  }
};

// Track form save/submit for advanced settings (variable style settings)
function saveFormSettings(ev) {
  ev.preventDefault();
  const [key, val] = Object.entries(Object.fromEntries(new FormData(ev.target)))[0];

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const normalized = getNormalizedSettings(result?.settings);

    if (key === "itBlur") {
      normalized.blurOnIdle.idleTimeout = val;
    } else {
      normalized.varStyles[key] = val + "px";
    }

    browser.storage.sync.set({ settings: normalized });
    showToast(browser.i18n.getMessage("toastSaved"));
  });
}

forms.forEach((form) => {
  form.addEventListener("submit", saveFormSettings);
});

if (scheduleForm) {
  scheduleForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const formData = new FormData(ev.target);
    const startTime = formData.get("startTime");
    const endTime = formData.get("endTime");
    const activeDayButtons = scheduleForm.querySelectorAll(".day-btn.active");
    const days = Array.from(activeDayButtons).map((btn) => parseInt(btn.dataset.day, 10));

    browser.storage.sync.get([settingsIdentifier]).then((result) => {
      const normalized = getNormalizedSettings(result?.settings);

      normalized.schedule.startTime = startTime;
      normalized.schedule.endTime = endTime;
      normalized.schedule.days = days;

      browser.storage.sync.set({ settings: normalized }).then(() => {
        try {
          browser.runtime.sendMessage({ action: "checkSchedule" });
        } catch (e) {}
      });

      showToast(browser.i18n.getMessage("toastSaved"));
    });
  });
}

function applySettingsToUI(rawSettings) {
  const settings = getNormalizedSettings(rawSettings);
  if (!settings) return;

  platformSwitches.forEach((checkbox) => {
    const platformId = checkbox.dataset.platformToggle;
    checkbox.checked = settings.enabledPlatforms?.[platformId] !== false;
  });

  styleSwitches.forEach((checkbox) => {
    const id = checkbox.dataset.style;
    if (id === "on") {
      checkbox.checked = settings.on ?? false;
    } else if (id === "blurOnIdle") {
      checkbox.checked = settings.blurOnIdle?.isEnabled ?? false;
    } else if (id === "schedule") {
      checkbox.checked = settings.schedule?.isEnabled ?? false;
    } else {
      checkbox.checked = settings.styles?.[id] ?? false;
    }
  });

  forms.forEach((form) => {
    const numInput = form.querySelector(`input[type="number"]`);
    if (!numInput) return;
    const varName = numInput.dataset.varName;
    if (varName === "itBlur") {
      numInput.value = parseInt(settings.blurOnIdle?.idleTimeout ?? 15, 10);
    } else if (settings.varStyles?.[varName]) {
      numInput.value = parseInt(settings.varStyles[varName], 10);
    }
  });

  if (settings.schedule) {
    const startInput = document.getElementById("scheduleStartTime");
    const endInput = document.getElementById("scheduleEndTime");
    if (startInput) startInput.value = settings.schedule.startTime ?? "09:00";
    if (endInput) endInput.value = settings.schedule.endTime ?? "17:00";

    const days = Array.isArray(settings.schedule.days)
      ? settings.schedule.days
      : [0, 1, 2, 3, 4, 5, 6];
    document.querySelectorAll(".day-btn").forEach((btn) => {
      const dayNum = parseInt(btn.dataset.day, 10);
      btn.classList.toggle("active", days.includes(dayNum));
    });
  }
}

// Update UI in real-time on storage change
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings && changes.settings.newValue) {
    applySettingsToUI(changes.settings.newValue);
  }
});

// Load settings on popup open
browser.storage.sync.get([settingsIdentifier]).then((result) => {
  applySettingsToUI(result?.settings);

  try {
    browser.runtime.sendMessage({ action: "checkSchedule" });
  } catch (e) {}
});
