# Movimento com previsão local + Anfitrião autoritativo para eventos de corrida

**Status**: accepted

Sem servidor de jogo (ADR 0003), alguém precisa arbitrar eventos que exigem acordo entre os dois peers (largada, validação de checkpoint/volta, ordem de chegada). Decidimos que cada cliente simula seu próprio Carro localmente e sem espera (responsividade imediata de input), envia seu estado (posição/velocidade/rotação) para o peer a uma taxa fixa, e renderiza o carro remoto interpolando entre os últimos estados recebidos. Para os eventos de corrida que precisam de uma fonte única de verdade (contagem regressiva de largada, validação de checkpoints, quem cruzou a Linha de Chegada primeiro), o Anfitrião (quem criou a Sala) é a autoridade.

## Considered Options

- **Lockstep determinístico** (ambos simulam a partir dos mesmos inputs, avançam só quando ambos os inputs chegam): consistência perfeita, mas introduz espera perceptível por latência de rede a cada frame — ruim para a sensação de corrida.
- **Servidor autoritativo dedicado**: mais robusto, mas contradiz a decisão P2P do ADR 0003.
- **Previsão local + Anfitrião autoritativo para eventos de corrida (escolhido)**: cada jogador sente resposta imediata ao próprio input; o carro remoto pode ter pequeno atraso/interpolação visual, mas isso é aceitável em corrida P2P casual. O Anfitrião decide fatos que precisam de consenso (largada e resultado), evitando que os dois clientes divirjam sobre quem venceu.

## Consequences

- Se o Anfitrião fechar a aba, a corrida atual não tem mais árbitro — aceitável para MVP (a Sala é efêmera; documentar como limitação conhecida, não resolver agora).
- O Convidado deve confiar no veredito de vencedor enviado pelo Anfitrião; não há reconciliação independente no MVP.
