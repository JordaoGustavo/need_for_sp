# Need for SP — Glossário de Domínio

Jogo de corrida multiplayer para navegador, com estética/fluxo de menu inspirados em Need for Speed Underground 2, ambientado em pistas fictícias inspiradas em rodovias e circuitos de São Paulo.

## Language

**Youtuber**:
Dono de uma Garagem no menu de seleção. Representa a identidade/tema sob a qual um conjunto de Carros é agrupado e exibido (equivalente ao "dono de garagem" do menu do NFSU2).
_Avoid_: Canal, criador, dono (isolado)

**Garagem (Garage)**:
A coleção de Carros pertencentes a um Youtuber, exibida ao jogador depois que ele seleciona o Youtuber no menu.
_Avoid_: Coleção, frota

**Carro (Car)**:
Um veículo selecionável dentro de uma Garagem, com estatísticas de desempenho (velocidade máxima, aceleração, manobrabilidade) e uma aparência visual. Definido como dado de conteúdo (CarDefinition), não codificado diretamente na interface do menu.
_Avoid_: Veículo (usar só quando falando genericamente do domínio de trânsito, não do domínio de jogo)

**Pista (Track)**:
Um cenário de corrida jogável, com um Tipo de Pista que determina suas regras de conclusão. Toda Pista tem uma Linha de Largada e uma Linha de Chegada.
_Avoid_: Mapa, circuito (isolado — "Circuito" é um Tipo de Pista específico, não sinônimo de Pista)

**Tipo de Pista**:
Ou `circuito` (Circuito Fechado) ou `arrancada` (Arrancada). Determina se a corrida usa voltas + checkpoints ou é um percurso único do início ao fim.

**Circuito Fechado**:
Tipo de Pista em loop fechado, disputado em um número fixo de voltas; a posição do jogador é determinada pela volta atual e pela ordem de passagem pelos Checkpoints. Ex.: Interlagos.
_Avoid_: Volta (isolado), loop

**Arrancada**:
Tipo de Pista em linha reta, ponto a ponto, sem voltas; vence quem cruzar a Linha de Chegada primeiro em uma única passagem. Ex.: Bandeirantita, Imigrantita.
_Avoid_: Drag race, corrida de rua (termo amplo demais)

**Checkpoint**:
Ponto de passagem obrigatório ao longo de uma Pista de Circuito Fechado, usado para validar que uma volta foi completa corretamente (evitar atalhos) e para calcular a posição relativa entre os dois jogadores.

**Linha de Largada / Linha de Chegada**:
Marcam, respectivamente, o início da corrida (onde ocorre a contagem regressiva) e o ponto que define quem venceu.

**HUD Skin**:
A aparência visual do conta-giros e do velocímetro exibidos durante a corrida, desacoplada dos dados que ela exibe (rotação do motor, velocidade, marcha). Permite trocar a skin sem alterar a lógica de simulação do Carro.
_Avoid_: Painel, dashboard (usar "HUD Skin" para o conceito trocável específico)

**Sala (Room)**:
Uma sessão de corrida efêmera para exatamente 2 jogadores, identificada por um Código de Sala. Não persiste além da sessão de jogo.
_Avoid_: Lobby, partida (isolado)

**Código de Sala (Room Code)**:
Identificador curto gerado ao criar uma Sala, embutido no Convite via Link para que o segundo jogador entre na mesma Sala.

**Convite via Link**:
O mecanismo de entrada de um segundo jogador em uma Sala: o Anfitrião gera um link contendo o Código de Sala e o compartilha; não existe fila de matchmaking.
_Avoid_: Convite (isolado), invite link (usar o termo em português como canônico)

**Anfitrião (Host) / Convidado (Guest)**:
Os dois papéis de jogador em uma Sala. O Anfitrião cria a Sala e gera o Convite via Link; é responsável por decidir o início da corrida e por validar Checkpoints/vencedor (ver ADR 0004). O Convidado entra via o link recebido.
_Avoid_: Player 1 / Player 2 (isolado — esses termos não distinguem papel de rede)
