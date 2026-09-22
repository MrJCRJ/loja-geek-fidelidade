# Correção GeekLock — relatório da loja (2026-09-22)

## Diagnóstico

O `GeekLock.exe` do pendrive (build GitHub `main`, 2026-09-22 12:33) **não inicia** sem gambiarra.

### Erro exato ao abrir

```
A JavaScript error occurred in the main process
Uncaught Exception:
Error: Cannot find module '../../shared/lan-discovery.cjs'
Require stack:
- C:\GeekLock\resources\app.asar\electron\main.cjs
```

### Causa raiz

O `electron/main.cjs` faz:

```js
const { startListener } = require("../../shared/lan-discovery.cjs");
```

No monorepo isso aponta para `shared/lan-discovery.cjs` (fora do pacote do agent).  
O **asar do release não inclui a pasta `shared/`**, então o require quebra.

Resolução do caminho a partir do asar:

- `__dirname` = `...\resources\app.asar\electron`
- `../../shared/lan-discovery.cjs` → `...\resources\shared\lan-discovery.cjs`

Conteúdo do asar (topo): `node_modules`, `dist`, `electron`, `package.json` — **sem `shared`**.

### API esperada do módulo

Usado em `main.cjs` (IPC `discovery:*`):

- `startListener(onChange)` → `{ getPeers(), stop() }`
- Peers na UI: `{ serverUrl, unitName }`

---

## Workaround aplicado na loja (temporário)

Arquivo criado em:

- `C:\GeekLock\resources\shared\lan-discovery.cjs`
- `C:\GeekLock\shared\lan-discovery.cjs` (cópia extra)

Cópia no pendrive:

- `workaround/lan-discovery.cjs`
- `D:\GeekLock\resources\shared\lan-discovery.cjs`
- `D:\GeekLock\shared\lan-discovery.cjs`

Com isso o app **abre** (janela título `GeekLock`).  
É um **stub UDP** (porta 8788, magic `GEEKCENTRAL`) — **não substitui** o módulo real do repo.

---

## Estação nesta máquina

| Campo | Valor |
|-------|--------|
| PC | `DESKTOP-FEBUOIS` |
| IP | `192.168.3.251` |
| Instalação | `C:\GeekLock` |
| Central esperado (LEIA-ME) | `http://192.168.3.70:8787` |
| Central no momento do setup | **offline** (ping/porta 8787 sem resposta) |

Config salva pela estação (ver `config-estacao/config-C-GeekLock.json`):

- `stationName`: `PC-01`
- `serverUrl`: `http://192.168.3.70:8787`
- `setupComplete`: `true`
- `stationToken`: presente
- `staffPin`: `2580`
- `sharedSecret`: mesmo do pendrive

---

## Correção definitiva (no PC de build / GitHub)

1. Garantir que `shared/lan-discovery.cjs` exista no repo.
2. No empacotamento Electron (electron-builder / forge), **incluir `shared/` no asar**  
   **ou** alterar o require para um path interno, ex.: `../shared/lan-discovery.cjs` e copiar `shared` para dentro do pacote do agent antes do pack.
3. Gerar novo release Windows e substituir `D:\GeekLock\` (e zip).
4. Remover o stub externo depois que o asar vier completo.

### Checklist de validação pós-build

- [ ] Abrir `GeekLock.exe` sem pasta `resources/shared` externa → sem diálogo `Error`
- [ ] Assistente lista Centrais na LAN (`unitName` + `serverUrl`)
- [ ] Setup salva `config.json` ao lado do `.exe`
- [ ] Sem Central → tela travada; com Central + face VIP → libera

---

## Arquivos nesta pasta

| Pasta/arquivo | Conteúdo |
|---------------|----------|
| `RELATORIO.md` | este documento |
| `COMO-CORRIGIR-BUILD.md` | passos curtos no repo |
| `workaround/lan-discovery.cjs` | stub usado na loja |
| `config-estacao/` | configs pendrive + C:\GeekLock |
| `evidencias/` | `main.cjs`, `config.cjs`, `preload.cjs`, `package.json`, LEIA-MEs, info do PC |

## Também no GeekCentral

O mesmo `require("../../shared/lan-discovery.cjs")` existe em `agent-central-windows/electron/services.cjs` (carregado no boot). Sem `resources/shared/`, o **GeekCentral.exe** também abre com o mesmo diálogo JavaScript — e a porta 8787 fica offline (como no PC `192.168.3.70` no dia do teste).

Correção no pack: `extraResources` + failsafe nos scripts `pack-pendrive*.sh`.

