# GeekCentral — UI para tela pequena

Atualizado em **2026-09-22**.  
**Status:** plano documentado — implementar no **mesmo build** que [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md).

---

## Contexto (loja)

PC do GeekCentral com monitor muito pequeno: layout “quebra” (cortes, janela grande demais, wizard difícil). Resolução exata desconhecida — tratar como **pior caso** (~1024×600 / 1280×720).

Hoje: janela Electron **920×780**; `.grid` 2 colunas até 700px; `.shell` max 880px + padding largo.

---

## Decisões fechadas

| # | Decisão | Escolha |
|---|--------|---------|
| 1 | Problema | Tela pequena; quebra geral (sem print/resolução) |
| 2 | Quando | **Junto** no próximo build (com código 6 dígitos) |
| 3 | Estratégia | **(C)** Responsivo **+** modo **Compacto** (toggle) |
| 4 | Hierarquia no ecrã pequeno | Status (API/Face) + **código pareamento** + túnel resumido no topo; resto com scroll |
| 5 | Agora | Só documentar |

---

## Comportamento desejado

### A — Responsivo (sempre)

- Janela: `minWidth`/`minHeight` baixos; ao abrir, **não** forçar 920×780 se o work area for menor — usar `screen.getPrimaryDisplay().workAreaSize`.
- Layout: 1 coluna em larguras baixas; sem scroll horizontal.
- Padding/fonte menores abaixo de ~800px de largura.
- Wizard de 1ª vez e painéis (Portal/Túnel, estações) empilhados e scrolláveis.

### B — Modo Compacto (toggle)

- Preferência em `data/config.json` (ex.: `uiCompact: true`) + checkbox na UI.
- Compacto: tipografia menor, pills/botões mais densos, menos margem nos `.panel`.
- Pode ligar automaticamente se `workArea.height < 700` (opcional na implementação).

### C — Ordem visual (topo → baixo)

1. Brand + pills Online / API / Face  
2. **Código de 6 dígitos** (pareamento) — grande o suficiente para ler de longe, mas sem estourar a largura  
3. Túnel / URL pública (resumo + copiar)  
4. Checklist + atalhos + config avançada (scroll)

---

## Checklist de implementação (próximo build)

- [ ] `BrowserWindow`: size baseado no `workArea`; min ~640×480  
- [ ] CSS: breakpoints (ex. 800 / 600) + classe `.compact`  
- [ ] Toggle “Modo compacto” + persistência  
- [ ] Reordenar seções conforme hierarquia acima (+ bloco do código curto)  
- [ ] Testar em viewport 1024×600 e 1280×720 (DevTools ou VM)  
- [ ] Regenerar pendrive GeekCentral  

---

## Relacionados

- Pareamento: [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md)  
- Autostart: [`exe-instalacao-autostart.md`](./exe-instalacao-autostart.md)  
- Setup loja: [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md)  
