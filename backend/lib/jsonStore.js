/**
 * lib/jsonStore.js
 * JSON file store with an in-memory mirror and a single-writer queue.
 *
 * Replaces the sync read-modify-write pattern on large cache files
 * (multi-MB readFileSync/writeFileSync blocked the event loop, and
 * concurrent enrichment phases could overwrite each other's updates).
 *
 * - Reads come from the in-memory mirror (no disk I/O on the request path).
 * - All mutations go through update()/set(), which serialize onto a single
 *   write chain — concurrent writers can never produce a torn or lost update.
 * - Writes are atomic: write to a temp file, then rename over the target.
 */

const fs     = require('fs');
const fsp    = require('fs/promises');
const path   = require('path');

class JsonStore {
  constructor(filePath, { defaultValue = null } = {}) {
    this.filePath = filePath;
    this.data = defaultValue;
    this._writeChain = Promise.resolve();
  }

  /**
   * One-time synchronous load, intended for module init / process startup.
   * Missing or unparsable file leaves the default value in place.
   */
  loadSync() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      // keep default
    }
    return this.data;
  }

  /** Current in-memory state. */
  get() {
    return this.data;
  }

  /** Replace the whole value and queue a persist. Returns the write promise. */
  set(data) {
    this.data = data;
    return this._persist();
  }

  /**
   * Mutate the current value and queue a persist. The mutator runs
   * synchronously against the in-memory mirror, so readers see the update
   * immediately even though the disk write is async.
   */
  update(mutator) {
    mutator(this.data);
    return this._persist();
  }

  _persist() {
    this._writeChain = this._writeChain.then(async () => {
      // Serialize inside the queued task so each write captures latest state
      const json = JSON.stringify(this.data);
      const tmp  = `${this.filePath}.tmp`;
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      await fsp.writeFile(tmp, json, 'utf8');
      await fsp.rename(tmp, this.filePath); // atomic on the same volume
    }).catch((err) => {
      console.error(`[JsonStore] Failed to persist ${this.filePath}:`, err.message);
    });
    return this._writeChain;
  }
}

module.exports = { JsonStore };
