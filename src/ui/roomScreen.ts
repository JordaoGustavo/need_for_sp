import { defaultSignalingUrl } from "../config";
import { hostRoom, joinRoom } from "../net/roomConnection";
import { parseRoomCodeFromUrl, withTrackParam } from "../net/roomCode";
import type { PeerConnection } from "../net/webrtcConnection";
import type { CarDefinition } from "../domain/car";
import type { TrackDefinition } from "../domain/track";
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
      withTrackParam(window.location.href, track.id),
    );

    linkInput.value = inviteUrl;
    linkBox.classList.remove("hidden");
    status.textContent = `Sala ${roomCode} criada. Compartilhe o link e aguarde o outro jogador...`;

    peerConnectionPromise
      .then((peer) => onReady({ peer, isHost: true, roomCode }))
      .catch((err) => {
        status.textContent = `Falha ao conectar: ${(err as Error).message}`;
      });
  }

  return root;
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
