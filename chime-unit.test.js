const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const chimeJs = fs.readFileSync("chime.js", "utf8");

function createDomWithAudioTracking() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    runScripts: "dangerously"
  });

  const calls = {
    oscillators: [],
    gains: [],
    currentTime: 0
  };

  dom.window.AudioContext = class {
    constructor() {
      calls.currentTime = 0;
    }
    createOscillator() {
      const osc = {
        type: null,
        frequency: {
          values: [],
          setValueAtTime(value, time) {
            this.values.push({ value, time });
          }
        },
        connect: () => {},
        start(time) { osc.startTime = time; },
        stop(time) { osc.stopTime = time; }
      };
      calls.oscillators.push(osc);
      return osc;
    }
    createGain() {
      const gain = {
        gain: {
          ramps: [],
          setValueAtTime(value, time) {
            this.ramps.push({ type: "set", value, time });
          },
          linearRampToValueAtTime(value, time) {
            this.ramps.push({ type: "linear", value, time });
          },
          exponentialRampToValueAtTime(value, time) {
            this.ramps.push({ type: "exponential", value, time });
          }
        },
        connect: () => {}
      };
      calls.gains.push(gain);
      return gain;
    }
    get destination() { return {}; }
    get currentTime() { return calls.currentTime; }
  };

  dom.window.eval(chimeJs);
  return { dom, calls };
}

test("playTone creates oscillator with correct frequency and type", () => {
  const { dom, calls } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.playButtonChime();

  assert.equal(calls.oscillators.length, 1);
  const osc = calls.oscillators[0];
  assert.equal(osc.type, "sine");
  assert.equal(osc.frequency.values[0].value, 440); // A4
});

test("playTone applies gain envelope to avoid clicking", () => {
  const { dom, calls } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.playButtonChime();

  assert.equal(calls.gains.length, 1);
  const ramps = calls.gains[0].gain.ramps;

  // Should start at 0, ramp up to 0.1, then decay
  assert.equal(ramps[0].type, "set");
  assert.equal(ramps[0].value, 0);
  assert.equal(ramps[1].type, "linear");
  assert.equal(ramps[1].value, 0.1);
  assert.equal(ramps[2].type, "exponential");
  assert.equal(ramps[2].value, 0.001);
});

test("playUpliftingChime plays C major arpeggio (C4, E4, G4, C5)", () => {
  const { dom, calls } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.playUpliftingChime();

  assert.equal(calls.oscillators.length, 4);

  const frequencies = calls.oscillators.map(
    (osc) => osc.frequency.values[0].value
  );

  assert.equal(frequencies[0], 261.63); // C4
  assert.equal(frequencies[1], 329.63); // E4
  assert.equal(frequencies[2], 392.00); // G4
  assert.equal(frequencies[3], 523.25); // C5

  // All should be sine type
  calls.oscillators.forEach((osc) => {
    assert.equal(osc.type, "sine");
  });
});

test("playUpliftingChime staggers notes with increasing start times", () => {
  const { dom, calls } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.playUpliftingChime();

  const startTimes = calls.oscillators.map((osc) => osc.startTime);
  assert.equal(startTimes[0], 0);   // 0s
  assert.equal(startTimes[1], 0.1); // 0.1s
  assert.equal(startTimes[2], 0.2); // 0.2s
  assert.equal(startTimes[3], 0.3); // 0.3s
});

test("playUpliftingChime final note has longer duration than earlier notes", () => {
  const { dom, calls } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.playUpliftingChime();

  // First three notes: duration 0.3 (stop - start)
  // Last note: duration 0.5
  const durations = calls.oscillators.map((osc) => osc.stopTime - osc.startTime);
  const approx = (a, b) => Math.abs(a - b) < 0.001;
  assert.ok(approx(durations[0], 0.3), `expected ~0.3, got ${durations[0]}`);
  assert.ok(approx(durations[1], 0.3), `expected ~0.3, got ${durations[1]}`);
  assert.ok(approx(durations[2], 0.3), `expected ~0.3, got ${durations[2]}`);
  assert.ok(approx(durations[3], 0.5), `expected ~0.5, got ${durations[3]}`);
});

test("showEncouragingPopup uses default message when none provided", () => {
  const { dom } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.showEncouragingPopup();

  const popup = dom.window.document.querySelector(".encouraging-popup");
  assert.ok(popup);
  assert.match(popup.textContent, /Great job! Form submitted successfully\./);
});

test("showEncouragingPopup applies fixed-position inline styles", () => {
  const { dom } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.showEncouragingPopup("Test");

  const popup = dom.window.document.querySelector(".encouraging-popup");
  assert.equal(popup.style.position, "fixed");
  assert.equal(popup.style.zIndex, "9999");
  assert.equal(popup.style.opacity, "0"); // Initially 0, fades in after 10ms
});

test("playButtonChime handles AudioContext error gracefully", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    runScripts: "dangerously"
  });

  dom.window.AudioContext = class {
    constructor() {
      throw new Error("AudioContext not allowed");
    }
  };

  dom.window.eval(chimeJs);

  // Should not throw
  assert.doesNotThrow(() => {
    dom.window.CubeSyncChime.playButtonChime();
  });
});

test("playUpliftingChime handles AudioContext error gracefully", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    runScripts: "dangerously"
  });

  dom.window.AudioContext = class {
    constructor() {
      throw new Error("AudioContext not allowed");
    }
  };

  dom.window.eval(chimeJs);

  assert.doesNotThrow(() => {
    dom.window.CubeSyncChime.playUpliftingChime();
  });
});

test("attachButtonChimes plays chime for all button clicks", () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html><body>
      <button id="generic">Save</button>
      <button id="action-edit" data-action="edit">Edit</button>
      <button id="action-delete" data-action="delete">Delete</button>
      <button id="action-open" data-action="open">Open</button>
    </body></html>
  `, { runScripts: "dangerously" });

  dom.window.AudioContext = class {
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { setValueAtTime: () => {} }, type: null }; }
    createGain() { return { connect: () => {}, gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
  };

  dom.window.eval(chimeJs);

  let chimeCalls = 0;
  dom.window.CubeSyncChime.playButtonChime = () => { chimeCalls += 1; };
  dom.window.CubeSyncChime.attachButtonChimes();

  // All button types should trigger chime
  ["generic", "action-edit", "action-delete", "action-open"].forEach((id) => {
    dom.window.document.getElementById(id).click();
  });

  assert.equal(chimeCalls, 4);
});

test("webkitAudioContext fallback is used when AudioContext is unavailable", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    runScripts: "dangerously"
  });

  let webkitUsed = false;
  delete dom.window.AudioContext;
  dom.window.webkitAudioContext = class {
    constructor() { webkitUsed = true; }
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { setValueAtTime: () => {} }, type: null }; }
    createGain() { return { connect: () => {}, gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
  };

  dom.window.eval(chimeJs);
  dom.window.CubeSyncChime.playButtonChime();

  assert.equal(webkitUsed, true);
});

test("each gain envelope has exactly 3 ramp stages", () => {
  const { dom, calls } = createDomWithAudioTracking();

  dom.window.CubeSyncChime.playUpliftingChime();

  // Each of the 4 notes should have 3 gain ramps
  assert.equal(calls.gains.length, 4);
  calls.gains.forEach((gain) => {
    assert.equal(gain.gain.ramps.length, 3);
  });
});
