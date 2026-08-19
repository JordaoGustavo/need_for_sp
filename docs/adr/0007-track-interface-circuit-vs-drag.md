# Interface de Pista unificando Circuito Fechado e Arrancada

**Status**: accepted

Interlagos (circuito fechado, com voltas) e Bandeirantita/Imigrantita (arrancada, percurso único) têm regras de conclusão diferentes. Definimos uma interface `Track` comum (geometria, Linha de Largada, Linha de Chegada, lista de Checkpoints) e uma propriedade `raceType: 'circuit' | 'drag'` que uma `RaceRules` (estratégia) usa para decidir como calcular progresso e quem venceu — voltas + ordem de checkpoints para `circuit`, cruzar a Linha de Chegada primeiro para `drag`. Pistas do tipo `circuit` sempre têm `laps > 1` e `checkpoints.length > 0`; pistas do tipo `drag` têm `laps === 1` e tipicamente `checkpoints = []`.

## Considered Options

- **Uma classe por tipo de pista sem interface comum**: mais simples a curto prazo, mas replica código de física/renderização e dificulta adicionar a 3ª pista.
- **Interface `Track` + estratégia `RaceRules` por tipo (escolhido)**: pistas futuras (inclusive a 3ª deste MVP) só implementam dados (`TrackDefinition`), reaproveitando a mesma lógica de simulação e apenas trocando a regra de vitória.
