/** Logs Electron só em dev ou com GEEKLOCK_DEBUG / GEEKCENTRAL_DEBUG=1 */
function createElectronDebug(namespace, isDev) {
  const enabled =
    Boolean(isDev) ||
    process.env.GEEKLOCK_DEBUG === "1" ||
    process.env.GEEKCENTRAL_DEBUG === "1";

  return {
    log(...args) {
      if (enabled) console.log(`[${namespace}]`, ...args);
    },
    warn(...args) {
      if (enabled) console.warn(`[${namespace}]`, ...args);
    },
  };
}

module.exports = { createElectronDebug };
