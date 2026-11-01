import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { IosDownloadIcon, IosLaptopIcon, IosRefreshIcon } from "./IosVectorIcons";
import { useMultiAccountState } from "../lib/accountManager";
import {
  isAuthorizedIosChatsRuntime,
  isRunningAsStandalonePwa,
} from "../lib/iosDetection";
import {
  applyIosPwaUpdateAndReload,
  checkForIosPwaUpdatesNow,
  openIosPwaInstallSheet,
  useIosPwaState,
} from "../lib/iosPwaUpdater";
import {
  DEFAULT_SOUND_LABEL,
  defaultSoundSelection,
  fetchDeviceSystemSounds,
  loadNotificationPreferences,
  previewSelectedSound,
  saveNotificationPreferences,
  saveUploadedCustomSound,
  stopSoundPreviewPlayback,
  type SoundSelection,
} from "../lib/alerts";
import { useE2EESnapshot } from "../lib/e2ee/keystore";
import { JaTextNative, type DeviceSystemSoundItem } from "../lib/nativeBridge";
import { useJaText } from "../lib/store";
import {
  COLOUR_THEME_PRESETS,
  CUSTOM_TILE_SWATCH,
  DEFAULT_THEME_OPTIONS,
  flushThemePersistence,
  updateThemeConfig,
  useJaTextTheme,
  type ColourThemeId,
  type DefaultThemeId,
} from "../lib/themeEngine";
import { AnimatedModal } from "./AnimatedModal";
import { Avatar } from "./Avatar";
import { Phone } from "./CallIcons";
import { LockIcon } from "./E2EEModals";
import { IosDevicesSection } from "./IosDevicesSection";
import { LegalModal, type LegalTab } from "./LegalModal";
import { triggerManualMobileUpdateCheck } from "./MobileUpdateGate";
import { ProfileForm } from "./ProfileForm";
import { WebsiteGlobeIcon } from "./SocialIcons";
import {
  ArrowLeftIcon,
  BellIcon,
  BubblePaletteIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SoundWaveIcon,
  SwitchAccountIcon,
  UserIcon,
} from "./UiIcons";

export type SettingsCategory =
  | "profile"
  | "appearance"
  | "devices"
  | "socials"
  | "notifications"
  | "security"
  | "legal";

function encodeSoundOptionValue(sel: SoundSelection): string {
  if (sel.mode === "default") return "default:";
  return `${sel.mode}:${sel.uri}`;
}

