import { defaultSignalingUrl } from "../config";
import { getLobby } from "../net/lobbyClient";
import { hostRoom, joinRoom } from "../net/roomConnection";
import { parseRoomCodeFromUrl, withTimeOfDayParam, withTrackParam } from "../net/roomCode";
import type { PeerConnection } from "../net/webrtcConnection";
import type { CarDefinition } from "../domain/car";
import type { TrackDefinition } from "../domain/track";
import type { TimeOfDay } from "../rendering/renderer";
import type { YoutuberProfile } from "../domain/youtuber";

export interface RoomScreenResult {
  readonly peer: PeerConnection;
  readonly isHost: boolean;
  readonly roomCode: string;
}

/**
 * Room step: shows a confirmation of the chosen Youtuber/Garagem/Carro (closing the
 * Youtuber -> Garagem -> confirmação -> corrida flow from docs/mvp-spec.md), then
 * either creates a Sala and shares the Convite via Link (Anfitrião), or joins one via
 * the room code already present in the current page URL (Convidado) — ADR 0008.
 */
export function renderRoomScreen(
  youtuber: YoutuberProfile,
  car: CarDefinition,
  track: TrackDefinition,
  timeOfDay: TimeOfDay,
  onReady: (result: RoomScreenResult) => void,
  onBack: () => void,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen room-screen";
  root.style.setProperty("--theme-color", youtuber.themeColor);

  const back = document.createElement("button");
  back.className = "back-button";
  back.textContent = "< Trocar carro";
  back.addEventListener("click", onBack);

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "Confirme sua seleção";

  const confirmation = buildSelectionConfirmation(youtuber, car);

  const linkTitle = document.createElement("h2");
  linkTitle.className = "room-section-title";
  linkTitle.textContent = "Convite via Link";

  const status = document.createElement("p");
  status.className = "room-status";

  const linkBox = document.createElement("div");
  linkBox.className = "room-link-box hidden";
  const linkInput = document.createElement("input");
  linkInput.readOnly = true;
  linkBox.appendChild(linkInput);

  root.append(back, title, confirmation, linkTitle, status, linkBox);

  const signalingUrl = defaultSignalingUrl();
  const roomCodeFromUrl = parseRoomCodeFromUrl(window.location.href);

  if (roomCodeFromUrl) {
    status.textContent = `Entrando na sala ${roomCodeFromUrl}...`;
    joinRoom(signalingUrl, roomCodeFromUrl)
      .then((peer) => onReady({ peer, isHost: false, roomCode: roomCodeFromUrl }))
      .catch((err) => {
        status.textContent = `Falha ao entrar na sala: ${(err as Error).message}`;
      });
  } else {
    status.textContent = "Criando sala...";
    // The chosen track rides in the invite URL so the guest loads the same map.
    const { roomCode, inviteUrl, peerConnectionPromise } = hostRoom(
      signalingUrl,
      withTimeOfDayParam(withTrackParam(window.location.href, track.id), timeOfDay),
    );

    linkInput.value = inviteUrl;
    linkBox.classList.remove("hidden");
    status.textContent = `Sala ${roomCode} criada. Compartilhe o link e aguarde o outro jogador...`;
    root.appendChild(buildFriendInvitePanel(inviteUrl, roomCode, root));

    peerConnectionPromise
      .then((peer) => onReady({ peer, isHost: true, roomCode }))
      .catch((err) => {
        status.textContent = `Falha ao conectar: ${(err as Error).message}`;
      });
  }

  return root;
}

/**
 * "Convidar amigos" panel for the host: online friends get an invite button
 * that pushes the room invite straight to their screen (friends widget toast);
 * the copyable link above stays as the universal fallback.
 */
function buildFriendInvitePanel(inviteUrl: string, roomCode: string, screenRoot: HTMLElement): HTMLElement {
  const lobby = getLobby();
  const panel = document.createElement("div");
  panel.className = "room-friends-panel";

  const title = document.createElement("div");
  title.className = "friends-title";
  panel.appendChild(title);

  const list = document.createElement("div");
  list.className = "friends-list";
  panel.appendChild(list);

  const unsubscribe = lobby.subscribe((state) => {
    if (state.kind !== "online") {
      title.textContent = "Convidar amigos — defina seu nick no painel de amigos";
      list.replaceChildren();
      return;
    }
    title.textContent = "Convidar amigos";
    list.replaceChildren();
    const online = state.friends.filter((friend) => friend.online);
    if (online.length === 0) {
      const empty = document.createElement("div");
      empty.className = "friends-empty";
      empty.textContent = "Nenhum amigo online agora — use o link acima.";
      list.appendChild(empty);
      return;
    }
    for (const friend of online) {
      const row = document.createElement("div");
      row.className = "friends-row";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = friend.nick;
      const invite = document.createElement("button");
      invite.className = "friends-button";
      invite.textContent = "Convidar";
      invite.addEventListener("click", () => {
        lobby.inviteFriend(friend.nick, inviteUrl, roomCode);
        invite.textContent = "Convidado ✓";
        invite.disabled = true;
        window.setTimeout(() => {
          invite.textContent = "Convidar";
          invite.disabled = false;
        }, 5000);
      });
      row.append(name, invite);
      list.appendChild(row);
    }
  });
  // showScreen dispatches teardown on the screen's root element, not on
  // nested nodes — hook it there so the lobby subscription is released.
  screenRoot.addEventListener("screen-teardown", unsubscribe, { once: true });

  return panel;
}

function buildSelectionConfirmation(youtuber: YoutuberProfile, car: CarDefinition): HTMLElement {
  const box = document.createElement("div");
  box.className = "selection-confirmation";

  const swatch = document.createElement("div");
  swatch.className = "selection-confirmation-swatch";
  swatch.style.background = car.visual.color;

  const text = document.createElement("div");
  const carLine = document.createElement("div");
  carLine.className = "selection-confirmation-car";
  carLine.textContent = car.visual.displayName;
  const garageLine = document.createElement("div");
  garageLine.className = "selection-confirmation-garage";
  garageLine.textContent = `Garagem de ${youtuber.displayName}`;
  text.append(carLine, garageLine);

  box.append(swatch, text);
  return box;
}
