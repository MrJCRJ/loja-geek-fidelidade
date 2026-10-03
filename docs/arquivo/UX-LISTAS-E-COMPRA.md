# Melhorias de UX — listas curtas e compra clara

Atualizado em **2026-08-26**.  
Objetivo: melhorias **do tipo produto/uso diário** — telas mais curtas, escolhas óbvias, menos confusão no balcão e no site.

Legenda: `[ ]` pendente · `[x]` feito

---

## Prioridade alta (pedidos da loja)

### U1 — GeekCentral: histórico só com os top 15
**Onde:** aba **Feed VIP** → “Histórico recente” (hoje a API manda até ~50 eventos).

**O que fazer:**
- Mostrar só os **15 mais recentes** na tabela.
- Texto discreto: “Mostrando os 15 mais recentes”.
- (Opcional) botão “Ver mais” que carrega +15, sem listona eterna na tela principal.

**Por quê:** loja lotada enche o histórico; a tela fica difícil de olhar no PC controle.

- [x] Feito (2026-08-26)

---

### U2 — Portal: comprar por **hora** ou por **dinheiro** (+ personalizado)
**Onde:** site Geek → dashboard → **Comprar horas** (hoje só packs em R$).

**O que fazer:**
1. Alternar modo: **Por horas** | **Por valor (R$)**.
2. Digitar um lado e o outro **converte na hora** (usa a tarifa atual do cliente, com desconto de assinante se houver).
   - Ex.: `2,5 h` → `R$ XX,XX`
   - Ex.: `R$ 25` → `~Y h`
3. Pacotes rápidos continuam (atalhos).
4. Campo **Personalizado**: a pessoa escolhe a quantidade que quiser (mínimo e máximo razoáveis, ex. R$ 5–R$ 500 ou 0,5h–20h).
5. Botão único **Pagar / Comprar** com o valor final em R$ (Pix precisa de reais).

**Por quê:** muita gente pensa em “quero 2 horas”; outra pensa em “tenho R$ 20”. Os dois caminhos devem existir.

- [x] Feito (2026-08-26)

---

## Mesmo estilo (listas curtas / menos scroll)

### U3 — GeekCentral: sessões do dia só top 15
**Onde:** aba Sessões (hoje até 100).

- Lista principal = 15 mais recentes.
- Stats do dia podem continuar completos em resumo (números), sem tabela enorme.

- [x] Feito (2026-08-26)

### U4 — GeekCentral: extrato do cliente (pontos / tempo) top 15
**Onde:** painel do cliente (hoje pontos já cortam em 12; alinhar tempo/pontos em **15** e título “Últimos 15”).

- [x] Feito (2026-08-26)

### U5 — Portal: histórico de pedidos top 15
**Onde:** dashboard → histórico de compras (API hoje até 40).

- Mostrar 15; “Ver anteriores” se precisar.

- [x] Feito (2026-08-26)

### U6 — GeekCentral: telemetria / Saúde top 15
**Onde:** aba Saúde → eventos recentes.

- Evitar muro de logs; 15 + filtro por nível.

- [x] Feito (2026-08-26)

### U7 — GeekCentral: feed “Ao vivo” com teto
**Onde:** Feed VIP → Ao vivo.

- Manter só as **últimas 15** mensagens em memória na tela (as mais novas empurram as velhas).

- [x] Feito (2026-08-26)

---

## Compra / saldo mais claros (portal)

### U8 — Mostrar conversão nos packs atuais
Enquanto U2 não sai: em cada pack, além de “~Xh”, mostrar **tarifa usada** (R$/h) e se tem desconto de assinante.

- [x] Feito (2026-08-26) — junto com U2

### U9 — Mínimo e máximo no personalizado
Evitar Pix de R$ 0,01 ou R$ 10.000 por engano. Mensagem clara se passar do limite.

- [x] Feito (2026-08-26) — R$ 5–500 · 0,5h–20h

### U10 — Arredondamento justo
Definir regra única: ex. horas com 1 casa decimal; reais com 2 casas; nunca cobrar a menos por arredondar a favor do sistema sem avisar.

- [x] Feito (2026-08-26)

### U11 — Confirmação antes do Pix
Resumo: “Você vai pagar **R$ 25,00** ≈ **2,1 h** na tarifa de R$ X/h” → Confirmar.

- [x] Feito (2026-08-26)

---

## Textos rápidos no GeekCentral (mesmo espírito)

### U12 — Clientes: busca já existe; garantir que lista não “explode”
Se a lista de clientes for muito grande, paginar ou virtualizar (ex. 30 por página). Só se a loja passar de ~100 VIP.

- [x] Feito (2026-08-26) — 30 por página

### U13 — Empty states já feitos; repetir o padrão
Qualquer lista nova: se vazia, uma frase + o que fazer (não tela em branco).

- [x] Mantido nos fluxos novos (caixa / FAQ)

### U14 — Labels curtos no celular do admin
Já melhorou no responsivo; revisar Feed/Sessões para caber sem scroll horizontal na tabela dos 15.

- [x] Feito (2026-08-26) — `table-compact` + labels curtos

---

## Ordem sugerida de implementação

| Ordem | Item | Esforço |
|------:|------|---------|
| 1 | **U1** Histórico Feed top 15 | Pequeno — feito |
| 2 | **U2** Compra hora ↔ dinheiro + personalizado | Médio — feito |
| 3 | U5 Histórico portal top 15 | Pequeno — feito |
| 4 | U3 / U4 / U6 / U7 tetos 15 | Pequeno — feito |
| 5 | U8–U11 polimento da compra | Pequeno–médio — feito |
| 6 | U12–U14 paginação / mobile | Pequeno — feito |

---

## Fora deste doc (já cobertos em outros lugares)

- Túnel / Pix live → [`loja-ready.md`](./loja-ready.md)
- Sessão órfã / saldo sem aviso → [`teorias-producao.md`](./teorias-producao.md)
- Ferramentas externas → [`ECOSSISTEMA.md`](./ECOSSISTEMA.md)

U1–U14 feitos no código (2026-08-26). Pendentes: ops da loja (A1–A6).
