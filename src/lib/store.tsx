import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FOURTEEN_DAYS,
  USERNAME_REGEX,
  type ActivityStatus,
  type ChatMessage,
  type ChatPreview,
  type FriendRequest,
  type JaTextStore,
  type JaUser,
  type ProfileInput,
} from "./types";
import { loadNotificationPreferences, saveNotificationPreferences } from "./alerts";

export const JaTextContext = createContext<JaTextStore | null>(null);

export function useJaText(): JaTextStore {
  const ctx = useContext(JaTextContext);
  if (!ctx) throw new Error("useJaText must be used inside a JaText provider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Demo store                                                          */
/*                                                                     */
/* Mirrors the Convex backend in /convex 1:1 (same rules: username     */
/* uniqueness, 14-day username lock, friends-only chatting, uploads)  */
/* so the app is fully usable before you connect your own Convex      */
/* deployment. Set VITE_CONVEX_URL and the real Convex store takes     */
/* over automatically — see src/lib/convexStore.tsx.                   */
/* ------------------------------------------------------------------ */

const DB_KEY = "jatext-demo-db-v1";
const SESSION_KEY = "jatext-demo-session-v1";

interface DemoUser extends JaUser {
  password?: string;
  provider: "email" | "google" | "bot";
  novaPinged?: boolean;
  botReplyCount?: number;
  unsendWarningShownAt?: number;
}

interface DemoDb {
  users: DemoUser[];
  requests: { id: string; fromId: string; toId: string; status: FriendRequest["status"]; createdAt: number }[];
  messages: DemoMessage[];
  presence: DemoPresence[];
  conversationSettings: DemoConversationSetting[];
}

interface DemoConversationSetting {
  userId: string;
  friendId: string;
  isArchived: boolean;
  isMuted: boolean;
  deletedAt?: number;
}

interface DemoMessage extends ChatMessage {
  hiddenFor?: string[];
  forwardedFromId?: string;
  unsentAt?: number;
}

interface DemoPresence {
  userId: string;
  lastSeenAt: number;
  lastActiveAt: number;
  typingToId?: string;
  typingAt?: number;
}

const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

function svgAvatar(initials: string, from: string, to: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='240' height='240' fill='url(#g)'/><text x='50%' y='56%' font-size='96' font-family='Arial' font-weight='900' fill='white' text-anchor='middle'>${initials}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function svgBanner(from: string, to: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='260'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='900' height='260' fill='url(#g)'/><circle cx='780' cy='40' r='120' fill='white' fill-opacity='0.15'/><circle cx='120' cy='230' r='90' fill='black' fill-opacity='0.12'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function seedDb(): DemoDb {
  const bots: DemoUser[] = [
    {
      id: "bot-maya",
      provider: "bot",
      email: "maya@jatext.app",
      displayName: "Maya",
      username: "maya",
      bio: "photographer 📸 | probably out getting coffee",
      pronouns: "she/her",
      avatarColor: "yellow",
      avatarUrl: svgAvatar("M", "#ffc61a", "#ff9d00"),
      bannerUrl: svgBanner("#ffc61a", "#fb7c1e"),
      onboardingComplete: true,
      usernameChangedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    },
    {
      id: "bot-kai",
      provider: "bot",
      email: "kai@jatext.app",
      displayName: "Kai Tan",
      username: "kai.codes",
      bio: "building stuff with Convex ⚡",
      pronouns: "he/him",
      avatarColor: "purple",
      avatarUrl: svgAvatar("K", "#8b5cf6", "#6d28d9"),
      bannerUrl: svgBanner("#8b5cf6", "#3b82f6"),
      onboardingComplete: true,
      usernameChangedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    },
    {
      id: "bot-nova",
      provider: "bot",
      email: "Nova@jatext.app",
      displayName: "Nova",
      username: "Nova",
      bio: "music, matcha & late night texts 🌙",
      pronouns: "they/them",
      avatarColor: "teal",
      avatarUrl: svgAvatar("L", "#14b8a6", "#0d9488"),
      bannerUrl: svgBanner("#14b8a6", "#22c55e"),
      onboardingComplete: true,
      usernameChangedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    },
  ];
  const now = Date.now();
  return {
    users: bots,
    requests: [],
    messages: [],
    conversationSettings: [],
    presence: bots.map((bot) => ({
      userId: bot.id,
      lastSeenAt: now,
      lastActiveAt: now,
    })),
  };
}

function loadDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      db.presence ??= db.users
        .filter((user) => user.provider === "bot")
        .map((user) => ({
          userId: user.id,
          lastSeenAt: Date.now(),
          lastActiveAt: Date.now(),
        }));
      db.conversationSettings ??= [];
      db.users.forEach((user) => {
        user.statusPreference ??= "online";
        user.customStatus ??= "";
      });
      return db;
    }
  } catch {
    /* fall through to seed */
  }
  const db = seedDb();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const BOT_WELCOME: Record<string, string> = {
  "bot-maya": "heyy! thanks for adding me 💛 welcome to JaText!",
  "bot-kai": "yo! friend request accepted ✅ what are we building today?",
  "bot-nova": "hiii ✨ Nova btw. send me something fun!",
};

const BOT_REPLIES = [
  "omg yes 😭",
  "wait that's actually so good",
  "tell me more 👀",
  "haha fr. also — try sending me a photo attachment, it works!",
  "okay noted 📝",
  "you're my favourite person to text rn not gonna lie",
  "real. anyway what are you up to later?",
];

const toPublic = (u: DemoUser): JaUser => {
  const { password: _pw, provider: _p, novaPinged: _n, botReplyCount: _b, ...pub } = u;
  return pub;
};

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DemoDb>(() => loadDb());
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState(loadNotificationPreferences);
  const timers = useRef<number[]>([]);

  const persist = useCallback((next: DemoDb) => {
    localStorage.setItem(DB_KEY, JSON.stringify(next));
    setDb(next);
  }, []);

  /** Mutate a fresh copy of the DB (safe inside setTimeout bot actions). */
  const transact = useCallback(
    (fn: (draft: DemoDb) => void) => {
      const fresh = loadDb();
      fn(fresh);
      persist(fresh);
      return fresh;
    },
    [persist],
  );

  // live updates across tabs, like Convex subscriptions
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DB_KEY && e.newValue) {
        setDb(loadDb());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const me = useMemo<DemoUser | null>(
    () => db.users.find((u) => u.id === sessionId) ?? null,
    [db, sessionId],
  );
  const currentUserId = me?.id;

  useEffect(() => {
    if (!currentUserId) return;
    let lastActivityAt = Date.now();
    const markActive = () => {
      lastActivityAt = Date.now();
    };
    const heartbeat = () => {
      const now = Date.now();
      const active =
        document.visibilityState === "visible" &&
        now - lastActivityAt < 5 * 60_000;
      transact((draft) => {
        let presence = draft.presence.find((entry) => entry.userId === currentUserId);
        if (!presence) {
          presence = { userId: currentUserId, lastSeenAt: now, lastActiveAt: now };
          draft.presence.push(presence);
        }
        presence.lastSeenAt = now;
        if (active) presence.lastActiveAt = now;
      });
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "mousemove"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, markActive));
    };
  }, [currentUserId, transact]);

  const startSession = useCallback((userId: string) => {
    localStorage.setItem(SESSION_KEY, userId);
    setSessionId(userId);
  }, []);

  /* ---------------- bot behaviours (demo only) ---------------- */

  const botAcceptAndGreet = useCallback(
    (botId: string, userId: string) => {
      schedule(() => {
        transact((draft) => {
          const req = draft.requests.find(
            (r) => r.fromId === userId && r.toId === botId && r.status === "pending",
          );
          if (req) req.status = "accepted";
          draft.messages.push({
            id: uid(),
            senderId: botId,
            receiverId: userId,
            body: BOT_WELCOME[botId] ?? "hey! 👋",
            createdAt: Date.now(),
          });
        });
      }, 2000);
    },
    [schedule, transact],
  );

  const botReply = useCallback(
    (botId: string, userId: string) => {
      transact((draft) => {
        const presence = draft.presence.find((entry) => entry.userId === botId);
        if (presence) {
          presence.typingToId = userId;
          presence.typingAt = Date.now();
        }
      });
      schedule(() => {
        transact((draft) => {
          const bot = draft.users.find((u) => u.id === botId);
          if (!bot) return;
          const presence = draft.presence.find((entry) => entry.userId === botId);
          if (presence) {
            presence.typingToId = undefined;
            presence.typingAt = undefined;
          }
          const idx = (bot.botReplyCount ?? 0) % BOT_REPLIES.length;
          bot.botReplyCount = (bot.botReplyCount ?? 0) + 1;
          draft.messages.push({
            id: uid(),
            senderId: botId,
            receiverId: userId,
            body: BOT_REPLIES[idx],
            createdAt: Date.now(),
          });
        });
      }, 1400);
    },
    [schedule, transact],
  );

  const NovaSendsRequest = useCallback(
    (userId: string) => {
      schedule(() => {
        transact((draft) => {
          const user = draft.users.find((u) => u.id === userId);
          if (!user || user.novaPinged) return;
          user.novaPinged = true;
          const exists = draft.requests.some(
            (r) =>
              (r.fromId === "bot-nova" && r.toId === userId) ||
              (r.fromId === userId && r.toId === "bot-nova"),
          );
          if (!exists) {
            draft.requests.push({
              id: uid(),
              fromId: "bot-nova",
              toId: userId,
              status: "pending",
              createdAt: Date.now(),
            });
          }
        });
      }, 5000);
    },
    [schedule, transact],
  );

  /* ---------------- auth ---------------- */

  const signUpEmail = useCallback<JaTextStore["signUpEmail"]>(
    async (email, password) => {
      email = email.trim().toLowerCase();
      if (!email.includes("@")) throw new Error("Please enter a valid email.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      if (loadDb().users.some((u) => u.email === email))
        throw new Error("An account with this email already exists. Try signing in.");
      const user: DemoUser = {
        id: uid(),
        provider: "email",
        email,
        password,
        displayName: "",
        username: "",
        bio: "",
        pronouns: "",
        avatarColor: "yellow",
        onboardingComplete: false,
      };
      transact((draft) => draft.users.push(user));
      startSession(user.id);
    },
    [startSession, transact],
  );

  const signInEmail = useCallback<JaTextStore["signInEmail"]>(
    async (email, password) => {
      email = email.trim().toLowerCase();
      const user = loadDb().users.find((u) => u.email === email);
      if (!user) throw new Error("No account found with that email. Create one first!");
      if (user.provider === "google")
        throw new Error("This account uses Google sign-in. Use the Google button.");
      if (user.password !== password) throw new Error("Incorrect password.");
      startSession(user.id);
    },
    [startSession],
  );

  const signInGoogle = useCallback<JaTextStore["signInGoogle"]>(
    async (demoProfile) => {
      const email = (demoProfile?.email ?? "Alex@example.com").trim().toLowerCase();
      const name = demoProfile?.name?.trim() || "Alex Google";
      const existing = loadDb().users.find((u) => u.email === email);
      if (existing) {
        startSession(existing.id);
        return;
      }
      const user: DemoUser = {
        id: uid(),
        provider: "google",
        email,
        displayName: name,
        username: "",
        bio: "",
        pronouns: "",
        avatarColor: "yellow",
        avatarUrl: svgAvatar(name.slice(0, 1).toUpperCase(), "#3b82f6", "#8b5cf6"),
        onboardingComplete: false,
      };
      transact((draft) => draft.users.push(user));
      startSession(user.id);
    },
    [startSession, transact],
  );

  const signOut = useCallback(async () => {
    if (sessionId) {
      transact((draft) => {
        const presence = draft.presence.find((entry) => entry.userId === sessionId);
        if (presence) {
          presence.lastSeenAt = 0;
          presence.typingToId = undefined;
          presence.typingAt = undefined;
        }
      });
    }
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setActiveChatId(null);
  }, [sessionId, transact]);

  /* ---------------- profile ---------------- */

  const checkUsername = useCallback<JaTextStore["checkUsername"]>(
    async (username) => {
      username = username.trim().toLowerCase();
      if (!USERNAME_REGEX.test(username))
        return {
          available: false,
          message: "3–20 characters: lowercase letters, numbers, . or _",
        };
      const taken = loadDb().users.some(
        (u) => u.username === username && u.id !== sessionId,
      );
      return taken
        ? { available: false, message: `@${username} is already taken` }
        : { available: true };
    },
    [sessionId],
  );

  const saveProfile = useCallback<JaTextStore["saveProfile"]>(
    async (input: ProfileInput) => {
      if (!me) throw new Error("Not signed in.");
      const username = input.username.trim().toLowerCase();
      if (!input.displayName.trim()) throw new Error("Display name is required.");
      if (!USERNAME_REGEX.test(username))
        throw new Error("Username must be 3–20 characters: lowercase letters, numbers, . or _");
      const fresh = loadDb();
      const current = fresh.users.find((u) => u.id === me.id)!;
      if (fresh.users.some((u) => u.username === username && u.id !== me.id))
        throw new Error(`@${username} is already taken.`);
      const firstTime = !current.onboardingComplete;
      if (
        current.username &&
        current.username !== username &&
        current.usernameChangedAt &&
        Date.now() - current.usernameChangedAt < FOURTEEN_DAYS
      ) {
        const days = Math.max(
          1,
          Math.ceil((current.usernameChangedAt + FOURTEEN_DAYS - Date.now()) / 86400000),
        );
        throw new Error(`You can only change your username once every 14 days. Try again in ${days} day${days === 1 ? "" : "s"}.`);
      }

      const avatarUrl =
        input.avatarFile === null
          ? undefined
          : input.avatarFile
            ? await fileToDataUrl(input.avatarFile)
            : current.avatarUrl;
      const bannerUrl =
        input.bannerFile === null
          ? undefined
          : input.bannerFile
            ? await fileToDataUrl(input.bannerFile)
            : current.bannerUrl;

      transact((draft) => {
        const u = draft.users.find((x) => x.id === me.id)!;
        if (u.username !== username) u.usernameChangedAt = Date.now();
        u.displayName = input.displayName.trim();
        u.username = username;
        u.bio = input.bio.trim();
        u.pronouns = input.pronouns.trim();
        u.avatarColor = input.avatarColor;
        u.avatarUrl = avatarUrl;
        u.bannerUrl = bannerUrl;
        u.onboardingComplete = true;
      });

      if (firstTime) NovaSendsRequest(me.id);
    },
    [me, NovaSendsRequest, transact],
  );

  /* ---------------- friends ---------------- */

  const { friends, incoming, outgoing } = useMemo(() => {
    if (!me) return { friends: [] as JaUser[], incoming: [] as FriendRequest[], outgoing: [] as FriendRequest[] };
    const byId = new Map(db.users.map((u) => [u.id, toPublic(u)]));
    const toReq = (r: DemoDb["requests"][number]): FriendRequest => ({
      id: r.id,
      from: byId.get(r.fromId)!,
      to: byId.get(r.toId)!,
      status: r.status,
      createdAt: r.createdAt,
    });
    const accepted = db.requests.filter((r) => r.status === "accepted" && (r.fromId === me.id || r.toId === me.id));
    return {
      friends: accepted
        .map((r) => byId.get(r.fromId === me.id ? r.toId : r.fromId)!)
        .filter(Boolean),
      incoming: db.requests
        .filter((r) => r.toId === me.id && r.status === "pending")
        .map(toReq),
      outgoing: db.requests
        .filter((r) => r.fromId === me.id && r.status === "pending")
        .map(toReq),
    };
  }, [db, me]);

  const sendFriendRequest = useCallback<JaTextStore["sendFriendRequest"]>(
    async (usernameRaw) => {
      if (!me) throw new Error("Not signed in.");
      const username = usernameRaw.trim().toLowerCase().replace(/^@/, "");
      const fresh = loadDb();
      const target = fresh.users.find((u) => u.username === username);
      if (!target) throw new Error(`No JaText user with username @${username}.`);
      if (target.id === me.id) throw new Error("You can't add yourself 😅");
      const between = fresh.requests.filter(
        (r) =>
          (r.fromId === me.id && r.toId === target.id) ||
          (r.fromId === target.id && r.toId === me.id),
      );
      if (between.some((r) => r.status === "accepted"))
        throw new Error(`You're already friends with @${username}.`);
      if (between.some((r) => r.status === "pending" && r.fromId === me.id))
        throw new Error(`Friend request to @${username} is already pending.`);
      if (between.some((r) => r.status === "pending" && r.fromId === target.id))
        throw new Error(`@${username} already sent YOU a request — check your requests!`);

      transact((draft) =>
        draft.requests.push({
          id: uid(),
          fromId: me.id,
          toId: target.id,
          status: "pending",
          createdAt: Date.now(),
        }),
      );
      if (target.provider === "bot") botAcceptAndGreet(target.id, me.id);
    },
    [botAcceptAndGreet, me, transact],
  );

  const respondRequest = useCallback<JaTextStore["respondRequest"]>(
    async (requestId, accept) => {
      transact((draft) => {
        const req = draft.requests.find((r) => r.id === requestId);
        if (req) req.status = accept ? "accepted" : "declined";
      });
    },
    [transact],
  );

  /* ---------------- messages ---------------- */

  const previews = useMemo<ChatPreview[]>(() => {
    if (!me) return [];
    return friends.map((friend) => {
      const settings = db.conversationSettings.find(
        (entry) => entry.userId === me.id && entry.friendId === friend.id,
      );
      const latest = db.messages
        .filter(
          (message) =>
            !message.hiddenFor?.includes(me.id) &&
            (message.senderId === me.id
              ? message.receiverId === friend.id
              : message.senderId === friend.id && message.receiverId === me.id) &&
            (settings?.deletedAt === undefined ||
              message.createdAt > settings.deletedAt),
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return {
        friendId: friend.id,
        body: latest
          ? latest.unsentAt
            ? "This message was unsent"
            : latest.body || "📎 Attachment"
          : "",
        createdAt: latest?.createdAt ?? 0,
        senderId: latest?.senderId ?? me.id,
        isArchived: settings?.isArchived ?? false,
        isMuted: settings?.isMuted ?? false,
      };
    });
  }, [db, friends, me]);

  const activeMessages = useMemo<ChatMessage[]>(() => {
    if (!me || !activeChatId) return [];
    const deletedAt = db.conversationSettings.find(
      (entry) => entry.userId === me.id && entry.friendId === activeChatId,
    )?.deletedAt;
    return db.messages
      .filter(
        (m) =>
          !m.hiddenFor?.includes(me.id) &&
          ((m.senderId === me.id && m.receiverId === activeChatId) ||
            (m.senderId === activeChatId && m.receiverId === me.id)) &&
          (deletedAt === undefined || m.createdAt > deletedAt),
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((message) => {
        if (!message.replyTo) return message;
        const source = db.messages.find((entry) => entry.id === message.replyTo?.id);
        if (!source) return message;
        return {
          ...message,
          replyTo: {
            id: source.id,
            senderId: source.senderId,
            body: source.hiddenFor?.includes(me.id)
              ? "Message unavailable"
              : source.unsentAt
                ? "This message was unsent"
                : source.body || "📎 Attachment",
          },
        };
      });
  }, [activeChatId, db, me]);

  const friendActivities = useMemo(
    () =>
      friends.map((friend) => {
        const presence = db.presence.find((entry) => entry.userId === friend.id);
        const isBot = db.users.some(
          (user) => user.id === friend.id && user.provider === "bot",
        );
        const now = Date.now();
        const connected =
          isBot || (!!presence && now - presence.lastSeenAt <= 90_000);
        const preference = friend.statusPreference ?? "online";
        const status: ActivityStatus =
          preference === "offline" || !connected
            ? "offline"
            : preference === "dnd"
              ? "dnd"
              : !isBot && now - (presence?.lastActiveAt ?? 0) >= 5 * 60_000
                ? "away"
                : "online";
        const typingAt = presence?.typingAt;
        return {
          userId: friend.id,
          status,
          customStatus: friend.customStatus ?? "",
          isTyping:
            presence?.typingToId === me?.id &&
            typingAt !== undefined &&
            now - typingAt <= 5_000,
        };
      }),
    [db.presence, db.users, friends, me?.id],
  );

  const sendMessage = useCallback<JaTextStore["sendMessage"]>(
    async (receiverId, body, file, replyToId) => {
      if (!me) throw new Error("Not signed in.");
      const attachmentUrl = file ? await fileToDataUrl(file) : undefined;
      transact((draft) => {
        const reply = replyToId
          ? draft.messages.find((message) => message.id === replyToId)
          : undefined;
        if (
          replyToId &&
          (!reply ||
            reply.hiddenFor?.includes(me.id) ||
            !(
              (reply.senderId === me.id && reply.receiverId === receiverId) ||
              (reply.senderId === receiverId && reply.receiverId === me.id)
            ))
        )
          throw new Error("The message you are replying to is unavailable.");
        draft.messages.push({
          id: uid(),
          senderId: me.id,
          receiverId,
          body: body.trim(),
          attachmentUrl,
          attachmentName: file?.name,
          attachmentType: file?.type,
          createdAt: Date.now(),
          replyTo: reply
            ? {
                id: reply.id,
                senderId: reply.senderId,
                body: reply.unsentAt ? "This message was unsent" : reply.body,
              }
            : undefined,
        });
      });
      const target = loadDb().users.find((u) => u.id === receiverId);
      if (target?.provider === "bot") botReply(receiverId, me.id);
    },
    [botReply, me, transact],
  );

  const forwardMessage = useCallback<JaTextStore["forwardMessage"]>(
    async (messageId, receiverId) => {
      if (!me) throw new Error("Not signed in.");
      const fresh = loadDb();
      const source = fresh.messages.find((message) => message.id === messageId);
      if (
        !source ||
        (source.senderId !== me.id && source.receiverId !== me.id) ||
        source.hiddenFor?.includes(me.id) ||
        source.unsentAt
      ) {
        throw new Error("This message can no longer be forwarded.");
      }
      if (!friends.some((friend) => friend.id === receiverId))
        throw new Error("You can only forward messages to accepted friends.");

      const forwardedFrom =
        fresh.users.find((user) => user.id === source.senderId)?.displayName ?? "a friend";
      transact((draft) =>
        draft.messages.push({
          ...source,
          id: uid(),
          senderId: me.id,
          receiverId,
          createdAt: Date.now(),
          replyTo: undefined,
          reactions: undefined,
          hiddenFor: undefined,
          forwardedFromId: source.senderId,
          forwardedFrom,
          unsentAt: undefined,
        }),
      );
      const target = fresh.users.find((user) => user.id === receiverId);
      if (target?.provider === "bot") botReply(receiverId, me.id);
    },
    [botReply, friends, me, transact],
  );

  const toggleMessageReaction = useCallback<JaTextStore["toggleMessageReaction"]>(
    async (messageId, emoji) => {
      const allowed = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
      if (!me) throw new Error("Not signed in.");
      if (!allowed.includes(emoji)) throw new Error("That reaction is not available.");
      transact((draft) => {
        const message = draft.messages.find((entry) => entry.id === messageId);
        if (
          !message ||
          (message.senderId !== me.id && message.receiverId !== me.id) ||
          message.hiddenFor?.includes(me.id) ||
          message.unsentAt
        ) {
          throw new Error("This message cannot be reacted to.");
        }
        const reactions = message.reactions ?? [];
        const existing = reactions.find((reaction) => reaction.userId === me.id);
        message.reactions =
          existing?.emoji === emoji
            ? reactions.filter((reaction) => reaction.userId !== me.id)
            : [
                ...reactions.filter((reaction) => reaction.userId !== me.id),
                { userId: me.id, emoji },
              ];
      });
    },
    [me, transact],
  );

  const deleteMessageForMe = useCallback<JaTextStore["deleteMessageForMe"]>(
    async (messageId) => {
      if (!me) throw new Error("Not signed in.");
      transact((draft) => {
        const message = draft.messages.find((entry) => entry.id === messageId);
        if (
          !message ||
          (message.senderId !== me.id && message.receiverId !== me.id)
        ) {
          throw new Error("Message not found.");
        }
        message.hiddenFor ??= [];
        if (!message.hiddenFor.includes(me.id)) message.hiddenFor.push(me.id);
      });
    },
    [me, transact],
  );

  const unsendMessage = useCallback<JaTextStore["unsendMessage"]>(
    async (messageId) => {
      if (!me) throw new Error("Not signed in.");
      let showWarning = false;
      transact((draft) => {
        const message = draft.messages.find((entry) => entry.id === messageId);
        if (!message || message.senderId !== me.id)
          throw new Error("You can only unsend your own messages.");
        if (message.unsentAt) throw new Error("This message was already unsent.");
        if (Date.now() - message.createdAt >= 60 * 60 * 1000)
          throw new Error("Messages can only be unsent within one hour.");
        const user = draft.users.find((entry) => entry.id === me.id);
        if (!user) throw new Error("Account not found.");
        const now = Date.now();
        showWarning =
          user.unsendWarningShownAt === undefined ||
          now - user.unsendWarningShownAt >= 3 * 60 * 60 * 1000;
        if (showWarning) user.unsendWarningShownAt = now;
        message.body = "";
        message.attachmentUrl = undefined;
        message.attachmentName = undefined;
        message.attachmentType = undefined;
        message.reactions = [];
        message.unsentAt = now;
      });
      return showWarning;
    },
    [me, transact],
  );

  const setConversationArchived = useCallback<JaTextStore["setConversationArchived"]>(
    async (friendId, archived) => {
      if (!me) throw new Error("Please sign in to change chat settings.");
      if (!friends.some((friend) => friend.id === friendId))
        throw new Error("This conversation is unavailable.");
      transact((draft) => {
        let settings = draft.conversationSettings.find(
          (entry) => entry.userId === me.id && entry.friendId === friendId,
        );
        if (!settings) {
          settings = {
            userId: me.id,
            friendId,
            isArchived: false,
            isMuted: false,
          };
          draft.conversationSettings.push(settings);
        }
        settings.isArchived = archived;
      });
    },
    [friends, me, transact],
  );

  const setConversationMuted = useCallback<JaTextStore["setConversationMuted"]>(
    async (friendId, muted) => {
      if (!me) throw new Error("Please sign in to change chat settings.");
      if (!friends.some((friend) => friend.id === friendId))
        throw new Error("This conversation is unavailable.");
      transact((draft) => {
        let settings = draft.conversationSettings.find(
          (entry) => entry.userId === me.id && entry.friendId === friendId,
        );
        if (!settings) {
          settings = {
            userId: me.id,
            friendId,
            isArchived: false,
            isMuted: false,
          };
          draft.conversationSettings.push(settings);
        }
        settings.isMuted = muted;
      });
    },
    [friends, me, transact],
  );

  const deleteConversationForMe = useCallback<JaTextStore["deleteConversationForMe"]>(
    async (friendId) => {
      if (!me) throw new Error("Please sign in to delete this chat.");
      if (!friends.some((friend) => friend.id === friendId))
        throw new Error("This conversation is unavailable.");
      transact((draft) => {
        let settings = draft.conversationSettings.find(
          (entry) => entry.userId === me.id && entry.friendId === friendId,
        );
        if (!settings) {
          settings = {
            userId: me.id,
            friendId,
            isArchived: false,
            isMuted: false,
          };
          draft.conversationSettings.push(settings);
        }
        settings.deletedAt = Date.now();
      });
    },
    [friends, me, transact],
  );

  const setActivity = useCallback<JaTextStore["setActivity"]>(
    async (status, customStatus) => {
      if (!me) throw new Error("Not signed in.");
      transact((draft) => {
        const user = draft.users.find((entry) => entry.id === me.id);
        if (!user) throw new Error("Account not found.");
        user.statusPreference = status;
        user.customStatus = customStatus.trim().slice(0, 60);
      });
    },
    [me, transact],
  );

  const setTyping = useCallback<JaTextStore["setTyping"]>(
    async (receiverId, isTyping) => {
      if (!me) throw new Error("Not signed in.");
      if (!friends.some((friend) => friend.id === receiverId))
        throw new Error("You can only type to accepted friends.");
      const now = Date.now();
      transact((draft) => {
        let presence = draft.presence.find((entry) => entry.userId === me.id);
        if (!presence) {
          presence = { userId: me.id, lastSeenAt: now, lastActiveAt: now };
          draft.presence.push(presence);
        }
        presence.typingToId = isTyping ? receiverId : undefined;
        presence.typingAt = isTyping ? now : undefined;
      });
    },
    [friends, me, transact],
  );

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setNotificationPreferences((current) => {
      const next = { ...current, notificationsEnabled: enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const setSoundsEnabled = useCallback((enabled: boolean) => {
    setNotificationPreferences((current) => {
      const next = { ...current, soundsEnabled: enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const value: JaTextStore = {
    mode: "demo",
    loading: false,
    me: me ? toPublic(me) : null,
    friends,
    incoming,
    outgoing,
    previews,
    previewsReady: true,
    friendActivities,
    notificationsEnabled: notificationPreferences.notificationsEnabled,
    soundsEnabled: notificationPreferences.soundsEnabled,
    activeChatId,
    setActiveChatId,
    activeMessages,
    signInEmail,
    signUpEmail,
    signInGoogle,
    signOut,
    checkUsername,
    saveProfile,
    sendFriendRequest,
    respondRequest,
    sendMessage,
    forwardMessage,
    toggleMessageReaction,
    deleteMessageForMe,
    unsendMessage,
    setConversationArchived,
    setConversationMuted,
    deleteConversationForMe,
    setActivity,
    setTyping,
    setNotificationsEnabled,
    setSoundsEnabled,
  };

  return <JaTextContext.Provider value={value}>{children}</JaTextContext.Provider>;
}