export function SettingsModal({
  onClose,
  onOpenAccountSwitcher,
  onOpenCustomThemeDrawer,
  initialCategory = "profile",
  openCategoryDirectlyOnMobile = false,
}: {
  onClose: () => void;
  onOpenAccountSwitcher?: () => void;
  onOpenCustomThemeDrawer?: () => void;
  initialCategory?: SettingsCategory;
  openCategoryDirectlyOnMobile?: boolean;
}) {
  const {
    me,
    signOut,
    mode,
    notificationsEnabled,
    pushRegistrationStatus,
    soundsEnabled,
    setActivity,
    setNotificationsEnabled,
    refreshPushRegistration,
    setSoundsEnabled,
  } = useJaText();
  const { accounts } = useMultiAccountState();
  const e2ee = useE2EESnapshot();
  const theme = useJaTextTheme();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [mobileMenuView, setMobileMenuView] = useState<"list" | "detail">(
    openCategoryDirectlyOnMobile ? "detail" : "list",
  );

  const [copiedFp, setCopiedFp] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] = useState(me?.statusPreference ?? "online");
  const [customStatus, setCustomStatus] = useState(me?.customStatus ?? "");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [inlineLegalTab, setInlineLegalTab] = useState<LegalTab>("terms");
  const [legalModalTab, setLegalModalTab] = useState<LegalTab | null>(null);

  const [soundPrefs, setSoundPrefs] = useState(loadNotificationPreferences);
  const [deviceNotifSounds, setDeviceNotifSounds] = useState<DeviceSystemSoundItem[]>([]);
  const [deviceRingtoneSounds, setDeviceRingtoneSounds] = useState<DeviceSystemSoundItem[]>([]);
  const [previewingCategory, setPreviewingCategory] = useState<"notification" | "ringtone" | null>(
    null,
  );
  const [soundError, setSoundError] = useState<string | null>(null);
  const [callWakePerms, setCallWakePerms] = useState<{
    canDrawOverlays: boolean;
    canFullScreenIntent: boolean;
  } | null>(null);

  const notifFileInputRef = useRef<HTMLInputElement | null>(null);
  const ringtoneFileInputRef = useRef<HTMLInputElement | null>(null);
  const isNative = Capacitor.isNativePlatform();
  const isIosChats = isAuthorizedIosChatsRuntime();
  const isPrimaryMobile = isNative || isIosChats;
  const iosPwaState = useIosPwaState();
  const [iosUpdateNotice, setIosUpdateNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    void Promise.all([
      fetchDeviceSystemSounds("notification"),
      fetchDeviceSystemSounds("ringtone"),
      JaTextNative.checkCallWakePermissions().catch(() => ({
        canDrawOverlays: true,
        canFullScreenIntent: true,
      })),
    ]).then(([notifs, rings, wake]) => {
      if (cancelled) return;
      setDeviceNotifSounds(notifs);
      setDeviceRingtoneSounds(rings);
      setCallWakePerms(wake);
    });
    return () => {
      cancelled = true;
      stopSoundPreviewPlayback();
    };
  }, [isNative]);

  useEffect(() => {
    return () => {
      stopSoundPreviewPlayback();
    };
  }, []);

  if (!me) return null;
  const currentUser = me;

  const handleCloseModal = () => {
    stopSoundPreviewPlayback();
    onClose();
  };

  function selectCategory(cat: SettingsCategory) {
    setSavedNotice(null);
    setActiveCategory(cat);
    setMobileMenuView("detail");
  }

  function handleSelectDefaultTheme(id: DefaultThemeId) {
    updateThemeConfig({
      kind: "default",
      defaultId: id,
    });
    flushThemePersistence();
  }

  function handleSelectPresetTheme(id: ColourThemeId) {
    updateThemeConfig({
      kind: "preset",
      presetId: id,
    });
    flushThemePersistence();
  }

  function handleToggleThemeSync(syncAcrossDevices: boolean) {
    updateThemeConfig({ syncAcrossDevices });
    if (syncAcrossDevices) {
      flushThemePersistence();
    }
  }

  function applySoundSelection(
    category: "notification" | "ringtone",
    selection: SoundSelection,
    playSample = true,
  ) {
    setSoundError(null);
    const current = loadNotificationPreferences();
    const next =
      category === "notification"
        ? { ...current, notificationSound: selection }
        : { ...current, callRingtone: selection };
    saveNotificationPreferences(next);
    setSoundPrefs(next);
    if (playSample) {
      setPreviewingCategory(category);
      previewSelectedSound(category, selection);
      window.setTimeout(() => {
        setPreviewingCategory((cur) => (cur === category ? null : cur));
      }, 3600);
    }
  }

  function handleDropdownChange(category: "notification" | "ringtone", value: string) {
    if (value === "default:") {
      applySoundSelection(category, defaultSoundSelection(), true);
      return;
    }
    if (value.startsWith("custom:")) {
      const currentCustom =
        category === "notification" ? soundPrefs.notificationSound : soundPrefs.callRingtone;
      if (currentCustom.mode === "custom") {
        applySoundSelection(category, currentCustom, true);
      }
      return;
    }
    if (value.startsWith("system:")) {
      const uri = value.slice("system:".length);
      const list = category === "notification" ? deviceNotifSounds : deviceRingtoneSounds;
      const found = list.find((s) => s.uri === uri);
      applySoundSelection(
        category,
        {
          mode: "system",
          uri,
          label: found?.title ?? "Phone sound",
        },
        true,
      );
    }
  }

  async function handleCustomSoundFile(category: "notification" | "ringtone", file: File | null) {
    if (!file) return;
    setSoundError(null);
    try {
      const savedSelection = await saveUploadedCustomSound(category, file);
      applySoundSelection(category, savedSelection, true);
    } catch (err) {
      setSoundError(
        err instanceof Error ? err.message : "Could not load custom sound file.",
      );
    }
  }

  function togglePreview(category: "notification" | "ringtone") {
    if (previewingCategory === category) {
      stopSoundPreviewPlayback();
      setPreviewingCategory(null);
      return;
    }
    const sel =
      category === "notification" ? soundPrefs.notificationSound : soundPrefs.callRingtone;
    setPreviewingCategory(category);
    previewSelectedSound(category, sel);
    window.setTimeout(() => {
      setPreviewingCategory((cur) => (cur === category ? null : cur));
    }, 4500);
  }

  async function updateActivity(status: typeof activityStatus, message = customStatus) {
    setActivityError(null);
    try {
      await setActivity(status, message);
      setActivityStatus(status);
      setCustomStatus(message);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Could not update activity.");
    }
  }

  async function toggleNotifications(enabled: boolean) {
    setNotificationError(null);
    if (!enabled) {
      setNotificationsEnabled(false);
      return;
    }
    if (Capacitor.isNativePlatform()) {
      if (mode === "demo") {
        setNotificationError(
          "Push notifications require the live Turso backend.",
        );
        return;
      }
      try {
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive === "granted") {
          setNotificationsEnabled(true);
        } else {
          setNotificationError(
            "Allow notifications in Android settings to enable push notifications.",
          );
        }
      } catch (error) {
        setNotificationError(
          error instanceof Error
            ? error.message
            : "Could not request Android notification permission.",
        );
      }
      return;
    }
    if (!("Notification" in window)) {
      if (isIosChats && !isRunningAsStandalonePwa()) {
        setNotificationError(
          "Install JaText iOS as a PWA to your Home Screen first (Share -> Add to Home Screen) to unlock iOS notifications.",
        );
      } else {
        setNotificationError("This browser does not support notifications.");
      }
      return;
    }
    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission === "granted") {
        setNotificationsEnabled(true);
      } else {
        setNotificationError("Allow notifications in your browser settings to enable them.");
      }
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Could not request notification permission.",
      );
    }
  }

  const categories: Array<{
    id: SettingsCategory;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "profile",
      label: "Profile",
      subtitle: "Avatar, banner, username, bio & accounts",
      icon: <UserIcon size={17} />,
    },
    {
      id: "appearance",
      label: "Appearance",
      subtitle: "Light, Ash, Dark, Onyx & custom colour themes",
      icon: <BubblePaletteIcon size={17} />,
    },
    ...(isIosChats
      ? [
          {
            id: "devices" as SettingsCategory,
            label: "Devices",
            subtitle: "Scan Web QR code & manage linked browsers",
            icon: <IosLaptopIcon size={17} />,
          },
        ]
      : []),
    {
      id: "socials",
      label: "Socials",
      subtitle: "Connected social links & personal website",
      icon: <WebsiteGlobeIcon size={17} />,
    },
    {
      id: "notifications",
      label: "Alerts & Audio",
      subtitle: "Activity status, push alerts & custom ringtones",
      icon: <BellIcon size={17} />,
    },
    {
      id: "security",
      label: "Encryption",
      subtitle: "Zero-knowledge E2EE key & security fingerprint",
      icon: <ShieldCheckIcon size={17} />,
    },
    {
      id: "legal",
      label: "Legal Policies",
      subtitle: "Terms of Service & Privacy Policy",
      icon: <FileTextIcon size={17} />,
    },
  ];

  const activeCategoryMeta =
    categories.find((c) => c.id === activeCategory) ?? categories[0];

  return (
    <>
      <AnimatedModal
        onClose={handleCloseModal}
        cardClassName="modal-card settings-shell-modal"
        closeLabel="Close settings"
      >
        {(requestClose) => (
          <div className={`settings-layout mobile-view-${mobileMenuView}`}>
            {/* ---------- Left Sidebar / Mobile Category List ---------- */}
            <aside className="settings-sidebar" aria-label="Settings categories">
              <div className="settings-sidebar-top">
                <div className="settings-sidebar-brand">
                  <SettingsIcon size={19} style={{ color: "var(--accent)" }} />
                  <span>Settings</span>
                </div>

                <div className="settings-user-summary">
                  <Avatar user={currentUser} size={40} />
                  <div className="settings-user-summary-text">
                    <strong>{currentUser.displayName}</strong>
                    <span className="muted small">
                      {currentUser.email ?? `@${currentUser.username}`}
                    </span>
                  </div>
                </div>

                {onOpenAccountSwitcher && (
                  <button
                    type="button"
                    className="ghost-btn settings-sidebar-switch-btn"
                    onClick={onOpenAccountSwitcher}
                  >
                    <SwitchAccountIcon size={15} />
                    <span>
                      {accounts.length > 1
                        ? `Switch account (${accounts.length})`
                        : "Add another account"}
                    </span>
                  </button>
                )}
              </div>

              <nav className="settings-nav-list">
                {categories.map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      type="button"
                      key={cat.id}
                      className={`settings-nav-item ${isActive ? "active" : ""}`}
                      onClick={() => selectCategory(cat.id)}
                    >
                      <span className="settings-nav-icon">{cat.icon}</span>
                      <span className="settings-nav-copy">
                        <strong>{cat.label}</strong>
                        <small>{cat.subtitle}</small>
                      </span>
                      <span className="settings-nav-chevron" aria-hidden="true">
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="settings-sidebar-foot">
                <button
                  type="button"
                  className="danger-btn settings-signout-btn"
                  onClick={() => {
                    requestClose();
                    void signOut();
                  }}
                >
                  {isPrimaryMobile
                    ? accounts.length > 1
                      ? `Sign out of @${currentUser.username}`
                      : "Sign out"
                    : "Unlink device"}
                </button>
              </div>
            </aside>

            {/* ---------- Right Content Pane ---------- */}
            <div className="settings-content-pane">
              <div className="settings-mobile-detail-bar">
                <button
                  type="button"
                  className="ghost-btn settings-mobile-back-btn"
                  onClick={() => setMobileMenuView("list")}
                >
                  <ArrowLeftIcon size={16} />
                  <span>Categories</span>
                </button>
                <strong>{activeCategoryMeta.label}</strong>
              </div>

              {savedNotice && (
                <div className="success-box" style={{ marginBottom: 14 }}>
                  <CheckCircleIcon size={16} /> {savedNotice}
                </div>
              )}

              {/* === 1. PROFILE === */}
              {activeCategory === "profile" && (
                <section className="settings-pane-section">
                  <div className="settings-pane-head">
                    <h3>Profile</h3>
                    <p className="muted small">
                      Update your profile picture, banner, display name, bio, pronouns, and avatar
                      outline colour. Usernames can be changed once every 14 days.
                    </p>
                  </div>

                  <ProfileForm
                    initial={currentUser}
                    sectionMode="profile"
                    submitLabel="Save profile"
                    onDone={() => {
                      setSavedNotice("Profile saved!");
                      window.setTimeout(() => setSavedNotice(null), 2200);
                    }}
                  />
                </section>
              )}

              {/* === 2. APPEARANCE === */}
              {activeCategory === "appearance" && (
                <section className="settings-pane-section">
                  <div className="settings-pane-head">
                    <h3>Appearance</h3>
                    <p className="muted small">
                      Pick a crisp default mode, choose any gradient colour theme, or build your own
                      custom theme.
                    </p>
                  </div>

                  {/* Default Themes */}
                  <div className="appearance-block">
                    <div className="appearance-block-header">
                      <strong>Default Themes</strong>
                    </div>

                    <div className="default-themes-row" role="radiogroup" aria-label="Default themes">
                      {DEFAULT_THEME_OPTIONS.map((opt) => {
                        const selected = theme.kind === "default" && theme.defaultId === opt.id;
                        return (
                          <button
                            type="button"
                            key={opt.id}
                            role="radio"
                            aria-checked={selected}
                            aria-label={opt.name}
                            data-tooltip={opt.name}
                            className={`theme-tile default-theme-tile ${selected ? "selected" : ""}`}
                            style={{
                              background: opt.swatchBg,
                              borderColor: selected ? "var(--accent)" : opt.swatchBorder,
                            }}
                            onClick={() => handleSelectDefaultTheme(opt.id)}
                          >
                            {selected && (
                              <span className="theme-tile-check">
                                <CheckIcon size={11} />
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {/* Sync with system button */}
                      {(() => {
                        const sysSelected =
                          theme.kind === "default" && theme.defaultId === "system";
                        return (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={sysSelected}
                            aria-label="Sync with system"
                            data-tooltip="Sync with system"
                            className={`theme-tile default-theme-tile system-sync-tile ${
                              sysSelected ? "selected" : ""
                            }`}
                            onClick={() => handleSelectDefaultTheme("system")}
                          >
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                              <path d="M21 3v5h-5" />
                              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                              <path d="M3 21v-5h5" />
                            </svg>
                            {sysSelected && (
                              <span className="theme-tile-check">
                                <CheckIcon size={11} />
                              </span>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Colour Themes */}
                  <div className="appearance-colour-card">
                    <div className="appearance-colour-head">
                      <div>
                        <strong>Colour Themes</strong>
                        <p className="muted small">
                          Choose any gradient theme or click the palette tile to customise your own.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ghost-btn appearance-custom-btn"
                        onClick={() => {
                          if (onOpenCustomThemeDrawer) {
                            requestClose();
                            onOpenCustomThemeDrawer();
                          }
                        }}
                      >
                        <BubblePaletteIcon size={15} />
                        <span>Customise Theme</span>
                      </button>
                    </div>

                    <div className="colour-themes-grid" role="radiogroup" aria-label="Colour themes">
                      {/* Tile 1: Custom Theme Palette Tile */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={theme.kind === "custom"}
                        aria-label="Custom Theme"
                        data-tooltip="Custom Theme"
                        className={`theme-tile colour-theme-tile custom-palette-tile ${
                          theme.kind === "custom" ? "selected" : ""
                        }`}
                        style={{ background: CUSTOM_TILE_SWATCH }}
                        onClick={() => {
                          if (onOpenCustomThemeDrawer) {
                            requestClose();
                            onOpenCustomThemeDrawer();
                          }
                        }}
                      >
                        <BubblePaletteIcon size={21} />
                        {theme.kind === "custom" && (
                          <span className="theme-tile-check">
                            <CheckIcon size={11} />
                          </span>
                        )}
                      </button>

                      {/* Tiles 2..23: Exact 1:1 Gradient Replicas */}
                      {COLOUR_THEME_PRESETS.map((preset) => {
                        const selected =
                          theme.kind === "preset" && theme.presetId === preset.id;
                        return (
                          <button
                            type="button"
                            key={preset.id}
                            role="radio"
                            aria-checked={selected}
                            aria-label={preset.name}
                            data-tooltip={preset.name}
                            className={`theme-tile colour-theme-tile ${
                              selected ? "selected" : ""
                            }`}
                            style={{ background: preset.swatchGradient }}
                            onClick={() => handleSelectPresetTheme(preset.id)}
                          >
                            {selected && (
                              <span className="theme-tile-check">
                                <CheckIcon size={11} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sync Theme Toggle */}
                  <label className="appearance-sync-row">
                    <span>Sync theme across my devices</span>
                    <input
                      type="checkbox"
                      className="appearance-sync-switch"
                      checked={theme.syncAcrossDevices}
                      onChange={(e) => handleToggleThemeSync(e.target.checked)}
                    />
                  </label>
                </section>
              )}

              {/* === 2B. LINKED DEVICES (iOS PRIMARY MOBILE) === */}
              {activeCategory === "devices" && isIosChats && (
                <section className="settings-pane-section">
                  <div className="settings-pane-head">
                    <h3>Linked Devices</h3>
                    <p className="muted small">
                      Scan a QR code on <strong>jatext.vercel.app/chats</strong> to sign in on your
                      computer with zero-knowledge E2EE key sync, or disconnect any session below.
                    </p>
                  </div>
                  <IosDevicesSection />
                </section>
              )}

              {/* === 3. SOCIALS === === */}
              {activeCategory === "socials" && (
                <section className="settings-pane-section">
                  <div className="settings-pane-head">
                    <h3>Socials &amp; Website</h3>
                    <p className="muted small">
                      Link your social profiles and personal website so friends can visit them right
                      from your profile card.
                    </p>
                  </div>

                  <ProfileForm
                    initial={currentUser}
                    sectionMode="socials"
                    submitLabel="Save socials & website"
                    onDone={() => {
                      setSavedNotice("Socials & website saved!");
                      window.setTimeout(() => setSavedNotice(null), 2200);
                    }}
                  />
                </section>
              )}

              {/* === 4. NOTIFICATIONS & AUDIO === */}
              {activeCategory === "notifications" && (
                <section className="settings-pane-section activity-settings">
                  <div className="settings-pane-head">
                    <h3>Activity, Alerts &amp; Audio</h3>
                    <p className="muted small">
                      Control your online presence, push alerts, notification tones, and call
                      ringtones.
                    </p>
                  </div>

                  <label>
                    Activity status
                    <select
                      value={activityStatus}
                      onChange={(event) =>
                        void updateActivity(event.target.value as typeof activityStatus)
                      }
                    >
                      <option value="online">Online (away after 5 minutes idle)</option>
                      <option value="dnd">Do Not Disturb</option>
                      <option value="offline">Offline until I change it</option>
                    </select>
                  </label>
                  <p className="muted small">
                    Do Not Disturb still shows you as available, but silences JaText message alerts.
                    Offline stays enabled across sign-outs.
                  </p>

                  <label>
                    Custom status
                    <input
                      value={customStatus}
                      maxLength={60}
                      placeholder="What are you up to?"
                      onChange={(event) => setCustomStatus(event.target.value)}
                    />
                  </label>
                  <button
                    className="ghost-btn"
                    type="button"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => void updateActivity(activityStatus, customStatus)}
                  >
                    Save custom status
                  </button>
                  {activityError && <div className="error-box">{activityError}</div>}

                  <label className="setting-toggle">
                    <input
                      type="checkbox"
                      checked={notificationsEnabled}
                      onChange={(event) => void toggleNotifications(event.target.checked)}
                    />
                    {isNative
                      ? "Push notifications when JaText is closed"
                      : "Desktop notifications for incoming messages"}
                  </label>
                  <label className="setting-toggle">
                    <input
                      type="checkbox"
                      checked={soundsEnabled}
                      onChange={(event) => setSoundsEnabled(event.target.checked)}
                    />
                    Message &amp; call sounds
                  </label>

                  <div className="sound-settings-grid">
                    <div className="sound-setting-card">
                      <div className="sound-setting-head">
                        <span className="sound-setting-title">
                          <BellIcon size={15} /> Notification sound
                        </span>
                        <button
                          type="button"
                          className="mini-btn sound-preview-btn"
                          onClick={() => togglePreview("notification")}
                        >
                          {previewingCategory === "notification" ? (
                            <>
                              <PauseIcon size={12} /> Stop
                            </>
                          ) : (
                            <>
                              <PlayIcon size={12} /> Test
                            </>
                          )}
                        </button>
                      </div>
                      <select
                        value={encodeSoundOptionValue(soundPrefs.notificationSound)}
                        onChange={(e) => handleDropdownChange("notification", e.target.value)}
                      >
                        <option value="default:">{DEFAULT_SOUND_LABEL}</option>
                        {soundPrefs.notificationSound.mode === "custom" && (
                          <option value={`custom:${soundPrefs.notificationSound.uri}`}>
                            Custom · {soundPrefs.notificationSound.label}
                          </option>
                        )}
                        {deviceNotifSounds.length > 0 && (
                          <optgroup label="Phone notifications">
                            {deviceNotifSounds.map((snd) => (
                              <option key={snd.uri} value={`system:${snd.uri}`}>
                                {snd.title}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <input
                        ref={notifFileInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void handleCustomSoundFile("notification", file);
                        }}
                      />
                      <button
                        type="button"
                        className="ghost-btn sound-upload-btn"
                        onClick={() => notifFileInputRef.current?.click()}
                      >
                        <PlusIcon size={14} />
                        <span>Add your custom notification sound.</span>
                      </button>
                    </div>

                    <div className="sound-setting-card">
                      <div className="sound-setting-head">
                        <span className="sound-setting-title">
                          <SoundWaveIcon size={15} /> Call ringtone
                        </span>
                        <button
                          type="button"
                          className="mini-btn sound-preview-btn"
                          onClick={() => togglePreview("ringtone")}
                        >
                          {previewingCategory === "ringtone" ? (
                            <>
                              <PauseIcon size={12} /> Stop
                            </>
                          ) : (
                            <>
                              <PlayIcon size={12} /> Test
                            </>
                          )}
                        </button>
                      </div>
                      <select
                        value={encodeSoundOptionValue(soundPrefs.callRingtone)}
                        onChange={(e) => handleDropdownChange("ringtone", e.target.value)}
                      >
                        <option value="default:">{DEFAULT_SOUND_LABEL}</option>
                        {soundPrefs.callRingtone.mode === "custom" && (
                          <option value={`custom:${soundPrefs.callRingtone.uri}`}>
                            Custom · {soundPrefs.callRingtone.label}
                          </option>
                        )}
                        {deviceRingtoneSounds.length > 0 && (
                          <optgroup label="Phone ringtones">
                            {deviceRingtoneSounds.map((snd) => (
                              <option key={snd.uri} value={`system:${snd.uri}`}>
                                {snd.title}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <input
                        ref={ringtoneFileInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void handleCustomSoundFile("ringtone", file);
                        }}
                      />
                      <button
                        type="button"
                        className="ghost-btn sound-upload-btn"
                        onClick={() => ringtoneFileInputRef.current?.click()}
                      >
                        <PlusIcon size={14} />
                        <span>Add your custom ringtone sound.</span>
                      </button>
                    </div>
                  </div>

                  {soundError && <div className="error-box">{soundError}</div>}

                  {isNative &&
                    callWakePerms &&
                    (!callWakePerms.canFullScreenIntent || !callWakePerms.canDrawOverlays) && (
                      <div className="sound-wake-perm-box">
                        <div className="sound-wake-perm-text">
                          <Phone size={15} />
                          <span>
                            Allow JaText to open incoming calls instantly over your lock screen and
                            other apps.
                          </span>
                        </div>
                        <div className="sound-wake-perm-actions">
                          {!callWakePerms.canFullScreenIntent && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={() =>
                                void JaTextNative.openCallWakeSettings({ kind: "fullscreen" })
                              }
                            >
                              Allow lock-screen calls
                            </button>
                          )}
                          {!callWakePerms.canDrawOverlays && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={() =>
                                void JaTextNative.openCallWakeSettings({ kind: "overlay" })
                              }
                            >
                              Allow instant pop-open
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                  {notificationError && <div className="error-box">{notificationError}</div>}
                  {isNative && mode !== "demo" && notificationsEnabled && (
                    <>
                      <p className="muted small" role="status">
                        {pushRegistrationStatus === "unavailable"
                          ? "In-app alerts active · background FCM not configured in this build"
                          : `Push registration: ${pushRegistrationStatus}`}
                      </p>
                      {pushRegistrationStatus !== "unavailable" && (
                        <button
                          className="ghost-btn"
                          type="button"
                          onClick={() => {
                            setNotificationError(null);
                            void refreshPushRegistration().catch((error: unknown) => {
                              setNotificationError(
                                error instanceof Error
                                  ? error.message
                                  : "Could not refresh push registration.",
                              );
                            });
                          }}
                        >
                          Repair push registration
                        </button>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* === 5. ENCRYPTION & SECURITY === */}
              {activeCategory === "security" && (
                <section className="settings-pane-section e2ee-settings-section">
                  <div className="settings-pane-head">
                    <h3>End-to-End Encryption</h3>
                    <p className="muted small">
                      Private chats, group chats, voice notes, and attachments are encrypted right on
                      your device before leaving your browser or phone.
                    </p>
                  </div>

                  <div className="profile-e2ee-header">
                    <span className="profile-e2ee-title">
                      <LockIcon size={15} />
                      <strong>Device Identity Key</strong>
                    </span>
                    <span className={`e2ee-pill ${e2ee.ready ? "active" : "pending"}`}>
                      {e2ee.ready ? "Active · Synced" : "Initializing…"}
                    </span>
                  </div>
                  <p className="muted small">
                    Open any friend&apos;s profile card in chat and tap <strong>Verify security code</strong>{" "}
                    to compare your 12-block safety fingerprint.
                  </p>
                  {e2ee.myFingerprint && (
                    <>
                      <div className="profile-e2ee-sub">
                        Key ID: <code>{e2ee.myKeyId}</code>
                      </div>
                      <code className="e2ee-fingerprint-code">{e2ee.myFingerprint}</code>
                    </>
                  )}
                  <div className="profile-e2ee-btn-row">
                    {e2ee.myFingerprint && (
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `JaText E2EE Key (@${currentUser.username} · ${e2ee.myKeyId})\nFingerprint: ${e2ee.myFingerprint}\nECDH-P256: ${e2ee.myDhPubB64 ?? ""}`,
                          );
                          setCopiedFp(true);
                          window.setTimeout(() => setCopiedFp(false), 1800);
                        }}
                      >
                        {copiedFp ? (
                          <>
                            <CheckIcon size={13} /> Copied
                          </>
                        ) : (
                          <>
                            <CopyIcon size={13} /> Copy security key
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {isNative && (
                    <div className="settings-inline-legal-card" style={{ marginTop: 4 }}>
                      <h4>App Version &amp; Updates</h4>
                      <p className="muted small">
                        Installed release: <strong>JaText v3.8.7 (Build 56)</strong>. JaText checks
                        for updates automatically on launch, or you can check manually below.
                      </p>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          requestClose();
                          triggerManualMobileUpdateCheck();
                        }}
                      >
                        Check for App Updates
                      </button>
                    </div>
                  )}

                  {isIosChats && (
                    <div className="settings-inline-legal-card" style={{ marginTop: 8 }}>
                      <h4>JaText iOS Liquid Glass PWA</h4>
                      <p className="muted small">
                        Active release: <strong>JaText v3.8.7</strong> (
                        {isRunningAsStandalonePwa()
                          ? "Installed on Home Screen"
                          : "Browser Mode"}
                        ). JaText automatically notifies you to refresh whenever new changes are
                        deployed.
                      </p>
                      {iosUpdateNotice && (
                        <p
                          className="small"
                          style={{ color: "var(--accent)", marginBottom: 10, fontWeight: 600 }}
                        >
                          {iosUpdateNotice}
                        </p>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {!isRunningAsStandalonePwa() && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            onClick={() => {
                              requestClose();
                              openIosPwaInstallSheet();
                            }}
                          >
                            <IosDownloadIcon size={14} />
                            <span>Install JaText iOS as a PWA!</span>
                          </button>
                        )}
                        {iosPwaState.updateAvailable ? (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            onClick={() => void applyIosPwaUpdateAndReload()}
                          >
                            <IosRefreshIcon size={14} />
                            <span>Refresh PWA Now</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            disabled={iosPwaState.checking}
                            onClick={async () => {
                              setIosUpdateNotice(null);
                              const found = await checkForIosPwaUpdatesNow();
                              if (!found) {
                                setIosUpdateNotice(
                                  "You are running the newest JaText iOS build!",
                                );
                              }
                            }}
                          >
                            <IosRefreshIcon
                              size={14}
                              className={iosPwaState.checking ? "jt-spin-icon" : undefined}
                            />
                            <span>
                              {iosPwaState.checking
                                ? "Checking..."
                                : "Check for PWA Updates"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* === 6. LEGAL POLICIES === */}
              {activeCategory === "legal" && (
                <section className="settings-pane-section legal-settings-section">
                  <div className="settings-pane-head">
                    <h3>Legal Policies</h3>
                    <p className="muted small">
                      Read JaText&apos;s Terms of Service and Privacy Policy below.
                    </p>
                  </div>

                  <div className="legal-modal-tabs" style={{ marginBottom: 14 }}>
                    <button
                      type="button"
                      className={`legal-tab-btn ${inlineLegalTab === "terms" ? "active" : ""}`}
                      onClick={() => setInlineLegalTab("terms")}
                    >
                      <FileTextIcon size={15} /> Terms of Service
                    </button>
                    <button
                      type="button"
                      className={`legal-tab-btn ${inlineLegalTab === "privacy" ? "active" : ""}`}
                      onClick={() => setInlineLegalTab("privacy")}
                    >
                      <ShieldCheckIcon size={15} /> Privacy Policy
                    </button>
                  </div>

                  {inlineLegalTab === "terms" ? (
                    <div className="settings-inline-legal-card">
                      <h4>Terms of Service · Effective 25 October 2026</h4>
                      <p className="muted small">
                        By creating an account or using JaText, you agree to keep your credentials
                        secure, treat others respectfully, avoid spam or unlawful content, and
                        understand that JaText is an independent service provided as-is.
                      </p>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setLegalModalTab("terms")}
                      >
                        Open full Terms of Service
                      </button>
                    </div>
                  ) : (
                    <div className="settings-inline-legal-card">
                      <h4>Privacy Policy · Effective 25 October 2026</h4>
                      <p className="muted small">
                        JaText stores only the account, profile, and encrypted message data needed to
                        deliver your conversations. We never sell personal data or run third-party
                        ads.
                      </p>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setLegalModalTab("privacy")}
                      >
                        Open full Privacy Policy
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </AnimatedModal>

      {legalModalTab && (
        <LegalModal initialTab={legalModalTab} onClose={() => setLegalModalTab(null)} />
      )}
    </>
  );
}
