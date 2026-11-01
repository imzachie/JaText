import type { BubbleStyleId } from "./chatCustomization";
import type { DeviceSyncRequest } from "./e2ee/cryptoPrimitives";
import type { MessageE2EEProof } from "./e2ee/keystore";
import type { ForwardedMessageContext } from "./forwardedContext";
import type { SyncedThemePayload } from "./themeEngine";

export interface UserSocialLink {
  platform: string;
  handle: string;
  url: string;
}

export interface UserWebsiteLink {
  title: string;
  url: string;
}

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
  socials?: UserSocialLink[];
  website?: UserWebsiteLink;
  syncedTheme?: SyncedThemePayload;
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
  bubbleStyle?: BubbleStyleId;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  stickerKey?: string;
  isStickerFavorite?: boolean;
  deliveryStatus?: MessageDeliveryStatus;
  editedAt?: number;
  createdAt: number;
  replyTo?: { id: string; senderId: string; body: string };
  forwardedFrom?: string;
  forwardedContext?: ForwardedMessageContext;
  unsentAt?: number;
  reactions?: MessageReaction[];
  e2ee?: MessageE2EEProof;
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
  unreadCount?: number;
}

export interface CommunityMessage {
  id: string;
  renderKey?: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatarUrl?: string;
  senderAvatarColor: string;
  body: string;
  bubbleStyle?: BubbleStyleId;
  type: "text" | "poll" | "sticker";
  pollOptions: string[];
  pollEndedAt?: number;
  votes: { userId: string; optionIndex: number }[];
  myVote?: number;
  createdAt: number;
  editedAt?: number;
  unsentAt?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  stickerUrl?: string;
  stickerName?: string;
  stickerKey?: string;
  isStickerFavorite?: boolean;
  forwardedFromName?: string;
  forwardedContext?: ForwardedMessageContext;
  replyTo?: { id: string; senderId: string; senderName: string; body: string };
  reactions?: MessageReaction[];
  canModerate: boolean;
  isOwner: boolean;
}

export interface CommunityUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  createdAt: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  avatarUrl?: string;
  ownerId: string;
  role: "owner" | "moderator" | "member";
  memberCount: number;
  lastMessage: string;
  lastMessageAt: number;
  lastSenderId?: string;
  lastSenderName?: string;
  lastMentionedMe?: boolean;
  isSilenced?: boolean;
  isArchived?: boolean;
  unreadCount?: number;
}

export interface GroupMember extends JaUser {
  role: "owner" | "moderator" | "member";
  muted: boolean;
}

export interface GroupDetails {
  id: string;
  name: string;
  avatarUrl?: string;
  ownerId: string;
  role: "owner" | "moderator" | "member";
  members: GroupMember[];
}

export interface GroupMessage {
  id: string;
  renderKey?: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatarUrl?: string;
  senderAvatarColor: string;
  body: string;
  bubbleStyle?: BubbleStyleId;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  stickerUrl?: string;
  stickerName?: string;
  stickerKey?: string;
  isStickerFavorite?: boolean;
  forwardedFromName?: string;
  forwardedContext?: ForwardedMessageContext;
  replyTo?: { id: string; senderId: string; senderName: string; body: string };
  createdAt: number;
  editedAt?: number;
  unsentAt?: number;
  mentionsEveryone?: boolean;
  mentionedUserIds?: string[];
  reactions?: MessageReaction[];
  e2ee?: MessageE2EEProof;
}

export interface ChatTypingUser {
  id: string;
  displayName: string;
  username: string;
}

export const OFFICIAL_COMMUNITY_ID = "jatext-official-community";

export interface ProfileInput {
  displayName: string;
  username: string;
  bio: string;
  pronouns: string;
  avatarColor: string;
  /** File = set new photo, null = remove photo, undefined = keep current */
  avatarFile?: File | null;
  bannerFile?: File | null;
  socials?: UserSocialLink[];
  website?: UserWebsiteLink | null;
  syncedTheme?: SyncedThemePayload | null;
}

