# Litestream — backup contínuo do SQLite (GeekCentral)

Atualizado em **2026-08-26**.

O GeekCentral já faz **backup periódico** na Config. O Litestream é o reforço: copia o banco **a cada segundo** (WAL) para a nuvem (S3 / Cloudflare R2 / MinIO). Se o HD do PC controle morrer, você restaura.

## O que precisa

1. Conta em storage S3-compatível (recomendado: **Cloudflare R2** — download barato).
2. Binário [Litestream](https://litestream.io/install/) no PC controle (Linux ou Windows).
3. Arquivo de config (veja `deploy/litestream.yml.example`).

## Config rápida (R2)

1. Crie um bucket R2 (ex. `geek-loja-db`).
2. Crie API token com permissão de leitura/escrita no bucket.
3. Copie o exemplo:

```bash
cp deploy/litestream.yml.example /etc/litestream.yml
# edite path do .db, bucket, endpoint e chaves
```

4. Suba o serviço (Linux):

```bash
litestream replicate -config /etc/litestream.yml
```

Ou com systemd: [guia oficial](https://litestream.io/guides/systemd/).

## Restaurar

```bash
# para um arquivo novo (PC limpo)
bash scripts/litestream-restore.sh s3://SEU-BUCKET/fidelidade.db ./data/fidelidade.db
```

Depois: pare a API, substitua o `.db`, suba de novo a API / GeekCentral.

## Boas práticas

- Deixe o SQLite em **WAL** (o better-sqlite3 / Litestream tratam isso).
- Não aponte o Litestream para um caminho que o Docker apaga no redeploy.
- Teste restore **uma vez** em PC de teste antes de confiar.
- Mantenha também o backup local do Central (duas camadas).

## Syncthing (alternativa caseira)

Se não quiser nuvem: instale Syncthing no PC controle + notebook de backup e sincronize só a pasta `data/`. Mais simples, menos “point-in-time”.
