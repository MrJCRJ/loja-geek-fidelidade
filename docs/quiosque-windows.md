# Modo quiosque Windows — Assigned Access (GeekLock)

Atualizado em **2026-08-26**.

Objetivo: o PC de jogo **só abre o GeekLock** (ou quase). O cliente não navega no Windows, Chrome, etc.

## Opção A — Assigned Access (recomendado, Windows 10/11 Pro/Edu)

1. Crie um usuário local só para a lan (ex. `LanPC01`), sem senha de admin.
2. Instale o GeekLock (pasta `pack` ou instalador NSIS).
3. Em **Configurações → Contas → Outros usuários → Configurar um quiosque** (Assigned Access).
4. Escolha o usuário da lan e o app **GeekLock** (se não listar, use shell launcher / atalho `.exe`).
5. Reinicie o PC: ao logar nesse usuário, só o GeekLock sobe.

## Opção B — Autostart + shell restrito

1. GeekLock já tenta **abrir no login** (`openAtLogin`).
2. Use política de grupo / AppLocker para bloquear outros executáveis (avançado).
3. Combine com **Soft Lock** do GeekLock: ausência avisa e depois trava.

## Checklist rápido

- [ ] Câmera/DroidCam testada no wizard
- [ ] Segredo da estação igual ao Central
- [ ] PIN Admin conhecido só pelo balcão
- [ ] Steam/Discord: avise o VIP para sair da conta (mensagem já aparece na liberação)

## Relacionados

- [`estacao-modos.md`](./estacao-modos.md)
- [`teorias-producao.md`](./teorias-producao.md)
- [`ECOSSISTEMA.md`](./ECOSSISTEMA.md)
