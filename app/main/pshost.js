const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');

// Long-running PowerShell helper speaking JSON lines. Restarts with backoff if it dies.
class PSHelper extends EventEmitter {
  constructor(script) {
    super();
    this.script = script;
    this.proc = null;
    this.backoff = 2000;
    this.stopped = false;
    this.queue = [];
  }
  start() {
    if (this.proc || this.stopped) return;
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.script], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc = p;
    this.ready = false;
    readline.createInterface({ input: p.stdout }).on('line', (line) => {
      if (!line || line[0] !== '{') return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.t === 'ready') {
        this.ready = true;
        this.backoff = 2000;
        for (const q of this.queue.splice(0)) this.send(q);
      }
      this.emit('msg', msg);
      this.emit(msg.t, msg);
    });
    p.stderr.on('data', (d) => this.emit('stderr', d.toString()));
    p.on('exit', () => {
      this.proc = null;
      this.ready = false;
      if (!this.stopped) {
        setTimeout(() => this.start(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, 60000);
      }
    });
  }
  send(obj) {
    if (!this.proc || !this.ready) { if (this.queue.length < 50) this.queue.push(obj); return; }
    try { this.proc.stdin.write(JSON.stringify(obj) + '\n'); } catch { /* restarting */ }
  }
  stop() {
    this.stopped = true;
    if (this.proc) { try { this.proc.stdin.write('{"c":"exit"}\n'); } catch {} setTimeout(() => { try { this.proc && this.proc.kill(); } catch {} }, 800); }
  }
}

module.exports = { PSHelper };
