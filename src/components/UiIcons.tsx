import type { CSSProperties, ReactNode } from "react";

export interface UiIconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  title?: string;
}

function joinCls(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

function BaseSvg({
  size = 18,
  className,
  strokeWidth = 1.9,
  style,
  title,
  children,
}: UiIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinCls("ui-icon", className)}
      style={style}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation, Controls & Actions                                      */
/* ------------------------------------------------------------------ */

export function CloseIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </BaseSvg>
  );
}

export function ArrowLeftIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m15 18-6-6 6-6" />
      <path d="M9 12h11" />
    </BaseSvg>
  );
}

export function ArrowRightIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </BaseSvg>
  );
}

export function ArrowUpRightIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </BaseSvg>
  );
}

export function ArrowDownLeftIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M17 7 7 17" />
      <path d="M16 17H7V8" />
    </BaseSvg>
  );
}

export function MoreVerticalIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="5" r="1.25" fill="currentColor" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
      <circle cx="12" cy="19" r="1.25" fill="currentColor" />
    </BaseSvg>
  );
}

export function CheckIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </BaseSvg>
  );
}

export function CheckCircleIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8.5 12.3 2.4 2.4 4.8-5" />
    </BaseSvg>
  );
}

export function PlusIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseSvg>
  );
}

export function SearchIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m20 20-3.6-3.6" />
    </BaseSvg>
  );
}

export function SettingsIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.42 1.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </BaseSvg>
  );
}

/* ------------------------------------------------------------------ */
/* Messaging, Composer & Context Menu                                  */
/* ------------------------------------------------------------------ */

export function MessageCircleIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22l5.9-2Z" />
    </BaseSvg>
  );
}

export function BubblePaletteIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.7 8.7 0 0 1-3.6-.8L3 20.5l1.5-4.7A8.4 8.4 0 1 1 21 11.5Z" />
      <circle cx="9" cy="11.5" r="1" fill="currentColor" />
      <circle cx="12.5" cy="9.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="12" r="1" fill="currentColor" />
    </BaseSvg>
  );
}

export function SendIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m21.5 3.5-9.2 17.3a.55.55 0 0 1-1-.03L8.5 14.5l-6.27-2.8a.55.55 0 0 1-.03-1L19.5 1.5" />
      <path d="m21.5 3.5-13 11" />
    </BaseSvg>
  );
}

export function PaperclipIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </BaseSvg>
  );
}

export function ReplyIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </BaseSvg>
  );
}

export function ForwardIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <polyline points="15 17 20 12 15 7" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </BaseSvg>
  );
}

export function UndoIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
    </BaseSvg>
  );
}

export function EditIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </BaseSvg>
  );
}

export function CopyIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </BaseSvg>
  );
}

export function LinkIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </BaseSvg>
  );
}

export function TrashIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </BaseSvg>
  );
}

export function SmilePlusIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M22 11v1a10 10 0 1 1-9-10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
      <path d="M16 5h6" />
      <path d="M19 2v6" />
    </BaseSvg>
  );
}

export function StarIcon({ filled, ...props }: UiIconProps & { filled?: boolean }) {
  return (
    <BaseSvg {...props}>
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        fill={filled ? "currentColor" : "none"}
      />
    </BaseSvg>
  );
}

export function SparklesIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      <path d="M19 3v4" />
      <path d="M17 5h4" />
    </BaseSvg>
  );
}

export function ImageIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </BaseSvg>
  );
}

export function CameraIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.5" />
    </BaseSvg>
  );
}

export function FilmIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="2" y="3" width="20" height="18" rx="2.5" />
      <path d="M7 3v18M17 3v18M2 9h5M17 9h5M2 15h5M17 15h5" />
    </BaseSvg>
  );
}

export function SmartphoneShareIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M12 15V8" />
      <path d="m9 11 3-3 3 3" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </BaseSvg>
  );
}

export function FileTextIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </BaseSvg>
  );
}

export function ArchiveIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="2" y="3" width="20" height="5" rx="1.5" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </BaseSvg>
  );
}

/* ------------------------------------------------------------------ */
/* Users, Roles, Security & Moderation                                 */
/* ------------------------------------------------------------------ */

export function UserIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </BaseSvg>
  );
}

export function UsersIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </BaseSvg>
  );
}

export function UserPlusIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </BaseSvg>
  );
}

export function UserMinusIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </BaseSvg>
  );
}

export function BanIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m5.3 5.3 13.4 13.4" />
    </BaseSvg>
  );
}

export function LockClosedIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </BaseSvg>
  );
}

export function UnlockIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 7.8-1.2" />
    </BaseSvg>
  );
}

export function ShieldCheckIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </BaseSvg>
  );
}

export function CrownIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m2 6 4.5 6L12 4l5.5 8L22 6l-2 13H4L2 6Z" />
    </BaseSvg>
  );
}

export function BellIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </BaseSvg>
  );
}

export function BellOffIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
      <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="m2 2 20 20" />
    </BaseSvg>
  );
}

/* ------------------------------------------------------------------ */
/* Media Playback, Audio & Soundboard                                  */
/* ------------------------------------------------------------------ */

export function PlayIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
    </BaseSvg>
  );
}

export function PauseIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </BaseSvg>
  );
}

export function MicVoiceIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </BaseSvg>
  );
}

export function PaletteIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="13.5" cy="6.5" r=".8" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".8" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".8" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".8" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.43-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 5.81 17.46 2 12 2Z" />
    </BaseSvg>
  );
}

