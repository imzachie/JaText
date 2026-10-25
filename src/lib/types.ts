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
  senderId: string;
  receiverId: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  createdAt: number;
}

export interface ChatPreview {
  friendId: string;
  body: string;
  createdAt: number;
  senderId: string;
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

  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: (demoProfile?: { name: string; email: string }) => Promise<void>;
  signOut: () => Promise<void>;

  checkUsername: (username: string) => Promise<{ available: boolean; message?: string }>;
  saveProfile: (input: ProfileInput) => Promise<void>;

  sendFriendRequest: (username: string) => Promise<void>;
  respondRequest: (requestId: string, accept: boolean) => Promise<void>;

  sendMessage: (receiverId: string, body: string, file?: File) => Promise<void>;
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
