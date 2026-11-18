/* Multi-Platform Privacy Auto-Blur                                  */
/* Original Copyright (c) 2024 Lukas Lenhardt - lukaslen.com         */
/* Fork & Maintenance Copyright (c) 2026 M Aryo Muzakki - muzakki.id */
/* Released under the MIT license, see LICENSE file for details      */

(function (root) {
  const ALL_STYLES = [
    "mediaGallery",
    "mediaPreview",
    "messages",
    "messagesPreview",
    "name",
    "noDelay",
    "profilePic",
    "textInput",
    "unblurActive"
  ];

  const PLATFORMS = {
    whatsapp: {
      id: "whatsapp",
      name: "WhatsApp",
      hosts: ["web.whatsapp.com"],
      cssBasePath: "platforms/whatsapp/css",
      supportedStyles: [...ALL_STYLES],
      isActiveRoute: () => true
    },
    instagram: {
      id: "instagram",
      name: "Instagram",
      hosts: ["www.instagram.com", "instagram.com"],
      cssBasePath: "platforms/instagram/css",
      supportedStyles: [
        "mediaPreview",
        "messages",
        "messagesPreview",
        "name",
        "noDelay",
        "profilePic",
        "textInput",
        "unblurActive"
      ],
      isActiveRoute: (urlObj) => {
        try {
          return urlObj.pathname.startsWith("/direct");
        } catch (e) {
          return false;
        }
      }
    }
  };

  function createDefaultGlobalSettings() {
    const enabledPlatforms = {};
    Object.keys(PLATFORMS).forEach((id) => {
      enabledPlatforms[id] = true;
    });

    return {
      schemaVersion: 3,
      on: true,
      currentPopupMessage: "",
      enabledPlatforms,
      styles: {
        mediaGallery: true,
        mediaPreview: true,
        messages: true,
        messagesPreview: true,
        name: false,
        noDelay: false,
        profilePic: false,
        textInput: true,
        unblurActive: false
      },
      varStyles: {
        mdgBlur: "20px",
        mdpBlur: "20px",
        msBlur: "8px",
        mspBlur: "8px",
        nmBlur: "5px",
        ppSmBlur: "3px",
        ppBlur: "8px",
        ppLgBlur: "12px",
        wiBlur: "14px"
      },
      blurOnIdle: {
        isEnabled: false,
        idleTimeout: 15
      },
      schedule: {
        isEnabled: false,
        startTime: "09:00",
        endTime: "17:00",
        days: [0, 1, 2, 3, 4, 5, 6]
      }
    };
  }

  function mergeGlobalFields(defaults, source) {
    if (!source || typeof source !== "object") {
      return defaults;
    }
    const merged = { ...defaults, ...source };
    merged.schemaVersion = 3;
    merged.enabledPlatforms = {
      ...defaults.enabledPlatforms,
      ...(source.enabledPlatforms ?? {})
    };
    merged.styles = { ...defaults.styles, ...(source.styles ?? {}) };
    merged.varStyles = { ...defaults.varStyles, ...(source.varStyles ?? {}) };
    merged.blurOnIdle = { ...defaults.blurOnIdle, ...(source.blurOnIdle ?? {}) };
    merged.schedule = { ...defaults.schedule, ...(source.schedule ?? {}) };
    return merged;
  }

  function migrateAndMergeSettings(currentSettings) {
    const defaults = createDefaultGlobalSettings();
    if (!currentSettings || typeof currentSettings !== "object") {
      return defaults;
    }

    // v2 -> v3 migration (from per-platform object to global + enabledPlatforms)
    if (currentSettings.platforms && typeof currentSettings.platforms === "object") {
      const base = currentSettings.platforms.whatsapp || Object.values(currentSettings.platforms)[0] || {};
      const enabledPlatforms = {};
      let anyOn = false;

      Object.keys(PLATFORMS).forEach((id) => {
        const isOn = currentSettings.platforms[id]?.on !== false;
        enabledPlatforms[id] = isOn;
        if (isOn) anyOn = true;
      });

      return mergeGlobalFields(defaults, {
        ...base,
        on: anyOn,
        enabledPlatforms: anyOn ? enabledPlatforms : defaults.enabledPlatforms
      });
    }

    // v1 or v3 -> v3
    return mergeGlobalFields(defaults, currentSettings);
  }

  function detectPlatformByHostname(hostname) {
    if (!hostname) return null;
    const normalized = hostname.toLowerCase();
    return Object.values(PLATFORMS).find((p) => p.hosts.includes(normalized)) || null;
  }

  function detectPlatformByUrl(urlStr) {
    if (!urlStr) return null;
    try {
      const url = new URL(urlStr);
      return detectPlatformByHostname(url.hostname);
    } catch (e) {
      return null;
    }
  }

  root.PRIVACY_BLUR_PLATFORMS = {
    ALL_STYLES,
    PLATFORMS,
    createDefaultGlobalSettings,
    migrateAndMergeSettings,
    detectPlatformByHostname,
    detectPlatformByUrl
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
