import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { areFriends, pairKey, requireUser } from "./lib";

const mediaType = v.union(
  v.literal("gif"),
  v.literal("sticker"),
  v.literal("image"),
);
const mediaSource = v.union(v.literal("klipy"), v.literal("upload"));

type StickerCtx = QueryCtx | MutationCtx;

function isKlipyUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "klipy.com" || url.hostname.endsWith(".klipy.com"))
    );
  } catch {
    return false;
  }
}

function validateMediaUrl(url: string, source: "klipy" | "upload") {
  if (source === "klipy" && !isKlipyUrl(url))
    throw new Error("Only Klipy GIF links can be saved from search.");
}

async function mediaView(ctx: StickerCtx, item: Doc<"stickerLibrary">) {
  const url = item.storageId
    ? await ctx.storage.getUrl(item.storageId)
    : item.url;
  if (!url) return null;
  return {
    key: item.mediaKey,
    url,
    previewUrl: item.previewUrl ?? url,
    name: item.name,
    mediaType: item.mediaType,
    source: item.source,
    storageId: item.storageId as string | undefined,
    isFavorite: item.isFavorite,
    useCount: item.useCount,
    lastUsedAt: item.lastUsedAt,
  };
}

async function getLibraryItem(
  ctx: StickerCtx,
  userId: Id<"users">,
  mediaKey: string,
) {
  return ctx.db
    .query("stickerLibrary")
    .withIndex("by_user_media", (q) =>
      q.eq("userId", userId).eq("mediaKey", mediaKey),
    )
    .unique();
}

export const library = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const [favorites, recent] = await Promise.all([
      ctx.db
        .query("stickerLibrary")
        .withIndex("by_user_favorite", (q) =>
          q.eq("userId", me._id).eq("isFavorite", true),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("stickerLibrary")
        .withIndex("by_user_recent", (q) => q.eq("userId", me._id))
        .order("desc")
        .take(80),
    ]);
    const [favoriteViews, recentViews] = await Promise.all([
      Promise.all(favorites.map((item) => mediaView(ctx, item))),
      Promise.all(
        recent
          .filter((item) => !item.isFavorite)
          .map((item) => mediaView(ctx, item)),
      ),
    ]);
    return {
      favorites: favoriteViews.filter((item) => item !== null),
      recent: recentViews.filter((item) => item !== null).slice(0, 50),
    };
  },
});

export const favoriteFromMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (
      !message ||
      (message.senderId !== me._id && message.receiverId !== me._id) ||
      message.hiddenFor?.includes(me._id) ||
      message.unsentAt
    ) {
      throw new Error("This media is no longer available.");
    }

    const isImage = message.attachmentType?.startsWith("image/");
    if (!message.attachmentUrl && !message.attachmentId) {
      throw new Error("This message does not contain a sticker or GIF.");
    }
    if (!message.stickerKey && !isImage) {
      throw new Error("Only images, stickers, and GIFs can be favorited.");
    }

    const mediaKey =
      message.stickerKey ??
      (message.attachmentId
        ? `upload:${message.attachmentId}`
        : `klipy:${message.attachmentUrl}`);
    const current = await getLibraryItem(ctx, me._id, mediaKey);
    if (current) {
      await ctx.db.patch(current._id, { isFavorite: !current.isFavorite });
      return !current.isFavorite;
    }

    const url = message.attachmentUrl;
    if (url && !isKlipyUrl(url)) {
      throw new Error("This media cannot be saved to your collection.");
    }
    await ctx.db.insert("stickerLibrary", {
      userId: me._id,
      mediaKey,
      url,
      storageId: message.attachmentId,
      previewUrl: url,
      name: message.attachmentName ?? "Shared media",
      mediaType:
        message.attachmentType === "image/gif" || message.stickerKey?.startsWith("klipy:")
          ? "gif"
          : "image",
      source: message.stickerKey?.startsWith("klipy:") || url ? "klipy" : "upload",
      isFavorite: true,
      useCount: 0,
    });
    return true;
  },
});

