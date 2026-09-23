# Pack Cursor — mesmo agent na loja (Windows)

Atualizado em **2026-09-22**.

A **conta Cursor** sincroniza User Rules do app. **Não** sincroniza:

- `~/.cursor/rules/*.mdc`
- `~/.cursor/skills/**` (grilling / grill-me)

Sem estes arquivos o agent na loja **não grila** sozinho.

---

## No pendrive

`Cursor-Agent\cursor-pack\`

| Pasta | Conteúdo |
|-------|----------|
| `cursor-rules\` | `grill-automatico.mdc` + `loja-geek-handoff.mdc` |
| `cursor-skills\` | `grilling` + `grill-me` |
| `INSTALAR-NO-WINDOWS.ps1` | copia para o perfil do usuário Windows |
| `LEIA-ME.txt` | estes passos |

**Não** vai no pack da loja: Bom dia / Hermes / Cena (são do PC de casa).

---

## Instalar no PC da loja

1. Instalar Cursor (`CursorUserSetup-x64.exe`) e **login na mesma conta**.  
2. PowerShell (pode ser sem admin):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& D:\Cursor-Agent\cursor-pack\INSTALAR-NO-WINDOWS.ps1
```

(Ajuste `D:` se a letra do pendrive for outra.)

3. Fechar e reabrir o Cursor.  
4. Abrir a pasta do projeto (`C:\GeekCentral` ou clone do repo).  
5. Chat **Agent** — cole `Cursor-Agent\PROMPT-PARA-O-AGENT.txt`.

Teste: peça uma feature de UI. Esperado: **uma rodada de grilling** sem você digitar `/grill-me`.

---

## Paths

Rules/skills no Windows: `%USERPROFILE%\.cursor\rules` e `%USERPROFILE%\.cursor\skills`.  
O `loja-geek-handoff.mdc` aponta para `docs\` do repo — abra o workspace certo.
