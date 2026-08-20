import { describe, expect, it } from "vitest";
import { LobbyStore } from "../../server/lobbyStore";

describe("lobby nickname registry", () => {
  it("first claim wins; the same token logs back in; another token is rejected", () => {
    const store = new LobbyStore(null);
    expect(store.login("Jordao", "token-aaaa")).toEqual({ ok: true, nick: "Jordao" });
    expect(store.login("Jordao", "token-aaaa")).toEqual({ ok: true, nick: "Jordao" });
    const stolen = store.login("Jordao", "token-bbbb");
    expect(stolen.ok).toBe(false);
  });

  it("uniqueness is case-insensitive", () => {
    const store = new LobbyStore(null);
    store.login("Jordao", "token-aaaa");
    const clash = store.login("JORDAO", "token-bbbb");
    expect(clash.ok).toBe(false);
  });

  it("rejects malformed nicks", () => {
    const store = new LobbyStore(null);
    expect(store.login("ab", "token-aaaa").ok).toBe(false); // too short
    expect(store.login("nome com espaço", "token-aaaa").ok).toBe(false);
    expect(store.login("ok_Nick99", "token-aaaa").ok).toBe(true);
  });

  it("adding a friend by nick is mutual and requires the nick to exist", () => {
    const store = new LobbyStore(null);
    store.login("Alice", "token-aaaa");
    store.login("Bob", "token-bbbb");

    expect(store.addFriend("Alice", "Carol").ok).toBe(false); // no such nick
    expect(store.addFriend("Alice", "Alice").ok).toBe(false); // not yourself

    const added = store.addFriend("Alice", "bob"); // case-insensitive lookup
    expect(added).toEqual({ ok: true, friendNick: "Bob" });
    expect(store.friendsOf("Alice")).toEqual(["Bob"]);
    expect(store.friendsOf("Bob")).toEqual(["Alice"]);

    // Adding again doesn't duplicate.
    store.addFriend("Alice", "Bob");
    expect(store.friendsOf("Alice")).toEqual(["Bob"]);
  });
});
