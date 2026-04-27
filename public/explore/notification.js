// Helper: format bio with line breaks
function formatBio(raw) {
  if (!raw || !raw.trim()) return 'No bio provided';
  const lines = raw.split(/\r\n|\r|\n/).map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(l => l.length > 0);
  if (lines.length > 1) return lines.join('<br>');
  const clean = lines[0];
  if (clean.includes('⚡')) {
    const parts = clean.split('⚡');
    return parts[0].trim() + '⚡<br>' + parts[1].trim();
  }
  if (clean.includes('. ')) return clean.split('. ').join('.<br>');
  return clean;
}

const notificationList = document.getElementById("notification-list");

// Fetch notifications for logged-in user
fetch("/api/get_notifications", { credentials: "include" })
  .then(res => res.json())
  .then(notifications => {
    notificationList.innerHTML = "";

    if (notifications.length === 0) {
      notificationList.innerHTML = "<p>No notifications yet.</p>";
      return;
    }

    notifications.forEach(n => {
      const card = document.createElement("div");
      card.className = "notification-card";
      card.dataset.id = String(n.id);

      // 🔗 Make the card clickable based on its type
      const actor = n.actor || '';
      let destination = null;
      if (n.type === 'message')      destination = `chat.html?user=${encodeURIComponent(actor)}`;
      else if (n.type === 'vibe_back' || n.type === 'vibe_accepted')
                                     destination = `profile.html?username=${encodeURIComponent(actor)}`;
      else if (n.type === 'post_like' || n.type === 'post_comment')
                                     destination = 'posts.html';

      if (destination) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          // Don't navigate if they clicked a button inside the card
          if (e.target.tagName === 'BUTTON') return;
          window.location.href = destination;
        });
      }

      const text = document.createElement("div");
      text.className = "notification-text";

      // Add a type-specific icon prefix
      let icon = "";
      if (n.type === "post_like")    icon = "❤️ ";
      else if (n.type === "post_comment") icon = "💬 ";
      else if (n.type === "vibe")    icon = "✨ ";
      else if (n.type === "message") icon = "📩 ";
      else if (n.type === "new_post") icon = "🆕 ";
      text.textContent = icon + n.message;

      card.appendChild(text);

      // If it's a vibe request, add Accept/Reject buttons
      if (n.type === "vibe") {
        const btnGroup = document.createElement("div");
        btnGroup.className = "action-buttons";

        const acceptBtn = document.createElement("button");
        acceptBtn.className = "accept-btn";
        acceptBtn.textContent = "Accept";
        acceptBtn.addEventListener("click", () => handleVibeAction(n.id, "accept", n.actor));

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "reject-btn";
        rejectBtn.textContent = "Reject";
        rejectBtn.addEventListener("click", () => handleVibeAction(n.id, "reject", n.actor));

        btnGroup.append(acceptBtn, rejectBtn);
        card.appendChild(btnGroup);
      } else {
        // 🔥 NEW: Add a dismiss button for New Posts and Messages
        const btnGroup = document.createElement("div");
        btnGroup.className = "action-buttons";

        const dismissBtn = document.createElement("button");
        dismissBtn.className = "view-btn"; // Uses your nice pink theme
        dismissBtn.textContent = "Dismiss";
        dismissBtn.style.padding = "6px 14px";
        dismissBtn.addEventListener("click", () => {
          fetch("/api/dismiss_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ notificationId: n.id })
          }).then(() => {
            card.remove(); // Remove it from the screen
            if (document.querySelectorAll('.notification-card').length === 0) {
              notificationList.innerHTML = "<p>No notifications yet.</p>";
            }
          });
        });

        btnGroup.appendChild(dismissBtn);
        card.appendChild(btnGroup);
      }

      notificationList.appendChild(card);
    });
  })
  .catch(err => {
    console.error("Error loading notifications:", err);
  });

function handleVibeAction(notificationId, action, actor) {
  fetch("/api/respond_vibe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ notificationId, action, actor })
  })
  .then(res => res.json())
  .then(data => {
    // Remove the notification card immediately upon successful action
    const card = document.querySelector(`.notification-card[data-id="${notificationId}"]`);
    if (card && card.parentElement) {
      card.parentElement.removeChild(card);
    }
    // If list becomes empty, show empty state message
    if (document.querySelectorAll('.notification-card').length === 0) {
      notificationList.innerHTML = "<p>No notifications yet.</p>";
    }
    console.log(data.message);
  })
  .catch(err => console.error("Error responding to vibe:", err));
}


// Fetch profile data for right panel
document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/user_profile", { method: "GET", credentials: "include" })
    .then(res => res.json())
    .then(data => {
      document.querySelector(".your-name").textContent = data.full_name;
      document.querySelector(".your-zodiac").textContent = data.zodiac_sign || "♒";
      const bioEl = document.querySelector(".your-bio");
      if (bioEl) bioEl.innerHTML = formatBio(data.bio);

      const yourPic = document.querySelector(".your-pic");
      const src = `/api/profile_pic/${data.username}`;
      yourPic.src = src;
      yourPic.onerror = () => { yourPic.src = "/uploads/default.jpg"; };
    })
    .catch(err => console.error("Error fetching profile:", err));
});