export function RocketIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </BaseSvg>
  );
}

export function ClockIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="12 7 12 12 15.5 14" />
    </BaseSvg>
  );
}

export function FlaskIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v5.4a2 2 0 0 1-.4 1.2L4.8 16.4A2.5 2.5 0 0 0 6.8 20.5h10.4a2.5 2.5 0 0 0 2-4.1l-4.8-6.8a2 2 0 0 1-.4-1.2V3" />
      <path d="M7.5 15h9" />
    </BaseSvg>
  );
}

export function DrumIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <ellipse cx="12" cy="9" rx="9" ry="4" />
      <path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9" />
      <path d="m4 3 6 5" />
      <path d="m20 3-6 5" />
    </BaseSvg>
  );
}

export function SoundWaveIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M2 10v4" />
      <path d="M6 6v12" />
      <path d="M10 3v18" />
      <path d="M14 8v8" />
      <path d="M18 5v14" />
      <path d="M22 10v4" />
    </BaseSvg>
  );
}

/* ------------------------------------------------------------------ */
/* Emoji Picker Category Tab Icons                                     */
/* ------------------------------------------------------------------ */

export function HandWaveIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </BaseSvg>
  );
}

export function PawIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="4" cy="8" r="2" />
      <path d="M17.2 14.8c-.8-1.4-2.2-2.8-5.2-2.8s-4.4 1.4-5.2 2.8c-.9 1.6-.2 4.2 2.1 4.2 1.2 0 2-.6 3.1-.6s1.9.6 3.1.6c2.3 0 3-2.6 2.1-4.2Z" />
    </BaseSvg>
  );
}

export function CupFoodIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <line x1="6" y1="2" x2="6" y2="4" />
      <line x1="10" y1="2" x2="10" y2="4" />
      <line x1="14" y1="2" x2="14" y2="4" />
    </BaseSvg>
  );
}

export function TrophyIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </BaseSvg>
  );
}

export function CompassIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </BaseSvg>
  );
}

export function LightbulbIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </BaseSvg>
  );
}

export function HeartOutlineIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </BaseSvg>
  );
}

export function FlagIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </BaseSvg>
  );
}

export function SwitchAccountIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </BaseSvg>
  );
}

export function ChevronUpDownIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </BaseSvg>
  );
}

export function LogOutIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </BaseSvg>
  );
}

/**
 * Apple iOS SF-Symbol `gear` icon: 10 rounded outer cogs + machined rim + 3 120-degree spokes + inner hub ring.
 */
export function IosSettingsGearIcon(props: UiIconProps) {
  const teethAngles = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
  const spokeAngles = [-90, 30, 150];
  return (
    <BaseSvg {...props}>
      {teethAngles.map((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x1 = 12 + Math.cos(rad) * 7.4;
        const y1 = 12 + Math.sin(rad) * 7.4;
        const x2 = 12 + Math.cos(rad) * 10.15;
        const y2 = 12 + Math.sin(rad) * 10.15;
        return (
          <line
            key={deg}
            x1={x1.toFixed(2)}
            y1={y1.toFixed(2)}
            x2={x2.toFixed(2)}
            y2={y2.toFixed(2)}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="12" cy="12" r="7.35" strokeWidth="1.85" />
      {spokeAngles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 12 + Math.cos(rad) * 2.35;
        const y1 = 12 + Math.sin(rad) * 2.35;
        const x2 = 12 + Math.cos(rad) * 6.95;
        const y2 = 12 + Math.sin(rad) * 6.95;
        return (
          <line
            key={deg}
            x1={x1.toFixed(2)}
            y1={y1.toFixed(2)}
            x2={x2.toFixed(2)}
            y2={y2.toFixed(2)}
            strokeWidth="1.55"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="12" cy="12" r="2.25" strokeWidth="1.55" />
    </BaseSvg>
  );
}

export function IosPlusCircleIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="8.8" strokeWidth="1.85" />
      <line x1="7.9" y1="12" x2="16.1" y2="12" strokeWidth="1.95" strokeLinecap="round" />
      <line x1="12" y1="7.9" x2="12" y2="16.1" strokeWidth="1.95" strokeLinecap="round" />
    </BaseSvg>
  );
}

export function PinIcon({ filled, ...props }: UiIconProps & { filled?: boolean }) {
  return (
    <BaseSvg {...props}>
      <path
        d="M15 4.5 19.5 9l-3.8 1.5-2.7 2.7.5 4.3L5 9l4.3.5 2.7-2.7L15 4.5Z"
        fill={filled ? "currentColor" : "none"}
        strokeLinejoin="round"
      />
      <path d="M9.2 14.8 4.5 19.5" strokeLinecap="round" />
    </BaseSvg>
  );
}

export function FolderIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path
        d="M3 6.8A1.8 1.8 0 0 1 4.8 5h4.3l1.9 2.2h8.2A1.8 1.8 0 0 1 21 9v8.2A1.8 1.8 0 0 1 19.2 19H4.8A1.8 1.8 0 0 1 3 17.2V6.8Z"
        strokeLinejoin="round"
      />
    </BaseSvg>
  );
}

export function ChevronUpIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </BaseSvg>
  );
}

export function ChevronDownIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </BaseSvg>
  );
}

export function KeyIcon(props: UiIconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="8.5" cy="15.5" r="4.5" />
      <path d="m11.7 12.3 8.3-8.3M16 8l2.5 2.5M18.5 5.5 21 8" strokeLinecap="round" strokeLinejoin="round" />
    </BaseSvg>
  );
}



