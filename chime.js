(function () {
  "use strict";

  function createAudioContext() {
    return new (window.AudioContext || window.webkitAudioContext)();
  }

  function playTone(ctx, frequency, type, duration, startTime = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);
    
    // Envelope to avoid clicking
    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration);
  }

  function playButtonChime() {
    try {
      const ctx = createAudioContext();
      playTone(ctx, 440, "sine", 0.1); // Short A4 beep
    } catch (e) {
      // Audio context might be blocked or unsupported
      console.warn("Audio chime not supported or blocked", e);
    }
  }

  function playUpliftingChime() {
    try {
      const ctx = createAudioContext();
      // Arpeggio: C4, E4, G4, C5
      playTone(ctx, 261.63, "sine", 0.3, 0);
      playTone(ctx, 329.63, "sine", 0.3, 0.1);
      playTone(ctx, 392.00, "sine", 0.3, 0.2);
      playTone(ctx, 523.25, "sine", 0.5, 0.3);
    } catch (e) {
      console.warn("Audio chime not supported or blocked", e);
    }
  }

  function showEncouragingPopup(message) {
    playUpliftingChime();

    const popup = document.createElement("div");
    popup.className = "encouraging-popup";
    popup.textContent = message || "Great job! Form submitted successfully.";
    
    // Simple inline styles for the popup
    Object.assign(popup.style, {
      position: "fixed",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "#22c55e",
      color: "white",
      padding: "16px 24px",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      fontSize: "1.1rem",
      fontWeight: "bold",
      zIndex: "9999",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out, top 0.3s ease-in-out"
    });

    document.body.appendChild(popup);

    // Fade in
    setTimeout(() => {
      popup.style.opacity = "1";
      popup.style.top = "40px";
    }, 10);

    // Fade out and remove after 3 seconds
    setTimeout(() => {
      popup.style.opacity = "0";
      popup.style.top = "20px";
      setTimeout(() => popup.remove(), 300);
    }, 3000);
  }

  function attachButtonChimes() {
    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) {
        const action = btn.dataset.action;
        
        // Play regular chime for any button by default, or specific ones
        // "do it for view, edit and delete buttons"
        if (
          action === "edit" || 
          action === "delete" || 
          action === "open" || 
          btn.textContent.toLowerCase().includes("view") ||
          btn.textContent.toLowerCase().includes("edit") ||
          btn.textContent.toLowerCase().includes("delete")
        ) {
          window.CubeSyncChime.playButtonChime();
        } else {
          // Play for every button press as requested
          window.CubeSyncChime.playButtonChime();
        }
      }
    });
  }

  window.CubeSyncChime = {
    playButtonChime,
    playUpliftingChime,
    showEncouragingPopup,
    attachButtonChimes
  };
})();
