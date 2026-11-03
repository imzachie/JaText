import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { colorById } from "../lib/colors";
import { friendlyError } from "../lib/errors";
import { useJaText } from "../lib/store";
import { AnimatedMediaImg } from "./Avatar";
import { IosEmojiText } from "./IosEmoji";
import { ArrowLeftIcon, PlusIcon, SearchIcon, UsersIcon } from "./UiIcons";

export function ExploreCommunitiesView({
  onBack,
  onSelectCommunity,
  onOpenCreateCommunity,
}: {
  onBack: () => void;
  onSelectCommunity: (communityId: string) => void;
  onOpenCreateCommunity?: () => void;
}) {
  const store = useJaText();
  const [query, setQuery] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = store.refreshExploreCommunities;
    if (!refresh) return;
    let cancelled = false;
    setRefreshing(true);
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store.refreshExploreCommunities]);

  const communities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const joinedIds = new Set(
      store.groups.filter((g) => Boolean(g.isCommunity)).map((g) => g.id),
    );
    return (store.exploreCommunities ?? [])
      .map((c) => ({
        ...c,
        isJoined: c.isJoined || joinedIds.has(c.id),
      }))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q),
      );
  }, [query, store.exploreCommunities, store.groups]);

  function openJoinedCommunity(communityId: string) {
    onSelectCommunity(communityId);
  }

  return (
    <section className="chat explore-communities-page" aria-label="Explore Communities">
      <header className="chat-header explore-communities-page-header">
        <button
          type="button"
          className="icon-btn explore-page-back-btn"
          onClick={onBack}
          aria-label="Back to Communities"
          title="Back to Communities"
        >
          <ArrowLeftIcon size={19} />
        </button>
        <div className="explore-communities-page-title">
          <strong>Explore Communities</strong>
          <span className="muted small">
            Join and find communities to hang out with.
          </span>
        </div>
        {onOpenCreateCommunity && (
          <div className="chat-header-actions">
            <button
              type="button"
              className="ghost-btn explore-create-btn"
              onClick={onOpenCreateCommunity}
            >
              <PlusIcon size={14} /> Create
            </button>
          </div>
        )}
      </header>

      <div className="explore-communities-page-body">
        <div className="explore-communities-search-wrap">
          <SearchIcon size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search public communities…"
            aria-label="Search public communities"
          />
          {query.length > 0 && (
            <button
              type="button"
              className="always-search-clear-btn"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}

        {communities.length === 0 ? (
          <div className="empty-box center explore-communities-empty">
            <UsersIcon size={28} />
            <strong>
              {refreshing
                ? "Finding communities…"
                : query.trim()
                  ? "No matching communities found"
                  : "No public communities yet"}
            </strong>
            <span className="muted small">
              {query.trim()
                ? "Try a different search keyword or create your own community."
                : "Be the first to launch an encrypted community for everyone to join!"}
            </span>
          </div>
        ) : (
          <div className="explore-communities-page-grid">
            {communities.map((comm) => {
              const commColor = colorById(comm.avatarColor ?? "purple");
              const isJoining = joiningId === comm.id;
              return (
                <article
                  key={`explore-page:${comm.id}`}
                  className="explore-community-card explore-page-card"
                  style={
                    {
                      "--comm-accent": commColor.hex,
                    } as CSSProperties
                  }
                >
                  <div
                    className="community-avatar-ring explore-avatar-ring"
                    style={{
                      boxShadow: `0 0 0 2.5px ${commColor.hex}`,
                      background: comm.avatarUrl ? undefined : commColor.gradient,
                    }}
                  >
                    {comm.avatarUrl ? (
                      <AnimatedMediaImg
                        className="group-avatar sidebar-group-avatar"
                        src={comm.avatarUrl}
                        loading="lazy"
                      />
                    ) : (
                      <span className="community-avatar-initials">
                        {comm.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="explore-community-info">
                    <strong>
                      <IosEmojiText text={comm.name} />
                    </strong>
                    <span className="explore-community-members">
                      {comm.memberCount}{" "}
                      {comm.memberCount === 1 ? "member" : "members"} joined
                    </span>
                    {comm.description ? (
                      <p className="explore-community-desc">
                        <IosEmojiText text={comm.description} />
                      </p>
                    ) : null}
                  </div>
                  {comm.isJoined ? (
                    <button
                      type="button"
                      className="explore-join-btn is-joined"
                      onClick={() => openJoinedCommunity(comm.id)}
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="explore-join-btn"
                      style={{ background: commColor.hex }}
                      disabled={isJoining}
                      onClick={() => {
                        if (!store.joinCommunity) return;
                        setError(null);
                        setJoiningId(comm.id);
                        void store
                          .joinCommunity(comm.id)
                          .then((cid) => {
                            openJoinedCommunity(cid);
                          })
                          .catch((err: unknown) => {
                            setError(
                              friendlyError(err, "Could not join community."),
                            );
                          })
                          .finally(() => setJoiningId(null));
                      }}
                    >
                      {isJoining ? "Joining…" : "Join"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
