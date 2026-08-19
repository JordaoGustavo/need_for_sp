# WebRTC DataChannel P2P para o jogo, com servidor de sinalização mínimo apenas para pareamento

**Status**: accepted

Para 2 jogadores conectados via Convite via Link, o estado da corrida trafega diretamente entre os dois navegadores via WebRTC DataChannel (P2P), evitando um backend que hospede a simulação. WebRTC, porém, não estabelece conexão sem um canal de sinalização fora de banda (troca de SDP/ICE) — por isso existe um servidor de sinalização mínimo (WebSocket, sem estado persistente) cujo único papel é: dado um Código de Sala, apresentar os dois peers um ao outro. Depois do handshake, o servidor de sinalização não participa mais da corrida.

## Considered Options

- **Servidor autoritativo/relay** (todo o estado do jogo passa pelo servidor): mais fácil de manter consistência e prevenir trapaça, mas exige um backend de jogo real com hospedagem de sala por corrida — desproporcional para 2 jogadores e contraria o pedido de "convite via link" simples, sem matchmaking.
- **P2P manual (copiar/colar SDP)**: dispensaria qualquer servidor, mas a UX de "convite via link" pede que o segundo jogador só clique no link — copiar/colar texto de sinalização manualmente não atende esse requisito.
- **WebRTC P2P + servidor de sinalização mínimo**: escolhido. O servidor de sinalização é pequeno, sem estado de jogo, fácil de hospedar, e o tráfego de corrida (posição, input) vai direto entre os navegadores.

## Consequences

- É necessário rodar (ou hospedar) um pequeno processo de sinalização (Node + WebSocket) além do client estático — não é 100% "só front-end". Documentado no MVP spec.
- Não há proteção contra trapaça (um peer mal-intencionado pode mentir sobre seu próprio estado) — aceitável para MVP casual de 2 jogadores; ver ADR 0004 sobre quem arbitra o resultado da corrida.
