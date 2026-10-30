import type { SyncedThemePayload } from "./themeEngine";
import type { UserSocialLink, UserWebsiteLink } from "./types";

const META_DELIMITER = "|__JT_META__:";

function isSafeHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeSyncedTheme(raw: unknown): SyncedThemePayload | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Partial<SyncedThemePayload>;
  if (obj.k === "d" && typeof obj.d === "string") {
    return { k: "d", d: obj.d };
  }
  if (obj.k === "p" && typeof obj.p === "string") {
    return { k: "p", p: obj.p };
  }
  if (obj.k === "c" && obj.c && typeof obj.c === "object") {
    const cols = Array.isArray(obj.c.cols)
      ? obj.c.cols.filter((c) => typeof c === "string").slice(0, 5)
      : [];
    if (cols.length > 0) {
      return {
        k: "c",
        c: {
          a: obj.c.a === "l" ? "l" : "d",
          cols,
          ang: typeof obj.c.ang === "number" ? Math.round(obj.c.ang) : 45,
          int: typeof obj.c.int === "number" ? Math.round(obj.c.int) : 60,
        },
      };
    }
  }
  return undefined;
}

export function stripProfileMetaFromColorId(rawColor: string | undefined): string {
  if (!rawColor) return "black";
  const idx = rawColor.indexOf(META_DELIMITER);
  const base = (idx >= 0 ? rawColor.slice(0, idx) : rawColor).trim();
  return base || "black";
}

export function packAvatarColorWithMeta(
  avatarColor: string,
  socials?: UserSocialLink[],
  website?: UserWebsiteLink | null,
  syncedTheme?: SyncedThemePayload | null,
): string {
  const baseColor = stripProfileMetaFromColorId(avatarColor);
  const cleanSocials: UserSocialLink[] = [];
  if (Array.isArray(socials)) {
    const seen = new Set<string>();
    for (const item of socials) {
      const platform = (item?.platform ?? "").trim().slice(0, 32);
      if (!platform) continue;
      const lower = platform.toLowerCase();
      if (seen.has(lower)) continue;
      const handle = (item.handle ?? "").trim().slice(0, 100);
      const url = (item.url ?? "").trim().slice(0, 400);
      if (!handle) continue;
      if (url && !isSafeHttpUrl(url)) continue;
      seen.add(lower);
      cleanSocials.push({
        platform,
        handle,
        url,
      });
      if (cleanSocials.length >= 12) break;
    }
  }

  let cleanWebsite: UserWebsiteLink | undefined;
  if (website && website.url && isSafeHttpUrl(website.url)) {
    const url = website.url.trim();
    const title = (website.title ?? "").trim().slice(0, 80) || url;
    cleanWebsite = { title, url };
  }

  const cleanTheme = syncedTheme ? sanitizeSyncedTheme(syncedTheme) : undefined;

  if (cleanSocials.length === 0 && !cleanWebsite && !cleanTheme) {
    return baseColor;
  }

  const payload: {
    s?: UserSocialLink[];
    w?: UserWebsiteLink;
    t?: SyncedThemePayload;
  } = {};
  if (cleanSocials.length > 0) payload.s = cleanSocials;
  if (cleanWebsite) payload.w = cleanWebsite;
  if (cleanTheme) payload.t = cleanTheme;
  return `${baseColor}${META_DELIMITER}${JSON.stringify(payload)}`;
}

export function unpackAvatarColorWithMeta(
  rawColor: string | undefined,
  explicitSocials?: UserSocialLink[],
  explicitWebsite?: UserWebsiteLink,
): {
  avatarColor: string;
  socials?: UserSocialLink[];
  website?: UserWebsiteLink;
  syncedTheme?: SyncedThemePayload;
} {
  const avatarColor = stripProfileMetaFromColorId(rawColor);
  let socials = explicitSocials && explicitSocials.length > 0 ? explicitSocials : undefined;
  let website = explicitWebsite?.url ? explicitWebsite : undefined;
  let syncedTheme: SyncedThemePayload | undefined;

  if (rawColor) {
    const idx = rawColor.indexOf(META_DELIMITER);
    if (idx >= 0) {
      const jsonPart = rawColor.slice(idx + META_DELIMITER.length);
      try {
        const parsed = JSON.parse(jsonPart) as {
          s?: Array<{ platform?: string; handle?: string; url?: string }>;
          w?: { title?: string; url?: string };
          t?: unknown;
        };
        if (!socials && Array.isArray(parsed.s)) {
          const valid: UserSocialLink[] = [];
          for (const entry of parsed.s) {
            if (
              entry &&
              typeof entry.platform === "string" &&
              entry.platform.trim() &&
              typeof entry.handle === "string" &&
              entry.handle.trim()
            ) {
              const rawUrl = typeof entry.url === "string" ? entry.url.trim() : "";
              if (!rawUrl || isSafeHttpUrl(rawUrl)) {
                valid.push({
                  platform: entry.platform.trim().slice(0, 32),
                  handle: entry.handle.trim(),
                  url: rawUrl,
                });
              }
            }
          }
          if (valid.length > 0) socials = valid;
        }
        if (!website && parsed.w && isSafeHttpUrl(parsed.w.url)) {
          const url = parsed.w.url.trim();
          const title =
            typeof parsed.w.title === "string" && parsed.w.title.trim()
              ? parsed.w.title.trim()
              : url;
          website = { title, url };
        }
        syncedTheme = sanitizeSyncedTheme(parsed.t);
      } catch {
        // Ignore malformed metadata suffix and keep clean base color.
      }
    }
  }

  return { avatarColor, socials, website, syncedTheme };
}
