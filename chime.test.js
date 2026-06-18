const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("chime.js exports playButtonChime and playUpliftingChime", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    runScripts: "dangerously",
  });
  
  // Mock AudioContext
  dom.window.AudioContext = class {
    createOscillator() {
      return {
        connect: () => {},
        start: () => {},
        stop: () => {},
        frequency: { setValueAtTime: () => {} }
      };
    }
    createGain() {
      return {
        connect: () => {},
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {}
        }
      };
    }
    get destination() { return {}; }
    get currentTime() { return 0; }
  };

  const chimeJs = fs.readFileSync("chime.js", "utf8");
  dom.window.eval(chimeJs);

  assert.ok(dom.window.CubeSyncChime, "CubeSyncChime should be defined");
  assert.equal(typeof dom.window.CubeSyncChime.playButtonChime, "function");
  assert.equal(typeof dom.window.CubeSyncChime.playUpliftingChime, "function");
  assert.equal(typeof dom.window.CubeSyncChime.showEncouragingPopup, "function");
  assert.equal(typeof dom.window.CubeSyncChime.attachButtonChimes, "function");
});

test("showEncouragingPopup creates a popup in the DOM", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    runScripts: "dangerously",
  });
  
  dom.window.AudioContext = class {
    createOscillator() { return { connect: ()=>{}, start: ()=>{}, stop: ()=>{}, frequency: { setValueAtTime: ()=>{} } }; }
    createGain() { return { connect: ()=>{}, gain: { setValueAtTime: ()=>{}, linearRampToValueAtTime: ()=>{}, exponentialRampToValueAtTime: ()=>{} } }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
  };

  const chimeJs = fs.readFileSync("chime.js", "utf8");
  dom.window.eval(chimeJs);

  dom.window.CubeSyncChime.showEncouragingPopup("Great job!");
  
  const popup = dom.window.document.querySelector(".encouraging-popup");
  assert.ok(popup, "Popup element should exist");
  assert.match(popup.textContent, /Great job!/);
});

test("attachButtonChimes attaches listeners to buttons", () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <button id="btn1">View</button>
        <button id="btn2" data-action="edit">Edit</button>
        <button id="btn3" data-action="delete">Delete</button>
      </body>
    </html>
  `, { runScripts: "dangerously" });
  
  let chimePlayed = false;
  dom.window.AudioContext = class {
    createOscillator() { return { connect: ()=>{}, start: ()=>{}, stop: ()=>{}, frequency: { setValueAtTime: ()=>{} } }; }
    createGain() { return { connect: ()=>{}, gain: { setValueAtTime: ()=>{}, linearRampToValueAtTime: ()=>{}, exponentialRampToValueAtTime: ()=>{} } }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
  };
  
  const chimeJs = fs.readFileSync("chime.js", "utf8");
  dom.window.eval(chimeJs);
  
  // Override to detect call
  dom.window.CubeSyncChime.playButtonChime = () => { chimePlayed = true; };

  dom.window.CubeSyncChime.attachButtonChimes();
  
  const btn = dom.window.document.getElementById("btn1");
  btn.click();
  
  assert.equal(chimePlayed, true, "Chime should be played on button click");
});
