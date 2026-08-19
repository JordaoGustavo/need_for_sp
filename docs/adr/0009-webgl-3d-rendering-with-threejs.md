# Renderização 3D com Three.js atrás da interface RaceRenderer

**Status**: accepted — supersedes ADR 0001

O ADR 0001 escolheu Canvas 2D top-down para o MVP, deliberadamente deixando a corrida atrás da interface `RaceRenderer` para permitir migrar para WebGL depois. Com o MVP multiplayer funcionando, decidimos fazer essa migração agora: a corrida passa a ser renderizada em 3D com Three.js (cena noturna urbana, câmera de perseguição), e o menu de garagem ganha um showcase 3D do carro girando, aproximando o jogo da referência visual do NFS Underground 2.

## Decisão

- **Three.js** como engine de renderização (`ThreeRaceRenderer` em `src/rendering/three/`), implementando a mesma interface `RaceRenderer` — física (`carPhysics`), rede (`RaceSession`/WebRTC) e domínio não mudam em nada.
- **Carros procedurais low-poly** construídos por código a partir de primitivas (`buildCarMesh`), com a cor vinda de `CarVisual` (ADR 0005: conteúdo é dado). Sem pipeline de assets 3D por enquanto — evita o custo de modelagem que o ADR 0001 apontou como risco.
- **Mapeamento de mundo**: a simulação continua 1D+lateral (`distanceMeters`, `lateralOffsetMeters`); o renderer mapeia `d → z = -d` e offset lateral → X. A física não sabe que o mundo virou 3D.
- **HUD permanece Canvas 2D** (contrato `HudSkin`, ADR 0006) desenhado num canvas overlay transparente sobre o canvas WebGL — nenhuma skin precisa ser reescrita.
- **Cenário determinístico**: prédios/janelas usam PRNG com seed derivada do `track.id`, para os dois jogadores verem o mesmo cenário sem trafegar nada pela rede.
- **Menu estilo NFSU2** com assets próprios: tipografia itálica agressiva (Chakra Petch), painéis com cortes diagonais, neon, e preview 3D do carro na garagem (`createCarPreview`). Não copiamos fontes, logos ou artes da EA — só a linguagem visual.

## Consequences

- O `CanvasRaceRenderer` 2D foi removido; a interface `RaceRenderer` segue sendo a costura, então um renderer alternativo (ex.: modo performance) ainda pode ser plugado.
- Pistas `circuit` (Interlagos) vão exigir que o renderer aprenda a extrudar um caminho curvo; a interface não muda, mas `buildTrackScene` hoje só desenha reta (suficiente para `drag`).
- Bundle cresce (~150 KB gzip do Three.js) e passa a exigir WebGL no navegador — aceitável para o público-alvo.
- Fonte via Google Fonts adiciona dependência de rede no primeiro load; há fallback para fontes de sistema.