export const setFavorite = mutation({
  args: {
    mediaKey: v.string(),
    url: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    name: v.string(),
    mediaType,
    source: mediaSource,
    isFavorite: v.boolean(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const current = await getLibraryItem(ctx, me._id, args.mediaKey);
    if (current) {
      await ctx.db.patch(current._id, { isFavorite: args.isFavorite });
      return;
    }
    if (args.source !== "klipy" || !args.url)
      throw new Error("Upload this media again before saving it.");
    validateMediaUrl(args.url, args.source);
    await ctx.db.insert("stickerLibrary", {
      userId: me._id,
      mediaKey: args.mediaKey,
      url: args.url,
      previewUrl: args.previewUrl,
      name: args.name.slice(0, 120),
      mediaType: args.mediaType,
      source: args.source,
      isFavorite: args.isFavorite,
      useCount: 0,
    });
  },
});

export const saveUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    mediaType,
  },
  handler: async (ctx, { storageId, name, mediaType: kind }) => {
    const me = await requireUser(ctx);
    const stored = await ctx.db.system.get("_storage", storageId);
    if (!stored) throw new Error("The uploaded sticker could not be found.");
    const mediaKey = `upload:${storageId}`;
    const current = await getLibraryItem(ctx, me._id, mediaKey);
    if (current) {
      await ctx.db.patch(current._id, { isFavorite: true });
    } else {
      await ctx.db.insert("stickerLibrary", {
        userId: me._id,
        mediaKey,
        storageId,
        name: name.slice(0, 120),
        mediaType: kind,
        source: "upload",
        isFavorite: true,
        useCount: 0,
      });
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("The uploaded sticker could not be opened.");
    return {
      key: mediaKey,
      url,
      previewUrl: url,
      name: name.slice(0, 120),
      mediaType: kind,
      source: "upload" as const,
      storageId: storageId as string,
      isFavorite: true,
      useCount: current?.useCount ?? 0,
      lastUsedAt: current?.lastUsedAt,
    };
  },
});

export const send = mutation({
  args: {
    receiverId: v.id("users"),
    mediaKey: v.string(),
    url: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    name: v.string(),
    mediaType,
    source: mediaSource,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await areFriends(ctx, me._id, args.receiverId)))
      throw new Error("You can only send media to accepted friends.");
    if (args.source === "klipy") {
      if (!args.url) throw new Error("This GIF is unavailable.");
      validateMediaUrl(args.url, args.source);
    } else if (!args.storageId) {
      throw new Error("Upload this sticker again before sending it.");
    }
    if (args.storageId) {
      const stored = await ctx.db.system.get("_storage", args.storageId);
      if (!stored) throw new Error("This uploaded sticker is unavailable.");
    }

    const current = await getLibraryItem(ctx, me._id, args.mediaKey);
    const now = Date.now();
    const media = {
      url: args.url ?? current?.url,
      previewUrl: args.previewUrl ?? current?.previewUrl,
      storageId: args.storageId ?? current?.storageId,
      name: args.name.slice(0, 120),
      mediaType: args.mediaType,
      source: args.source,
      isFavorite: current?.isFavorite ?? false,
      useCount: (current?.useCount ?? 0) + 1,
      lastUsedAt: now,
    };
    if (current) {
      await ctx.db.patch(current._id, media);
    } else {
      await ctx.db.insert("stickerLibrary", {
        userId: me._id,
        mediaKey: args.mediaKey,
        ...media,
      });
    }

    await ctx.db.insert("messages", {
      senderId: me._id,
      receiverId: args.receiverId,
      pairKey: pairKey(me._id, args.receiverId),
      body: "",
      attachmentUrl: args.url,
      attachmentId: args.storageId,
      attachmentName: args.name.slice(0, 120),
      attachmentType:
        args.mediaType === "gif" ? "image/gif" : "image/*",
      stickerKey: args.mediaKey,
    });

    const recent = await ctx.db
      .query("stickerLibrary")
      .withIndex("by_user_recent", (q) => q.eq("userId", me._id))
      .order("asc")
      .take(120);
    const stale = recent.filter(
      (item) => !item.isFavorite && item.mediaKey !== args.mediaKey,
    );
    const excess = Math.max(0, stale.length - 50);
    await Promise.all(stale.slice(0, excess).map((item) => ctx.db.delete(item._id)));
  },
});
