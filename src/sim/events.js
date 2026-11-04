// A tiny event bus. Systems talk through these instead of calling each other.
// Events in use: tilesChanged {x0,y0,x1,y1}, exhibitsChanged, notify {text, at}, dayEnded {day}, escaped {animal}.

export class Bus {
  constructor() { this.subs = new Map(); }
  on(type, fn) { (this.subs.get(type) || this.subs.set(type, []).get(type)).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.subs.get(type); if (l) l.splice(l.indexOf(fn) >>> 0, 1); }
  emit(type, data) { for (const fn of [...(this.subs.get(type) || [])]) fn(data); }
}
