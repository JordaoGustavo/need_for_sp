# Youtubers e Carros definidos como dados de conteúdo, não hardcoded na UI

**Status**: accepted

O briefing prevê adicionar mais youtubers/carros/pistas no futuro. Youtubers e seus Carros são definidos como módulos de dados (`CarDefinition`, `YoutuberProfile`) em um registro de conteúdo, lido pelo menu — o componente de menu não conhece nomes de youtuber/carro específicos, apenas itera sobre o registro.

## Consequences

- Adicionar um youtuber ou carro novo é uma mudança de dados (novo arquivo/entrada no registro), não uma mudança na lógica do menu.
- Abre caminho natural para, no futuro, carregar esse registro de uma fonte externa (JSON remoto/CMS) sem mudar a UI — não implementado no MVP, mas a estrutura já não impede.
