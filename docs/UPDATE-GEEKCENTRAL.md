# Atualizar GeekCentral na loja (GitHub Releases)

Atualizado em **2026-09-22**.

## Decisões

| Item | Escolha |
|------|---------|
| Onde | Botão **Atualizar** só no **GeekCentral** |
| Pacote | ZIP completo (exe + runtime); mantém `data\` |
| Auth | Token GitHub classic com `contents:read` (repo privado) |
| GeekLock | Depois (Central manda update) — não nesta leva |

## Na loja (uso)

1. Crie um token em GitHub → Settings → Developer settings → Personal access tokens  
   - Escopo mínimo: acesso ao repo privado `MrJCRJ/loja-geek-fidelidade` (contents read)  
2. No GeekCentral → seção **Atualizar** → cole o token → **Verificar**  
3. Se houver versão nova → **Baixar e instalar** (app fecha, troca arquivos, reabre)  

A pasta `data\` (banco, config, segredos) **não** é apagada.

## Publicar uma versão (teu PC / CI)

### Opção A — GitHub Actions

Actions → **Release GeekCentral** → Run workflow → versão `1.1.0`  
Gera tag `central-v1.1.0` + asset `GeekCentral-win-x64.zip`.

### Opção B — Local

```bash
# pack completo + zip + upload
UPLOAD=1 bash scripts/release-geekcentral.sh 1.1.0

# se o runtime já estiver pronto:
SKIP_PREPARE=1 UPLOAD=1 bash scripts/release-geekcentral.sh 1.1.0
```

Requisitos locais: `gh` logado, Node, zip, rsync.

## Agent Cursor na loja

Com a mesma conta, o agent **não** sincroniza chat — mas pode orientar:  
*“abre o GeekCentral → Atualizar → Verificar”*  
ou, se houver clone git + toolchain (raro na loja): *“roda o release / pack”*.

O caminho suportado na loja é o **botão**, não `git pull` na pasta do .exe.

## GeekLock

Planejado: Central avisa estações / empacota update do Lock. Ainda não implementado.
