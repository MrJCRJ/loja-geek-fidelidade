# Deploy amanhã — GeekLock uso/energia (1.1.6)

Atualizado em **2026-09-29 · noite**.  
Fazer em **2026-09-30** (após padaria / quando estiver no Kali da loja).

Spec: [`estacao-uso-telemetria.md`](./estacao-uso-telemetria.md)  
Handoff geral: [`geeklock-handoff.md`](./geeklock-handoff.md)

## O que já está pronto (hoje)

- Código no monorepo local (`/home/treegunn/loja-geek-fidelidade`): coletor, inventário NVIDIA/AMD, aba Uso, destraves `staff_timed` / `staff_open` / `guest_named`, config tarifa/TDP/títulos.
- Teste API: `server/tests/station-usage.test.ts` passando.
- **Ainda não:** `git commit` / push / release GitHub / rebuild NSIS / instalar nos PCs.

## Checklist deploy (ordem)

### 0. Antes de começar

- [ ] Confirmar que o pendrive **GEEKLOCK** (~15 G) está à mão (não misturar com outro USB).
- [ ] PC controle `192.168.3.90` com API que vai receber o código novo.
- [ ] Não publicar release do GeekCentral no mesmo `latest` sem `latest.yml` do Lock.

### 1. Commit + push (se ainda não)

```bash
cd /home/treegunn/loja-geek-fidelidade
git status
# revisar; commit só se pedir / ou fazer amanhã com mensagem focada em uso/energia
git push origin main
```

### 2. Versão GeekLock 1.1.6

```bash
cd /home/treegunn/loja-geek-fidelidade/agent-windows
# package.json → "version": "1.1.6"
npm run build:web
```

### 3. NSIS (Docker Wine — não usar Wine do host)

```bash
docker run --rm -e CSC_IDENTITY_AUTO_DISCOVERY=false \
  -v /home/treegunn/loja-geek-fidelidade/agent-windows:/project \
  -w /project electronuserland/builder:wine \
  bash -lc 'npx electron-builder --win nsis --x64 --publish never'
```

### 4. Release GitHub (latest)

```bash
cd /home/treegunn/loja-geek-fidelidade
# upload GeekLock-Setup-1.1.6.exe + .blockmap + latest.yml
gh release create v1.1.6 ...   # ou upload em release existente
gh release edit v1.1.6 --latest
```

### 5. Pendrive + API na loja

```bash
bash scripts/pack-pendrive.sh
# copiar pendrive/ → USB GEEKLOCK
# reiniciar API/Central com o código novo (npm / serviço atual)
```

### 6. Nos PCs da lan

- [ ] Instalar via `.bat` ou Setup 1.1.6 (ou deixar auto-update se já estavam em 1.1.5 com Setup).
- [ ] Liberar 1 PC (VIP ou staff) e conferir aba **Uso** no Central (dono).
- [ ] Conferir chip GPU (NVIDIA/AMD) e amostra de app após ~1–2 min.

## Critério de “feito”

- [ ] Release `v1.1.6` marcada **latest** com `latest.yml` do Lock
- [ ] Pelo menos 1 estação mandando hardware + minutos de uso
- [ ] Dashboard mostra kWh estimado / top app (ou “—” só se zero amostras)

## Não fazer amanhã (exceto se sobrar tempo)

- Assinatura de código Windows (H7)
- Tomada inteligente / medidor físico
- Keylog / clipboard (proibido de propósito)
