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

const searchInput = document.getElementById("searchInput");
const resultsDiv = document.getElementById("results");

// Store logged-in user data
let currentUser = null;

// Fetch logged-in user's profile for right-side panel and also store it
fetch("/api/user_profile", { method: "GET", credentials: "include" })
  .then(res => {
    if (!res.ok) throw new Error("Not logged in or profile not found");
    return res.json();
  })
  .then(data => {
    currentUser = data; // store current user

    // Update right-side panel
    document.querySelector(".your-name").textContent = data.full_name;
    document.querySelector(".your-zodiac").textContent = data.zodiac_sign || "♒";
    const bioEl = document.querySelector(".your-bio");
    if (bioEl) bioEl.innerHTML = formatBio(data.bio);

    const yourPic = document.querySelector(".your-pic");
    const src = `/api/profile_pic/${data.username}`;
    yourPic.src = src;
    yourPic.onerror = () => { yourPic.src = "/uploads/default.jpg"; };
  })
  .catch(err => {
    console.error("Error fetching profile:", err);
    document.querySelector(".your-name").textContent = "Guest User";
    document.querySelector(".your-pic").src = "/uploads/default.jpg";
  });

// Handle search input
searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    resultsDiv.innerHTML = "";
    return;
  }

  fetch(`/api/search_users?query=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      resultsDiv.innerHTML = "";

      // Include current user in results if query matches their name
     // Prevent duplicates by removing the current user from the backend results first
      if (currentUser) {
        data = data.filter(user => user.username !== currentUser.username);
        
        // Then manually pin them to the very top if they match the search query
        if (currentUser.full_name.toLowerCase().includes(query)) {
          data.unshift(currentUser);
        }
      }

      data.forEach(user => {
        const card = document.createElement("div");
        card.className = "profile-card";

        const img = document.createElement("img");
        img.className = "profile-pic";
        img.src = `/api/profile_pic/${user.username}`;
        img.onerror = () => { img.src = "/uploads/default.jpg"; };

        const name = document.createElement("div");
        name.className = "profile-name";
        name.textContent = user.full_name;

        const zodiac = document.createElement("div");
        zodiac.className = "profile-zodiac";
        zodiac.textContent = user.zodiac_sign || "♒";

        const bio = document.createElement("div");
        bio.className = "profile-bio";
        bio.innerHTML = formatBio(user.bio);

        // --- View Profile button ---
const viewBtn = document.createElement("button");
viewBtn.className = "view-btn";
viewBtn.textContent = "View Profile";
viewBtn.addEventListener("click", () => {
  window.location.href = `profile.html?username=${encodeURIComponent(user.username)}`;
});

// --- NEW Connect (Y) button ---
        if (currentUser && user.username === currentUser.username) {
          // If the search result is YOU, show a disabled "You" button instead
          const selfBtn = document.createElement("button");
          selfBtn.className = "connect-btn";
          selfBtn.textContent = "You";
          selfBtn.disabled = true;
          
          card.append(img, name, zodiac, bio, viewBtn, selfBtn);
          resultsDiv.appendChild(card);
        } else {
          // If it's someone else, run the normal Vibe checks
          const connectBtn = document.createElement("button");
          connectBtn.className = "connect-btn";
          connectBtn.textContent = "..."; // Loading state

          fetch(`/api/vibe_status/${encodeURIComponent(user.username)}`, { credentials: "include" })
            .then(res => res.json())
            .then(statusData => {
              if (statusData.status === "accepted") {
                connectBtn.textContent = "\u2713 Vibing";
                connectBtn.style.opacity = '0.7';
                connectBtn.addEventListener("click", () => {
                  if (!confirm(`Are you sure you want to unvibe @${user.username}?`)) return;
                  fetch("/api/unvibe", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ to_username: user.username })
                  })
                  .then(r => r.json())
                  .then(d => {
                    if (d.success) {
                      connectBtn.textContent = "Vibe";
                      connectBtn.style.opacity = '1';
                    } else { alert(d.message || 'Could not unvibe.'); }
                  });
                });
              } else if (statusData.status === "pending") {
                connectBtn.textContent = "Sent \u00b7 Withdraw";
                connectBtn.style.opacity = '0.7';
                connectBtn.addEventListener("click", () => {
                  if (!confirm(`Cancel your vibe request to @${user.username}?`)) return;
                  fetch("/api/withdraw_vibe", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ to_username: user.username })
                  })
                  .then(r => r.json())
                  .then(d => {
                    if (d.success) {
                      connectBtn.textContent = "Vibe";
                      connectBtn.style.opacity = '1';
                    } else { alert(d.message || 'Could not withdraw.'); }
                  });
                });
              } else {
                connectBtn.textContent = "Vibe";
                connectBtn.addEventListener("click", () => {
                  fetch("/api/send_vibe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ to_username: user.username })
                  })
                  .then(res => res.json())
                  .then(resp => {
                    if (resp.success) {
                      connectBtn.textContent = "Sent \u00b7 Withdraw";
                      connectBtn.style.opacity = '0.7';
                    } else {
                      alert(resp.message || "Error sending request");
                    }
                  })
                  .catch(err => console.error("Error sending vibe:", err));
                });
              }
            })
            .catch(err => {
              connectBtn.textContent = "Vibe";
            });

          // Append all elements to the card
          card.append(img, name, zodiac, bio, viewBtn, connectBtn);
          resultsDiv.appendChild(card);
        }

      });
    })
    .catch(err => console.error("Frontend search error:", err));
});
