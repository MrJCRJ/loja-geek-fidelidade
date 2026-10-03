# Spec — Uso da estação (apps, energia, saúde, ocupante)

Atualizado em **2026-09-29**.  
Status: **implementado (código)** — validar na lan com GeekLock rebuild.

Relacionados: [`telemetria.md`](./telemetria.md) (ops atual) · [`teorias-producao.md`](./teorias-producao.md) · [`geeklock-handoff.md`](./geeklock-handoff.md)

## Objetivo

No GeekCentral, o **dono** vê o que acontece nos PCs liberados:

1. **Energia** — kWh / custo estimado (não medidor de tomada no v1)
2. **Apps** — o que está em foco enquanto a máquina está liberada
3. **Saúde sob carga** — CPU / GPU / RAM durante a ocupação
4. Tudo **amarrado a quem** está usando (VIP, staff, convidado)
5. **Inventário de hardware** por estação — GeekLock reporta o que o PC é (CPU/GPU NVIDIA ou AMD/RAM) para o Central adaptar energia, UI e defaults

Telemetria **ops** (face caiu, WS, disco) continua em [`telemetria.md`](./telemetria.md) / aba Saúde. Isto é um eixo novo: **uso**.

## Fora de escopo (explícito)

- Keylogger, clipboard, prints, áudio, campos de senha
- Export automático para nuvem
- Medidor físico (tomada inteligente) — opcional depois

## Ocupante (`occupant`)

| `kind` | Como nasce | Identidade gravada |
|--------|------------|-------------------|
| `vip` | Face + sessão com saldo | `customerId` + nome |
| `staff_timed` | Central: Destravar com minutos | `staff` + `durationSec` + motivo opcional |
| `staff_open` | Central: Destravar sem timer (até Travar / quit) | `staff` + confirmação obrigatória na UI |
| `guest_named` | Central: liberar com rótulo | rótulo 2–40 chars (+ atalhos últimos 5) + timed/open |

Hoje no código só existem `vip` e `staff` (auto-trava global `staffUnlockMaxSeconds`). O 1º entregável **cria** UI mínima + comandos para os kinds novos, para a coleta não mentir.

## Inventário de hardware (adaptação)

GeekLock, no boot / a cada N horas / sob comando:

- Coleta e envia ao Central (por `stationToken`):
  - CPU: nome, núcleos, (TDP se WMI/registry der; senão `null`)
  - GPU(s): vendor (`nvidia` \| `amd` \| `intel` \| `other`), modelo, VRAM se disponível
  - RAM total
  - OS build (opcional, útil pra suporte)
- Central grava em `stations` (ou tabela `station_hardware`) e mostra na aba Uso / Estações.
- **Adaptação automática:**
  - Se NVIDIA → sample de GPU via `nvidia-smi`/NVML (utilização + W quando existir)
  - Se AMD → sample via ADLX / caminho Windows disponível; se sensor falhar, GPU%/`W` null e usa só `tdpGpuW` × estimativa
  - Mistura N+A na mesma loja: cada estação escolhe o caminho pelo inventário dela
  - Sugere defaults de `tdpCpuW` / `tdpGpuW` / `idleW` a partir do modelo detectado (dono pode sobrescrever)

Loja com **NVIDIA e AMD misturados** é caso normal, não exceção.

## Coleta (GeekLock)

- Só com máquina **liberada** (`unlocked`) para uso/apps/energia minuto a minuto.
- Inventário hardware: também com locked (boot), para cadastrar o PC antes da 1ª sessão.
- Sample a cada **15 s** (unlocked):
  - processo em foco (`processName`, ex. `cs2.exe`)
  - título da janela **só se** flag Central `usageDetailedTitles=1` (sanitizado: corta query string, e-mails óbvios, paths longos)
  - CPU %, RAM %, GPU % / W conforme vendor do inventário
  - Watts estimados (ver calibração)
  - `occupant` atual (kind + ids)
- **Não** envia biometria, tokens, PIN, imagem.

## Agregação (Central / SQLite)

- Recebe samples → agrega em **1 linha/minuto/estação** (e por ocupação aberta).
- Campos típicos do agregado: `station_id`, `minute_ts`, `occupant_*`, `app_process` (dominante no minuto), `app_title` (se flag), `cpu_avg`, `gpu_avg`, `ram_avg`, `watts_avg`, `sample_count`.
- Retenção alinhada à telemetria ops (~**30 dias** / prune).
- Dados **só locais** no SQLite da loja.

