# Como corrigir o build do GeekLock

## Problema

Release Windows abre com:

`Cannot find module '../../shared/lan-discovery.cjs'`

## No repositório

1. Localize `shared/lan-discovery.cjs` (exporta `startListener`).
2. Confirme que `agent/electron/main.cjs` (ou equivalente) continua com:

```js
const { startListener } = require("../../shared/lan-discovery.cjs");
```

3. Ajuste o script de pack para **uma** destas opções:

### Opção A — incluir shared no asar (preferida se mantém o require)

Antes do `electron-builder`, copie:

```
shared/  →  <pacote-agent>/shared/
```

e mude o require para:

```js
require("../shared/lan-discovery.cjs")
```

(assim o arquivo fica **dentro** do asar).

### Opção B — extrair shared para `resources/shared`

No `extraResources` do electron-builder:

```json
{
  "extraResources": [
    { "from": "../shared", "to": "shared" }
  ]
}
```

Mantém o require `../../shared/...` (resolve para `resources/shared` fora do asar).

4. Rebuild Windows, teste **sem** pasta stub manual.
5. Atualize o pendrive `D:\GeekLock\` + `GeekLock-pendrive.zip`.

## Stub temporário (loja)

Enquanto o release não sai, copie `workaround/lan-discovery.cjs` para:

- `<instalacao>\resources\shared\lan-discovery.cjs`

Detalhes: `RELATORIO.md`.
