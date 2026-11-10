const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');

class State {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { conversations: {} };
    if (!this.data.conversations || typeof this.data.conversations !== 'object') throw new Error('Invalid state');
  }
  get(id) { return this.data.conversations[hash(id)]; }
  set(id, value) {
    this.data.conversations[hash(id)] = value;
    this.save();
  }
  getBaseline(id) { return this.data.baselines?.[hash(id)]; }
  setBaseline(id, value) {
    this.data.baselines ||= {};
    this.data.baselines[hash(id)] = value;
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, this.file);
  }
}
module.exports = { State, hash };