## Calibração de energia

Por estação (manual **ou** sugerido pelo inventário):

- `tdpCpuW`, `tdpGpuW`, `idleW`
- Fórmula v1 (marcada como **estimativa** na UI):  
  `watts ≈ idleW + (cpu%/100)*tdpCpuW + (gpu%/100)*tdpGpuW`  
  Se o sensor devolver Watts reais (NVIDIA/AMD), preferir sensor e usar a fórmula só como fallback.

Na Config da loja:

- `energyTariffReaisPerKwh` → cards de **R$ estimado** no Dashboard

## UI GeekCentral

- Aba nova **Uso**: ranking de apps, kWh/R$ por estação e por período, detalhe por ocupante, filtros por `kind`; chip de GPU (NVIDIA/AMD) por estação.
- **Dashboard**: cards resumo (kWh hoje, top apps da loja, estações sob carga).
- Visibilidade: **só dono** (papel admin pleno) vê aba Uso e detalhe por pessoa. Balcão não.

Flag: **Títulos detalhados** (dono) — liga `usageDetailedTitles` nas estações.

## Destrave no Central (mínimo no 1º entregável) — cortesia longa

- **Destravar com tempo**: presets **15 / 30 / 60 / 120 / 240** min + campo livre.
- **Teto `staff_timed`:** **4 horas (240 min)** por padrão de produto (cortesia longa); configurável na Config até **8 h** se precisar.
- Separar do `staffUnlockMaxSeconds` legado do modo Admin antigo: o timed novo usa o teto de cortesia; não fica preso nos 10–20 min do auto-trava histórico.
- **Destravar aberto**: checkbox/confirm “fica até Travar” (sem teto de minutos).
- **Convidado**: campo rótulo + últimos 5 + escolha timed/open.
- VIP continua só por face (sem mudança de fluxo do cliente).

Comandos WS / API: estender além de `unlock_screen` genérico (payload com `kind`, `durationSec`, `guestLabel`) — detalhe na implementação.

## 1º entregável (ordem)

1. Schema SQLite (uso + hardware) + ingest + agregador 1 min  
2. Inventário hardware no GeekLock + coletor 15 s + envio por `stationToken`  
3. UI mínima dos destraves novos (kinds + cortesia longa)  
4. Aba Uso + cards Dashboard + flag títulos + TDP/tarifa + chip GPU  
5. Docs: atualizar `telemetria.md` (+ histórico em `arquivo/LISTA-COMPLETA.md` se relevante)

## Decisões (grill 2026-09-29)

| # | Decisão |
|---|--------|
| Meta | Energia + apps + saúde; coleta ampla |
| Ocupante | `vip` \| `staff_timed` \| `staff_open` \| `guest_named` |
| Identidade | IDs/nomes no SQLite local; sem export nuvem |
| Cadência | 15 s → agregado 1 min |
| UI | Aba Uso + Dashboard; só dono |
| Hardware | GeekLock inventaria CPU/GPU/RAM; loja NVIDIA+AMD misturada |
| GPU sensors | NVIDIA (NVML) + AMD (ADLX/fallback TDP); adapta por PC |
| Energia | TDP sugerido pelo inventário + override; tarifa R$/kWh; W real se sensor der |
| Títulos | Off por padrão; flag on = sanitizado (buscas via title bar, não teclado) |
| Staff UI | Presets até 4h + confirm open; guest = rótulo + últimos 5; teto cortesia 4h (config até 8h) |
| Ship | Coletor + inventário + UI mínima dos kinds |

## Antes de codar

~~Confirmar este doc com **ok para implementar**~~ — ok 2026-09-29; código no monorepo.

### Onde está no código

| Peça | Path |
|------|------|
| Schema / agregação / APIs | `server/src/station-usage.ts`, rotas em `station-routes.ts` |
| Inventário + sample Windows | `agent-windows/electron/hardware.cjs` |
| Loop 15s | `agent-windows/src/usage-collector.ts` + `App.tsx` |
| Aba Uso / destraves / config | `web/src/admin/tabs/UsoTab.tsx`, `EstacoesTab.tsx`, `ConfigTab.tsx`, `DashboardTab.tsx` |

Para valer nos PCs: rebuild GeekLock (versão seguinte) + reiniciar API/Central.
