const fs = require('fs');
const path = require('path');

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function getPath(obj, p) {
  if (!p) return obj;
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, p, val) {
  const keys = p.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isObj(o[keys[i]])) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = val;
}

// Small JSON file store with debounced, atomic writes.
class JsonStore {
  constructor(file, defaults = {}) {
    this.file = file;
    this.defaults = defaults;
    this.timer = null;
    let loaded = {};
    try {
      loaded = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      // Keep a copy of an unreadable file instead of silently overwriting the user's data.
      if (e.code !== 'ENOENT') try { fs.copyFileSync(file, file + '.corrupt'); } catch {}
    }
    this.data = deepMerge(defaults, loaded);
    this.listeners = [];
  }
  get(p) { return getPath(this.data, p); }
  set(p, val) {
    setPath(this.data, p, val);
    this.save();
    for (const fn of this.listeners) fn(p, val);
  }
  onChange(fn) { this.listeners.push(fn); }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('store write', this.file, e.message); }
  }
}

module.exports = { JsonStore, deepMerge, getPath };
