const { execFile } = require("node:child_process");

/**
 * Tenta liberar a porta da API no firewall (rede privada).
 * Pode falhar sem elevação — nesse caso só registra o erro.
 * @param {number} port
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
function ensureApiFirewallRule(port = 8787) {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: true });
  }
  const name = "GeekCentral API";
  const args = [
    "advfirewall",
    "firewall",
    "add",
    "rule",
    `name=${name}`,
    "dir=in",
    "action=allow",
    "protocol=TCP",
    `localport=${Number(port) || 8787}`,
    "profile=private",
  ];
  return new Promise((resolve) => {
    execFile("netsh", args, { windowsHide: true }, (err, _stdout, stderr) => {
      if (!err) {
        resolve({ ok: true });
        return;
      }
      const msg = String(stderr || err.message || err);
      // regra já existe
      if (/already exists|já existe/i.test(msg)) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, error: msg.trim() || "Falha ao criar regra de firewall (rode como admin uma vez)" });
    });
  });
}

module.exports = { ensureApiFirewallRule };
