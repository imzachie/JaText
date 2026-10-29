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

function summarizeReadablePushBody(body: string, fallback: string): string {
  if (body.includes("__JATEXT_CALL__:")) {
    return body.includes('"mode":"video"') ? "Incoming video call" : "Incoming voice call";
  }
  if (body.includes("__JATEXT_CALL_GRP__:")) {
    return body.includes('"mode":"video"')
      ? "Incoming group video call"
      : "Incoming group voice call";
  }
  const stripped = body
    .replace(/__JATEXT_BUBBLE__:[^\n]*\n?/, "")
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

    const isCall =
      body.includes("__JATEXT_CALL__:") || body.includes("__JATEXT_CALL_GRP__:");
    const cleanNotificationBody = summarizeReadablePushBody(
      body,
      body.includes("__JATEXT_E2EE_V1__:") ? "Sent you a message" : "Sent you an attachment",
    );

    const includeRawWire =
      (body.includes("__JATEXT_E2EE_V1__:") || isCall) && body.length <= 3500;

    let response;
    try {
      response = await getMessaging(appInfo.app).sendEachForMulticast({
        tokens: devices.map((device) => device.token),
        notification: {
          title:
            title ??
            (isCall ? senderName : `New message from ${senderName}`),
          body: cleanNotificationBody,
        },
        data: {
          senderId,
          ...(includeRawWire ? { rawWire: body } : {}),
          ...(groupId
            ? { groupId, type: isCall ? "call" : "group_mention" }
            : { type: isCall ? "call" : "message" }),
        },
        android: {
          priority: "high",
          notification: {
            channelId: isCall
              ? "jatext_incoming_calls_v2"
              : "jatext_messages_default_v2",
            sound: "default",
          },
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

    // FCM sendEachForMulticast supports up to 500 tokens per batch
    for (let offset = 0; offset < devices.length; offset += 500) {
      const batch = devices.slice(offset, offset + 500);
      const response = await getMessaging(app).sendEachForMulticast({
        tokens: batch.map((d) => d.token),
        notification: {
          title,
          body: cleanBody,
        },
        data: {
          senderId,
          chatId: "__jatext_community__",
          type: "announcement",
          rawWire: cleanBody,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "jatext_messages_default_v2",
            sound: "default",
          },
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
