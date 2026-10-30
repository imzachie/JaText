"use node";

import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

function getFirebaseApp() {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    throw new Error("FCM push is not configured. Set FCM_SERVICE_ACCOUNT_JSON in Convex.");
  }

  const credentials: unknown = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  if (
    typeof credentials !== "object" ||
    credentials === null ||
    !("project_id" in credentials) ||
    typeof credentials.project_id !== "string" ||
    !("client_email" in credentials) ||
    typeof credentials.client_email !== "string" ||
    !("private_key" in credentials) ||
    typeof credentials.private_key !== "string"
  ) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON must contain project_id, client_email, and private_key.");
  }
  const serviceAccount: ServiceAccount = {
    projectId: credentials.project_id,
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
  };

  const appName = "jatext-fcm";
  const app =
    getApps().find((existingApp) => existingApp.name === appName) ??
    initializeApp({ credential: cert(serviceAccount) }, appName);
  return { app, projectId: credentials.project_id };
}

function detectCallInfo(body: string): { isCall: boolean; isVideo: boolean } {
  if (body.includes("(__JATEXT_CALL_DM_RINGING__:video)") || body.includes("(__JATEXT_CALL_GRP_ACTIVE__:video)")) {
    return { isCall: true, isVideo: true };
  }
  if (
    body.includes("(__JATEXT_CALL_DM_RINGING__:voice)") ||
    body.includes("(__JATEXT_CALL_GRP_ACTIVE__:voice)") ||
    body.includes("(__JATEXT_CALL_GRP_ACTIVE__)")
  ) {
    return { isCall: true, isVideo: false };
  }
  if (body.includes("__JATEXT_CALL__:") && body.includes('"state":"ringing"')) {
    return { isCall: true, isVideo: body.includes('"mode":"video"') };
  }
  if (body.includes("__JATEXT_CALL_GRP__:") && body.includes('"state":"active"')) {
    return { isCall: true, isVideo: body.includes('"mode":"video"') };
  }
  return { isCall: false, isVideo: false };
}

function summarizeReadablePushBody(body: string, fallback: string): string {
  const callInfo = detectCallInfo(body);
  if (callInfo.isCall) {
    if (body.includes("__JATEXT_CALL_GRP__:") || body.includes("__JATEXT_CALL_GRP_ACTIVE__")) {
      return callInfo.isVideo ? "Incoming group video call" : "Incoming group voice call";
    }
    return callInfo.isVideo ? "Incoming video call" : "Incoming voice call";
  }
  const stripped = body
    .replace(/__JATEXT_BUBBLE__:[^\n]*\n?/g, "")
    .replace(/__JATEXT_FWD_V1__:[^\n]*\n?/g, "")
    .replace(/__JATEXT_E2EE_V1__:[\s\S]*$/m, "")
    .replace(/[\u200B\u200C\u2063]/g, "")
    .trim()
    .slice(0, 200);
  return stripped || fallback;
}

