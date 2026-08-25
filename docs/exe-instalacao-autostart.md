# Melhorias nos .exe — instalação, túnel e autostart

Atualizado em **2026-08-25**.  
Foco: **PC controle Windows** (GeekCentral) + estações (GeekLock).

Hoje:
- **GeekLock** já registra `openAtLogin` no Windows (liga com o PC).
- **GeekCentral** sobe API + face **só enquanto o .exe está aberto** — **não** tem autostart nem túnel embutido.
- Túnel Cloudflare existe só em script Linux (`scripts/portal-tunnel.sh`).

---

## Objetivo na loja

1. Copiar pasta do pendrive → rodar instalador/assistente **uma vez**.  
2. No boot do PC controle: **GeekCentral sobe sozinho** → API `:8787` + face `:8100` → (opcional) **túnel** → portal na Vercel fala com a loja.  
3. Nas estações: GeekLock continua ligando sozinho e acha a central fácil.

---

## A — Instalação mais fácil (os dois .exe)

| # | Melhoria | Detalhe |
|---|----------|---------|
| A1 | **Assistente de 1ª execução** (wizard) | Pasta destino sugerida (`C:\GeekCentral`, `C:\GeekLock`), atalho na Área de Trabalho e no Menu Iniciar. |
| A2 | **Copiar pasta com 1 clique** | “Instalar” = extrair `win-unpacked` + runtime para disco fixo (não rodar do pendrive). |
| A3 | **Firewall automático** | Regra Windows Defender Firewall para TCP **8787** (e 8100 se exposto) em rede privada, sem o usuário clicar “Permitir” às cegas. |
| A4 | **Teste de saúde pós-install** | Botão “Verificar”: API ok? Face ok? Webcam? Disco com espaço? |
| A5 | **LEIA-ME / checklist na UI** | Passos 1–5 na tela do GeekCentral (IP, senha admin, link admin) em português. |
| A6 | **Atualização simples** | “Atualizar desta pasta” (substituir binários mantendo `data\`). |
| A7 | **Desinstalar limpo** | Remover autostart + atalhos; opção de **manter** ou **apagar** `data\`. |

---

## B — GeekCentral: abrir com o Windows (igual GeekLock)

| # | Melhoria | Detalhe |
|---|----------|---------|
| B1 | **`app.setLoginItemSettings({ openAtLogin: true })`** | Mesmo padrão do GeekLock no `electron/main.cjs`. |
| B2 | **Abrir minimizado / bandeja** | `openAsHidden` + tray: loja não precisa ver a janela todo boot; API já sobe. |
| B3 | **Toggle na UI** | “Iniciar com o Windows” (ligar/desligar) + status “Autostart: ativo”. |
| B4 | **Single-instance** | Segunda abertura só foca a janela (não sobe 2 APIs). |
| B5 | **Atraso pós-login** | Esperar 10–30s após login do Windows (rede/disco HDD) antes de subir face/API — evita falha no boot lento. |
| B6 | **Recuperação** | Se API/face caírem, restart automático com backoff; notificação na bandeja. |

Ordem no boot sugerida:

```
Windows login
  → GeekCentral (hidden)
      → face :8100
      → API  :8787
      → (opcional) cloudflared tunnel
      → (opcional) abrir admin no browser
```

---

## C — API automática + túnel (portal / Pix)

| # | Melhoria | Detalhe |
|---|----------|---------|
| C1 | **Empacotar `cloudflared.exe`** no runtime do GeekCentral (ou download na 1ª config). |
| C2 | **Tela “Portal / Túnel”** no Central | Modo: desligado · quick tunnel · túnel **nomeado** (URL fixa). |
| C3 | **Autostart do túnel** junto com a API | Quando API healthy → sobe `cloudflared tunnel run …`. |
| C4 | **Mostrar URL pública** | Copiar `https://api.…` / trycloudflare para colar na Vercel (`VITE_API_URL`). |
| C5 | **Salvar config do túnel** em `data\config.json` | `tunnelName`, `credentialsPath`, `portalOrigin`, `enabled`. |
| C6 | **Health “Portal alcança a loja?”** | Ping `/api/health` via URL pública; pill verde/vermelho no Central. |
| C7 | **`PORTAL_ORIGIN` automático** | Gravar `https://loja-geek-portal.vercel.app` (editável) no env da API. |
| C8 | **Webhook Mercado Pago** | Mostrar URL `https://api…/api/portal/webhooks/mercadopago` para colar no painel MP. |
| C9 | **Firewall + “rede privada”** | Aviso se Wi‑Fi estiver em perfil público (bloqueia LAN). |

---

## D — Comunicação GeekLock ↔ Central (instalação das estações)

| # | Melhoria | Detalhe |
|---|----------|---------|
| D1 | **Descoberta na LAN** | Central anuncia IP (mDNS / UDP beacon); GeekLock lista “GeekCentral encontrado” sem digitar IP. |
| D2 | **QR no Central** | QR com `serverUrl` + dica; operador aponta o celular ou cola no `config.json`. |
| D3 | **Assistente no GeekLock** | 1ª vez: escolher central → nome da estação → claim → pronto. |
| D4 | **Autostart GeekLock** | Já existe no Windows; expor toggle na UI + “reinstalar autostart”. |
| D5 | **Modo offline claro** | Se central/túnel cair: mensagem “PC controle offline” (já há ideias no portal; espelhar no Lock). |

---

## E — Ordem sugerida de implementação

### Fase 1 — “liga sozinho” ✅ (2026-08-25)
1. ~~**B1–B4** — autostart + tray + single-instance no GeekCentral~~ **feito**
2. ~~**A3** — regra de firewall na 1ª execução~~ **feito** (botão + tentativa no setup)
3. ~~**B5–B6** — delay no boot + restart se face/API morrer~~ **feito** (watchdog)

### Fase 2 — “portal sempre no ar” ✅ (2026-08-25)
4. ~~**C1–C5** — cloudflared no Central + UI túnel + config em `data\`~~ **feito**
5. ~~**C6–C8** — health público + PORTAL_ORIGIN + URL webhook~~ **feito**

### Fase 3 — “instalação zero fricção” ✅ (2026-08-25)
6. ~~**A5–A7** — checklist na UI + atalhos Desktop/Iniciar + desinstalar local~~ **feito** (Central)
7. ~~**D1–D3** — beacon UDP LAN + QR no Central + assistente 1ª vez no GeekLock~~ **feito**
   - A1–A2 (copiar pasta/installer NSIS) ficam para pack futuro; atalhos + wizard cobrem o fluxo na loja.

---

## Critérios de pronto (aceite na loja)

- [x] GeekCentral: autostart Windows, bandeja, single-instance, delay no boot, watchdog API
- [x] GeekCentral: painel Portal/Túnel (quick + named), download cloudflared, copiar URL/webhook, health público
- [x] GeekCentral: checklist + QR da URL da API + atalhos + desinstalar local
- [x] GeekLock: assistente 1ª vez (descoberta LAN UDP + claim)
- [ ] Reiniciar o **PC controle Windows** → sem clicar em nada, em ~1–2 min: API `:8787` responde, face healthy. *(validar após pack)*
- [ ] Com túnel ligado: portal Vercel deixa de mostrar “lanhouse offline”.
- [ ] GeekLock nas estações acha a central (IP fixo ou descoberta) e autostart continua ok. *(código pronto — validar na loja)*
- [ ] Operador consegue copiar URL do túnel e URL do webhook Pix da própria tela do GeekCentral. *(UI pronta — validar na loja)*

---

## Fora do .exe (ainda necessário uma vez)

- Conta Cloudflare + túnel **nomeado** (URL fixa) — ver [`portal-api-tunnel.md`](./portal-api-tunnel.md)  
- `VITE_API_URL` na Vercel apontando para essa URL  
- `MP_ACCESS_TOKEN` para Pix real  

O .exe **automatiza** subir e manter isso; a criação do túnel nomeado / token MP continua sendo setup inicial (pode ser guiada na UI do Central).
