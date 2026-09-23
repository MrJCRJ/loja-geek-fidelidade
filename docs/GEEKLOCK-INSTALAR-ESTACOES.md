# GeekLock nas estações — guia completo

Atualizado em **2026-09-23**.  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade

Como **instalar ou atualizar** o GeekLock nos PCs de jogo. O motor (API + face + túnel) fica **só** no PC principal. As estações só falam com ele na LAN.

Não recriar domínio, túnel nem `api.geekloja.com.br`.  
Não commitar `config.json` com `stationToken`.

---

## Peças

| Papel | Onde | URL que o Lock usa |
|-------|------|-------------------|
| GeekCentral (motor) | PC principal `192.168.3.70` | — |
| API da loja (LAN) | mesma máquina, porta **8787** | `http://192.168.3.70:8787` |
| GeekAdmin (celular, Wi‑Fi da loja) | túnel / `loja.geekloja.com.br` | **não** colocar no Lock |
| GeekLock | cada PC de jogo, pasta `C:\GeekLock` | só o HTTP `:8787` |

URL **errada** (Lock fica “Central offline”): `http://192.168.3.70` sem porta, `https://…`, `geek.local`, `loja.geekloja.com.br`.

Health antes de qualquer instalação:

```
GET http://192.168.3.70:8787/api/health
```

Precisa de `{"ok":true,...}`. Se falhar, o Central não está no ar — **não** continue.

---

## O que já está no código (2026-09-23)

- Equipe libera PC **sem conta** no GeekAdmin: **15 min / 30 min / 1 h / 2 h**.
- No Lock aparece HUD no canto: **Equipe · resta Xm Xs · Liberado sem conta**. No último minuto avisa; no zero trava sozinho.
- PIN Admin no próprio Lock usa o tempo padrão da Config (10 min se ninguém mudou).
- Instalador de pendrive: `scripts/pendrive-geeklock/` (`INSTALAR-GEEKLOCK.bat` + `.ps1` + autostart). O pack **não** leva `config.json` (evita token no USB).

Commit do HUD: `d5d148c`. Commit do instalador: `304c5f8`.

---

## Rede da loja (medida neste PC em 2026-09-23)

Varredura a partir da estação **PC-01** (`DESKTOP-FEBUOIS`, `192.168.3.251`):

| IP | Nome | O que é | SMB (pasta Windows) |
|----|------|---------|---------------------|
| `192.168.3.70` | `DESKTOP-5L1741K` | **Central** | Fechado (só `:8787`) |
| `192.168.3.251` | `DESKTOP-FEBUOIS` | Estação PC-01 (este PC) | Aberto (local) |
| `192.168.3.21` | `DESKTOP-FHG1MVH` | Outro Windows | Porta 445 aberta; **acesso negado** (usuário desta estação não entra em `C$`) |
| `192.168.3.1` | — | Roteador | — |
| Outros (`.42`, `.48`, `.149`…) | — | Celular / IoT (ping, sem SMB) | Não é PC de jogo |

**Conclusão:** de um PC GeekLock **não dá** para empurrar o instalador sozinho para os outros. Sem senha admin do destino, `\\IP\C$\GeekLock` falha. O Central também não aceita cópia por SMB. “Update Lock via Central” continua backlog — ver [CENTRAL-LOCK-MELHORIAS.md](./CENTRAL-LOCK-MELHORIAS.md) item (D).

Caminhos que funcionam:

1. **Pendrive** (recomendado para PC novo ou reinstalação limpa).
2. **Sentar no outro PC** e copiar o pack (USB ou share, se alguém criar).
3. **Senha admin daquele Windows** — aí sim dá para tentar `C$` (não guardar senha no git).

`net view` do grupo de trabalho falhou (erro 6118). WinRM não estava disponível nesta estação.

---

## Caminho A — Pendrive (PC novo ou reinstalar)

Fonte no repo: `scripts/pendrive-geeklock/` + pack gerado por `scripts/pack-pendrive.sh` → `pendrive/GeekLock/`.

No USB deve ter `GeekLock.exe` **e** `INSTALAR-GEEKLOCK.bat` (na pasta GeekLock ou na raiz do pendrive).

Em **cada** PC de jogo:

1. Não rode o `.exe` de dentro do USB.
2. Clique `INSTALAR-GEEKLOCK.bat` (aceite UAC se pedir).
3. O instalador **apaga** `C:\GeekLock` antigo (some o pareamento), copia o pack, cria `GeekLock.vbs` na Inicialização e abre o assistente.
4. Permita a webcam.
5. URL: `http://192.168.3.70:8787`
6. Nome único (`PC-02`, `PC-03`…) + **código de 6 dígitos**.

Código: celular do dono no Wi‑Fi da loja → `https://loja.geekloja.com.br` → aba PCs / Estações.

Prompt do agent se estiver no PC da estação: [ATUALIZAR-GEEKLOCK-ESTACAO.md](./ATUALIZAR-GEEKLOCK-ESTACAO.md) + [PROMPT-PC-GEEKLOCK.txt](./PROMPT-PC-GEEKLOCK.txt).

---

## Caminho B — Atualizar sem perder o pareamento

Use quando o Lock **já** tem `stationToken` e só precisa do código novo (HUD do timer, etc.).

1. Central no ar (`/api/health` ok).
2. Copiar `C:\GeekLock\config.json` para um backup.
3. Fechar `GeekLock.exe` (`taskkill /IM GeekLock.exe /F`).
4. Trocar o `app.asar` (ou a pasta `win-unpacked` inteira) pelo build novo.
5. Restaurar o `config.json`. Conferir `serverUrl` = `http://192.168.3.70:8787`.
6. Conferir `C:\GeekLock\resources\shared\lan-discovery.cjs`.
7. Subir `C:\GeekLock\GeekLock.exe`.

Foi assim que o **PC-01** recebeu o HUD em 2026-09-23. Não pediu código de novo.

Não commitar o `config.json` (tem token).

---

## Caminho C — Share neste PC (ainda não ligado)

Dá para **criar** um compartilhamento da pasta do pack (sem `config.json`) em `\\192.168.3.251\...` e, **sentado no outro Windows**, rodar o `INSTALAR-GEEKLOCK.bat` por UNC.

Em 2026-09-23 este PC só tinha os shares padrão `C$` / `ADMIN$` / `IPC$` — **não** havia pasta GeekLock compartilhada, e o firewall de “File and Printer Sharing” não estava visível como grupo ativo. Ligar share é decisão de ops (não fazer sem o dono mandar).

---

## Depois de instalado — validar

- Tela de trava (rosto). Lock **não** diz Central offline.
- No celular: **Liberar** → escolher 15 / 30 / 1 h / 2 h → no canto do PC: **Equipe · resta …**.
- Travar / Encerrar no GeekAdmin volta a tela de trava.

---

## Fora de escopo

Túnel, DNS, domínio, `.env` do Central, Mercado Pago live, boot rápido do Lock, update Lock empurrado pelo Central, abrir porta pública neste PC.
