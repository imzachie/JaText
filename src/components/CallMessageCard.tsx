import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "./CallIcons";
import { formatCallDuration, useCall, type CallInvitePayload } from "../lib/calling";
import type { JaUser } from "../lib/types";

interface CallMessageCardProps {
  invite: CallInvitePayload;
  isMine: boolean;
  peer: JaUser;
}

export function CallMessageCard({ invite, isMine, peer }: CallMessageCardProps) {
  const { session, startCall, setMinimized } = useCall();
  const isLiveThisCall = session?.callId === invite.callId;
  const ageMs = invite.ts > 0 ? Date.now() - invite.ts : 120_000;

  // In a 1-on-1 DM call, if this user is NOT currently in `invite.callId`,
  // a historical `"connected"` card is finished ("ended") and a stale `"ringing"` card is unanswered/missed!
  const effectiveState = isLiveThisCall
    ? invite.state
    : invite.state === "connected"
      ? "ended"
      : invite.state === "ringing" && (isMine || ageMs > 50_000)
        ? "missed"
        : invite.state;

  const isMissedOrDeclined = effectiveState === "missed" || effectiveState === "declined";

  const title =
    invite.mode === "video"
      ? isMissedOrDeclined
        ? isMine
          ? "Unanswered video call"
          : "Missed video call"
        : "Video call"
      : isMissedOrDeclined
        ? isMine
          ? "Unanswered voice call"
          : "Missed voice call"
        : "Voice call";

  const subtitle = isLiveThisCall
    ? "Tap to return to active call"
    : effectiveState === "ringing"
      ? isMine
        ? "Ringing…"
        : "Incoming call…"
      : effectiveState === "connected"
        ? "In progress"
        : effectiveState === "declined"
          ? "Declined"
          : effectiveState === "missed"
            ? isMine
              ? "No answer"
              : "Tap to call back"
            : invite.durationSec
              ? formatCallDuration(invite.durationSec)
              : "Call ended";

  const Icon =
    invite.mode === "video"
      ? Video
      : isMissedOrDeclined
        ? PhoneMissed
        : isMine
          ? PhoneOutgoing
          : PhoneIncoming;

  return (
    <div
      className={`call-msg-card ${isMissedOrDeclined ? "missed" : ""} ${isLiveThisCall ? "live" : ""}`}
    >
      <div className={`call-msg-icon ${isMissedOrDeclined ? "danger" : ""}`}>
        <Icon size={18} />
      </div>
      <div className="call-msg-info">
        <div className="call-msg-title">{title}</div>
        <div className="call-msg-sub">{subtitle}</div>
      </div>
      <button
        type="button"
        className="call-msg-action-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (isLiveThisCall) {
            setMinimized(false);
          } else {
            void startCall(peer, invite.mode);
          }
        }}
        title={isLiveThisCall ? "Return to call" : isMissedOrDeclined ? "Call back" : "Call again"}
      >
        {invite.mode === "video" ? <Video size={14} /> : <Phone size={14} />}
        <span>{isLiveThisCall ? "Open" : isMissedOrDeclined && !isMine ? "Call back" : "Call"}</span>
      </button>
    </div>
  );
}
