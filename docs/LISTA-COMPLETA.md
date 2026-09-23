# Lista completa de melhorias — projeto todo

Atualizado em **2026-09-23** (só status ops A1–A2 / C12–C13). Fila do dia: [`PENDENCIAS.md`](./PENDENCIAS.md) · índice: [`README.md`](./README.md).  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade  

Esta é a **visão do sistema inteiro** (loja, site, apps, dinheiro, segurança).  
Não é a lista só de “listas curtas / compra hora↔R$” — essa fica em [`UX-LISTAS-E-COMPRA.md`](./UX-LISTAS-E-COMPRA.md).

Legenda: `[ ]` falta · `[~]` parcial · `[x]` feito

---

## 1. Abrir a loja de verdade (ops — bloqueia o resto)

| # | Item | Status |
|---|------|--------|
| A1 | Túnel Cloudflare **com nome fixo** + DNS + autostart | `[~]` túnel/DNS ok; autostart Windows na loja falta |
| A2 | `VITE_API_URL` do portal apontando para essa URL fixa | `[x]` |
| A3 | Pix real: `MP_ACCESS_TOKEN` + webhook HTTPS | `[ ]` |
| A4 | `STRICT_SECRETS=1` + senhas fortes no PC controle | `[ ]` |
| A5 | Rodar `npm run loja:ready` e marcar [`loja-ready.md`](./loja-ready.md) | `[ ]` |
| A6 | Regenerar GeekCentral + GeekLock após mitigações recentes | `[ ]` |
| A7 | Backup do `data/` testado (restaurar em PC de teste) | `[ ]` |
| A8 | NTP / horário certo nos PCs da lan | `[ ]` |

Sem A1–A3 o site não cobra e não fala com a loja de forma estável.

---

## 2. Dinheiro e produtos

| # | Item | Status |
|---|------|--------|
| B1 | Checkout portal em **live** (não demo) | `[ ]` |
| B2 | Pacotes de horas editáveis no GeekCentral (sem mexer código) | `[x]` |
| B3 | Compra por hora **ou** por R$ + personalizado | `[x]` → detalhe em UX U2 |
| B4 | Assinatura: deixar claro que é **desconto**, não ilimitado | `[x]` |
| B5 | Recibo / comprovante simples após Pix (e-mail ou PDF) | `[ ]` |
| B6 | Relatório de faturamento no Central (dia / semana / mês) | `[x]` |
| B7 | Avaliar Asaas/Pagar.me só se taxa do MP doer | `[ ]` |
| B8 | Promo sazonal (ex. 2h pelo preço de 1,5h) | `[ ]` |

---

## 3. GeekCentral (PC controle)

| # | Item | Status |
|---|------|--------|
| C1 | Histórico Feed só top 15 | `[x]` → UX U1 |
| C2 | Sessões / telemetria com teto na tela | `[x]` |
| C3 | Dashboard de métricas | `[x]` |
| C4 | Admin usable no celular | `[x]` |
| C5 | Backup SQLite agendado | `[x]` |
| C6 | Export LGPD / revogar face sem apagar conta | `[x]` |
| C7 | Mensagem remota rica para estações | `[x]` |
| C8 | Multi-Central (várias lojas no mesmo portal) | `[x]` base |
| C9 | Caixa no balcão: vender horas sem portal (atalho rápido) | `[x]` |
| C10 | Impressão / compartilhar token de estação (QR) | `[x]` |
| C11 | Alertas: face-service caiu, estação offline, disco cheio | `[~]` Saúde + telemetria |
| C12 | Atualização do Central sem reinstalar pasta toda | `[~]` botão GitHub Releases; **0 releases**; de casa só publicar |
| C13 | Modo “só leitura” para ajudante de balcão (sem config) | `[x]` papel clerk + equipe só no Wi‑Fi da loja |

---

## 4. GeekLock (PC do jogo)

| # | Item | Status |
|---|------|--------|
| D1 | Mitigações sessão órfã / saldo / ausência | `[x]` parte 18 |
| D2 | Aviso de saldo baixo + HUD com resto de horas | `[x]` |
| D3 | Auto-trava modo Admin/PIN | `[x]` |
| D4 | Pausar cobrança quando VIP ausente | `[x]` |
| D5 | Atualização automática do .exe | `[~]` electron-updater base |
| D6 | Fechar / avisar Steam-Discord ao travar (integração) | `[x]` splash + banner ao hard lock |
| D7 | Modo quiosque Windows (Assigned Access) documentado | `[~]` docs/quiosque-windows.md |
| D8 | Indicador claro “crédito pausado” / “ausente Xs” | `[x]` HUD |
| D9 | Soft lock (aviso) antes do hard lock por ausência | `[x]` HUD + sons 15s |
| D10 | Teste de câmera no wizard (preview + tip de luz) | `[~]` wizard + tip C270 |
| D11 | Relatório local de última falha (para balcão ver no PC) | `[x]` banner lastFailure |

---

## 5. Portal (site do cliente)

