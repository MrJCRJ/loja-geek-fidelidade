# Melhorias Central ↔ GeekLock — handoff loja

Atualizado em **2026-09-23**.  
**Status:** decisões documentadas — **não implementar nesta visita** (só validar o que já foi para o pendrive).

**Controle no celular** (implementado 2026-09-23): [`GEEKADMIN-CELULAR.md`](./GEEKADMIN-CELULAR.md). Na loja: atualizar + CNAME `admin` no túnel existente.

---

## Decisões fechadas (grilling)

| # | Pergunta | Escolha |
|---|----------|---------|
| 1 | O que melhorar | **Setup (A) + Estabilidade (B) + Update Lock via Central (D)** |
| 2 | Nesta leva de código | **Só uma** melhoria por vez |
| 3 | Como validar | Máximo no PC de build; rede multi-PC na loja |
| 4 | **Próxima implementação** | **(B) Estabilidade** |
| 5 | Mínimo de (B) | Reconnect automático do WebSocket + banner “Central offline / voltou” |

**Ordem futura (após B):**

1. ~~Pareamento código 6 dígitos~~ — **já feito**  
2. **(B) Estabilidade** — próxima  
3. **(A) Setup** — fila de estações / código multi-uso / checklist  
4. **(D) Update Lock via Central** — empurrar ZIP do Lock a partir do Central  
5. **(E) GeekAdmin no celular** — [`GEEKADMIN-CELULAR.md`](./GEEKADMIN-CELULAR.md) — **implementado** (validar na loja)  

---

## O que já está no pendrive (levar e testar)

| Item | Doc | O que fazer na loja |
|------|-----|---------------------|
| Fix `lan-discovery` (erro “JavaScript”) | [`CORRECAO-LOJA-2026-09-22.md`](./CORRECAO-LOJA-2026-09-22.md) | Recopiar GeekCentral + GeekLock para `C:\` |
| Código 6 dígitos | [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md) | Central Online → digitar código no Lock |
| UI tela pequena | [`UI-TELA-PEQUENA.md`](./UI-TELA-PEQUENA.md) | Modo compacto no Central |
| Atualizar Central (GitHub) | [`UPDATE-GEEKCENTRAL.md`](./UPDATE-GEEKCENTRAL.md) | Token + Verificar (precisa de **release** publicado) |
| Setup Windows / túnel | [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md) | Túnel Nomeado + auto-start |
| Monitor remoto (depois) | [`REMOTE-MONITOR.md`](./REMOTE-MONITOR.md) | Cloudflare Access — **depois** de estável |

---

## Próxima feature a implementar (B) — spec curta

### Objetivo
Se a API/WebSocket do Central cair ou a rede oscilar, o GeekLock:

1. Mostra banner claro: **“Central offline”** / **“Central voltou”**  
2. **Reconecta o WebSocket sozinho** (backoff)  
3. Não pede reconfigurar estação (token/`config.json` intactos)

### Fora do escopo de B (nesta feature)
- Retomar sessão VIP sem face de novo (foi opção Q5-B — **não** escolhida)  
- Botão manual “Reconectar” (Q5-C — não)  
- Update do Lock (D)  
- Setup avançado (A)

### Critério de pronto
- [x] Reconnect WS com backoff (já existia) + banners **Central offline** / **Central voltou**
- [ ] Validar na loja: derrubar API → banner; subir → reconecta sem reiniciar o .exe  

### Onde mexer (quando for implementar)
- `agent-windows` — WS client / banners  
- `server` — hub WebSocket (se precisar heartbeat/reconnect hints)  
- Docs: marcar esta página como implementado  

---

## (A) Setup — backlog (depois de B)

Ideias alinhadas ao grilling:

- Código de pareamento **não** gastar no 1º PC (ou regenerar na hora para o próximo)  
- Sugestão automática `PC-01`, `PC-02`…  
- Checklist no Central: “estações pareadas hoje”  
- Evitar digitar URL se a descoberta LAN estiver ok  

---

## (D) Update Lock via Central — backlog (depois de A)

- Release `GeekLock-win-x64.zip` (espelho do fluxo Central)  
- Central: “há update Lock” + comando/WS para estações baixarem  
- Manter `config.json` da estação  

---

## Checklist visita à loja (ops)

1. [ ] Plugar pendrive → ler `LEIA-PRIMEIRO.txt` / `ATUALIZACAO-2026-09-22.txt`  
2. [ ] Copiar **GeekCentral** e **GeekLock** para `C:\` (substituir pastas)  
3. [ ] Copiar `cloudflared-COPIAR-PARA-USERPROFILE` → `%USERPROFILE%\.cloudflared\`  
4. [ ] GeekCentral → Online → túnel **Nomeado** + auto-start  
5. [ ] Health: `https://api.geekloja.com.br/api/health`  
6. [ ] Parear 1 estação com **código 6 dígitos**  
7. [ ] Anotar no celular: o que ainda falhou (para voltar e implementar **B**)  
8. [ ] Cronometrar boot do GeekLock após reinício — [`GEEKLOCK-BOOT-RAPIDO.md`](./GEEKLOCK-BOOT-RAPIDO.md)  
9. [ ] Instalar pack Cursor (`Cursor-Agent\cursor-pack`) para o agent grilar igual — [`CURSOR-PACK-LOJA.md`](./CURSOR-PACK-LOJA.md)  

**Não fazer nesta visita:** Cloudflare Access remoto; Mercado Pago live; implementar B/A/D nem boot rápido do Lock (a menos que você diga “implementa”).

---

## Relacionados

- Teorias de produção (sessão/face): [`teorias-producao.md`](./teorias-producao.md)  
- Pendências ops gerais: [`PENDENCIAS.md`](./PENDENCIAS.md)  
- Update Central: [`UPDATE-GEEKCENTRAL.md`](./UPDATE-GEEKCENTRAL.md)  
