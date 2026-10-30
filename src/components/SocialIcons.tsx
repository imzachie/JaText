import type { UserSocialLink } from "../lib/types";

export interface SocialPlatformSpec {
  id: string;
  label: string;
  placeholder: string;
  accent: string;
  buildUrl: (input: string) => { handle: string; url: string };
}

function cleanHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function parseIfFullUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      return null;
    }
  }
  return null;
}

export const SOCIAL_PLATFORMS: SocialPlatformSpec[] = [
  {
    id: "discord",
    label: "Discord",
    placeholder: "username or https://discord.gg/...",
    accent: "#5865F2",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const parts = full.split("/").filter(Boolean);
        return { handle: parts[parts.length - 1] || "Discord", url: full };
      }
      const trimmed = raw.trim();
      if (/^(discord\.gg|discord\.com)\//i.test(trimmed)) {
        const url = `https://${trimmed}`;
        const parts = trimmed.split("/").filter(Boolean);
        return { handle: parts[parts.length - 1] || trimmed, url };
      }
      const h = cleanHandle(trimmed);
      return { handle: h, url: `https://discord.com/users` };
    },
  },
  {
    id: "youtube",
    label: "YouTube",
    placeholder: "@channel or https://youtube.com/@...",
    accent: "#FF0033",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+)/i);
        return { handle: m ? m[1] : cleanHandle(raw), url: full };
      }
      const h = cleanHandle(raw);
      return { handle: `@${h}`, url: `https://www.youtube.com/@${encodeURIComponent(h)}` };
    },
  },
  {
    id: "x",
    label: "X",
    placeholder: "@username or https://x.com/...",
    accent: "#E7E9EA",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/i);
        return { handle: m ? `@${cleanHandle(m[1])}` : raw.trim(), url: full };
      }
      const h = cleanHandle(raw);
      return { handle: `@${h}`, url: `https://x.com/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "instagram",
    label: "Instagram",
    placeholder: "@username or https://instagram.com/...",
    accent: "#E1306C",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/instagram\.com\/([^/?#]+)/i);
        return { handle: m ? `@${cleanHandle(m[1])}` : raw.trim(), url: full };
      }
      const h = cleanHandle(raw);
      return { handle: `@${h}`, url: `https://www.instagram.com/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "tiktok",
    label: "TikTok",
    placeholder: "@username or https://tiktok.com/@...",
    accent: "#FE2C55",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/tiktok\.com\/@?([^/?#]+)/i);
        return { handle: m ? `@${cleanHandle(m[1])}` : raw.trim(), url: full };
      }
      const h = cleanHandle(raw);
      return { handle: `@${h}`, url: `https://www.tiktok.com/@${encodeURIComponent(h)}` };
    },
  },
  {
    id: "github",
    label: "GitHub",
    placeholder: "username or https://github.com/...",
    accent: "#C9D1D9",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/github\.com\/([^/?#]+)/i);
        return { handle: m ? cleanHandle(m[1]) : raw.trim(), url: full };
      }
      const h = cleanHandle(raw);
      return { handle: h, url: `https://github.com/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "twitch",
    label: "Twitch",
    placeholder: "channel or https://twitch.tv/...",
    accent: "#9146FF",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/twitch\.tv\/([^/?#]+)/i);
        return { handle: m ? cleanHandle(m[1]) : raw.trim(), url: full };
      }
      const h = cleanHandle(raw);
      return { handle: h, url: `https://www.twitch.tv/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "spotify",
    label: "Spotify",
    placeholder: "username or https://open.spotify.com/...",
    accent: "#1DB954",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) return { handle: "Spotify", url: full };
      const h = cleanHandle(raw);
      return { handle: h, url: `https://open.spotify.com/user/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "reddit",
    label: "Reddit",
    placeholder: "u/username or https://reddit.com/u/...",
    accent: "#FF4500",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        const m = full.match(/reddit\.com\/(?:user|u)\/([^/?#]+)/i);
        return { handle: m ? `u/${cleanHandle(m[1])}` : raw.trim(), url: full };
      }
      const h = cleanHandle(raw.replace(/^u\//i, ""));
      return { handle: `u/${h}`, url: `https://www.reddit.com/user/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "steam",
    label: "Steam",
    placeholder: "custom ID or https://steamcommunity.com/id/...",
    accent: "#66C0F4",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) return { handle: "Steam", url: full };
      const h = cleanHandle(raw);
      return { handle: h, url: `https://steamcommunity.com/id/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    placeholder: "handle or https://linkedin.com/in/...",
    accent: "#0A66C2",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) return { handle: "LinkedIn", url: full };
      const h = cleanHandle(raw);
      return { handle: h, url: `https://www.linkedin.com/in/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "bluesky",
    label: "Bluesky",
    placeholder: "handle.bsky.social or https://bsky.app/...",
    accent: "#0085FF",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) return { handle: raw.trim(), url: full };
      const h = cleanHandle(raw);
      const handleWithDomain = h.includes(".") ? h : `${h}.bsky.social`;
      return {
        handle: `@${handleWithDomain}`,
        url: `https://bsky.app/profile/${encodeURIComponent(handleWithDomain)}`,
      };
    },
  },
  {
    id: "telegram",
    label: "Telegram",
    placeholder: "@username or https://t.me/...",
    accent: "#26A5E4",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) return { handle: raw.trim(), url: full };
      const h = cleanHandle(raw);
      return { handle: `@${h}`, url: `https://t.me/${encodeURIComponent(h)}` };
    },
  },
  {
    id: "other",
    label: "Other platform",
    placeholder: "https://your-social-profile.com/...",
    accent: "#A78BFA",
    buildUrl: (raw) => {
      const full = parseIfFullUrl(raw);
      if (full) {
        try {
          const host = new URL(full).hostname.replace(/^www\./, "");
          return { handle: host, url: full };
        } catch {
          return { handle: full, url: full };
        }
      }
      const withHttps = `https://${raw.trim()}`;
      return { handle: raw.trim(), url: withHttps };
    },
  },
];

export function getSocialPlatformMeta(platformRaw: string): {
  label: string;
  accent: string;
  key: string;
} {
  const key = platformRaw.trim().toLowerCase();
  const match = SOCIAL_PLATFORMS.find(
    (p) => p.id === key || p.label.toLowerCase() === key,
  );
  if (match && match.id !== "other") {
    return { label: match.label, accent: match.accent, key: match.id };
  }
  return {
    label: platformRaw.trim() || "Social",
    accent: "#A78BFA",
    key,
  };
}

export function isHandleOnlyDiscord(social: UserSocialLink): boolean {
  const key = social.platform.trim().toLowerCase();
  return key === "discord" && (!social.url || social.url === "https://discord.com/users");
}

export function SocialBrandIcon({
  platform,
  size = 15,
}: {
  platform: string;
  size?: number;
}) {
  const key = platform.trim().toLowerCase();
  switch (key) {
    case "discord":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
        </svg>
      );
    case "x":
    case "twitter":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "instagram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1Z" />
        </svg>
      );
    case "github":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.39-5.27 5.68.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
        </svg>
      );
    case "twitch":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
        </svg>
      );
    case "spotify":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
      );
    case "reddit":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    case "telegram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case "steam":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

export function WebsiteGlobeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function ExternalArrowIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}
