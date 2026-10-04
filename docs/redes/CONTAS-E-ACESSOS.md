# Contas e acessos — Google, Meta, WhatsApp

Atualizado em **2026-10-03**.  
Objetivo: você (dono) ter as contas **Business** prontas para depois ligar API / eu ajudar com rascunhos oficiais.

Não compartilhe senha no chat. Quando precisar de token/API, use variável no `.env` ou painel — nunca commit.

---

## Visão geral

| Canal | Situação hoje | O que fazer |
|-------|----------------|-------------|
| **WhatsApp** | Evolution + bot na VPS (`loja-geek`, instância ativa) | Manter aparelho conectado; ajustar supervisão FAQ |
| **Google Maps / Business** | Perfis das unidades existem; review link Loja GEEKS ok | Confirmar que **você** é gestor em cada perfil |
| **Instagram + Facebook** | A criar / ligar no Meta Business | Criar Business + Página + IG profissional |

Ordem sugerida (mesmo em “paralelo” mental): **1 Google → 2 Meta → 3 WA fine-tune**.

---

## 1) Google Business Profile (Maps)

Serve para: ficha no Maps, posts no perfil, **responder avaliações**, horários, fotos.

### Por unidade

1. No celular ou PC, abra [business.google.com](https://business.google.com) com o **Gmail da loja** (ideal: um e-mail Geeks, não só pessoal).  
2. Confira se estas fichas aparecem como **Gerente** ou **Proprietário**:
   - Loja GEEKS — R. Santo Antônio, 6  
   - Game Box — Av. Getúlio Vargas  
   - Lan House Geeks — R. Mal. Rondon  
3. Se a ficha for de outra pessoa: peça **transferência** ou **adicione seu e-mail** como administrador.  
4. Em cada perfil, complete: horário, telefone, site (`https://loja-geek-portal.vercel.app`), categoria, fotos.  
5. Loja GEEKS — link de escrever avaliação (campanhas):  
   `https://search.google.com/local/writereview?placeid=ChIJrcvudQAxCQcRkpS8xkTbkg0`

### Posts e respostas (sem API ainda)

1. Abra o perfil no app **Google Maps** ou em business.google.com.  
2. **Postar:** Atualizações → criar post (foto + texto).  
3. **Avaliações:** Notificações → responder.  
4. Peça rascunho ao Cursor: “rascunho resposta avaliação 4 estrelas Lan” → salva em [`respostas/`](./respostas/).

### API depois (opcional)

Google Business Profile API exige projeto no Google Cloud + verificação do perfil. Só vale quando quiser que o sistema **liste/responda reviews sozinho**. Até lá: rascunho + você cola.

**Checklist Google**

- [ ] E-mail Geeks é gestor nas 3 fichas  
- [ ] Horário e WhatsApp corretos em cada uma  
- [ ] Site do portal no perfil  
- [ ] Testei criar 1 post e responder 1 avaliação  

---

## 2) Meta Business (Facebook + Instagram)

Serve para: Página Facebook, Instagram profissional, depois Graph API / inbox.

### Criar / organizar

1. Acesse [business.facebook.com](https://business.facebook.com) com o Facebook que será o **dono**.  
2. Crie um **Portfólio empresarial** (ex.: “Geeks Paulo Afonso”).  
3. Crie ou vincule **Página do Facebook** (uma Página “Geeks” ou uma por unidade — recomendado **uma Página principal Geeks** + destaques das unidades no About).  
4. No Instagram: perfil → **Conta profissional** (ou Criador) → vincular à Página Facebook.  
5. Em Configurações do Business: adicione o Instagram e a Página como ativos; você como admin.

### Posts e DMs (sem API ainda)

1. Publique pelo app IG / Meta Business Suite.  
2. DMs: Inbox do Business Suite.  
3. Rascunhos: peça ao Cursor e grave em [`posts/`](./posts/) ou [`respostas/`](./respostas/).

### API depois (opcional)

1. [developers.facebook.com](https://developers.facebook.com) → app tipo Business.  
2. Permissões típicas: `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `pages_messaging` (aprovação Meta pode demorar).  
3. Token de página de longa duração → `.env` (nunca no git).

**Checklist Meta**

- [ ] Portfólio Business criado  
- [ ] Página Facebook no ar  
- [ ] Instagram profissional ligado à Página  
- [ ] Sei abrir Business Suite no celular  
- [ ] (Depois) App Developer criado se formos automatizar  

---

## 3) WhatsApp (já na VPS)

Stack: `/opt/loja-geek-whatsapp` · containers `loja_evo_api` + `loja_wa_bot` · instância Evolution **`loja-geek`**.

| Número | Uso |
|--------|-----|
| `(75) 99186-9502` | Loja / Game Box / conserto / impressão |
| `(75) 98860-3747` | Lan / horas / INSS |

### Painel

- Bot na VPS: porta **8090** (só localhost na VPS; use SSH tunnel se for abrir do Kali:  
  `ssh -L 8090:127.0.0.1:8090 root@179.236.238.208` → http://127.0.0.1:8090 ).  
- Token: `PANEL_AUTH_TOKEN` no `.env` da VPS (não colar no chat).

### Modo desejado (combinado)

- FAQ conhecido → resposta automática ok.  
- Preço / estoque / caso novo → avisa equipe **só no plantão**.

**Plantão humano (2026-10-04):** seg–sáb **08:00–18:00** (Paulo Afonso). Domingo / fora do horário: sem WhatsApp para Luiz/Kauã/dono; cliente recebe aviso de retorno. Vars: `LOJA_HORARIO_INICIO`, `LOJA_HORARIO_FIM`, `LOJA_DIAS_ABERTOS`.

`SUPERVISION_MODE=false` = resposta ao cliente pode sair auto; plantão controla só o **aviso à equipe**.

### Pedido de avaliação

Já no GeekCentral/API: pós Pix/venda, link writereview + cooldown 60 dias. Textos: [`../atracao/TEXTOS-AVALIAR.txt`](../atracao/TEXTOS-AVALIAR.txt).

**Checklist WhatsApp**

- [ ] Celular ainda mostra Evolution em “Aparelhos conectados”  
- [ ] Consigo abrir o painel 8090 (tunnel)  
- [ ] FAQ em `knowledge/` da pasta whatsapp está atualizado (horário, PIX)  
- [ ] Sei a diferença: auto FAQ vs aprovação  

---

## 4) Como pedir ajuda ao Cursor no dia a dia

Exemplos de pedido:

1. `Rascunho post IG Geeks: promoção capas — tom TOM.md`  
2. `Rascunho resposta avaliação Google 5 estrelas Loja GEEKS`  
3. `Rascunho DM cliente perguntando preço de impressão — sem inventar valor`  
4. `Atualiza FAQ WhatsApp com horário X–Y`

Arquivos gerados vão em `docs/redes/posts/` ou `docs/redes/respostas/` com data no nome, ex.: `2026-10-03-post-ig-capas.md`.

---

## 5) O que eu (Cursor) **não** faço sem API / token

- Entrar no app com sua senha de IG/FB/Google.  
- Publicar sozinho em IG/FB/Maps.  
- Ler DMs do Instagram sem Graph API + permissões.

WhatsApp outbound (texto) **já** é possível via Evolution na VPS, com cuidado para não spam.
