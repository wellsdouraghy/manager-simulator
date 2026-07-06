// ============================================================================
// storage.js — thin localStorage wrapper. Namespaced keys, all guarded with
// try/catch so private-mode / disabled-storage never throws into the game.
// ============================================================================

const KEYS = {
  best: 'ms:best',
  augustUnlocked: 'ms:augustUnlocked',
  augustOn: 'ms:augustOn',
  soundOn: 'ms:soundOn',
  tugTutorial: 'ms:tugTutorial', // seen the hold-to-negotiate hint
};

function readNum(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
function writeRaw(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode — ignore */
  }
}
function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    return v === '1' || v === 'true';
  } catch {
    return fallback;
  }
}

export function createStorage() {
  return {
    getBestCommission() {
      return readNum(KEYS.best, 0);
    },
    setBestCommission(n) {
      writeRaw(KEYS.best, Math.round(n));
    },
    getAugustUnlocked() {
      return readBool(KEYS.augustUnlocked, false);
    },
    setAugustUnlocked(v) {
      writeRaw(KEYS.augustUnlocked, v ? '1' : '0');
    },
    getAugustOn() {
      return readBool(KEYS.augustOn, false);
    },
    setAugustOn(v) {
      writeRaw(KEYS.augustOn, v ? '1' : '0');
    },
    getSoundOn() {
      return readBool(KEYS.soundOn, true); // default ON
    },
    setSoundOn(v) {
      writeRaw(KEYS.soundOn, v ? '1' : '0');
    },
    getTugTutorialSeen() {
      return readBool(KEYS.tugTutorial, false);
    },
    setTugTutorialSeen(v) {
      writeRaw(KEYS.tugTutorial, v ? '1' : '0');
    },
  };
}