export interface PollVoter {
  userId: string;
  optionIndex: number;
  displayName: string;
  username: string;
  avatarColor: string;
  avatarUrl?: string;
}

export type ScheduledTargetKind = "dm" | "group" | "community";

export interface ScheduledMessage {
  id: string;
  senderId: string;
  targetKind: ScheduledTargetKind;
  targetId: string;
  body: string;
  replyToId?: string;
  scheduledAt: number;
  createdAt: number;
}

export interface FetchMessagesOptions {
  callPollOnly?: boolean;
  limit?: number;
}

export interface JaTextStore {
  /** "turso" on live Turso backend, or "demo" in local fallback mode */
  mode: "demo" | "convex" | "turso";
  loading: boolean;
  me: JaUser | null;
  friends: JaUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  previews: ChatPreview[];
  previewsReady: boolean;
  friendActivities: FriendActivity[];
  communityMessages: CommunityMessage[];
  communityMessagesReady: boolean;
  communityMuted: boolean;
  communityUnreadCount: number;
  setCommunityMuted: (muted: boolean) => Promise<void>;
  markCommunityRead: () => Promise<void>;
  communityPermissions: { isOwner: boolean; canModerate: boolean; moderatorIds: string[] };
  communityDirectory: CommunityUser[];
  groups: GroupSummary[];
  activeGroupId: string | null;
  setActiveGroupId: (id: string | null) => void;
  groupDetails: GroupDetails | null;
  groupMessages: GroupMessage[];
  groupMessagesReady: boolean;
  groupTypingUsers: ChatTypingUser[];
  communityTypingUsers: ChatTypingUser[];
  notificationsEnabled: boolean;
  pushRegistrationStatus: "idle" | "registering" | "registered" | "unavailable" | "error";
  soundsEnabled: boolean;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  activeMessages: ChatMessage[];
  activeMessagesReady: boolean;
  hasMoreOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  loadOlderMessages?: () => Promise<number>;
  hasMoreOlderGroupMessages?: boolean;
  loadingOlderGroupMessages?: boolean;
  loadOlderGroupMessages?: () => Promise<number>;
  hasMoreOlderCommunityMessages?: boolean;
  loadingOlderCommunityMessages?: boolean;
  loadOlderCommunityMessages?: () => Promise<number>;
  blockedUserIds: string[];

  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: (demoProfile?: { name: string; email: string }) => Promise<void>;
  signOut: () => Promise<void>;

  checkUsername: (username: string) => Promise<{ available: boolean; message?: string }>;
  saveProfile: (input: ProfileInput) => Promise<void>;
  getUserById?: (userId: string) => Promise<JaUser | null>;
  getCommunityPollVoters?: (pollId: string) => Promise<PollVoter[]>;

  sendFriendRequest: (username: string) => Promise<void>;
  respondRequest: (requestId: string, accept: boolean) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;

