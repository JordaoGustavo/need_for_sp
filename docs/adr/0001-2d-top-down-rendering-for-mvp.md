# Renderização 2D top-down (Canvas) para o MVP, não WebGL 3D

**Status**: superseded by ADR 0009 (a corrida agora é 3D com Three.js, atrás da mesma interface RaceRenderer prevista aqui)

O briefing pede uma estética inspirada em Need for Speed Underground 2 (que é 3D), mas o requisito funcional prioritário é multiplayer 2 jogadores via link, com menu de garagem/carro e pistas jogáveis rapidamente. Decidimos renderizar em Canvas 2D top-down (câmera de cima, sprites de carro) para o MVP, e não WebGL 3D real (ex.: Three.js) nem pseudo-3D estilo Mode 7.

## Considered Options

- **WebGL 3D real (Three.js)**: visual mais fiel ao NFSU2, mas exige modelagem/animação 3D de carros e pistas, câmera de perseguição, iluminação — escopo de meses, não de um MVP. Alto risco de nunca chegar a "jogável multiplayer".
- **Pseudo-3D (Mode 7 / sprite scaling)**: visual de corrida clássica (tipo OutRun), mas a matemática de projeção e o pipeline de sprites por ângulo são um meio-termo caro sem ganho claro de fidelidade ao NFSU2.
- **2D top-down (Canvas 2D)**: mais rápido de construir, física simples (posição/ângulo/velocidade em um plano), fácil de debugar e sincronizar em rede. Não parece com o NFSU2 em jogo, mas o menu (que é a peça mais reconhecível do NFSU2) pode ser fiel independentemente da renderização da pista.

## Consequences

- A fidelidade visual ao NFSU2 fica concentrada no **menu** (seleção de garagem/youtuber/carro), não na corrida em si.
- A camada de renderização da corrida deve ficar atrás de uma interface (`TrackRenderer`/`CarRenderer`) para permitir trocar para WebGL depois sem reescrever a simulação de física ou o código de rede.
