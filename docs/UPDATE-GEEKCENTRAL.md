# Atualizar GeekCentral (GitHub Releases)

Atualizado em **2026-09-23**.

## De casa × na loja

| Onde | O que fazer |
|------|-------------|
| **Casa** | Publicar a release. No celular (conta **dono**) → Config → **Atualizar Central**. |
| **Loja** | Motor em segundo plano. Não abre janela. |
| **Primeira vez** | Este código precisa já estar no PC. Versão velha: uma vez, bandeja → Status do motor → Atualizar, **ou** pendrive. Depois é o celular. |

O PC da loja usa o `gh` já logado ou o token em `data\config.json`. Sem colar token no celular.

`data\` (banco, config, túnel) **não** é apagada. GeekLock é outro pacote — [`GEEKLOCK-INSTALAR-ESTACOES.md`](./GEEKLOCK-INSTALAR-ESTACOES.md).

## No celular (dono)

1. Config → **Atualizar Central** → Verificar  
2. Se houver versão nova → **Baixar e instalar**  
3. Confirma: a loja fica 1–2 min sem API  
4. O motor baixa o ZIP, troca o `.exe` e reabre sozinho  

## Publicar uma versão (teu PC)

### GitHub Actions

Actions → **Release GeekCentral** → Run workflow → versão `1.1.1`  
Gera tag `central-v1.1.1` + `GeekCentral-win-x64.zip`.

### Local

```bash
UPLOAD=1 bash scripts/release-geekcentral.sh 1.1.1
# ou, runtime já pronto:
SKIP_PREPARE=1 UPLOAD=1 bash scripts/release-geekcentral.sh 1.1.1
```

Não use `git pull` na pasta do `.exe`.
