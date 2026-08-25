# Telemetria e saúde em produção

Atualizado em **2026-08-25**.

## Objetivo

Receber **logs operacionais** enquanto a loja usa o sistema, ver falhas cedo (face caiu, disco cheio, estação desconectou) e melhorar com base em uso real — **sem** enviar fotos, embeddings faciais, senhas ou tokens.

## Onde fica

| Peça | Função |
|------|--------|
| Tabela `system_events` (SQLite) | Eventos estruturados na loja |
| Probe a cada 60s | Face + RAM + disco |
| `GET /api/admin/diagnostics` | Resumo + alertas |
| `GET /api/admin/telemetry` | Lista de logs |
| `POST /api/telemetry/events` | GeekLock / admin envia eventos |
| Aba **Saúde** no GeekAdmin | UI para o operador |

Retenção: ~30 dias / máx. ~5000 eventos (prune automático).

## O que é coletado

- Boot da API, probe ok / face down / recursos sob pressão  
- Estação desconectou do WebSocket  
- Face-service down no recognize  
- Comandos admin (mensagem / reload)  
- GeekLock: mensagem remota, WS close, boot offline  

**Nunca:** `imageBase64`, embeddings, PIN, `stationToken`, senhas (sanitizer remove chaves sensíveis).

## Como usar na loja

1. Abra o admin → aba **Saúde**.  
2. Veja alertas (vermelho/amarelo) e a tabela de eventos.  
3. Filtre por `error` / `warn` quando algo “estranho” acontecer com clientes.  

Export futuro (opcional): backup SQLite já inclui `system_events`; para centralizar várias unidades, cada GeekCentral tem `unitId` próprio.

## Multi-unidade

Cada PC controle = uma `unitId` / `unitName` (Config). O portal lista as 3 unidades comerciais + catálogo WhatsApp; o GeekLock da lan aponta só para o Central da lan.