| # | Item | Status |
|---|------|--------|
| E1 | Landing, login, registro, enroll, termos LGPD | `[x]` |
| E2 | PWA / service worker | `[x]` básico |
| E3 | OfflineBanner quando loja offline | `[x]` |
| E4 | Seletor multi-Central | `[x]` |
| E5 | Compra hora ↔ R$ + personalizado | `[x]` |
| E6 | Histórico de pedidos curto (top 15) | `[x]` |
| E7 | Push no celular: “saldo acabando” | `[~]` VAPID + SW + botão dashboard |
| E8 | WhatsApp automático (saldo / Pix pago) | `[~]` Evolution hooks; falta instância |
| E9 | Cadastro facial: mais dicas de luz / ângulo | `[~]` |
| E10 | Avaliação Google pós-compra | `[x]` CTA |
| E11 | Página “como funciona a lan” (FAQ curto) | `[x]` |
| E12 | Idioma / acessibilidade básica (contraste, focus) | `[~]` |

---

## 6. Face / reconhecimento

| # | Item | Status |
|---|------|--------|
| F1 | OpenCV YuNet+SFace local | `[x]` |
| F2 | Match na API (não manda galeria a cada frame) | `[x]` |
| F3 | Presença exige VIP + rosto não longe demais | `[x]` |
| F4 | Guia de enroll: mínimo de amostras + qualidade | `[~]` |
| F5 | Re-enroll obrigatório se score médio cair | `[ ]` |
| F6 | Detecção de pose (lado / boné) avisando o cliente | `[ ]` |
| F7 | Benchmark CPU fraca (ONNX se precisar) | `[ ]` |

---

## 7. Segurança e LGPD

| # | Item | Status |
|---|------|--------|
| G1 | Segredos fortes / STRICT_SECRETS | `[~]` código ok; ops na loja |
| G2 | Tokens de estação hasheados | `[x]` |
| G3 | Rate limit login / recognize | `[x]` |
| G4 | Consentimento + termos | `[x]` |
| G5 | Revogar biometria mantendo conta | `[x]` |
| G6 | Purge de eventos antigos | `[x]` |
| G7 | Auditoria: quem staff-unlock / quem vendeu hora | `[x]` contas nominais + actor na Ajuda |
| G8 | Rotação de `STATION_SHARED_SECRET` com doc | `[ ]` |
| G9 | Política “1 face = 1 pessoa” no site e no balcão | `[~]` aviso no portal |

---

## 8. Infra, build e qualidade

| # | Item | Status |
|---|------|--------|
| H1 | CI GitHub Actions | `[x]` |
| H2 | Testes server + face | `[x]` |
| H3 | E2E admin Playwright | `[~]` básico |
| H4 | Sentry (erros portal + API) | `[~]` DSN opcional |
| H5 | Uptime Kuma / monitor externo | `[~]` docs/uptime-kuma.md |
| H6 | Litestream ou Syncthing do `data/` | `[~]` litestream + syncthing docs |
| H7 | Assinatura de código Windows (menos falso vírus) | `[ ]` |
| H8 | Script único “loja de pé” pós-reboot | `[~]` linux-loja / exe |
| H9 | Deploy portal sempre da **raiz do monorepo** (shared/) | `[~]` documentar no loja-ready |

---

## 9. Negócio / crescimento (fora do código puro)

| # | Item | Status |
|---|------|--------|
| I1 | URL do portal nas fichas Google Business | `[ ]` |
| I2 | Pacotes promo no Maps / Instagram | `[ ]` |
| I3 | Catálogo de games + WhatsApp | `[~]` catálogo WA existe |
| I4 | Agendamento (ex. INSS / horário marcado) via WA | `[ ]` |
| I5 | Treino rápido do balcão (1 página: liberar, vender, travar) | `[ ]` |
| I6 | Cartaz na loja: “saldo no site / face no PC” | `[ ]` |

---

## 10. Ordem sugerida (projeto todo)

1. **Ops A1–A6** — túnel, Pix, secrets, regenerar apps  
2. ~~**U1 + U2** — histórico 15 + compra hora/R$~~ **feito** ([`UX-LISTAS-E-COMPRA.md`](./UX-LISTAS-E-COMPRA.md))  
3. ~~**B6 / C9** — caixa e faturamento claros no Central~~ **feito**  
4. ~~**D5 / C12** — atualizar apps sem pendrive~~ **base** (electron-updater; falta release NSIS)  
5. ~~**H4 / H6** — erros visíveis + backup contínuo~~ **base** (Sentry DSN + Litestream doc)  
6. ~~**E7**~~ **base** web-push · ~~**E8**~~ **base** WhatsApp Evolution (falta conta)  
7. **I1–I6** — crescimento e operação humana  

---

## Onde está cada pedaço

| Doc | Assunto |
|-----|---------|
| [`loja-ready.md`](./loja-ready.md) | Checklist para a loja ligar Pix + túnel |
| [`UX-LISTAS-E-COMPRA.md`](./UX-LISTAS-E-COMPRA.md) | Histórico top 15 + compra hora/R$ |
| [`teorias-producao.md`](./teorias-producao.md) | Problemas de sessão no chão + mitigações |
| [`ECOSSISTEMA.md`](./ECOSSISTEMA.md) | Ferramentas externas (simples) |
| [`MELHORIAS.md`](./MELHORIAS.md) | Resumo do que já foi feito nesta rodada |
| [`REFINO.md`](./REFINO.md) | Limpeza de código em partes |
| [`roadmap.md`](./roadmap.md) | Arquitetura + prioridade de negócio |

Quando um item desta lista for feito no código, marque `[x]` aqui e, se for ops, marque também em `loja-ready.md`.
