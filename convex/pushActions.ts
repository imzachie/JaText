"use node";

import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

export const sendMessageNotification = internalAction({
  args: {
    receiverId: v.id("users"),
    senderId: v.id("users"),
    senderName: v.string(),
    body: v.string(),
    title: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, { receiverId, senderId, senderName, body, title, groupId }) => {
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
    const devices = await ctx.runQuery(internal.push.listUserDevices, { userId: receiverId });
    if (devices.length === 0) {
      console.warn("FCM push skipped: recipient has no registered devices.", {
        receiverId,
        projectId: serviceAccount.projectId,
      });
      return;
    }

    let response;
    try {
      response = await getMessaging(app).sendEachForMulticast({
        tokens: devices.map((device) => device.token),
        notification: {
          title: title ?? `New message from ${senderName}`,
          body: body.trim().slice(0, 160) || "Sent you an attachment",
        },
        data: {
          senderId,
          ...(groupId ? { groupId, type: "group_mention" } : { type: "message" }),
        },
        android: {
          priority: "high",
          notification: { channelId: "messages", sound: "default" },
        },
      });
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "unknown";
      console.error("FCM push request failed.", {
        receiverId,
        projectId: serviceAccount.projectId,
        deviceCount: devices.length,
        code,
      });
      throw error;
    }

    const failures = response.responses.flatMap((result, index) =>
      result.success
        ? []
        : [{
            deviceId: devices[index].id,
            code: result.error?.code ?? "unknown",
          }],
    );
    const summary = {
      receiverId,
      projectId: serviceAccount.projectId,
      deviceCount: devices.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      failures,
    };
    if (response.failureCount > 0) {
      console.error("FCM push delivery had failures.", summary);
    } else {
      console.info("FCM push accepted for all registered devices.", summary);
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
