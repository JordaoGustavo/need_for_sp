# Interface HudSkin desacoplada da simulação do carro

**Status**: accepted

O usuário pediu explicitamente para já preparar a troca futura do "hub" (HUD) do conta-giros/velocímetro. Definimos uma interface `HudSkin` (contrato: recebe `{ speedKmh, rpm, gear, maxRpm }` e desenha) implementada por uma skin padrão (`DefaultDigitalHudSkin`) no MVP. A simulação do Carro nunca desenha o HUD diretamente nem conhece qual skin está ativa — apenas expõe seu estado, e uma skin qualquer o consome.

## Consequences

- Trocar o HUD no futuro é implementar uma nova classe `HudSkin` e trocar qual instância a tela de corrida usa — sem tocar em física de carro ou rede.
- Não há UI de seleção de HUD skin no MVP (fora de escopo agora), só a interface e uma implementação padrão.
