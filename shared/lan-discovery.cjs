const dgram = require("node:dgram");
const os = require("node:os");

const DISCOVERY_PORT = 48787;
const MAGIC = "LOJA_GEEK_CENTRAL_V1";

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (net.address.startsWith("172.1") || net.address.startsWith("172.2")) continue;
      out.push({ address: net.address, broadcast: net.broadcast || null });
    }
  }
  return out;
}

function encodeBeacon(payload) {
  return Buffer.from(
    JSON.stringify({
      magic: MAGIC,
      ts: Date.now(),
      ...payload,
    }),
    "utf8",
  );
}

function decodeBeacon(buf) {
  try {
    const o = JSON.parse(Buffer.from(buf).toString("utf8"));
    if (!o || o.magic !== MAGIC) return null;
    if (!o.lanIp || !o.apiPort) return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * Anuncia o GeekCentral na LAN (UDP broadcast).
 */
function startBeacon(getPayload, opts = {}) {
  const port = opts.port || DISCOVERY_PORT;
  const intervalMs = opts.intervalMs || 2000;
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  let timer = null;
  let stopped = false;

  socket.on("error", () => {
    /* ignore */
  });

  socket.bind(() => {
    try {
      socket.setBroadcast(true);
    } catch {
      /* ignore */
    }
  });

  const tick = () => {
    if (stopped) return;
    const payload = typeof getPayload === "function" ? getPayload() : getPayload;
    if (!payload?.lanIp || !payload?.apiPort) return;
    const msg = encodeBeacon(payload);
    // broadcast global + por interface quando possível
    try {
      socket.send(msg, 0, msg.length, port, "255.255.255.255");
    } catch {
      /* ignore */
    }
    for (const iface of lanAddresses()) {
      const bcast = iface.broadcast;
      if (bcast) {
        try {
          socket.send(msg, 0, msg.length, port, bcast);
        } catch {
          /* ignore */
        }
      }
    }
  };

  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 300);

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Escuta anúncios do GeekCentral.
 * @param {(peer: object) => void} onPeer
 */
function startListener(onPeer, opts = {}) {
  const port = opts.port || DISCOVERY_PORT;
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const seen = new Map();

  socket.on("message", (msg, rinfo) => {
    const peer = decodeBeacon(msg);
    if (!peer) return;
    const key = `${peer.lanIp}:${peer.apiPort}`;
    const next = {
      ...peer,
      from: rinfo.address,
      serverUrl: `http://${peer.lanIp}:${peer.apiPort}`,
      seenAt: Date.now(),
    };
    seen.set(key, next);
    onPeer(next, [...seen.values()]);
  });

  socket.on("error", () => {
    /* ignore */
  });

  socket.bind(port);

  return {
    getPeers() {
      const now = Date.now();
      const list = [];
      for (const [k, v] of seen) {
        if (now - v.seenAt > 8000) seen.delete(k);
        else list.push(v);
      }
      return list;
    },
    stop() {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}

module.exports = {
  DISCOVERY_PORT,
  MAGIC,
  startBeacon,
  startListener,
  lanAddresses,
  encodeBeacon,
  decodeBeacon,
};