  sendMessage: (receiverId: string, body: string, file?: File, replyToId?: string) => Promise<void>;
  fetchMessagesWithUser: (otherId: string, options?: FetchMessagesOptions) => Promise<ChatMessage[]>;
  forwardMessage: (messageId: string, receiverId: string) => Promise<void>;
  forwardDmToTarget?: (messageId: string, target: { userId?: string; groupId?: string }) => Promise<void>;
  toggleMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteMessageForMe: (messageId: string) => Promise<void>;
  restoreMessageForMe?: (message: ChatMessage) => Promise<void>;
  unsendMessage: (messageId: string) => Promise<boolean>;
  editMessage: (messageId: string, body: string) => Promise<void>;
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
  setCommunityModerators: (userIds: string[]) => Promise<void>;
  sendCommunityText: (body: string, file?: File, replyToId?: string, forwardedFromId?: string) => Promise<void>;
  sendCommunitySticker: (sticker: StickerMedia, replyToId?: string) => Promise<void>;
  setCommunityTyping: (isTyping: boolean) => Promise<void>;
  createCommunityPoll: (question: string, options: string[]) => Promise<void>;
  voteCommunityPoll: (pollId: string, optionIndex: number) => Promise<void>;
  endCommunityPoll: (pollId: string) => Promise<void>;
  editCommunityMessage: (messageId: string, body: string) => Promise<void>;
  deleteCommunityMessage: (messageId: string) => Promise<void>;
  toggleCommunityReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteCommunityMessageForMe: (messageId: string) => Promise<void>;
  restoreCommunityMessageForMe?: (message: CommunityMessage) => Promise<void>;
  unsendCommunityMessage: (messageId: string) => Promise<boolean>;
  forwardCommunityMessage: (messageId: string, target: { groupId?: string; userId?: string; community?: boolean }) => Promise<void>;
  favoriteCommunityStickerFromMessage: (messageId: string) => Promise<void>;
  createGroup: (name: string, memberIds: string[]) => Promise<string>;
  addGroupMembers: (groupId: string, memberIds: string[]) => Promise<void>;
  sendGroupMessage: (groupId: string, body: string, file?: File, replyToId?: string, forwardedFromId?: string) => Promise<void>;
  fetchGroupMessages: (groupId: string, options?: FetchMessagesOptions) => Promise<GroupMessage[]>;
  fetchGroupDetails: (groupId: string) => Promise<GroupDetails | null>;
  sendGroupSticker: (groupId: string, sticker: StickerMedia, replyToId?: string) => Promise<void>;
  setGroupTyping: (groupId: string, isTyping: boolean) => Promise<void>;
  toggleGroupReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteGroupMessageForMe: (messageId: string) => Promise<void>;
  restoreGroupMessageForMe?: (message: GroupMessage) => Promise<void>;
  unsendGroupMessage: (messageId: string) => Promise<boolean>;
  editGroupMessage: (messageId: string, body: string) => Promise<void>;
  forwardGroupMessage: (messageId: string, target: { groupId?: string; userId?: string; community?: boolean }) => Promise<void>;
  favoriteGroupStickerFromMessage: (messageId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  setGroupAvatar: (groupId: string, file: File | null) => Promise<void>;
  setGroupMemberRole: (groupId: string, userId: string, role: "moderator" | "member") => Promise<void>;
  setGroupMuted: (groupId: string, userId: string, muted: boolean) => Promise<void>;
  removeGroupMember: (groupId: string, userId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  clearGroupChatForMe: (groupId: string) => Promise<void>;
  setGroupSilenced: (groupId: string, silenced: boolean) => Promise<void>;
  setGroupArchived: (groupId: string, archived: boolean) => Promise<void>;
  markGroupRead: (groupId: string) => Promise<void>;
  refreshPushRegistration: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundsEnabled: (enabled: boolean) => void;

  /** Zero-knowledge E2EE Vault & Multi-Device Sync */
  hasRemoteE2EEVault?: boolean;
  remoteVaultKeyId?: string | null;
  pendingDeviceSyncRequests?: DeviceSyncRequest[];
  activeDeviceSyncCode?: string | null;
  saveE2EEVaultBackup?: (passphrase: string) => Promise<{ recoveryKey: string }>;
  restoreE2EEVaultBackup?: (secretInput: string, mode: "pin" | "recovery") => Promise<void>;
  requestLiveDeviceSync?: () => Promise<string>;
  approveDeviceSyncRequest?: (request: DeviceSyncRequest) => Promise<void>;
  verifyFriendSecurityCode?: (friendId: string, verified?: boolean) => Promise<boolean>;

  /** Scheduled Messages */
  scheduledMessages?: ScheduledMessage[];
  scheduleMessage?: (
    targetKind: ScheduledTargetKind,
    targetId: string,
    body: string,
    scheduledAt: number,
    replyToId?: string,
  ) => Promise<ScheduledMessage>;
  refreshScheduledMessages?: () => Promise<ScheduledMessage[]>;
  deleteScheduledMessage?: (scheduledId: string) => Promise<void>;
  flushScheduledMessages?: () => Promise<number>;
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
