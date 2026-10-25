export interface JaUser {
  id: string;
  email?: string;
  displayName: string;
  /** "" until onboarding is done */
  username: string;
  bio: string;
  pronouns: string;
  /** avatar color id, see src/lib/colors.ts */
  avatarColor: string;
  avatarUrl?: string;
  bannerUrl?: string;
  onboardingComplete: boolean;
  usernameChangedAt?: number;
  statusPreference?: StatusPreference;
  customStatus?: string;
}

export type StatusPreference = "online" | "dnd" | "offline";
export type ActivityStatus = StatusPreference | "away";

export interface FriendActivity {
  userId: string;
  status: ActivityStatus;
  customStatus: string;
  isTyping: boolean;
}

export interface FriendRequest {
  id: string;
  from: JaUser;
  to: JaUser;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  renderKey?: string;
  senderId: string;
  receiverId: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  stickerKey?: string;
  isStickerFavorite?: boolean;
  deliveryStatus?: MessageDeliveryStatus;
  createdAt: number;
  replyTo?: { id: string; senderId: string; body: string };
  forwardedFrom?: string;
  unsentAt?: number;
  reactions?: MessageReaction[];
}

export type MessageDeliveryStatus = "delivered" | "sent" | "read";

export type StickerMediaType = "gif" | "sticker" | "image";
export type StickerMediaSource = "klipy" | "upload";

export interface StickerMedia {
  key: string;
  url: string;
  previewUrl?: string;
  name: string;
  mediaType: StickerMediaType;
  source: StickerMediaSource;
  storageId?: string;
  isFavorite: boolean;
  useCount: number;
  lastUsedAt?: number;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
}

export interface ChatPreview {
  friendId: string;
  body: string;
  createdAt: number;
  senderId: string;
  isArchived?: boolean;
  isMuted?: boolean;
}

export interface ProfileInput {
  displayName: string;
  username: string;
  bio: string;
  pronouns: string;
  avatarColor: string;
  /** File = set new photo, null = remove photo, undefined = keep current */
  avatarFile?: File | null;
  bannerFile?: File | null;
}

export interface JaTextStore {
  /** "convex" when VITE_CONVEX_URL is set, otherwise a local demo that mirrors the Convex API 1:1 */
  mode: "demo" | "convex";
  loading: boolean;
  me: JaUser | null;
  friends: JaUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  previews: ChatPreview[];
  previewsReady: boolean;
  friendActivities: FriendActivity[];
  notificationsEnabled: boolean;
  soundsEnabled: boolean;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  activeMessages: ChatMessage[];
  activeMessagesReady: boolean;
  blockedUserIds: string[];

  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: (demoProfile?: { name: string; email: string }) => Promise<void>;
  signOut: () => Promise<void>;

  checkUsername: (username: string) => Promise<{ available: boolean; message?: string }>;
  saveProfile: (input: ProfileInput) => Promise<void>;

  sendFriendRequest: (username: string) => Promise<void>;
  respondRequest: (requestId: string, accept: boolean) => Promise<void>;

  sendMessage: (receiverId: string, body: string, file?: File, replyToId?: string) => Promise<void>;
  forwardMessage: (messageId: string, receiverId: string) => Promise<void>;
  toggleMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteMessageForMe: (messageId: string) => Promise<void>;
  unsendMessage: (messageId: string) => Promise<boolean>;
  setConversationArchived: (friendId: string, archived: boolean) => Promise<void>;
  setConversationMuted: (friendId: string, muted: boolean) => Promise<void>;
  deleteConversationForMe: (friendId: string) => Promise<void>;
  setUserBlocked: (friendId: string, blocked: boolean) => Promise<void>;
  markMessagesRead: (friendId: string) => Promise<void>;
  stickerFavorites: StickerMedia[];
  recentStickers: StickerMedia[];
  searchKlipy: (query: string) => Promise<StickerMedia[]>;
  saveSticker: (file: File) => Promise<StickerMedia>;
  setStickerFavorite: (sticker: StickerMedia, favorite: boolean) => Promise<void>;
  favoriteStickerFromMessage: (messageId: string) => Promise<void>;
  sendSticker: (receiverId: string, sticker: StickerMedia) => Promise<void>;
  setActivity: (status: StatusPreference, customStatus: string) => Promise<void>;
  setTyping: (receiverId: string, isTyping: boolean) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundsEnabled: (enabled: boolean) => void;
}

export const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;
export const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

export function usernameLockInfo(user: JaUser | null): {
  locked: boolean;
  nextChangeAt?: number;
  daysLeft?: number;
} {
  if (!user?.username || !user.usernameChangedAt) return { locked: false };
  const next = user.usernameChangedAt + FOURTEEN_DAYS;
  if (Date.now() >= next) return { locked: false };
  return {
    locked: true,
    nextChangeAt: next,
    daysLeft: Math.max(1, Math.ceil((next - Date.now()) / (24 * 60 * 60 * 1000))),
  };
}
