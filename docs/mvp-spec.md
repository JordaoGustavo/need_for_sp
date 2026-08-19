# Need for SP — Escopo do MVP

Este documento resume o que será implementado agora (Etapa 2) e o que fica deliberadamente para depois, com base nas decisões registradas em `docs/adr/` e no glossário em `docs/glossary.md`.

## Contexto

Jogo de corrida multiplayer no navegador, 2 jogadores, pareamento via link de convite, com menu de seleção de garagem/youtuber/carro no estilo Need for Speed Underground 2, e pistas fictícias inspiradas em SP (Interlagos, Bandeirantita, Imigrantita).

## No MVP (implementar agora)

- **Projeto TypeScript + Vite** (ADR 0002), com camada de domínio (`Car`, `Track`, `HudSkin`, `Youtuber`/`Garage`) desacoplada da renderização e da rede.
- **Renderização 2D top-down em Canvas** (ADR 0001), atrás de uma interface de renderer.
- **Menu**: tela de seleção de Youtuber → tela de Garagem com os Carros daquele Youtuber → confirmação → tela de corrida. Fluxo e estilo visual inspirados no menu do NFSU2. Conteúdo (youtubers e carros) vem de um registro de dados (ADR 0005), não hardcoded na UI.
- **1 Youtuber com 2–3 Carros** no registro, suficiente para exercitar o fluxo de seleção real (não é preciso povoar todos os youtubers imaginados a longo prazo).
- **1 pista jogável: Bandeirantita** (Arrancada). Justificativa: entre as 3 pistas descritas no briefing, a Arrancada é a mais simples de implementar corretamente primeiro — percurso único, sem voltas, sem múltiplos checkpoints, o que valida física de carro + sincronização multiplayer + HUD com o menor número de partes móveis. Interlagos (circuito fechado) e Imigrantita ficam para depois, usando a mesma interface `Track`/`RaceRules` (ADR 0007) já pronta para receber `raceType: 'circuit'`.
- **Interface `Track`** cobrindo os dois `raceType` (`circuit` e `drag`) desde já (ADR 0007), mesmo com só uma pista `drag` implementada.
- **Interface `HudSkin`** com uma implementação padrão (conta-giros + velocímetro digital) (ADR 0006). Sem UI de troca de skin no MVP — só a interface e o default.
- **`CarDefinition`** com stats (velocidade máxima, aceleração, manobrabilidade) e visual, desenhada para futuramente suportar customização (cor, upgrades), mas **sem UI de customização no MVP**.
- **Multiplayer 2 jogadores**: servidor de sinalização mínimo (Node + WebSocket, sem persistência) só para handshake WebRTC (ADR 0003); estado de corrida trafega via WebRTC DataChannel P2P. Movimento com previsão local + interpolação do carro remoto; Anfitrião autoritativo para largada, checkpoints e resultado final (ADR 0004).
- **Convite via link**: Anfitrião gera Código de Sala, URL carrega `?room=CÓDIGO` (ADR 0008); Convidado abrindo o link entra direto na sala, sem tela de lobby/matchmaking.
- **Testável localmente com 2 abas do navegador**: rodar o servidor de sinalização localmente + o client via Vite dev server; abrir a URL do Anfitrião em uma aba, copiar o link com `?room=` gerado e abrir em outra aba (ou janela anônima) para simular o Convidado.

## Fora do MVP (fica para depois — mas a abstração já está pronta para receber)

- **Pista Interlagos (circuito fechado)** e **Pista Imigrantita**: não implementadas agora; usam a mesma interface `Track`/`RaceRules`, só falta a `TrackDefinition` + regra de circuito.
- **Troca de HUD skin pelo jogador** (UI de seleção): a interface `HudSkin` já existe; falta apenas escrever skins alternativas e uma tela de seleção.
- **Customização de carros** (cor, upgrades de performance): fora de escopo agora; `CarDefinition` foi desenhada para não bloquear isso depois, mas nenhuma UI ou lógica de customização é implementada no MVP.
- **Mais youtubers/carros** além do necessário para exercitar o fluxo de menu.
- **Proteção anticheat / validação server-side de física**: aceito como limitação conhecida do modelo P2P (ADR 0003, ADR 0004).
- **Hospedagem em produção do servidor de sinalização**: o MVP roda localmente; deploy real (domínio público, TLS, hospedagem do servidor de sinalização) não faz parte desta leva.

## Critério de "MVP funcionando"

Duas abas do navegador em localhost conseguem: abrir o menu, cada uma escolher o mesmo Youtuber e um Carro, uma delas criar uma Sala e gerar o link, a outra entrar pelo link, ambas verem a pista Bandeirantita, correr com HUD funcional, e ver um resultado (quem cruzou a Linha de Chegada primeiro) refletido nas duas abas.
