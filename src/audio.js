import { resourceURL } from './resources.js';

export class SprayAudio {
  muted = false;
  spraying = false;

  arm() {
    if (this.context) {
      this.context.resume().catch(() => {});
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    this.context = new Audio();
    this.context.resume().catch(() => {});
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    this.ready = Promise.all(['spray-loop.wav', 'valve.wav'].map(async name => {
      const response = await fetch(resourceURL('./assets/' + name));
      return this.context.decodeAudioData(await response.arrayBuffer());
    })).then(([loop, valve]) => {
      this.valve = valve;
      const source = this.context.createBufferSource();
      source.buffer = loop;
      source.loop = true;
      source.connect(this.gain);
      source.start();
      this.update();
    }).catch(() => {});
  }

  tap() {
    this.ready?.then(() => {
      if (this.muted || !this.valve || document.hidden) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = .22;
      source.buffer = this.valve;
      source.connect(gain).connect(this.context.destination);
      source.start();
    });
  }

  spray(active) { this.spraying = active; this.update(); }
  mute(muted) { this.muted = muted; this.update(); }

  update() {
    if (!this.context) return;
    const value = this.spraying && !this.muted && !document.hidden ? .15 * .44 : 0;
    if (this.lastValue === value) return;
    this.lastValue = value;
    const time = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setTargetAtTime(value, time, value > 0 ? .014 : .026);
  }
}
