import { useCallback, useState, type ReactNode } from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
// Works with both the checked-in stub and the real generated API
// (run `npx convex dev` once to generate convex/_generated for real).
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { JaTextContext } from "./store";
import type {
  ChatMessage,
  ChatPreview,
  FriendRequest,
  JaTextStore,
  JaUser,
  ProfileInput,
} from "./types";

/* ------------------------------------------------------------------ */
/* Real Convex store — active when VITE_CONVEX_URL is set.             */
/* All data (users, friend requests, messages, file uploads) goes     */
/* through the Convex functions in /convex. Auth = Convex Auth with    */
/* Google OAuth + email/password providers.                            */
/* ------------------------------------------------------------------ */

export function ConvexStoreProvider({ children }: { children: ReactNode }) {
  const convex = useConvex();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut: convexSignOut } = useAuthActions();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip") as
    | JaUser
    | null
    | undefined;
  const friends = (useQuery(
    api.friends.listFriends,
    isAuthenticated ? {} : "skip",
  ) ?? []) as JaUser[];
  const incoming = (useQuery(
    api.friends.listIncoming,
    isAuthenticated ? {} : "skip",
  ) ?? []) as FriendRequest[];
  const outgoing = (useQuery(
    api.friends.listOutgoing,
    isAuthenticated ? {} : "skip",
  ) ?? []) as FriendRequest[];
  const previews = (useQuery(
    api.messages.previews,
    isAuthenticated ? {} : "skip",
  ) ?? []) as ChatPreview[];
  const activeMessages = (useQuery(
    api.messages.list,
    isAuthenticated && activeChatId
      ? { otherId: activeChatId as Id<"users"> }
      : "skip",
  ) ?? []) as ChatMessage[];

  const saveProfileMut = useMutation(api.users.saveProfile);
  const sendRequestMut = useMutation(api.friends.sendRequest);
  const respondMut = useMutation(api.friends.respond);
  const sendMessageMut = useMutation(api.messages.send);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);

  /** Upload a file to Convex storage, returns its storage id. */
  const upload = useCallback(
    async (file: File): Promise<Id<"_storage">> => {
      const url = (await generateUploadUrl()) as string;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = await res.json();
      return storageId as Id<"_storage">;
    },
    [generateUploadUrl],
  );

  const signInEmail = useCallback<JaTextStore["signInEmail"]>(
    async (email, password) => {
      await signIn("password", { email: email.trim(), password, flow: "signIn" });
    },
    [signIn],
  );

  const signUpEmail = useCallback<JaTextStore["signUpEmail"]>(
    async (email, password) => {
      await signIn("password", { email: email.trim(), password, flow: "signUp" });
    },
    [signIn],
  );

  const signInGoogle = useCallback<JaTextStore["signInGoogle"]>(
    async () => {
      await signIn("google");
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    setActiveChatId(null);
    await convexSignOut();
  }, [convexSignOut]);

  const checkUsername = useCallback<JaTextStore["checkUsername"]>(
    async (username) =>
      (await convex.query(api.users.checkUsername, {
        username: username.trim().toLowerCase(),
      })) as { available: boolean; message?: string },
    [convex],
  );

  const saveProfile = useCallback<JaTextStore["saveProfile"]>(
    async (input: ProfileInput) => {
      const avatarId =
        input.avatarFile === null
          ? null
          : input.avatarFile
            ? await upload(input.avatarFile)
            : undefined;
      const bannerId =
        input.bannerFile === null
          ? null
          : input.bannerFile
            ? await upload(input.bannerFile)
            : undefined;
      await saveProfileMut({
        displayName: input.displayName.trim(),
        username: input.username.trim().toLowerCase(),
        bio: input.bio.trim(),
        pronouns: input.pronouns.trim(),
        avatarColor: input.avatarColor,
        ...(avatarId !== undefined ? { avatarId } : {}),
        ...(bannerId !== undefined ? { bannerId } : {}),
      });
    },
    [saveProfileMut, upload],
  );

  const sendFriendRequest = useCallback<JaTextStore["sendFriendRequest"]>(
    async (username) => {
      await sendRequestMut({ username: username.trim().toLowerCase().replace(/^@/, "") });
    },
    [sendRequestMut],
  );

  const respondRequest = useCallback<JaTextStore["respondRequest"]>(
    async (requestId, accept) => {
      await respondMut({
        requestId: requestId as Id<"friendRequests">,
        accept,
      });
    },
    [respondMut],
  );

  const sendMessage = useCallback<JaTextStore["sendMessage"]>(
    async (receiverId, body, file) => {
      const attachmentId = file ? await upload(file) : undefined;
      await sendMessageMut({
        receiverId: receiverId as Id<"users">,
        body: body.trim(),
        ...(attachmentId
          ? { attachmentId, attachmentName: file!.name, attachmentType: file!.type }
          : {}),
      });
    },
    [sendMessageMut, upload],
  );

  const value: JaTextStore = {
    mode: "convex",
    loading: authLoading || (isAuthenticated && me === undefined),
    me: isAuthenticated ? (me ?? null) : null,
    friends,
    incoming,
    outgoing,
    previews,
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
  };

  return <JaTextContext.Provider value={value}>{children}</JaTextContext.Provider>;
}