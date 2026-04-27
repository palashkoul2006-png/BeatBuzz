// Global theme initializer: dark-mode toggle + accent color picker
(function () {
  const root = document.documentElement; // we'll set data-theme on <html>

  function setTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', t);
    // For CSS vars override we rely on body[data-theme], mirror for robustness
    document.body.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch {}
  }

  function shadeHex(hex, percent) {
    // percent: -30 (darker) to +30 (lighter)
    try {
      const h = hex.replace('#','');
      const num = parseInt(h, 16);
      let r = (num >> 16) & 0xFF;
      let g = (num >> 8) & 0xFF;
      let b = num & 0xFF;
      const p = Math.max(-100, Math.min(100, percent)) / 100;
      r = Math.round(r + (p * (p < 0 ? r : (255 - r))));
      g = Math.round(g + (p * (p < 0 ? g : (255 - g))));
      b = Math.round(b + (p * (p < 0 ? b : (255 - b))));
      const toHex = (v) => v.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch { return hex; }
  }

  function applyAccent(hex) {
    try {
      const accent = shadeHex(hex, -0.2 * 100); // ~20% darker
      root.style.setProperty('--primary', hex);
      root.style.setProperty('--accent', accent);
      localStorage.setItem('accent', hex);
    } catch {}
  }

  function initThemeControls() {
    try {
      // Load persisted theme
      const savedTheme = localStorage.getItem('theme') || 'light';
      setTheme(savedTheme);

      // Load persisted accent
      const savedAccent = localStorage.getItem('accent');
      if (savedAccent) applyAccent(savedAccent);

      // Wire up dark mode toggle if present
      const toggle = document.getElementById('darkModeToggle');
      if (toggle) {
        toggle.checked = (savedTheme === 'dark');
        toggle.addEventListener('change', () => setTheme(toggle.checked ? 'dark' : 'light'));
      }

      // Wire up accent swatches
      const swatches = document.querySelectorAll('.accent-swatch');
      swatches.forEach((btn) => {
        const color = btn.dataset.color;
        if (savedAccent && color.toLowerCase() === savedAccent.toLowerCase()) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
          swatches.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applyAccent(color);
        });
      });
    } catch (e) {
      console.warn('Theme controls init failed:', e);
    }
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeControls);
  } else {
    initThemeControls();
  }

  // Expose for other modules if needed
  window.BBTheme = { setTheme, applyAccent };
})();

// 🔥 REAL-TIME NOTIFICATION ALERT SYSTEM
document.addEventListener("DOMContentLoaded", () => {
  // 1. Create an invisible container for our pop-up alerts
  const toastContainer = document.createElement("div");
  Object.assign(toastContainer.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "9999",
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  });
  document.body.appendChild(toastContainer);

  // Keep track of the last notification we saw so we don't repeat alerts
  let lastNotifId = localStorage.getItem("lastNotifId") || 0;

  // 2. Silently check the server every 10 seconds for new updates
  setInterval(() => {
    fetch("/api/get_notifications", { credentials: "include" })
      .then(res => res.json())
      .then(notifications => {
        if (!Array.isArray(notifications) || notifications.length === 0) return;
        
        const latest = notifications[0]; // The newest notification
        
        // If the ID is higher than the last one we saw, it's brand new!
        if (latest.id > lastNotifId) {
          lastNotifId = latest.id;
          localStorage.setItem("lastNotifId", lastNotifId);
          
          showToast(latest.message); // Trigger the slide-in alert
          
          // Add a red notification dot to the bell icon in the sidebar
          const bellIcon = document.querySelector(".bi-bell");
          if (bellIcon && !bellIcon.parentElement.querySelector(".notif-dot")) {
            const dot = document.createElement("span");
            dot.className = "notif-dot";
            Object.assign(dot.style, {
              background: "#e41955", width: "8px", height: "8px", 
              borderRadius: "50%", position: "absolute", top: "12px", right: "12px"
            });
            bellIcon.parentElement.style.position = "relative";
            bellIcon.parentElement.appendChild(dot);
          }
        }
      })
      .catch(err => console.error("Silent notification poll failed:", err));
  }, 10000); 

  // 3. The function that draws the beautiful slide-in alert
  function showToast(message) {
    const toast = document.createElement("div");
    Object.assign(toast.style, {
      background: "linear-gradient(135deg, #e41955, #c21749)",
      color: "white",
      padding: "14px 20px",
      borderRadius: "10px",
      boxShadow: "0 8px 20px rgba(228,25,85,0.3)",
      fontFamily: "'Poppins', sans-serif",
      fontSize: "14px",
      fontWeight: "500",
      transform: "translateX(120%)", // Start off-screen
      transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)" // Bouncy slide
    });
    toast.innerHTML = `<i class="bi bi-bell-fill" style="margin-right: 8px;"></i> ${message}`;
    
    toastContainer.appendChild(toast);
    
    // Slide it in
    setTimeout(() => { toast.style.transform = "translateX(0)"; }, 100);
    
    // Slide it out and delete it after 5 seconds
    setTimeout(() => {
      toast.style.transform = "translateX(120%)";
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  }
});

