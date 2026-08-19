# Código de Sala embutido na URL como mecanismo de Convite via Link

**Status**: accepted

Para permitir "convite via link" sem tela de lobby, o Anfitrião gera um Código de Sala curto no cliente (ex.: 6 caracteres alfanuméricos) ao criar uma corrida, e a própria URL do jogo carrega esse código como query param (`?room=ABC123`). O Convidado abre o link, o cliente lê o `room` da URL automaticamente e inicia a conexão de sinalização (ADR 0003) com esse código — sem exigir que o Convidado digite nada.

## Consequences

- O Código de Sala por si só não autentica ninguém — qualquer pessoa com o link entra na Sala. Aceitável para MVP (uso entre amigos via link privado), mas deve ficar documentado como limitação conhecida caso o jogo seja exposto publicamente depois.
- A Sala é efêmera: o servidor de sinalização não persiste Código de Sala além da sessão de handshake ativa (ver ADR 0003).
