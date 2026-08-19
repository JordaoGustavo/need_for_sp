# TypeScript + Vite como stack de linguagem/build

**Status**: accepted

O briefing pede explicitamente uso de interfaces e objetos para facilitar evolução futura (troca de HUD skin, customização de carros). TypeScript dá essa garantia em tempo de compilação (interfaces reais, checagem de tipos), o que JS puro + JSDoc só simula parcialmente. Vite foi escolhido como bundler/dev server pela configuração mínima e recarga rápida durante o desenvolvimento.

## Considered Options

- **JavaScript puro sem build**: zero configuração, mas sem verificação de interfaces em tempo de compilação — o requisito explícito de "interfaces para facilitar evolução" fica só como convenção, não como contrato garantido.
- **TypeScript + Vite**: interfaces verificadas, boa DX, HMR rápido. Custo: exige um passo de build/dev server (não é mais "abrir um HTML e pronto").

Optamos por TypeScript + Vite porque o requisito arquitetural (interfaces trocáveis) é central ao pedido do usuário, não incidental.
