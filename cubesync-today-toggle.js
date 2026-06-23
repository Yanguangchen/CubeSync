/**
 * CubeSync "Today only" tactile switch.
 *
 * Wraps the glass tactile-switch engine (provided design) and binds it to a
 * real <input type="checkbox"> that is the single source of truth. The
 * dashboard only listens to that checkbox's `change` event, so the filter keeps
 * working even when the glass engine can't run (e.g. JSDOM / no <canvas>),
 * in which case a lightweight CSS-driven fallback toggle is used instead.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncTodayToggle = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* --- Glass engine maths (from the provided tactile-switch design) -------- */

  const SurfaceEquations = {
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4)
  };

  class Spring {
    constructor(v, s = 300, d = 20) {
      this.value = v;
      this.target = v;
      this.velocity = 0;
      this.stiffness = s;
      this.damping = d;
    }
    setTarget(t) { this.target = t; }
    update(dt) {
      const f = (this.target - this.value) * this.stiffness;
      const df = this.velocity * this.damping;
      this.velocity += (f - df) * dt;
      this.value += this.velocity * dt;
      return this.value;
    }
    isSettled() {
      return Math.abs(this.target - this.value) < 0.001 && Math.abs(this.velocity) < 0.001;
    }
  }

  function calculateDisplacementMap1D(gt, bw, sf, ri, s = 128) {
    const e = 1 / ri;
    const r = [];
    for (let i = 0; i < s; i++) {
      const x = i / s;
      const y = sf(x);
      const dx = x < 1 ? 0.0001 : -0.0001;
      const d = (sf(Math.max(0, Math.min(1, x + dx))) - y) / dx;
      const m = Math.sqrt(d * d + 1);
      const n = [-d / m, -1 / m];
      const dt = n[1];
      const k = 1 - e * e * (1 - dt * dt);
      if (k < 0) {
        r.push(0);
      } else {
        const rf = [
          -(e * dt + Math.sqrt(k)) * n[0],
          e - (e * dt + Math.sqrt(k)) * n[1]
        ];
        r.push(rf[0] * ((y * bw + gt) / rf[1]));
      }
    }
    return r;
  }

  function calculateDisplacementMap2D(cw, ch, ow, oh, rad, bw, md, pMap) {
    const img = new ImageData(cw, ch);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 128;
      img.data[i + 1] = 128;
      img.data[i + 3] = 255;
    }
    const rSq = rad * rad;
    const rp1Sq = (rad + 1) ** 2;
    const rmBwSq = Math.max(0, rad - bw) ** 2;
    const wB = ow - rad * 2;
    const hB = oh - rad * 2;
    const oX = (cw - ow) / 2;
    const oY = (ch - oh) / 2;
    for (let y1 = 0; y1 < oh; y1++) {
      for (let x1 = 0; x1 < ow; x1++) {
        const idx = ((oY + y1) * cw + oX + x1) * 4;
        const x = x1 < rad ? x1 - rad : x1 >= ow - rad ? x1 - rad - wB : 0;
        const y = y1 < rad ? y1 - rad : y1 >= oh - rad ? y1 - rad - hB : 0;
        const dSq = x * x + y * y;
        if (dSq <= rp1Sq && dSq >= rmBwSq) {
          const dist = Math.sqrt(dSq);
          const op = dSq < rSq ? 1 : 1 - (dist - rad) / (Math.sqrt(rp1Sq) - rad);
          const bIdx = Math.floor(Math.max(0, Math.min(1, (rad - dist) / bw)) * pMap.length);
          const dVal = pMap[Math.max(0, Math.min(bIdx, pMap.length - 1))] || 0;
          const dX = md > 0 ? (-(dist > 0 ? x / dist : 0) * dVal) / md : 0;
          const dY = md > 0 ? (-(dist > 0 ? y / dist : 0) * dVal) / md : 0;
          img.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * op));
          img.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * op));
        }
      }
    }
    return img;
  }

  function calculateSpecularHighlight(ow, oh, rad) {
    const img = new ImageData(ow, oh);
    const sVec = [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)];
    const rSq = rad * rad;
    const rp1Sq = (rad + 1) ** 2;
    const rmSSq = Math.max(0, (rad - 1.5) ** 2);
    for (let y1 = 0; y1 < oh; y1++) {
      for (let x1 = 0; x1 < ow; x1++) {
        const x = x1 < rad ? x1 - rad : x1 >= ow - rad ? x1 - rad - (ow - rad * 2) : 0;
        const y = y1 < rad ? y1 - rad : y1 >= oh - rad ? y1 - rad - (oh - rad * 2) : 0;
        const dSq = x * x + y * y;
        if (dSq <= rp1Sq && dSq >= rmSSq) {
          const dist = Math.sqrt(dSq);
          const op = dSq < rSq ? 1 : 1 - (dist - rad) / (Math.sqrt(rp1Sq) - rad);
          const dp = Math.abs((dist > 0 ? x / dist : 0) * sVec[0] + (dist > 0 ? -y / dist : 0) * sVec[1]);
          const cf = dp * Math.sqrt(1 - (1 - Math.max(0, Math.min(1, (rad - dist) / 1.5))) ** 2);
          const c = Math.min(255, 255 * cf);
          const idx = (y1 * ow + x1) * 4;
          img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = c;
          img.data[idx + 3] = Math.min(255, c * cf * op);
        }
      }
    }
    return img;
  }

  function imageDataToDataURL(img) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").putImageData(img, 0, 0);
    return c.toDataURL();
  }

  /* --- Feature detection --------------------------------------------------- */

  // The glass engine needs a real 2D canvas context (ImageData/putImageData)
  // and requestAnimationFrame. JSDOM and very old browsers lack these.
  function canRunGlassEngine() {
    try {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        return false;
      }
      if (typeof ImageData === "undefined") {
        return false;
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext && canvas.getContext("2d");
      return Boolean(ctx && typeof ctx.putImageData === "function" && typeof ctx.getImageData === "function");
    } catch {
      return false;
    }
  }

  function detectBackdropFilter() {
    try {
      const probe = document.createElement("div");
      probe.style.backdropFilter = "url(#test)";
      return Boolean(window.chrome) && probe.style.backdropFilter.includes("url");
    } catch {
      return false;
    }
  }

  /* --- Glass engine runner ------------------------------------------------- */

  function runGlassEngine(els, initialChecked, notify) {
    const useBackdropFilter = detectBackdropFilter();
    if (useBackdropFilter && document.body) {
      document.body.classList.add("use-backdrop-filter");
    }

    const c = { tw: 160, th: 67, w: 146, h: 92, r: 46, bw: 19, gt: 47, ri: 1.5, sr: 0.65, sa: 0.9 };
    const s = { chk: Boolean(initialChecked), pd: false, ix: 0, xr: 1, md: 0 };
    const sp = {
      xr: new Spring(s.chk ? 1 : 0, 1000, 80),
      sc: new Spring(c.sr, 2000, 80),
      bo: new Spring(1, 2000, 80),
      tc: new Spring(s.chk ? 1 : 0, 1000, 80),
      sr: new Spring(0.4, 100, 10)
    };

    c.ro = ((1 - c.sr) * c.w) / 2;
    c.tr = c.tw - c.th - (c.w - c.h) * c.sr;
    let af = null;

    const th = els.thumb, tr = els.track, ci = els.cloneInner;
    const pc = calculateDisplacementMap1D(c.gt, c.bw, SurfaceEquations.convex_squircle, c.ri);
    s.md = Math.max(...pc.map(Math.abs));

    els.displacementImage.setAttribute("href", imageDataToDataURL(
      calculateDisplacementMap2D(c.w, c.h, c.w, c.h, c.r, c.bw, s.md || 1, pc)));
    els.specularImage.setAttribute("href", imageDataToDataURL(
      calculateSpecularHighlight(c.w, c.h, c.r)));

    if (!useBackdropFilter && els.clone) {
      els.clone.style.filter = "url(#switchGlassFilter)";
    }

    function setChecked(next, silent) {
      const value = Boolean(next);
      if (value === s.chk) return;
      s.chk = value;
      if (!silent && typeof notify === "function") notify(s.chk);
      if (!af) af = requestAnimationFrame(loop);
    }

    function loop() {
      const dt = Math.min(0.032, 1 / 60);
      sp.sc.setTarget(s.pd ? c.sa : c.sr);
      sp.bo.setTarget(s.pd ? 0.1 : 1);
      sp.sr.setTarget(s.pd ? 0.9 : 0.4);
      if (!s.pd) sp.xr.setTarget(s.chk ? 1 : 0);
      sp.tc.setTarget(s.pd ? (s.xr > 0.5 ? 1 : 0) : (s.chk ? 1 : 0));

      const xr = sp.xr.update(dt), sc = sp.sc.update(dt), bo = sp.bo.update(dt), tc = sp.tc.update(dt);
      const tx = -c.ro + (c.th - c.h * c.sr) / 2 + xr * c.tr;

      th.style.left = tx + "px";
      th.style.transform = `translateY(-50%) scale(${sc})`;
      th.style.backgroundColor = `rgba(255,255,255,${bo})`;
      th.style.boxShadow = s.pd
        ? "0 4px 22px rgba(0,0,0,0.1), inset 2px 7px 24px rgba(0,0,0,0.09), inset -2px -7px 24px rgba(255,255,255,0.09)"
        : "0 10px 30px rgba(0,0,0,0.5)";
      if (els.clone) els.clone.style.opacity = 1 - bo;

      const r = Math.round(255 + (139 - 255) * tc);
      const g = Math.round(255 + (92 - 255) * tc);
      const b_ = Math.round(255 + (246 - 255) * tc);
      const a = 0.05 + (0.5 - 0.05) * tc;
      const tBg = `rgba(${r}, ${g}, ${b_}, ${a})`;
      tr.style.backgroundColor = tBg;

      if (!useBackdropFilter && ci && els.area) {
        const aR = els.area.getBoundingClientRect();
        const cl = (aR.width - c.tw) / 2;
        const ct = (aR.height - c.th) / 2;
        ci.style.width = aR.width + "px";
        ci.style.height = aR.height + "px";
        ci.style.transform = `translate(${-(cl + tx)}px, ${-(ct + (c.th / 2 - c.h / 2))}px)`;
        ci.style.setProperty("--switch-track-color", tBg);
        ci.style.setProperty("--track-left", `${cl}px`);
        ci.style.setProperty("--track-top", `${ct}px`);
      }
      els.displacementMap.setAttribute("scale", s.md * sp.sr.update(dt));

      if (!Object.values(sp).every((x) => x.isSettled())) af = requestAnimationFrame(loop);
      else af = null;
    }

    th.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      s.pd = true; s.ix = e.clientX; s.xr = s.chk ? 1 : 0;
      if (!af) af = requestAnimationFrame(loop);
    });
    th.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      s.pd = true; s.ix = e.touches[0].clientX; s.xr = s.chk ? 1 : 0;
      if (!af) af = requestAnimationFrame(loop);
    }, { passive: false });

    function drag(cx) {
      const r = (s.chk ? 1 : 0) + (cx - s.ix) / c.tr;
      s.xr = Math.min(1, Math.max(0, r)) + ((r < 0 ? 1 : -1) * (r < 0 ? -r : r > 1 ? r - 1 : 0)) / 22;
      sp.xr.setTarget(s.xr);
      if (!af) af = requestAnimationFrame(loop);
    }
    window.addEventListener("mousemove", (e) => { if (s.pd) { e.stopPropagation(); drag(e.clientX); } });
    window.addEventListener("touchmove", (e) => {
      if (s.pd) { e.stopPropagation(); drag(e.touches ? e.touches[0].clientX : e.clientX); }
    }, { passive: false });

    window.addEventListener("mouseup", (e) => {
      if (s.pd) {
        s.pd = false;
        setChecked(Math.abs(e.clientX - s.ix) < 4 ? !s.chk : s.xr > 0.5);
        if (!af) af = requestAnimationFrame(loop);
      }
    });
    window.addEventListener("touchend", (e) => {
      if (s.pd) {
        s.pd = false;
        const cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        setChecked(Math.abs(cx - s.ix) < 4 ? !s.chk : s.xr > 0.5);
        if (!af) af = requestAnimationFrame(loop);
      }
    });

    tr.addEventListener("click", (e) => {
      if (e.target === tr) setChecked(!s.chk);
    });
    window.addEventListener("resize", () => { if (!af) af = requestAnimationFrame(loop); });

    af = requestAnimationFrame(loop);
    return { setChecked };
  }

  /* --- Public setup -------------------------------------------------------- */

  function collectElements(container) {
    const q = (sel) => container.querySelector(sel);
    return {
      area: container,
      checkbox: q('input[type="checkbox"]'),
      track: q("#switchTrack") || q(".switch-track"),
      thumb: q("#switchThumb") || q(".switch-thumb"),
      clone: q("#switchThumbClone"),
      cloneInner: q("#switchThumbCloneInner"),
      displacementImage: q("#switchDisplacementImage"),
      specularImage: q("#switchSpecularImage"),
      displacementMap: q("#switchDisplacementMap")
    };
  }

  // Wire a basic (no-canvas) fallback: clicking the track/thumb just toggles the
  // checkbox; the CSS `.is-basic` rules move the thumb based on :checked.
  function wireBasicToggle(els) {
    function toggle() {
      els.checkbox.checked = !els.checkbox.checked;
      els.checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (els.track) els.track.addEventListener("click", toggle);
    if (els.thumb) els.thumb.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  }

  function setup(container) {
    if (!container) return null;
    const els = collectElements(container);
    if (!els.checkbox || !els.track || !els.thumb) {
      return null;
    }

    if (!canRunGlassEngine()) {
      container.classList.add("is-basic");
      wireBasicToggle(els);
      return { mode: "basic" };
    }

    try {
      const engine = runGlassEngine(els, els.checkbox.checked, function (checked) {
        els.checkbox.checked = checked;
        els.checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });
      container.classList.add("is-engine-active");
      // Keep the engine visual in sync if the checkbox is toggled elsewhere.
      els.checkbox.addEventListener("change", function () {
        engine.setChecked(els.checkbox.checked, true);
      });
      return { mode: "glass", engine: engine };
    } catch {
      container.classList.add("is-basic");
      wireBasicToggle(els);
      return { mode: "basic" };
    }
  }

  return {
    setup: setup,
    canRunGlassEngine: canRunGlassEngine
  };
});
