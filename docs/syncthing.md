# Syncthing — backup caseiro da pasta `data/`

Atualizado em **2026-08-26**.

Se não quiser Litestream/R2 agora: sincronize a pasta do banco com outro PC (notebook do dono).

## Ideia

- PC controle: pasta `data/` (onde está `fidelidade.db`)
- Notebook: pasta espelho `geek-backup/data/`
- Syncthing copia mudanças nos dois sentidos (ou só envio do Central → notebook)

## Passos

1. Instale [Syncthing](https://syncthing.net/) nos dois PCs.
2. No Central, compartilhe a pasta `data/` (modo “Send Only” se preferir).
3. No notebook, aceite o share.
4. **Pare a API** antes de restaurar um `.db` antigo no Central.

## Cuidados

- SQLite em uso: Syncthing pode copiar arquivo “no meio” da escrita. Prefira:
  - sincronizar a pasta de **backups** do GeekCentral (Config → backups), ou
  - Litestream para WAL contínuo ([`litestream.md`](./litestream.md)).
- Não exponha Syncthing na internet sem relay/auth.

## Relacionados

- [`litestream.md`](./litestream.md)
- [`ECOSSISTEMA.md`](./ECOSSISTEMA.md)
