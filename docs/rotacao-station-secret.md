# Rotação do `STATION_SHARED_SECRET`

Atualizado em **2026-08-26**.

O segredo compartilhado permite o **claim** de uma estação (GeekLock pede o token na 1ª config). Não é o token da estação em si — cada PC guarda um token hasheado depois do claim.

## Quando rotacionar

- Suspeita de vazamento (pendrive perdido, ex-funcionário).
- Troca periódica de segurança (ex. a cada 6–12 meses).
- Após ativar `STRICT_SECRETS=1` em produção.

## Passos

1. No PC controle, edite o `.env` (ou config do GeekCentral):

```bash
STATION_SHARED_SECRET=novo-segredo-longo-aleatorio
```

2. Reinicie a API / GeekCentral.
3. **Estações já claimadas continuam funcionando** (usam o token individual).
4. Só estações **novas** ou que precisam **re-claim** usam o segredo novo:
   - No GeekLock: apague/refaça o setup (wizard) e informe o segredo novo.
5. Não reutilize o default `loja-geek-station-secret`.

## O que não fazer

- Não colocar o segredo no portal Vercel nem em print de WhatsApp.
- Não compartilhar o mesmo `.env` completo em pendrives sem criptografia.

## Relacionados

- [`loja-ready.md`](./loja-ready.md)
- [`ECOSSISTEMA.md`](./ECOSSISTEMA.md)
