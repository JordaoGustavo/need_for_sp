import { getLobby, type LobbyState, type RoomInvite } from "../net/lobbyClient";
import { isValidNick } from "../net/signalingProtocol";
import { playConfirm, playHover, playSelect } from "../audio/uiSounds";

/**
 * Persistent friends panel, mounted once (app.ts) beside the screen container
 * so it survives menu transitions. Handles: claiming the unique nickname,
 * showing friends with online presence, adding friends by nick, and surfacing
 * incoming room invites as an accept/decline toast. Inviting TO a room lives
 * in roomScreen.ts (it needs the room's link).
 */
export function mountFriendsWidget(parent: HTMLElement): void {
  const lobby = getLobby();

  const root = document.createElement("div");
  root.className = "friends-widget";
  parent.appendChild(root);

  const toastHost = document.createElement("div");
  toastHost.className = "invite-toast-host";
  parent.appendChild(toastHost);

  // Collapsed by default once a nick exists, so the panel never sits on top
  // of menu buttons; without a nick it stays open to prompt the setup.
  let collapsed = lobby.getState().kind !== "no-nick";
  let lastKind = lobby.getState().kind;

  lobby.subscribe((state) => {
    // Auto-collapse when the nick claim succeeds, so the panel gets out of
    // the way of the menu buttons; the header stays as the reopen handle.
    if (state.kind === "online" && lastKind !== "online") collapsed = true;
    lastKind = state.kind;
    render(state);
  });
  lobby.onNotice((message) => flashNotice(message));
  lobby.onInvite((invite) => showInviteToast(invite));

  let noticeTimer: number | null = null;

  function render(state: LobbyState): void {
    root.replaceChildren();
    root.classList.toggle("collapsed", collapsed);

    const header = document.createElement("button");
    header.type = "button";
    header.className = "friends-header";
    header.textContent = headerLabel(state) + (collapsed ? "  ▴" : "  ▾");
    header.addEventListener("click", () => {
      collapsed = !collapsed;
      render(lobby.getState());
    });
    root.appendChild(header);
    if (collapsed) return;

    const title = document.createElement("div");
    title.className = "friends-title";

    if (state.kind === "no-nick" || state.kind === "error") {
      title.textContent = "Escolha seu nick";
      const form = document.createElement("form");
      form.className = "friends-row";
      const input = document.createElement("input");
      input.className = "friends-input";
      input.placeholder = "3–16 letras/números";
      input.maxLength = 16;
      if (state.kind === "error") input.value = state.nick;
      const button = document.createElement("button");
      button.type = "submit";
      button.className = "friends-button";
      button.textContent = "OK";
      form.append(input, button);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const nick = input.value.trim();
        if (!isValidNick(nick)) {
          flashNotice("Nick inválido: 3–16 letras, números ou _");
          return;
        }
        playConfirm();
        lobby.setNick(nick);
      });
      root.append(title, form);
      if (state.kind === "error") {
        const error = document.createElement("div");
        error.className = "friends-error";
        error.textContent = state.message;
        root.appendChild(error);
      }
      root.appendChild(noticeLine());
      return;
    }

    if (state.kind === "connecting") {
      title.textContent = `Conectando como ${state.nick}...`;
      root.appendChild(title);
      return;
    }

    // Online.
    title.textContent = `Amigos — você é ${state.nick}`;
    root.appendChild(title);

    const list = document.createElement("div");
    list.className = "friends-list";
    if (state.friends.length === 0) {
      const empty = document.createElement("div");
      empty.className = "friends-empty";
      empty.textContent = "Nenhum amigo ainda — adicione pelo nick.";
      list.appendChild(empty);
    }
    for (const friend of state.friends) {
      const row = document.createElement("div");
      row.className = "friends-row";
      const dot = document.createElement("span");
      dot.className = friend.online ? "friend-dot online" : "friend-dot";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = friend.nick;
      const presence = document.createElement("span");
      presence.className = "friend-presence";
      presence.textContent = friend.online ? "online" : "offline";
      row.append(dot, name, presence);
      list.appendChild(row);
    }
    root.appendChild(list);

    const form = document.createElement("form");
    form.className = "friends-row";
    const input = document.createElement("input");
    input.className = "friends-input";
    input.placeholder = "Adicionar amigo (nick)";
    input.maxLength = 16;
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "friends-button";
    button.textContent = "+";
    form.append(input, button);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const nick = input.value.trim();
      if (!isValidNick(nick)) {
        flashNotice("Nick inválido: 3–16 letras, números ou _");
        return;
      }
      playSelect();
      lobby.addFriend(nick);
      input.value = "";
    });
    root.appendChild(form);
    root.appendChild(noticeLine());
  }

  function headerLabel(state: LobbyState): string {
    if (state.kind === "online") {
      const online = state.friends.filter((friend) => friend.online).length;
      return `AMIGOS · ${state.nick}${online > 0 ? ` · ${online} online` : ""}`;
    }
    if (state.kind === "connecting") return `AMIGOS · conectando...`;
    return "AMIGOS · escolha seu nick";
  }

  function noticeLine(): HTMLElement {
    const line = document.createElement("div");
    line.className = "friends-notice";
    line.dataset.role = "notice";
    return line;
  }

  function flashNotice(message: string): void {
    const line = root.querySelector<HTMLElement>('[data-role="notice"]');
    if (!line) return;
    line.textContent = message;
    if (noticeTimer !== null) window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      line.textContent = "";
    }, 4000);
  }

  function showInviteToast(invite: RoomInvite): void {
    playHover();
    const toast = document.createElement("div");
    toast.className = "invite-toast";

    const text = document.createElement("div");
    text.className = "invite-toast-text";
    text.textContent = `${invite.from} te convidou para a sala ${invite.roomCode}`;

    const actions = document.createElement("div");
    actions.className = "invite-toast-actions";
    const accept = document.createElement("button");
    accept.className = "friends-button";
    accept.textContent = "Aceitar";
    accept.addEventListener("click", () => {
      playConfirm();
      // Joining reuses the invite-link flow: full load with ?room= in the URL.
      window.location.href = invite.inviteUrl;
    });
    const decline = document.createElement("button");
    decline.className = "friends-button subtle";
    decline.textContent = "Recusar";
    decline.addEventListener("click", () => toast.remove());
    actions.append(accept, decline);

    toast.append(text, actions);
    toastHost.appendChild(toast);
    window.setTimeout(() => toast.remove(), 30_000);
  }
}
