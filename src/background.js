/* Multi-Platform Privacy Auto-Blur                                  */
/* Original Copyright (c) 2024 Lukas Lenhardt - lukaslen.com         */
/* Fork & Maintenance Copyright (c) 2026 M Aryo Muzakki - muzakki.id */
/* Released under the MIT license, see LICENSE file for details      */

if (typeof browser == "undefined") {
  globalThis.browser = chrome;
}

if (typeof PRIVACY_BLUR_PLATFORMS === "undefined" && typeof importScripts === "function") {
  importScripts("core/platforms.js");
}

const settingsIdentifier = "settings";
const platformRegistry = globalThis.PRIVACY_BLUR_PLATFORMS;

const requiredPermissions = {
  origins: ["https://web.whatsapp.com/*", "https://www.instagram.com/*"],
  permissions: ["storage"]
};

function isScheduleActive(schedule, date = new Date()) {
  if (!schedule || !schedule.isEnabled) return false;

  const days = Array.isArray(schedule.days) ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 0) return false;

  const [startH, startM] = (schedule.startTime ?? "09:00").split(":").map(Number);
  const [endH, endM] = (schedule.endTime ?? "17:00").split(":").map(Number);

  const isSameDay = startH < endH || (startH === endH && startM < endM);

  const todayDay = date.getDay();
  if (days.includes(todayDay)) {
    const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startH, startM, 0, 0);
    const todayEnd = isSameDay
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), endH, endM, 0, 0)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, endH, endM, 0, 0);

    if (date >= todayStart && date < todayEnd) {
      return true;
    }
  }

  if (!isSameDay) {
    const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 0, 0, 0, 0);
    const yesterdayDay = yesterday.getDay();
    if (days.includes(yesterdayDay)) {
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), startH, startM, 0, 0);
      const yesterdayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endH, endM, 0, 0);

      if (date >= yesterdayStart && date < yesterdayEnd) {
        return true;
      }
    }
  }

  return false;
}

function checkSchedule() {
  return browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) return null;

    const normalized = platformRegistry.migrateAndMergeSettings(result.settings);
    const schedule = normalized.schedule;
    if (!schedule || !schedule.isEnabled) return normalized.on;

    const shouldBeOn = isScheduleActive(schedule);
    if (normalized.on !== shouldBeOn) {
      normalized.on = shouldBeOn;
      return browser.storage.sync.set({ settings: normalized }).then(() => shouldBeOn);
    }
    return shouldBeOn;
  });
}

function updateAlarms() {
  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) return;

    const normalized = platformRegistry.migrateAndMergeSettings(result.settings);
    const schedule = normalized.schedule;

    browser.alarms.clearAll().then(() => {
      if (!schedule || !schedule.isEnabled) return;

      const getNextTimeMs = (timeStr) => {
        const [hours, minutes] = (timeStr ?? "09:00").split(":").map(Number);
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
        return target.getTime();
      };

      browser.alarms.create("scheduleStart", {
        when: getNextTimeMs(schedule.startTime ?? "09:00"),
        periodInMinutes: 1440
      });

      browser.alarms.create("scheduleEnd", {
        when: getNextTimeMs(schedule.endTime ?? "17:00"),
        periodInMinutes: 1440
      });

      browser.alarms.create("scheduleHeartbeat", {
        periodInMinutes: 5
      });
    });
  });
}

function updateActionIconForActiveTab() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const activeTab = tabs && tabs[0];
    const detected = platformRegistry.detectPlatformByUrl(activeTab?.url);

    browser.storage.sync.get([settingsIdentifier]).then((result) => {
      if (!result.hasOwnProperty(settingsIdentifier)) return;
      const normalized = platformRegistry.migrateAndMergeSettings(result.settings);
      const isPlatformEnabled = detected
        ? normalized.enabledPlatforms?.[detected.id] !== false
        : true;
      const isOn = normalized.on === true && isPlatformEnabled;

      browser.action.setIcon({
        path: "images/status" + (isOn ? "On" : "Off") + ".png"
      });
    });
  }).catch(() => {});
}

// On install or update: migrate settings to v3 global + enabledPlatforms schema
browser.runtime.onInstalled.addListener(() => {
  browser.permissions.contains(requiredPermissions).then((hasPermissions) => {
    if (hasPermissions) return;
    browser.permissions.request(requiredPermissions);
  });

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const currentSettings = result.hasOwnProperty(settingsIdentifier) ? result.settings : null;
    const merged = platformRegistry.migrateAndMergeSettings(currentSettings);
    browser.storage.sync.set({ settings: merged }).then(() => {
      updateAlarms();
      checkSchedule();
      updateActionIconForActiveTab();
    });
  });
});

// Handle global toggle command (Alt+X)
browser.commands.onCommand.addListener((command) => {
  if (command !== "toggle") return;

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) {
      browser.runtime.reload();
      return;
    }

    const normalized = platformRegistry.migrateAndMergeSettings(result.settings);
    normalized.on = !normalized.on;
    browser.storage.sync.set({ settings: normalized });
  });
});

// Update icon & alarms on setting change
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || changes.settings == null) return;

  updateActionIconForActiveTab();

  const oldNormalized = platformRegistry.migrateAndMergeSettings(changes.settings.oldValue);
  const newNormalized = platformRegistry.migrateAndMergeSettings(changes.settings.newValue);

  const oldDays = JSON.stringify(oldNormalized.schedule?.days || []);
  const newDays = JSON.stringify(newNormalized.schedule?.days || []);

  const scheduleChanged =
    !oldNormalized.schedule ||
    oldNormalized.schedule.isEnabled !== newNormalized.schedule.isEnabled ||
    oldNormalized.schedule.startTime !== newNormalized.schedule.startTime ||
    oldNormalized.schedule.endTime !== newNormalized.schedule.endTime ||
    oldDays !== newDays;

  if (scheduleChanged) {
    updateAlarms();
    checkSchedule();
  }
});

// Update icon when switching or navigating tabs
browser.tabs.onActivated.addListener(() => {
  updateActionIconForActiveTab();
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    updateActionIconForActiveTab();
  }
});

// Handle alarm triggers
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scheduleStart" || alarm.name === "scheduleEnd" || alarm.name === "scheduleHeartbeat") {
    checkSchedule();
  }
});

// Handle messages from contentScript or popup to check schedule
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === "checkSchedule") {
    checkSchedule().then((isOn) => {
      sendResponse({ on: isOn });
    });
    return true;
  }
});

// Initialize alarms, schedule check, and icon on load
updateAlarms();
checkSchedule();
updateActionIconForActiveTab();
