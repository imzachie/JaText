import { memo } from "react";
import {
  canAccessForwardedContext,
  formatForwardedTimestamp,
  requestJumpToForwardedMessage,
  type ForwardedMessageContext,
} from "../lib/forwardedContext";
import { useJaText } from "../lib/store";
import { Avatar } from "./Avatar";
import { IosEmojiText } from "./IosEmoji";
import { ArrowRightIcon, ClockIcon, ForwardIcon } from "./UiIcons";

interface ForwardedMessageCardProps {
  context?: ForwardedMessageContext | null;
  legacySenderName?: string;
  fallbackTimestamp?: number;
}

export const ForwardedMessageCard = memo(function ForwardedMessageCard({
  context,
  legacySenderName,
  fallbackTimestamp,
}: ForwardedMessageCardProps) {
  const store = useJaText();

  if (!context && !legacySenderName) return null;

  const canAccess = canAccessForwardedContext(
    context,
    store.me?.id,
    store.friends,
    store.groups,
  );

  const authorName =
    context?.originalSenderName || legacySenderName || "Unknown user";
  const authorColor = context?.originalSenderAvatarColor || "violet";
  const authorAvatar = context?.originalSenderAvatarUrl;
  const formattedDate = formatForwardedTimestamp(
    context?.originalCreatedAt || fallbackTimestamp || 0,
  );

  let sourceBadgeText = "";
  if (context) {
    if (context.sourceKind === "channel") {
      const cname = context.channelName || context.originalSenderName || "Channel";
      sourceBadgeText = context.channelVerified ? `Channel · ${cname} ✓` : `Channel · ${cname}`;
    } else if (context.sourceKind === "community") {
      sourceBadgeText = "JaText Community";
    } else if (context.sourceKind === "group") {
      const liveGroup = store.groups.find((g) => g.id === context.groupId);
      const isComm = Boolean(liveGroup?.isCommunity);
      sourceBadgeText = canAccess
        ? liveGroup?.name || context.groupName || (isComm ? "Community" : "Group chat")
        : isComm
          ? "Community"
          : "Private group";
    } else if (context.sourceKind === "dm") {
      sourceBadgeText = "Direct message";
    }
  }

  const cardInner = (
    <>
      <div className="forwarded-card-top">
        <span className="forwarded-card-pill">
          <ForwardIcon size={12} />
          <span>Forwarded</span>
        </span>
        {canAccess ? (
          <span className="forwarded-card-jump-hint">
            <span>Visit original</span>
            <ArrowRightIcon size={11} />
          </span>
        ) : null}
      </div>
      <div className="forwarded-card-author-row">
        <Avatar
          user={{
            displayName: authorName,
            username: context?.originalSenderUsername || "",
            avatarColor: authorColor,
            avatarUrl: authorAvatar,
          }}
          size={20}
        />
        <div className="forwarded-card-author-meta">
          <div className="forwarded-card-author-line">
            <strong className="forwarded-card-author-name">
              <IosEmojiText text={authorName} />
            </strong>
            {sourceBadgeText ? (
              <span className="forwarded-card-source-tag">
                · <IosEmojiText text={sourceBadgeText} />
              </span>
            ) : null}
          </div>
          {formattedDate ? (
            <time className="forwarded-card-timestamp">
              <ClockIcon size={11} />
              <span>{formattedDate}</span>
            </time>
          ) : null}
        </div>
      </div>
    </>
  );

  if (canAccess && context && store.me) {
    return (
      <button
        type="button"
        className="forwarded-context-card clickable"
        title="Click to jump to the original message"
        onClick={(e) => {
          e.stopPropagation();
          if (!store.me) return;
          requestJumpToForwardedMessage(context, store.me.id, {
            setActiveChatId: store.setActiveChatId,
            setActiveGroupId: store.setActiveGroupId,
          });
        }}
      >
        {cardInner}
      </button>
    );
  }

  return (
    <div
      className="forwarded-context-card no-access"
      onClick={(e) => {
        // Viewer does not have access, intentionally do nothing on click
        e.stopPropagation();
      }}
    >
      {cardInner}
    </div>
  );
});
