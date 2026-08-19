# Som via WebAudio sintetizado; música licenciada carregada de public/, nunca embutida

**Status**: accepted

O jogo ganhou som: música de menu, efeitos de UI e som de motor por carro. Duas restrições guiaram o desenho: (1) a faixa desejada para o menu ("Riders on the Storm") é protegida por direitos autorais e não pode ser distribuída com o repositório; (2) queremos que cada carro tenha uma voz própria sem montar um pipeline de assets de áudio.

## Decisão

- **Tudo sintetizado em WebAudio por padrão** (`src/audio/`): efeitos de UI (blips), som de motor e a ambiência de fallback do menu são gerados por osciladores/ruído em código — zero arquivos de áudio no repositório.
- **Música do menu é conteúdo do jogador**: `menuMusic.ts` tenta carregar `public/audio/menu-theme.mp3` (onde o dono do jogo coloca a própria cópia licenciada da faixa que quiser). Se o arquivo não existe, toca uma ambiência de tempestade sintetizada **original** — clima parecido, melodia nenhuma copiada.
- **Som de motor é dado de conteúdo** (ADR 0005): `CarDefinition.sound` (`CarSoundProfile`: frequência base, detune, brilho) alimenta o sintetizador `EngineSound`. Carro novo = entrada nova no registro com sua assinatura sonora; nenhum código de áudio muda.
- **Motor do adversário audível com atenuação por distância** na tela de corrida (gap em metros → volume), usando o mesmo `EngineSound`.
- **Autoplay**: o `AudioContext` só destrava após gesto do usuário (política dos navegadores); `whenAudioUnlocked()` centraliza isso. Tecla **M** alterna mudo global.

## Consequences

- O repositório continua distribuível sem risco de copyright; o custo é que o menu só toca a música "de verdade" se o jogador fornecer o arquivo.
- Sons sintetizados têm caráter retrô/estilizado — se um dia quisermos áudio gravado (ronco real de motor), o contrato `CarSoundProfile`/`EngineSound` vira o ponto de troca, mas hoje não há pipeline de samples.
- `RaceSession` continua sem saber que áudio existe: a tela de corrida deriva RPM do estado e alimenta o som, mantendo domínio/física/rede puros.
