# GeekCentral no Raspberry Pi (sem face)

Alvo: **Pi 3 B+** (1 GB) como mini-servidor na loja.

- API Node em `:8787` (admin web incluso)
- **Sem** face-service
- **cloudflared** para `api.geekloja.com.br` / `admin.geekloja.com.br`
- Rede: cabo Ethernet, IP fixo **192.168.3.70**

## Credenciais do cartão

Arquivo local (não vai pro Git): `~/.agents/geekcentral-pi-credentials.txt`

## Ordem na loja

1. Fonte **5 V ≥ 2,5 A**, cartão gravado, cabo Ethernet na rede `192.168.3.x`.
2. Se ainda estiver em DHCP: `ssh geek@<IP>` e rode `sudo bash /opt/geekcentral/set-static-ip.sh`.
3. `sudo bash /opt/geekcentral/install.sh`
4. Túnel (uma vez): `cloudflared tunnel login` e configure como em `docs/SETUP-WINDOWS-LOJA.md` (túnel `loja-geek-api`).
5. Testes:
   - `http://192.168.3.70:8787/api/health`
   - `https://api.geekloja.com.br/api/health` (após túnel)

## GeekLocks

`serverUrl` continua `http://192.168.3.70:8787`. Face/enroll fica noutro PC se precisar — este Pi só o motor + túnel.
