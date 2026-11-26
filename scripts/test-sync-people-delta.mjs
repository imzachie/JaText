#!/usr/bin/env node
/**
 * Does a profile edit reach other people without a message?
 *
 *   node scripts/test-sync-people-delta.mjs
 *
 * `sync` is the loop every client runs about once a second, and the payload only
 * carries friend profiles (`social`) when the server decides something is worth
 * resending. The original conditions were "a message changed", "a friendship changed"
 * and "the presence beat happened", so a new picture, name, about line or theme could
 * sit invisible for as long as twenty five seconds, and a person's reply to that was to
 * leave the conversation and come back, which refetches everything. The check the fix
 * added is what this file pins down:
 *
 *   1. a friend's profile moved  -> social is in the payload
 *   2. nothing moved             -> social is absent, so the probe is doing real work
 *   3. the probe is asked every poll, not only on the presence beat
 *   4. the active chat partner is looked at even before they are a friend
 *   5. the optional argument is passed as text, which is what keeps the same SQL legal
 *      on Postgres, where a bare "$n IS NOT NULL" has no type to infer
 */
import crypto from "node:crypto";
import process from "node:process";

const SECRET = "sync-people-test-secret";
const ME = "user-me";
const PEER = "user-peer";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `  -> ${detail}` : ""}`);
  }
}

function b64u(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintToken(sub) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(
    JSON.stringify({ sub, email: "sync-test@example.com", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function makeStubDb({ peerProfileChanged }) {
  const meRow = {
    id: ME,
    email: "sync-test@example.com",
    display_name: "Me",
    username: "me",
    avatar_url: null,
    avatar_color: "black",
    bio: "",
    pronouns: "",
    banner_url: null,
    onboarding_complete: 1,
    status_preference: "online",
    custom_status: "",
    socials_json: "[]",
    website_json: "[]",
    synced_theme_json: null,
    created_at: 1,
    updated_at: 1,
    is_suspended: 0,
    totp_enabled: 0,
  };
  const calls = [];

  return {
    calls,
    async execute(stmt) {
      const sql = typeof stmt === "string" ? stmt : stmt?.sql;
      const args = (typeof stmt === "string" ? [] : stmt?.args) || [];
      const text = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ text, args });

      if (/FROM users u .*friend_requests fr/s.test(text)) {
        return { rows: peerProfileChanged ? [{ "?column?": 1 }] : [] };
      }
      if (/FROM users WHERE id = \?/.test(text)) {
        return { rows: [meRow] };
      }
      return { rows: [] };
    },
    async batch(list) {
      for (const stmt of list || []) await this.execute(stmt);
      return [];
    },
  };
}

function probeSql(calls) {
  return calls.find((c) => /FROM users u /.test(c.text));
}

async function runSync(db, extraArgs = {}) {
  const backend = await import(new URL("../server/tursoBackend.js", import.meta.url));
  backend.setCustomDbForTesting(db);
  return backend.handleTursoRpc(
    "sync",
    { sinceTs: Date.now() - 60_000, touchPresence: false, includePresence: false, ...extraArgs },
    `Bearer ${mintToken(ME)}`,
  );
}

async function main() {
  process.env.AUTH_SECRET = SECRET;
  console.log("sync: a profile edit is a reason to resend people");

  // 1. the friend changed only their profile
  const changed = makeStubDb({ peerProfileChanged: true });
  const withPeerChange = await runSync(changed);
  check("the sync call succeeded", withPeerChange && typeof withPeerChange === "object");
  check("social is resent when a profile in the circle moved", Boolean(withPeerChange.social), JSON.stringify(Object.keys(withPeerChange)));

  const probe = probeSql(changed.calls);
  check("the profile probe was actually issued", Boolean(probe));
  check(
    "no message, friendship or presence delta was reported, so none of those caused the resend",
    !withPeerChange.me && !withPeerChange.changedDmMessages && !withPeerChange.changedGroupMessages,
    JSON.stringify(Object.keys(withPeerChange)),
  );
  check(
    "the optional active peer is bound as a value, not tested for null",
    typeof probe?.args?.[4] === "string" || probe?.args?.[4] === null,
    `arg5=${typeof probe?.args?.[4]}`,
  );
  check(
    "my own row is excluded from the probe so I never trigger a resend for myself",
    probe?.args?.[1] === ME,
    JSON.stringify(probe?.args),
  );

  // 2. and when nothing moved, it must not force a resend
  const quiet = makeStubDb({ peerProfileChanged: false });
  const withoutPeerChange = await runSync(quiet);
  check("social is still skipped when nothing changed", !withoutPeerChange.social, JSON.stringify(Object.keys(withoutPeerChange)));
  check("the probe is asked every poll, even when it will find nothing", Boolean(probeSql(quiet.calls)));
  check(
    "finding nothing costs no extra work, while finding something rebuilds the payload",
    changed.calls.length > quiet.calls.length,
    `${quiet.calls.length} vs ${changed.calls.length} queries`,
  );

  // 3. the active chat partner is covered even outside the friend list
  const activePeer = makeStubDb({ peerProfileChanged: true });
  await runSync(activePeer, { activeFriendId: PEER });
  const p2 = probeSql(activePeer.calls);
  check("the open conversation's partner is passed to the probe", p2?.args?.[4] === PEER, JSON.stringify(p2?.args));
  check(
    "the probe compares against that id instead of testing a bare null parameter",
    /COALESCE\(\?,''/.test(p2?.text.replace(/\s+/g, "") || ""),
    p2?.text.slice(0, 220),
  );

  console.log(failures === 0 ? "\nprofile propagation checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
