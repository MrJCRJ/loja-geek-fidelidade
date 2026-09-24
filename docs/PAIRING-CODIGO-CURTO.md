# Pareamento GeekLock ↔ GeekCentral

Atualizado em **2026-09-23**.  
**Status:** na LAN **não precisa de código**. Instala o Lock → ele acha o Central → nome do PC → Conectar.

O GeekAdmin em `loja.geekloja.com.br` **não mostra código**. Lock na LAN: acha o Central → nome do PC → Conectar. A API antiga `/api/stations/pair` fica só para Lock velho.

---

## Decisões fechadas

| # | Decisão | Escolha |
|---|--------|---------|
| 1 | Método | Código de **6 dígitos** (não QR — PCs fixos não scaneiam bem) |
| 2 | Segredo longo na UI do Lock | **Some** — só código curto no assistente |
| 3 | Quando | Documentar agora; implementar + regenerar pendrive depois |
| 4 | Onde o código aparece | Tela principal do **GeekCentral** (grande, legível de longe) |
| 5 | Validade | Até claim com sucesso **ou** no máx. **15 min** |
| 6 | O que digitar no Lock | Escolher Central na LAN + **nome da estação** + **código** |

O `STATION_SHARED_SECRET` / `sharedSecret` continua existindo **só no servidor** (e em `config.json` se alguém editar à mão). Staff da loja **não** digita mais a string longa.

---

## Fluxo desejado

```
GeekCentral (PC controle)          GeekLock (estação)
─────────────────────────          ──────────────────
Online → mostra código 6 dígitos
  grande na tela principal
                                   1) Escolhe Central na lista LAN
                                   2) Digita nome (ex.: PC-01)
                                   3) Digita o código
                                   4) API valida código → claim
                                      com o segredo real (interno)
Código invalida após uso / 15 min
```

---

## API (proposta na implementação)

| Peça | Ideia |
|------|--------|
| Central | Gera código numérico 6 dígitos, guarda hash + expiry em memória (ou SQLite curto) |
| `POST /api/stations/pair` | `{ name, pairCode }` → se ok, mesmo efeito do claim com `sharedSecret` (devolve `stationToken`) |
| GeekLock SetupWizard | Remove campo password do segredo; campo `pairCode` |
| GeekCentral UI | Bloco grande “Código para estações: ######” + “Gerar novo” opcional |

**Não** enviar o segredo longo no beacon UDP da LAN (só `serverUrl` / unitName como hoje).

---

## Segurança (mínimo)

- Código de uso único (ou invalida ao claim ok).  
- TTL máx. 15 min.  
- Rate-limit tentativas erradas por IP/estação.  
- Segredo longo continua forte; código é só “ponte” de setup na LAN.

---

## Fora de escopo (nesta feature)

- QR de pareamento  
- Colar segredo na UI do Lock  
- Cloudflare Access / monitor remoto  

---

## Checklist de implementação

- [x] Endpoint `pair` + geração no Central  
- [x] UI código grande no GeekCentral  
- [x] SetupWizard: nome + código (sem sharedSecret)  
- [ ] Teste na loja: Central online → Lock digita código → claim ok  
- [ ] Regenerar pendrive Lock + Central (pack)  
- [x] Atualizar LEIA-ME dos scripts de pack  

---

## Relacionados

- Incidente pack: [`CORRECAO-LOJA-2026-09-22.md`](./CORRECAO-LOJA-2026-09-22.md)  
- Setup Windows: [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md)  
- Claim atual: `POST /api/stations/claim` com `sharedSecret`  
