import type { UserSocialLink, UserWebsiteLink } from "./types";

const META_DELIMITER = "|__JT_META__:";

const VALID_PLATFORMS = new Set<string>([
  "discord",
  "youtube",
  "x",
  "instagram",
  "tiktok",
  "twitch",
  "github",
  "reddit",
  "spotify",
  "linkedin",
]);

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
): string {
  const baseColor = stripProfileMetaFromColorId(avatarColor);
  const cleanSocials: UserSocialLink[] = [];
  if (Array.isArray(socials)) {
    const seen = new Set<string>();
    for (const item of socials) {
      if (!item || !VALID_PLATFORMS.has(item.platform)) continue;
      if (seen.has(item.platform)) continue;
      const handle = (item.handle ?? "").trim().slice(0, 100);
      const url = (item.url ?? "").trim().slice(0, 400);
      if (!handle) continue;
      if (url && !isSafeHttpUrl(url)) continue;
      seen.add(item.platform);
      cleanSocials.push({
        platform: item.platform,
        handle,
        url,
      });
      if (cleanSocials.length >= 10) break;
    }
  }

  let cleanWebsite: UserWebsiteLink | undefined;
  if (website && website.url && isSafeHttpUrl(website.url)) {
    const url = website.url.trim();
    const title = (website.title ?? "").trim().slice(0, 80) || url;
    cleanWebsite = { title, url };
  }

  if (cleanSocials.length === 0 && !cleanWebsite) {
    return baseColor;
  }

  const payload: { s?: UserSocialLink[]; w?: UserWebsiteLink } = {};
  if (cleanSocials.length > 0) payload.s = cleanSocials;
  if (cleanWebsite) payload.w = cleanWebsite;
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
} {
  const avatarColor = stripProfileMetaFromColorId(rawColor);
  let socials = explicitSocials && explicitSocials.length > 0 ? explicitSocials : undefined;
  let website = explicitWebsite?.url ? explicitWebsite : undefined;

  if (rawColor) {
    const idx = rawColor.indexOf(META_DELIMITER);
    if (idx >= 0) {
      const jsonPart = rawColor.slice(idx + META_DELIMITER.length);
      try {
        const parsed = JSON.parse(jsonPart) as {
          s?: Array<{ platform?: string; handle?: string; url?: string }>;
          w?: { title?: string; url?: string };
        };
        if (!socials && Array.isArray(parsed.s)) {
          const valid: UserSocialLink[] = [];
          for (const entry of parsed.s) {
            if (
              entry &&
              typeof entry.platform === "string" &&
              VALID_PLATFORMS.has(entry.platform) &&
              typeof entry.handle === "string" &&
              entry.handle.trim()
            ) {
              const rawUrl = typeof entry.url === "string" ? entry.url.trim() : "";
              if (!rawUrl || isSafeHttpUrl(rawUrl)) {
                valid.push({
                  platform: entry.platform,
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
      } catch {
        // Ignore malformed metadata suffix and keep clean base color.
      }
    }
  }

  return { avatarColor, socials, website };
}
