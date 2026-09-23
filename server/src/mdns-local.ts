import dgram from "node:dgram";
import os from "node:os";
import { SHOP_HOST } from "./request-scope.js";

const MDNS_ADDR = "224.0.0.251";
const MDNS_PORT = 5353;

function lanIpv4(): string | null {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (net.address.startsWith("172.1") || net.address.startsWith("172.2")) continue;
      return net.address;
    }
  }
  return null;
}

function encodeName(name: string): Buffer {
  const labels = name.replace(/\.$/, "").split(".");
  const parts = labels.map((label) => {
    const buf = Buffer.alloc(1 + label.length);
    buf.writeUInt8(label.length, 0);
    buf.write(label, 1);
    return buf;
  });
  return Buffer.concat([...parts, Buffer.from([0])]);
}

function readName(buf: Buffer, offset: number): { name: string; next: number } {
  const labels: string[] = [];
  let jumped = false;
  let next = offset;
  let guard = 0;
  while (guard++ < 20) {
    if (offset >= buf.length) break;
    const len = buf[offset];
    if (len === 0) {
      if (!jumped) next = offset + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[offset + 1];
      if (!jumped) next = offset + 2;
      offset = ptr;
      jumped = true;
      continue;
    }
    labels.push(buf.subarray(offset + 1, offset + 1 + len).toString("utf8"));
    offset += 1 + len;
    if (!jumped) next = offset;
  }
  return { name: labels.join(".").toLowerCase(), next };
}

function buildAResponse(qname: string, ip: string): Buffer {
  const nameBuf = encodeName(qname);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(0, 4);
  header.writeUInt16BE(1, 6);
  const q = Buffer.concat([nameBuf, Buffer.from([0x00, 0x01, 0x00, 0x01])]);
  const rdata = Buffer.from(ip.split(".").map((n) => Number(n)));
  const answer = Buffer.concat([
    nameBuf,
    Buffer.from([0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x04]),
    rdata,
  ]);
  return Buffer.concat([header, q, answer]);
}

export function startGeekLocalMdns(getIp: () => string | null = lanIpv4): { stop: () => void } {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const wanted = SHOP_HOST.toLowerCase();

  socket.on("error", () => {
    /* best-effort — Android/Windows podem bloquear 5353 */
  });

  socket.on("message", (msg) => {
    try {
      if (msg.length < 12) return;
      const qdcount = msg.readUInt16BE(4);
      if (qdcount < 1) return;
      let offset = 12;
      for (let i = 0; i < qdcount; i++) {
        const { name, next } = readName(msg, offset);
        offset = next + 4;
        if (name !== wanted && name !== `${wanted}.`) continue;
        const ip = getIp();
        if (!ip) return;
        const packet = buildAResponse(wanted, ip);
        socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_ADDR);
      }
    } catch {
      /* ignore */
    }
  });

  function announce() {
    const ip = getIp();
    if (!ip) return;
    const packet = buildAResponse(wanted, ip);
    try {
      socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_ADDR);
    } catch {
      /* ignore */
    }
  }

  socket.bind(MDNS_PORT, () => {
    try {
      socket.addMembership(MDNS_ADDR);
      socket.setMulticastTTL(255);
      socket.setMulticastLoopback(true);
    } catch {
      /* ignore */
    }
    announce();
  });

  const timer = setInterval(announce, 15_000);

  return {
    stop() {
      clearInterval(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}