export const sendMessageNotification = internalAction({
  args: {
    receiverId: v.id("users"),
    senderId: v.id("users"),
    senderName: v.string(),
    body: v.string(),
    title: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, { receiverId, senderId, senderName, body, title, groupId, messageId }) => {
    const devices = await ctx.runQuery(internal.push.listUserDevices, { userId: receiverId });
    if (devices.length === 0) {
      if (messageId) {
        await ctx.runMutation(internal.push.updateMessagePushDeliveryStatus, {
          messageId,
          pushSucceeded: false,
        });
      }
      return;
    }

    let appInfo: ReturnType<typeof getFirebaseApp>;
    try {
      appInfo = getFirebaseApp();
    } catch (err) {
      if (messageId) {
        await ctx.runMutation(internal.push.updateMessagePushDeliveryStatus, {
          messageId,
          pushSucceeded: false,
        });
      }
      throw err;
    }

    const isCallCancel = body === "__JATEXT_CALL_CANCEL__";
    const callInfo = isCallCancel ? { isCall: false, isVideo: false } : detectCallInfo(body);
    const isEncrypted = body.includes("__JATEXT_E2EE_V1__:");
    const cleanNotificationBody = isCallCancel
      ? ""
      : summarizeReadablePushBody(
          body,
          isEncrypted ? "Encrypted message" : "Sent you an attachment",
        );

    const includeRawWire =
      !isCallCancel && (isEncrypted || callInfo.isCall) && body.length <= 3500;

    const resolvedTitle =
      title ?? (callInfo.isCall ? senderName : `New message from ${senderName}`);
    const resolvedType = isCallCancel
      ? "call_cancel"
      : callInfo.isCall
        ? "call"
        : groupId
          ? "group_mention"
          : "message";

    let response;
    try {
      // CRITICAL: Send pure DATA-ONLY high-priority FCM without a top-level `notification` block!
      // On Android, any top-level `notification` block causes Google Play Services to intercept
      // pushes in the OS tray when locked/minimized, bypassing JaTextFirebaseMessagingService
      // (which breaks E2EE decryption, custom sounds, and lock-screen incoming-call wakeup).
      response = await getMessaging(appInfo.app).sendEachForMulticast({
        tokens: devices.map((device) => device.token),
        data: {
          title: resolvedTitle,
          body: cleanNotificationBody,
          senderId,
          isEncrypted: isEncrypted ? "1" : "0",
          type: resolvedType,
          ...(callInfo.isCall ? { callMode: callInfo.isVideo ? "video" : "voice" } : {}),
          ...(includeRawWire ? { rawWire: body } : {}),
          ...(groupId ? { groupId } : {}),
        },
        android: {
          priority: "high",
          ttl: callInfo.isCall || isCallCancel ? 60_000 : 86_400_000,
        },
      });
    } catch (error) {
      if (messageId) {
        await ctx.runMutation(internal.push.updateMessagePushDeliveryStatus, {
          messageId,
          pushSucceeded: false,
        });
      }
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "unknown";
      console.error("FCM push request failed.", {
        receiverId,
        projectId: appInfo.projectId,
        deviceCount: devices.length,
        code,
      });
      throw error;
    }

    if (messageId) {
      await ctx.runMutation(internal.push.updateMessagePushDeliveryStatus, {
        messageId,
        pushSucceeded: response.successCount > 0,
      });
    }

    await Promise.all(
      response.responses.map((result, index) => {
        if (
          result.success ||
          (result.error?.code !== "messaging/registration-token-not-registered" &&
            result.error?.code !== "messaging/invalid-registration-token")
        ) {
          return Promise.resolve();
        }
        return ctx.runMutation(internal.push.deleteInvalidDevice, {
          deviceId: devices[index].id,
        });
      }),
    );
  },
});

export const sendAnnouncementNotification = internalAction({
  args: {
    senderId: v.id("users"),
    senderName: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { senderId, senderName, body }) => {
    const devices = await ctx.runQuery(internal.push.listAllAnnouncementDevices, {
      excludeUserId: senderId,
    });
    if (devices.length === 0) return;

    const { app } = getFirebaseApp();
    const cleanBody = summarizeReadablePushBody(body, `New announcement from ${senderName}`);
    const title = "JaText Announcements";

    // Pure DATA-ONLY high-priority FCM so JaTextFirebaseMessagingService always plays
    // the boosted JaText Notification sound (or user custom sound) even when locked/minimized!
    for (let offset = 0; offset < devices.length; offset += 500) {
      const batch = devices.slice(offset, offset + 500);
      const response = await getMessaging(app).sendEachForMulticast({
        tokens: batch.map((d) => d.token),
        data: {
          title,
          body: cleanBody,
          senderId,
          chatId: "__jatext_community__",
          type: "announcement",
          isEncrypted: "0",
          rawWire: cleanBody,
        },
        android: {
          priority: "high",
          ttl: 86_400_000,
        },
      });

      await Promise.all(
        response.responses.map((result, index) => {
          if (
            result.success ||
            (result.error?.code !== "messaging/registration-token-not-registered" &&
              result.error?.code !== "messaging/invalid-registration-token")
          ) {
            return Promise.resolve();
          }
          return ctx.runMutation(internal.push.deleteInvalidDevice, {
            deviceId: batch[index].id,
          });
        }),
      );
    }
  },
});
