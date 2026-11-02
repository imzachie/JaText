import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { isGenuineIosDevice } from "../lib/iosDetection";
import { navigateToChats, navigateToIosChats } from "../lib/webRoute";
import { IosWelcomeGate } from "./IosWelcomeGate";
import "../landingHero.css";

type SketchTab = "chat" | "calls" | "e2ee";

interface FeatureItem {
  index: string;
  title: string;
  description: string;
  tags: string[];
  icon: ReactNode;
}

interface UpdateLogEntry {
  version: string;
  date: string;
  headline: string;
  latest?: boolean;
  bullets: string[];
}

function handleStartChattingClick(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  if (isGenuineIosDevice()) {
    navigateToIosChats();
  } else {
    navigateToChats();
  }
}

const FEATURES: FeatureItem[] = [
  {
    index: "01",
    title: "Real Zero-Knowledge E2EE",
    description:
      "Every 1:1 message, attachment, and rotating group epoch key is encrypted right on your device with WebCrypto ECDH P-256 and AES-256-GCM before anything touches the wire, complete with peer security-code verification.",
    tags: ["ECDH P-256", "AES-256-GCM", "Verify Security Code"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="10" rx="2.5" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        <circle cx="12" cy="16" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    index: "02",
    title: "HD Voice, Video & Audio Screen Share",
    description:
      "Jump into 1:1 or mesh group voice/video calls with clickable full-screen screen sharing WITH audio on desktop and mobile, a 5-clip live soundboard, and dominant first-device pickup across logged-in devices.",
    tags: ["WebRTC Mesh", "Screen + Audio", "5-Clip Soundboard"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="4" width="14" height="12" rx="2.2" />
        <path d="m16.5 8.5 5-2.8v8.6l-5-2.8z" />
        <path d="M6.5 20h6" />
      </svg>
    ),
  },
  {
    index: "03",
    title: "Custom Themes, Bubbles & Wallpapers",
    description:
      "Choose Light, Ash, Dark, Onyx, or custom gradient themes synced across devices, personalize outgoing bubbles across 1:1 DMs, Groups, and Community, and react with multiple emojis on any message.",
    tags: ["Synced Themes", "Custom Bubbles", "Polls & Stickers"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.7 8.7 0 0 1-3.8-.9L3 20.5l1.6-4.8A8.4 8.4 0 1 1 21 11.5z" />
        <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth="2.8" />
      </svg>
    ),
  },
  {
    index: "04",
    title: "Voice Notes & Music-Smart Transcription",
    description:
      "Send crisp waveform voice notes with instant playback and one-tap speech-to-text transcription that automatically detects music clips and labels them '(Music)' instead of hallucinating lyrics.",
    tags: ["Waveform Audio", "Auto Music Guard", "On-Demand Transcript"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2.5" width="6" height="11" rx="3" />
        <path d="M5 10.5a7 7 0 0 0 14 0" />
        <path d="M12 17.5v4M8.5 21.5h7" />
      </svg>
    ),
  },
  {
    index: "05",
    title: "Rich Link Embeds & Context Forwarding",
    description:
      "Paste YouTube, X/Twitter, GitHub, or web links for clean Discord-style OpenGraph preview cards, and forward messages as structured context cards with original timestamps and one-click jump-to-source.",
    tags: ["OpenGraph Cards", "Jump to Original", "Social Profiles"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19.07" />
      </svg>
    ),
  },
  {
    index: "06",
    title: "Offline-First Cache & Multi-Account Slots",
    description:
      "IndexedDB caches DMs and group histories locally for instant 0ms opens. Switch between multiple signed-in accounts on Web and Android without logging out, with custom ringtones and plaintext decrypted push alerts.",
    tags: ["IndexedDB 0ms Load", "Fast Account Switch", "Web + Android APK"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5" />
        <path d="M4 20 21 3" />
        <path d="M21 16v5h-5" />
        <path d="m15 15 6 6" />
        <path d="M4 4l5 5" />
      </svg>
    ),
  },
];

const UPDATE_LOGS: UpdateLogEntry[] = [
  {
    version: "v3.9.4",
    date: "November 2, 2026",
    headline: "5-Tab Mobile Navigation (Updates, Calls, Groups, Chats, You), Live Mobile Typing Indicators & Friend Request Fix",
    latest: true,
    bullets: [
      "Redesigned mobile navigation into a 5-tab capsule (Updates, Calls, Groups, Chats defaulting on the 4th tab for 1:1 P2P chats, and You with your profile avatar opening Settings) with 1:1 SVG icons and no separated search button.",
      "Fixed real-time typing indicators across mobile 1:1 DMs, Groups, and Community (both sending and sub-second sync receiving), and fixed outgoing friend requests showing the recipient profile instead of your own.",
    ],
  },
  {
    version: "v3.9.2",
    date: "November 1, 2026",
    headline: "iOS 26.3 Chats Header & Separated Liquid Glass Search Bar",
    bullets: [
      "Replaced the mobile greeting banner with a clean SF Pro Bold Chats title (pure White on dark themes and pure Black on light themes) and removed the permanent top search bar.",
      "Updated the bottom Liquid Glass navigation bar to the iOS 26.3 layout with Chats, Calls, Add, and Settings in the primary capsule plus a separated circular icon-only Search button on the right end.",
    ],
  },
  {
    version: "v3.9.1",
    date: "November 1, 2026",
    headline: "Native Apple SF Pro Typography Across Android APK (Display, Text & Rounded)",
    bullets: [
      "Bundled the full SF Pro typography suite (SF Pro Text, SF Pro Display, and SF Pro Rounded across Regular, Medium, Semibold, Bold, Heavy, Black, Light, Thin, Ultralight, and Italics) across every screen, chat message, input, modal, badge, and call overlay in the JaText Android APK.",
    ],
  },
  {
    version: "v3.9.0",
    date: "November 1, 2026",
    headline: "View Once, Passkeys & 2FA, Chat Folders & Pins, Custom Soundboards, Multi-Language & E2EE Reliability",
    bullets: [
      "Added View Once messages with fullscreen viewer and permanent burn, custom call Soundboards, Chat Folders and Pinning, in-chat message search, bulk multi-file attachments, draggable voice-note scrubbing, and 17-language support across Mobile and Desktop.",
      "Added Authenticator App 2FA and Passkeys (WebAuthn + Android Credential Manager), mobile screen-share audio, DM and Group @mentions, Blocked Users manager, and multi-device E2EE key self-healing.",
    ],
  },
  {
    version: "v3.8.7",
    date: "November 1, 2026",
    headline: "Scheduled Messages, Animated Composer Plus Menu & Instant In-Call Desktop Messaging",
    bullets: [
      "Replaced the composer attachment icon with an animated + menu across Mobile and Desktop featuring Upload attachment, Schedule message with future date/time presets, and a live Scheduled message manager with animated removal.",
      "Eliminated Desktop send/unsend latency and Failed to fetch errors during active 1:1 and Group calls with indexed Turso queries, mutation-priority polling, call-signal attachment filtering, and automatic RPC retries.",
    ],
  },
  {
    version: "v3.8.6",
    date: "November 1, 2026",
    headline: "Seamless Desktop-to-Mobile Calling, Instant Multi-Device Call Dismissal & Mobile Video Player Scrubber",
    bullets: [
      "Unified encrypted SDP signaling and E2EE overflow hydration across Desktop Web, Android APK, and iOS so 1:1 and Group calls connect reliably in both directions.",
      "Added instant sibling-device call dominance and FCM cancel push wakes so answering or declining a call on Mobile or Desktop immediately stops ringing and dismisses the prompt on your other devices, plus a full scrubbable progress bar and video controller on Mobile.",
    ],
  },
  {
    version: "v3.8.0",
    date: "October 31, 2026",
    headline: "JaText iOS Web & Liquid Glass PWA (/ios/chats) with 1:1 Mobile Parity & Live Updates",
    bullets: [
      "Launched jatext.vercel.app/ios/chats exclusively for iOS Safari and Chrome users with an instant On iOS? welcome screen, standalone Home Screen PWA installation, and automatic live PWA refresh notifications on every deploy.",
      "Delivered 1:1 JaText mobile parity on iOS including Google and Email sign-in, multi-account switching, Settings -> Devices rear-camera QR scanning to link Desktop Web, mobile chat wallpapers, and iOS 26 Liquid Glass animations across Settings and chat surfaces.",
    ],
  },
  {
    version: "v3.7.2",
    date: "October 31, 2026",
    headline: "Instant Desktop Delete-for-Me, Strict Keyboard Focus Control & Mobile-Only Chat Wallpapers",
    bullets: [
      "Made Desktop Delete for me instantaneous and permanent across 1:1 DMs, Groups, and Community while keeping 5-second Undo restoration seamless.",
      "Stopped soft keyboards from ever opening on their own after being dismissed, and restored Chat Wallpapers strictly to mobile devices.",
    ],
  },
  {
    version: "v3.7.1",
    date: "October 31, 2026",
    headline: "Both-Sides Snappy Thanos Snap, Reliable Delete Undo & Looping Animated GIF PFPs, Banners & Wallpapers",
    bullets: [
      "Upgraded message unsend with a faster Thanos Snap particle sweep visible on both sender and recipient devices, followed cleanly by the visible This message was unsent notice, and fixed Desktop Delete for me Undo so messages restore instantaneously.",
      "Enabled continuous infinite-looping animated GIFs across Mobile Chat Wallpapers, Profile Banners, User PFPs, and Group PFPs with lossless GIF89a loop patching and chunked media reassembly.",
    ],
  },
  {
    version: "v3.7.0",
    date: "October 31, 2026",
    headline: "Thanos Snap Unsend, 5s Delete Undo, Pinch-to-Zoom & Image Hold Menu, On-Demand Voice Transcription & Group Moderation",
    bullets: [
      "Added 1:1 Telegram Thanos Snap particle disintegration on message unsend, a 5-second Deleted the message for me Undo popup, on-demand voice note transcription with Hide transcribe, Desktop Web notifications with the default JaText sound, smooth spring call animations, centered 2-minute rotating QR link cards, and balanced anti-DDoS rate limiting.",
      "Upgraded Native Android with full animated GIF playback, pinch-to-zoom fullscreen image viewer, Image Hold menu (Copy image, Copy image address, Save to Favourites), automatic keyboard dismissal on call start, E2EE group Add members, and owner/moderator Mute and Remove controls.",
    ],
  },
  {
    version: "v3.6.0",
    date: "October 31, 2026",
    headline: "Mobile QR Linked Devices, End-to-End Encrypted Companion Sync & Live Device Management",
    bullets: [
      "Link JaText Web directly from your phone via Settings -> Devices -> Scan with QR code with zero-knowledge ECDH + AES-256-GCM keyring and attachment sync.",
      "View up to 5 connected web sessions live in Mobile Settings and disconnect any linked browser session instantaneously.",
    ],
  },
  {
    version: "v3.5.4",
    date: "October 31, 2026",
    headline: "Seamless Desktop & Mobile E2EE Keyring Sync, Stroked SVG Chat Menu & Wallpaper Event Pills",
    bullets: [
      "Unified multi-device E2EE keyring auto-sync and live Turso delta sync across Desktop Web and Native Android so messages sent from either device decrypt immediately with zero waiting.",
      "Upgraded the mobile 3-dots chat menu to JaText's crisp stroked SVG vector icons, rendered shared wallpaper updates as clean event pills, and added a one-tap Sync Messages & Keys action.",
    ],
  },
  {
    version: "v3.5.3",
    date: "October 31, 2026",
    headline: "24 Vector Mascot Bubble Styles, Wallpaper-Tinted Contact Cards, Rich Media & Full Web UI Parity",
    bullets: [
      "Ported all 24 Web vector mascot and illustrated bubble styles, real shared chat wallpapers that tint contact headers and profile cards, Markdown bios on both Web and Android, and 1:1 Customise Theme, Socials, Legal Policies, and JaText Community announcement layouts.",
      "Fixed mobile image, inline video, and voice note attachments, decrypted quoted reply previews, added Sent / Delivered / Read text receipts, Group Seen by avatars, Group PFP uploads, Sticker & Emoji Favourites and Most Used tabs, OpenGraph link embed images, Call event cards, and a freely draggable floating call bubble.",
    ],
  },
  {
    version: "v3.5.2",
    date: "October 31, 2026",
    headline: "1:1 Web UI Parity Overhaul, Fixed Google Sign-In Sheet, Legacy E2EE Repair & Crash-Proof Calls",
    bullets: [
      "Rebuilt the Android UI to match jatext.vercel.app 1:1 with the #9B6CFF web purple palette, 3px ringed 9-colour avatars, 2.5px profile card outlines, greeting banner, pill tabs, and verified JaText Community badges.",
      "Fixed the AndroidX Browser CustomTab toolbar cornerRadiusDp crash on Sign in with Google, repaired legacy incomplete E2EE identity slots causing error parsing private key on send, added runtime mic/camera permission guards for calls, and mounted a global Update your JaText version! prompt across all screens.",
    ],
  },
  {
    version: "v3.5.1",
    date: "October 31, 2026",
    headline: "Zero-Config In-App Mobile Google Sign-In Sheet & Dual-Channel Session Handoff",
    bullets: [
      "Fixed mobile Continue with Google silently dropping Play Services [28444] unregistered SHA-1 responses after account selection.",
      "Added an in-app 82%-height rounded Partial Custom Tab OAuth sheet with dual-channel return (instant com.ahad00010.jatext://auth deep-link plus Turso mobileSession background polling) so Google Sign-In goes straight into JaText with zero Google Cloud SHA-1 setup required.",
    ],
  },
  {
    version: "v3.5.0",
    date: "October 31, 2026",
    headline: "100% Pure Native Android APK (Kotlin + Jetpack Compose) & In-App Google Sign-In",
    bullets: [
      "Rebuilt the entire JaText Android app in pure Kotlin and Jetpack Compose with zero WebView or Capacitor code, delivering native 120Hz RenderThread scrolling, zero-gap keyboard insets, and zero-lag Customise Theme HSV controls.",
      "Added in-app Google Sign-In via Android Credential Manager backed by server-side Google ID token verification on Turso so mobile accounts sign in directly inside JaText without redirecting to Chrome.",
      "Preserved 100% Web + Android interoperability across NIST P-256 E2EE messages, voice notes, 64 MB chunked media, 24 custom bubble styles, cross-device synced themes, and native org.webrtc 1:1 & Group calls with audio screen sharing and the 5-clip Soundboard.",
    ],
  },
  {
    version: "v3.4.4",
    date: "October 31, 2026",
    headline: "Zero-Flash Outgoing E2EE Delivery & Native 120Hz Mobile Chat Scrolling",
    bullets: [
      "Pre-seeded outgoing ECDH and Group Epoch encryption caches before network dispatch and pre-warmed incoming delta batches so sent and received messages never flash a transient Decrypting message placeholder.",
      "Eliminated idle delta-sync React re-renders, switched Sidebar row holds to compositor-safe PointerEvents, replaced 480 per-bubble touch listeners and idle GPU badge layers with a single delegated passive swipe listener, and tuned Android WebView direct Viz compositing for butter-smooth 60 to 120 FPS mobile chat scrolling.",
    ],
  },
  {
    version: "v3.4.3",
    date: "October 31, 2026",
    headline: "Official Mastered Default Notification Audio Asset",
    bullets: [
      "Updated the default JaText notification sound across Web and Android (NotificationChannel v6) directly to the exact mastered JaText Notification-FIXED.mp3 audio file with zero runtime gain modification.",
    ],
  },
  {
    version: "v3.4.2",
    date: "October 30, 2026",
    headline: "60 FPS Mobile Chat Scroll, Chunked Video & Audio Uploads, Singapore Low-Latency Sync & Older History",
    bullets: [
      "Fixed mobile gradient-theme chat overlap and eliminated scroll jank using opaque mobile chat surfaces, passive native swipe-to-reply listeners, and pointer-based hold gestures.",
      "Added chunked up-to-64 MB video and audio uploads with HTTP 206 byte-range streaming and E2EE range assembly, plus smooth scroll-anchored older message pagination across DMs, Groups, and Community.",
      "Pinned serverless edge functions to Singapore (sin1), fixed write-timestamp sync overlap and foreground FCM wake pokes for instant text arrival, switched lighter-bubble voice notes to crisp black ink, raised mobile context menus above the navigation bar, and boosted default notification volume to +55%.",
    ],
  },
  {
    version: "v3.4.1",
    date: "October 30, 2026",
    headline: "Zero-Lag Mobile Custom Theme Palette & GPU Touch Sliders",
    bullets: [
      "Replaced native WebView range inputs in Customise Theme with custom GPU-composited translate3d touch sliders and passive-false touch guards for zero touch-slop on Android.",
      "Switched live full-screen gradient previewing to an opaque hardware-scaled canvas and isolated drawer surface tokens to eliminate subtree style recalculations and overdraw while dragging.",
      "Eliminated synchronous layout reads and finger-release root style stalls across the 2D saturation-brightness palette, Hue, Gradient Direction, and Colour Intensity controls.",
    ],
  },
  {
    version: "v3.4.0",
    date: "October 30, 2026",
    headline: "Full Turso (libSQL) Cloud Migration, Built-In 30-Day Auth & CDN Media Storage",
    bullets: [
      "Migrated JaText's entire database, auth, media storage, and real-time sync engine to Turso (libSQL) with automatic zero-touch schema setup.",
      "Replaced external auth dependencies with built-in scrypt Email/Password authentication, Google OAuth 2.0 on both Web (/chats) and Android, and multi-tab 30-day sessions.",
      "Preserved 100% of zero-knowledge E2EE, 1:1 and Group WebRTC calls with audio screen sharing, custom synced themes, custom bubbles, polls, and Android background push decryption.",
    ],
  },
  {
    version: "v3.3.7",
    date: "October 30, 2026",
    headline: "Mobile Login Scroll & Tap Fix, Auth Env Schema & Live Health Diagnostics",
    bullets: [
      "Fixed mobile Login and Onboarding scrolling & button/input tapping inside locked mobile viewports, with zero permanent transform hit-test offsets.",
      "Declared all Convex Auth environment variables in convex.config.ts, added live Convex backend health diagnostics on sign-in errors, and gave Light-theme error boxes crisp contrast.",
      "Retained 120 FPS Custom Theme sliders, cross-device theme sync, OAuth /chats return latching, and 30-day refresh token protection.",
    ],
  },
  {
    version: "v3.3.6",
    date: "October 30, 2026",
    headline: "Google OAuth & Long-Lived Session Persistence Fix, 120 FPS Custom Theme Sliders & Unread Fixes",
    bullets: [
      "Fixed Google OAuth sign-in on /chats and prevented hourly JWT refresh races or cold-start watchdogs from wiping valid 30-day refresh tokens across tabs.",
      "Replaced raw Convex auth server errors on the sign-in screen with clear guidance and improved JaText logo legibility on Light gradient themes.",
      "Re-engineered the Custom Theme builder for zero-lag 120 FPS mobile dragging/scrolling, real-time cross-device theme sync, accurate unread badges, and 'Mark as done' on hold or right-click.",
    ],
  },
  {
    version: "v3.3.5",
    date: "October 30, 2026",
    headline: "120 FPS Mobile Custom Theme Sliders, Real-Time Cross-Device Theme Sync & Unread Fixes",
    bullets: [
      "Re-engineered the Custom Theme builder with isolated GPU layer painting, translate3d picker thumbs, and horizontal touch-action sliders for zero-lag 120 FPS mobile dragging and scrolling.",
      "Fixed cross-device theme sync so Default, Preset Colour, and Custom themes save reliably to your account and update across signed-in mobile and desktop sessions in real time.",
      "Eliminated ghost unread badges and stuck UNREAD MESSAGES dividers caused by silent E2EE reaction/seen signals or cached conversations, and fixed blank sender preview lines.",
      "Added 'Mark as done' to the hold (mobile) and right-click (desktop) context menus on all Groups and 1:1 Chats to clear unread indicators immediately.",
    ],
  },
  {
    version: "v3.3.4",
    date: "October 30, 2026",
    headline: "Categorised Settings, 1:1 Theme Engine, Custom Theme Builder & 60 FPS Mobile Optimisations",
    bullets: [
      "Reorganised Settings into clear desktop and mobile categories (Profile, Appearance, Socials, Alerts & Audio, Encryption, and Legal Policies) with a focused Socials & Website editor.",
      "Added app-wide Light, Ash, Dark, Onyx, and System modes plus 22 preset gradient colour themes, direct swatch hover tooltips, and cross-device theme sync.",
      "Shipped the live Custom Theme side drawer with Dark/Light base toggle, multi-stop colour gradient bar, 2D saturation-brightness picker, hue slider, hex/eyedropper input, gradient direction, and colour intensity.",
      "Updated the Hero page to an eye-friendly dark slate background with the official JaText logo, removed em dashes across the app, and optimised mobile GPU compositing and VSync touch dragging for locked 60 FPS.",
    ],
  },
  {
    version: "v3.3.3",
    date: "October 30, 2026",
    headline: "/chats Web Route, Group History Controls & Rich Link Previews",
    bullets: [
      "Moved the full JaText web app to jatext.vercel.app/chats while keeping the native Android APK opening directly into your chats.",
      "Restricted permanent 'Delete group' (2-step exact-name confirmation) strictly to the group owner and added 'Remove chat' for owners, moderators, and members to clear group chat history without leaving the group.",
      "Fixed dark unreadable text inside link-embed preview cards when using light-background custom chat bubbles.",
      "Added full OpenGraph and Twitter preview metadata so sharing jatext.vercel.app renders a rich informative link card.",
    ],
  },
  {
    version: "v3.3.2",
    date: "October 30, 2026",
    headline: "60 FPS Main-Thread Stability & Deterministic Unread Sync",
    bullets: [
      "Eliminated an unbounded main-thread re-render loop by making local DM, Group, and Community read-markers strictly idempotent on message timestamps.",
      "Stabilized Convex store callback identities and memoized LinkEmbeds and ForwardedMessageCard rendering across long conversations.",
    ],
  },
  {
    version: "v3.3.1",
    date: "October 30, 2026",
    headline: "Discord-Style Link Embeds, Forwarded Context Cards & Profile Socials",
    bullets: [
      "Added automatic OpenGraph / oEmbed link preview cards for YouTube, X/Twitter, GitHub, and general websites.",
      "Replaced plain forwarded text prefixes with structured Forwarded Message context cards showing original date/time and jump-to-source navigation when permitted.",
      "Added Socials and Website fields on user profiles, silent archived chats, JaText Community Mute/Unmute context menu, and smooth 3-dots dropdown animations.",
    ],
  },
  {
    version: "v3.3.0",
    date: "October 29, 2026",
    headline: "Zero-Gap Mobile Keyboard, Lock-Screen Call Wake & Custom Audio",
    bullets: [
      "Engineered single-pass Android IME inset alignment so the mobile keyboard sits flush beneath the message composer with automatic scroll-to-bottom.",
      "Added reliable lock-screen incoming call wake, looping 'JaText (Default)' ringtone, +40% boosted default notification sound, custom device audio pickers, and 60-second unanswered 'Call dismissed' retry UX.",
      "Tightened read receipts so messages only mark 'Read' when the recipient actively opens the conversation on an unlocked screen.",
    ],
  },
  {
    version: "v3.2.0",
    date: "October 28, 2026",
    headline: "WhatsApp-Style Security Code Verification, Local Cache & Mentions",
    bullets: [
      "Streamlined zero-knowledge E2EE with 12-block peer Security Code verification right on user profiles and decrypted native push notifications.",
      "Shipped IndexedDB local conversation caching, fast multi-account slot switching without signing out, and @username + admin @everyone group mention alerts.",
    ],
  },
];

export function LandingHeroPage() {
  const [activeTab, setActiveTab] = useState<SketchTab>("chat");
  const [isIosVisitor] = useState<boolean>(() => isGenuineIosDevice());
  const [showIosGate, setShowIosGate] = useState<boolean>(() => isGenuineIosDevice());
  const chatsHref = isIosVisitor ? "/ios/chats" : "/chats";

  useEffect(() => {
    document.documentElement.classList.add("jatext-landing-route");
    return () => {
      document.documentElement.classList.remove("jatext-landing-route");
    };
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".jt-reveal"));
    if (nodes.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="jt-sketch-page">
      {isIosVisitor && showIosGate && (
        <IosWelcomeGate onDismissForReading={() => setShowIosGate(false)} />
      )}
      <svg className="jt-sketch-svg-defs" aria-hidden="true">
        <defs>
          <filter id="jt-pencil-wobble" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* Top Sticky Sketch Navbar */}
      <header className="jt-nav-wrap">
        <nav className="jt-nav" aria-label="Primary">
          <a href="#top" className="jt-brand">
            <img
              className="jt-brand-logo-img"
              src="/jatext-logo-icon.png"
              alt="JaText logo"
            />
            <span className="jt-brand-text">
              <span className="jt-brand-name">JaText</span>
              <span className="jt-stamp-pill">
                <span className="jt-live-dot" />
                v3.9.4 · Live
              </span>
            </span>
          </a>

          <div className="jt-nav-links">
            <a href="#features">Features</a>
            <a href="#security">Zero-Knowledge E2EE</a>
            <a href="#updates">Update Logs</a>
            {isIosVisitor ? (
              <a href={chatsHref} onClick={handleStartChattingClick}>
                Open Web App (/ios/chats)
              </a>
            ) : (
              <a href="/downloads/JaText-release.apk">Android APK</a>
            )}
          </div>

          <div className="jt-nav-actions">
            <a
              href={chatsHref}
              onClick={handleStartChattingClick}
              className="jt-btn-primary jt-btn-sm"
            >
              Start chatting
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main id="top">
        <section className="jt-hero">
          <div className="jt-container">
            <div className="jt-hero-grid">
              {/* Left Column */}
              <div>
                <div className="jt-margin-note">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  Real WebCrypto E2EE · Zero ads · Web &amp; Android
                </div>

                <h1 className="jt-hero-title">
                  Text your people,{" "}
                  <span className="jt-marker-highlight">
                    inked in privacy
                    <svg className="jt-underline-svg" viewBox="0 0 320 14" fill="none" preserveAspectRatio="none" aria-hidden="true">
                      <path
                        className="jt-draw-stroke jt-draw-delay-1"
                        pathLength={1}
                        d="M4 9.5C78 3.2 214 2.8 316 8.6"
                        stroke="#22c55e"
                        strokeWidth="3.4"
                        strokeLinecap="round"
                        filter="url(#jt-pencil-wobble)"
                      />
                    </svg>
                  </span>{" "}
                  &amp; built for real talk.
                </h1>

                <p className="jt-hero-lead">
                  JaText pairs authentic client-side end-to-end encryption with HD 1:1 and mesh
                  group calls, screen sharing with audio, custom chat themes and bubbles, voice-note
                  transcription, and instant multi-account switching.
                </p>

                <div className="jt-hero-cta-row">
                  <a
                    href={chatsHref}
                    onClick={handleStartChattingClick}
                    className="jt-btn-primary jt-btn-lg"
                  >
                    Start chatting
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </a>

                  {isIosVisitor ? (
                    <a
                      href="/ios/chats"
                      onClick={handleStartChattingClick}
                      className="jt-btn-secondary jt-btn-lg"
                    >
                      Open Web App (/ios/chats)
                    </a>
                  ) : (
                    <a
                      href="/downloads/JaText-release.apk"
                      className="jt-btn-secondary jt-btn-lg"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download Android APK
                    </a>
                  )}
                </div>

                <div className="jt-hero-handnote">
                  <svg width="34" height="20" viewBox="0 0 42 24" fill="none" aria-hidden="true">
                    <path
                      className="jt-draw-stroke jt-draw-delay-2"
                      pathLength={1}
                      d="M38 19C24 20 13 15 7 5M7 5L4 12M7 5L14 7"
                      stroke="#4ade80"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    {isIosVisitor
                      ? "Opens jatext.vercel.app/ios/chats right in your iOS browser, no install needed."
                      : "Opens jatext.vercel.app/chats right in your browser, no install needed."}
                  </span>
                </div>

                <div className="jt-hero-stats">
                  <div className="jt-stat-chip">
                    <strong>P-256 + GCM</strong>
                    <span>Zero-knowledge keys</span>
                  </div>
                  <div className="jt-stat-chip">
                    <strong>60 FPS + 0ms</strong>
                    <span>IndexedDB local cache</span>
                  </div>
                  <div className="jt-stat-chip">
                    <strong>v3.9.4 (Build 61)</strong>
                    <span>{isIosVisitor ? "iOS Web & Liquid Glass PWA" : "Web & Signed APK"}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Dark Sketch Canvas */}
              <div className="jt-sketch-stage">
                <div className="jt-sketch-pin">Interactive Sketch · Click tabs</div>

                <div className="jt-sketch-window">
                  <div className="jt-window-topbar">
                    <div className="jt-window-dots" aria-hidden="true">
                      <span className="jt-window-dot" />
                      <span className="jt-window-dot" />
                      <span className="jt-window-dot green" />
                    </div>

                    <div className="jt-window-tabs" role="tablist" aria-label="JaText Sketch Preview">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "chat"}
                        className={`jt-window-tab ${activeTab === "chat" ? "active" : ""}`}
                        onClick={() => setActiveTab("chat")}
                      >
                        Chat &amp; Bubbles
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "calls"}
                        className={`jt-window-tab ${activeTab === "calls" ? "active" : ""}`}
                        onClick={() => setActiveTab("calls")}
                      >
                        Calls &amp; Screen
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "e2ee"}
                        className={`jt-window-tab ${activeTab === "e2ee" ? "active" : ""}`}
                        onClick={() => setActiveTab("e2ee")}
                      >
                        E2EE Proof
                      </button>
                    </div>
                  </div>

                  <div className="jt-window-body">
                    {activeTab === "chat" && (
                      <>
                        <div className="jt-sketch-chat-header">
                          <div className="jt-sketch-peer">
                            <div className="jt-sketch-avatar">M</div>
                            <div>
                              <strong>Maya · @maya</strong>
                              <span>
                                <span className="jt-live-dot" />
                                Online · Verified E2EE
                              </span>
                            </div>
                          </div>
                          <span className="jt-e2ee-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <rect x="4" y="11" width="16" height="10" rx="2" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                            Encrypted
                          </span>
                        </div>

                        <div className="jt-sketch-messages">
                          <div className="jt-sketch-msg theirs">
                            Check out the latest JaText build: custom themes, bubbles, and link
                            embeds look super clean now:
                            <div className="jt-sketch-embed-mini">
                              <strong>JaText · Private E2EE Chat &amp; HD Calls</strong>
                              Zero-knowledge messaging, screen share with audio &amp; fast multi-account slots.
                            </div>
                            <div className="jt-sketch-reactions">
                              <span className="jt-sketch-reaction-pill">FIRE · 3</span>
                              <span className="jt-sketch-reaction-pill">100 · 2</span>
                            </div>
                          </div>

                          <div className="jt-sketch-msg mine" style={{ animationDelay: "90ms" }}>
                            <div className="jt-sketch-voice-row">
                              <span className="jt-sketch-play-btn" aria-hidden="true">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="6 4 20 12 6 20 6 4" />
                                </svg>
                              </span>
                              <div className="jt-sketch-waveform" aria-hidden="true">
                                {[10, 18, 13, 21, 9, 17, 22, 12, 16, 19, 11, 15].map((h, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      height: `${h}px`,
                                      animationDelay: `${idx * 90}ms`,
                                    }}
                                  />
                                ))}
                              </div>
                              <strong>0:08</strong>
                            </div>
                            <div className="jt-sketch-msg-meta">
                              <span>Transcript: &ldquo;Hopping into Group VC now!&rdquo;</span>
                              <span>Read · 16:42</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {activeTab === "calls" && (
                      <>
                        <div className="jt-sketch-chat-header">
                          <div className="jt-sketch-peer">
                            <div className="jt-sketch-avatar">GC</div>
                            <div>
                              <strong>Design Studio · Group VC</strong>
                              <span>
                                <span className="jt-live-dot" />4 connected · 1080p Screen + Audio
                              </span>
                            </div>
                          </div>
                          <span className="jt-e2ee-badge">WebRTC Mesh</span>
                        </div>

                        <div className="jt-sketch-call-grid">
                          <div className="jt-sketch-screen-tile">
                            <div className="jt-sketch-tile-tag">
                              LIVE SCREEN + SYSTEM AUDIO
                            </div>
                            <strong style={{ display: "block", fontSize: "13.5px", marginBottom: "5px" }}>
                              Kai&apos;s Workspace (Click to expand full screen)
                            </strong>
                            <p style={{ margin: 0, fontSize: "12.5px", color: "#b9ccc0" }}>
                              Works on both desktop and mobile views with dominant first-device
                              call pickup and automatic &ldquo;GC VC Ended&rdquo; logs.
                            </p>
                            <div className="jt-soundboard-strip">
                              <span className="jt-sound-chip">Airhorn</span>
                              <span className="jt-sound-chip">Applause</span>
                              <span className="jt-sound-chip">Bruh</span>
                              <span className="jt-sound-chip">Cricket</span>
                              <span className="jt-sound-chip">Drumroll</span>
                            </div>
                          </div>

                          <div className="jt-sketch-peer-tile">
                            <div className="jt-sketch-tile-tag">PEERS (4)</div>
                            <div style={{ display: "grid", gap: "7px", fontSize: "12.5px", fontWeight: 700 }}>
                              <div>• Zach (Owner)</div>
                              <div>• Maya (Speaking)</div>
                              <div>• Kai (Sharing)</div>
                              <div>• Nova</div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {activeTab === "e2ee" && (
                      <>
                        <div className="jt-sketch-chat-header">
                          <div className="jt-sketch-peer">
                            <div className="jt-sketch-avatar">ZK</div>
                            <div>
                              <strong>Verify Security Code</strong>
                              <span>12-Block Fingerprint · Matched</span>
                            </div>
                          </div>
                          <span className="jt-e2ee-badge">Verified</span>
                        </div>

                        <div className="jt-crypto-proof-box">
                          <strong style={{ fontSize: "13.5px" }}>
                            Shared Safety Number (ECDH P-256 + SHA-256)
                          </strong>
                          <div className="jt-safety-grid">
                            {[
                              "48291",
                              "90314",
                              "77105",
                              "61280",
                              "33941",
                              "10852",
                              "84519",
                              "26703",
                            ].map((block) => (
                              <span key={block} className="jt-safety-cell">
                                {block}
                              </span>
                            ))}
                          </div>
                          <p style={{ margin: 0, fontSize: "12.3px", color: "#b9ccc0" }}>
                            Inspect any message&apos;s AES-256-GCM IV, sender key ID, and ciphertext
                            digest directly from the message context menu.
                          </p>
                        </div>
                      </>
                    )}

                    <div className="jt-window-composer">
                      <span>
                        {isIosVisitor
                          ? "Write an encrypted message in /ios/chats..."
                          : "Write an encrypted message in /chats..."}
                      </span>
                      <a
                        href={chatsHref}
                        onClick={handleStartChattingClick}
                        className="jt-composer-go"
                      >
                        {isIosVisitor ? "Open Web App (/ios/chats)" : "Open /chats →"}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comprehensive Features Section */}
        <section id="features" className="jt-section">
          <div className="jt-container">
            <div className="jt-section-head jt-reveal">
              <span className="jt-eyebrow">Field Sketchbook · What&apos;s Inside</span>
              <h2 className="jt-section-title">
                Every tool your group chat wishes it had, without the bloat.
              </h2>
              <p className="jt-section-sub">
                Designed from scratch for instant responsiveness, genuine cryptographic privacy,
                and playful everyday conversations across Web and Android.
              </p>
            </div>

            <div className="jt-features-grid">
              {FEATURES.map((feature, i) => (
                <article
                  key={feature.index}
                  className="jt-sketch-card jt-reveal"
                  style={{ transitionDelay: `${(i % 3) * 70}ms` }}
                >
                  <span className="jt-card-index">{feature.index}</span>
                  <div className="jt-card-icon" aria-hidden="true">
                    {feature.icon}
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <div className="jt-card-tags">
                    {feature.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Zero-Knowledge Security & Architecture */}
        <section id="security" className="jt-section">
          <div className="jt-container">
            <div className="jt-section-head jt-reveal">
              <span className="jt-eyebrow">Zero-Knowledge Architecture</span>
              <h2 className="jt-section-title">
                Your private keys never leave your device. Period.
              </h2>
              <p className="jt-section-sub">
                JaText never relies on decorative lock icons: every DM and group message carries
                verifiable client-side ciphertext sealed before upload.
              </p>
            </div>

            <div className="jt-arch-box jt-reveal">
              <div className="jt-arch-steps">
                <div className="jt-arch-step">
                  <span className="jt-arch-step-num">1</span>
                  <h4>Device Keypair Generation</h4>
                  <p>
                    WebCrypto generates non-extractable ECDH P-256 identity keys locally on sign-in
                    and derives shared secrets via HKDF-SHA256.
                  </p>
                </div>

                <div className="jt-arch-step">
                  <span className="jt-arch-step-num">2</span>
                  <h4>AES-256-GCM Per-Message Seal</h4>
                  <p>
                    Plaintext, files, voice notes, and group epoch keys are encrypted with fresh
                    96-bit IVs before Convex ever sees a byte.
                  </p>
                </div>

                <div className="jt-arch-step">
                  <span className="jt-arch-step-num">3</span>
                  <h4>Verify &amp; Audit Anytime</h4>
                  <p>
                    Compare 12-block security codes on any friend&apos;s profile or open the live
                    Encryption Proof inspector on individual messages.
                  </p>
                </div>
              </div>

              <div className="jt-spec-belt">
                {[
                  "ECDH P-256 + HKDF-SHA256",
                  "AES-256-GCM Authenticated Cipher",
                  "Rotating Group Epoch Keys",
                  "Owner-Only Group Deletion + Non-Leaving Chat Clear",
                  "Decrypted Native Android Push",
                  "Multi-Account Isolated Storage",
                ].map((item) => (
                  <span key={item} className="jt-spec-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Dated Newest Update Logs */}
        <section id="updates" className="jt-section">
          <div className="jt-container">
            <div className="jt-section-head jt-reveal">
              <span className="jt-eyebrow">Dated Release Notes · Changelog</span>
              <h2 className="jt-section-title">Newest JaText update logs</h2>
              <p className="jt-section-sub">
                Every web deploy and signed Android release APK is tracked with exact dates and
                verifiable build numbers.
              </p>
            </div>

            <div className="jt-changelog-list">
              {UPDATE_LOGS.map((entry) => (
                <article
                  key={entry.version}
                  className={`jt-log-entry jt-reveal ${entry.latest ? "latest" : ""}`}
                >
                  <span className="jt-log-node" aria-hidden="true" />
                  <div className="jt-log-header">
                    <div className="jt-log-title-group">
                      <span className="jt-log-version">{entry.version}</span>
                      {entry.latest && <span className="jt-log-newest-tag">Newest Release</span>}
                      <h3 className="jt-log-headline">{entry.headline}</h3>
                    </div>
                    <time className="jt-log-date">{entry.date}</time>
                  </div>
                  <ul className="jt-log-bullets">
                    {entry.bullets.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom Sketch Callout */}
        <section className="jt-container">
          <div className="jt-cta-banner jt-reveal">
            <div>
              <h2>Ready to jump into your chats?</h2>
              <p>
                {isIosVisitor ? (
                  <>
                    Launch JaText for iOS instantly at{" "}
                    <strong>jatext.vercel.app/ios/chats</strong> with zero installation required.
                  </>
                ) : (
                  <>
                    Launch the full JaText web app at{" "}
                    <strong>jatext.vercel.app/chats</strong> or grab the latest signed Android
                    Release APK (v3.9.4).
                  </>
                )}
              </p>
            </div>
            <div className="jt-cta-banner-actions">
              <a
                href={chatsHref}
                onClick={handleStartChattingClick}
                className="jt-btn-primary jt-btn-lg"
              >
                Start chatting
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </a>
              {isIosVisitor ? (
                <a
                  href="/ios/chats"
                  onClick={handleStartChattingClick}
                  className="jt-btn-secondary jt-btn-lg"
                >
                  Open Web App (/ios/chats)
                </a>
              ) : (
                <a
                  href="/downloads/JaText-release.apk"
                  className="jt-btn-secondary jt-btn-lg"
                >
                  Get Android APK (v3.9.4)
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="jt-footer">
        <div className="jt-container jt-footer-inner">
          <div className="jt-footer-brand">
            <img src="/jatext-logo-icon.png" alt="JaText logo" />
            <span>
              <strong>JaText v3.9.4</strong> · End-to-End Encrypted Messaging &amp; HD Calls
            </span>
          </div>
          <div className="jt-footer-links">
            <a href={chatsHref} onClick={handleStartChattingClick}>
              {isIosVisitor ? "Open Web App (/ios/chats)" : "Open Web App (/chats)"}
            </a>
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#updates">Update Logs</a>
            {!isIosVisitor && <a href="/downloads/JaText-release.apk">Download APK</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
