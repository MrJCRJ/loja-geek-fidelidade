# Setup — Google Business Profile API + MCP (comunidade)

Atualizado: **2026-10-04**  
Status: **preparação** — não instalar MCP até a API estar aprovada (cota ≠ 0).

Escopo agora: **só Loja GEEKS** (único perfil neste e-mail). Game Box / Lan / padaria = depois do acesso de gestor.

Combinado: Calendar/Gmail MCP **fora**. Interesse = Maps / Business Profile.

---

## Por que não “ligar e testar” já

1. As APIs de Business Profile **não são abertas** — a Google precisa **aprovar** o projeto Cloud.  
2. Antes da aprovação a cota costuma ser **0 QPM** → MCP chama e falha.  
3. MCP da comunidade só funciona **depois** de OAuth + aprovação.  
4. Conta gestora: **`mr.jociriju@gmail.com`** — hoje só **Loja GEEKS**; Game Box e Lan ainda sem acesso neste e-mail.

Referência oficial: [Prerequisites](https://developers.google.com/my-business/content/prereqs) · [Basic setup](https://developers.google.com/my-business/content/basic-setup).

---

## Fase 0 — Gestor nas fichas (faça quando puder)

Painel: [business.google.com](https://business.google.com)

E-mail a usar no login e no pedido de API: **`mr.jociriju@gmail.com`**.

Anote o papel quando abrir o painel (sem colar senha):

| Unidade | Aparece? | Papel / nota |
|---------|----------|--------------|
| Loja GEEKS — R. Santo Antônio, 6 | **sim** | ok neste e-mail (2026-10-04) |
| Game Box — Av. Getúlio Vargas | **não** | pedir gestor / transferência |
| Lan House Geeks — R. Mal. Rondon | **não** | pedir gestor / transferência |

**API/MCP:** começar só pela **Loja GEEKS** (perfil que você já gerencia). As outras entram depois do acesso.

### Uma API para todas as lojas?

**Sim — em geral um projeto Cloud + uma aprovação de API + um OAuth.**  
Não precisa de um “MCP/API por loja”. O servidor lista **todos os locais** em que o e-mail logado é Proprietário/Gerente.

| O quê | Quantos |
|-------|---------|
| Projeto Google Cloud + pedido Basic API Access | **1** (reutilizar) |
| MCP no Cursor | **1** |
| Fichas Maps (Loja GEEKS, Game Box, Lan, padaria…) | **várias** — cada uma aparece quando esse e-mail for gestor |

Hoje só Loja GEEKS aparece → a API só enxerga essa. Quando Game Box, Lan e padaria tiverem `mr.jociriju@gmail.com` como gestor, entram no **mesmo** projeto/MCP, sem novo pedido de API (na prática normal).

Só faria outro projeto Cloud se mudasse de conta Google ou a Google pedisse isso num caso raro.

Checklist espelhado em [`CONTAS-E-ACESSOS.md`](./CONTAS-E-ACESSOS.md).

Requisitos Google para pedir API (vale saber):

- Perfil **verificado** e ativo há **60+ dias**
- **Site** do negócio na ficha (Geek: portal Vercel)
- E-mail do pedido = **owner/manager** no GBP

---

## Fase 1 — Google Cloud (quando for a hora)

1. Logado como **`mr.jociriju@gmail.com`** → [Google Cloud Console](https://console.cloud.google.com/) → **Create project** (ex. `geeks-gbp-api`).  
2. Anotar o **Project number** (Dashboard → Project info).  
3. Pedir acesso: formulário [GBP API contact](https://support.google.com/business/contact/api_default)  
   - Tipo: **Application for Basic API Access**  
   - Mesmo e-mail gestora: **`mr.jociriju@gmail.com`**  
   - Informar Project number + site do negócio (portal Geek)  
4. Esperar review (Google cita até ~**14 dias**).  
5. **Aviso de resultado:** e-mail da Google para a conta que enviou o formulário (no seu caso **`mr.jociriju@gmail.com`** — confira spam/Promoções).  
6. Conferir também na prática: Cloud Console → APIs → quotas Business Profile  
   - **0 QPM** = ainda não / recusado  
   - **~300 QPM** = aprovado  
7. **Se recusar:** pode **pedir de novo** depois de corrigir o que faltava (perfil 60+ dias, verificado, site na ficha, e-mail gestor, Project number certo). Não adianta reenviar igual no mesmo dia.

**Não** gastar tempo instalando MCP enquanto a cota for 0.

---

## Fase 2 — Depois da aprovação

1. Habilitar APIs do projeto ([lista](https://developers.google.com/my-business/content/basic-setup)):  
   My Business Account Management, Business Information, Google My Business (legacy — posts/reviews), Performance se precisar, etc.  
2. OAuth consent screen + **OAuth client ID**.  
3. Teste rápido sem MCP: [OAuth Playground](https://developers.google.com/oauthplayground)  
   - Scope: `https://www.googleapis.com/auth/business.manage`  
   - GET `https://mybusinessaccountmanagement.googleapis.com/v1/accounts` → espera **200**  
4. **Só então** escolher e instalar MCP comunidade (ainda **não** decidido):  
   - candidatos: `narkov/gbp-mcp-server`, `mcp-google-business` (npx)  
5. Credenciais: `.env` local / `~/.cursor/mcp.json` com env — **nunca** commit no git nem colar secret no chat.  
6. Smoke test no Cursor: listar accounts/locations das 3 unidades Geek.

---

## Fase 3 — Padaria (depois de novembro)

- Transferir ou adicionar gestor no Business Profile da padaria.  
- Reusar o mesmo projeto Cloud **se** a Google permitir o mesmo e-mail/projeto; senão repetir gestor + escopo.  
- Não misturar com Geek no dia a dia sem querer (posts/reviews no local certo).

---

## Enquanto isso (sem API)

Continua valendo: rascunho no Cursor → você publica no Maps / business.google.com.  
Ver [`posts/`](./posts/) e [`respostas/`](./respostas/).

---

## Segurança

- Não commitar `client_secret`, refresh token, `credentials/*.json`.  
- Preferir e-mail Geeks (não pessoal) como gestor + dono do projeto Cloud.  
- MCP comunidade = código de terceiros: revisar README/repo na hora da instalação.
