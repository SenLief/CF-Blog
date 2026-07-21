import type { SiteSettings } from "@cf-blog/contracts";

export const SITE_SETTINGS_UPDATED_EVENT = "cf-blog:site-settings-updated";

export function notifySiteSettingsUpdated(settings: SiteSettings) {
  window.dispatchEvent(
    new CustomEvent<SiteSettings>(SITE_SETTINGS_UPDATED_EVENT, {
      detail: settings
    })
  );
}
