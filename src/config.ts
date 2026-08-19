/** Default signaling server address for local development (server/signalingServer.ts). */
export function defaultSignalingUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:8787`;
}
