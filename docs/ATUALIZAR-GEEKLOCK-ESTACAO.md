# Atualizar GeekLock na estação

**Preferido:** no celular (dono) → Config → **Atualizar GeekLock**. Os PCs ligados baixam agora; o que estava desligado pega na próxima vez que ligar.

**Primeira vez / Lock velho sem este código:** pendrive uma vez (abaixo). Depois é o botão.

Atualizado em **2026-09-23** (instalador no pendrive).  
**Para o agent Cursor no PC da estação.** Repo: https://github.com/MrJCRJ/loja-geek-fidelidade (`main`).

Guia completo (rede, pendrive, atualizar sem perder token, timer da equipe): [`GEEKLOCK-INSTALAR-ESTACOES.md`](./GEEKLOCK-INSTALAR-ESTACOES.md). Índice: [`README.md`](./README.md).

Prompt para colar no chat Agent deste PC: [`PROMPT-PC-GEEKLOCK.txt`](./PROMPT-PC-GEEKLOCK.txt).

## Por que atualizar

O GeekLock de **22/09** mostra **Central offline** mesmo com o GeekCentral no ar.

- O motor está no PC principal (`192.168.3.70`).
- A API da loja para o Lock é **só LAN HTTP na porta 8787**.
- Se o `serverUrl` for `http://192.168.3.70` **sem** `:8787`, o pedido cai na porta 80 (HTTPS do celular) e o Lock acha que o Central morreu.

URL correta:

```
http://192.168.3.70:8787
```

Não usar `https://`, `loja.geekloja.com.br` nem `geek.local` no GeekLock.

## O que o agent faz

1. `GET http://192.168.3.70:8787/api/health` → `ok: true` (senão parar).
2. `git pull` (ou clonar o repo).
3. Preferir o instalador do pendrive (apaga o antigo + autostart + assistente de pareamento):
   - `D:\INSTALAR-GEEKLOCK.bat` ou `D:\GeekLock\INSTALAR-GEEKLOCK.bat` (letra do USB).
   - Depois: o Lock acha o Central na LAN + nome da estação → Conectar.
4. Se o `.bat` não existir: fechar `GeekLock.exe`, apagar `C:\GeekLock`,
   copiar o pack novo (pendrive `GeekLock\` **ou** build
   `agent-windows` → `electron-builder --win dir --x64`).
5. Forçar `serverUrl` = `http://192.168.3.70:8787` e `setupComplete` = false (sem token).
6. Garantir `C:\GeekLock\resources\shared\lan-discovery.cjs`.
7. Subir `GeekLock.exe` e **re-parear** (nome do PC + Conectar).

## Pareamento (obrigatório após o instalador)

No Lock, na rede da loja: ele acha o Central sozinho. Só o nome da estação + Conectar.

## Fora de escopo

Túnel, DNS, domínio, `.env` do Central, Mercado Pago live, boot rápido, update Lock via Central.
