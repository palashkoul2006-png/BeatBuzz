// Helper: format bio with line breaks
function formatBio(raw) {
  if (!raw || !raw.trim()) return 'No bio provided';
  // Split on any newline variant (\r\n, \r, \n) first
  const lines = raw.split(/\r\n|\r|\n/).map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(l => l.length > 0);
  if (lines.length > 1) {
    return lines.join('<br>');
  }
  // Single line: check for ⚡
  const clean = lines[0];
  if (clean.includes('⚡')) {
    const parts = clean.split('⚡');
    return parts[0].trim() + '⚡<br>' + parts[1].trim();
  }
  // Check for sentence break
  if (clean.includes('. ')) {
    return clean.split('. ').join('.<br>');
  }
  return clean;
}

document.addEventListener("DOMContentLoaded", () => {

  let currentUser = ""; // use let so we can assign later

  // Smooth page transition
  document.querySelector('.center-feed')?.classList.add('fade-in');
  document.querySelector('.profile-panel')?.classList.add('fade-in');

  // Fetch logged-in user's profile for right-side panel
  fetch("/api/user_profile", { method: "GET", credentials: "include" })
    .then(res => res.json())
    .then(data => {
      console.log("BIO RAW:", data.bio);
      currentUser = data.username; // store username for vibe checks
      
      // 🔥 Kickstart the dynamic stories system!
      loadStories();

      const nameEl = document.querySelector(".your-name");
      const zodiacEl = document.querySelector(".your-zodiac");
      const bioEl = document.querySelector(".your-bio");
      const picEl = document.querySelector(".your-pic");

      if (nameEl) nameEl.textContent = data.full_name;
      if (zodiacEl) zodiacEl.textContent = data.zodiac_sign || "♒";
      if (bioEl) {
        bioEl.innerHTML = formatBio(data.bio);
      }
      if (picEl) {
        const src = `/api/profile_pic/${data.username}`;
        picEl.src = src;
        picEl.onerror = () => { picEl.src = "/uploads/default.jpg"; };
      }
    })
    .catch(err => {
      console.error("Error fetching profile:", err);
      const nameEl = document.querySelector(".your-name");
      const picEl = document.querySelector(".your-pic");
      if (nameEl) nameEl.textContent = "Guest User";
      if (picEl) picEl.src = "/uploads/default.jpg";
    });

  // Fetch all profiles except logged-in user
  fetch("/api/all_profiles", { method: "GET", credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Unable to load profiles");
      return res.json();
    })
    .then(profiles => {
      const container = document.querySelector(".profile-cards");
      container.innerHTML = "";

      if (!Array.isArray(profiles)) {
        container.innerHTML = "<p>Unable to load profiles. Please log in.</p>";
        return;
      }

      if (profiles.length === 0) {
        container.innerHTML = "<p>No profiles found yet.</p>";
        return;
      }

      profiles.forEach(profile => {
        const card = document.createElement("div");
        card.className = "profile-card";
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          window.location.href = `profile.html?username=${encodeURIComponent(profile.username)}`;
        });

        const img = document.createElement("img");
        img.className = "profile-pic";
        img.src = `/api/profile_pic/${profile.username}`;
        img.onerror = () => { img.src = "/uploads/default.jpg"; };

        const name = document.createElement("div");
        name.className = "profile-name";
        name.textContent = profile.full_name; // use full_name

        const zodiac = document.createElement("div");
        zodiac.className = "profile-zodiac";
        zodiac.textContent = profile.zodiac_sign || "♒";

        const bio = document.createElement("div");
        bio.className = "profile-bio";
        bio.innerHTML = formatBio(profile.bio);

        const btn = document.createElement("button");
        btn.className = "view-btn";

        // Check vibe/follow status dynamically
        fetch(`/api/vibe_status/${encodeURIComponent(profile.username)}`, { credentials: "include" })
          .then(res => res.json())
          .then(statusData => {
            // Stop card click from firing when Vibe button is clicked
            btn.addEventListener("click", (e) => e.stopPropagation());
            if(statusData.status === "accepted") {
              btn.textContent = "✓ Vibing";
              btn.disabled = false;
              btn.style.opacity = '0.7';
              btn.addEventListener("click", () => unvibe(profile.username, btn));
            } else if(statusData.status === "pending") {
              btn.textContent = "Vibe Sent · Withdraw";
              btn.disabled = false;
              btn.style.opacity = '0.7';
              btn.addEventListener("click", () => withdrawVibe(profile.username, btn));
            } else {
              btn.textContent = "Vibe";
              btn.disabled = false;
              btn.addEventListener("click", () => sendVibe(profile.username, btn));
            }
          })
          .catch(err => {
            console.error("Error fetching vibe status:", err);
            btn.textContent = "Vibe";
            btn.disabled = false;
            btn.addEventListener("click", () => sendVibe(profile.username, btn));
          });

        card.append(img, name, zodiac, bio, btn);
        container.appendChild(card);
      });

      // Populate right-panel suggestions (top 5)
      try {
        const followBody = document.querySelector('.widget-follow .widget-body');
        if (followBody) {
          followBody.innerHTML = '';
          profiles.slice(0,5).forEach(p => {
            const row = document.createElement('div');
            row.className = 'widget-row';

            const ava = document.createElement('img');
            ava.className = 'avatar';
            ava.src = `/api/profile_pic/${p.username}`;
            ava.onerror = () => { ava.src = '/uploads/default.jpg'; };

            const nm = document.createElement('div');
            nm.className = 'name';
            nm.textContent = p.full_name;

            const action = document.createElement('div');

            fetch(`/api/vibe_status/${encodeURIComponent(p.username)}`, { credentials: 'include' })
              .then(r => r.json())
              .then(st => {
                if (st.status === 'accepted') {
                  const b = document.createElement('button');
                  b.className = 'follow-btn';
                  b.textContent = '✓ Vibing';
                  b.style.opacity = '0.7';
                  b.addEventListener('click', () => unvibe(p.username, b));
                  action.appendChild(b);
                } else if (st.status === 'pending') {
                  const b = document.createElement('button');
                  b.className = 'follow-btn';
                  b.textContent = 'Sent · Withdraw';
                  b.style.opacity = '0.7';
                  b.addEventListener('click', () => withdrawVibe(p.username, b));
                  action.appendChild(b);
                } else {
                  const btn = document.createElement('button');
                  btn.className = 'follow-btn';
                  btn.textContent = 'Follow';
                  btn.addEventListener('click', () => sendVibe(p.username, btn));
                  action.appendChild(btn);
                }
              })
              .catch(() => {
                const btn = document.createElement('button');
                btn.className = 'follow-btn';
                btn.textContent = 'Follow';
                btn.addEventListener('click', () => sendVibe(p.username, btn));
                action.appendChild(btn);
              });

            row.append(ava, nm, action);
            followBody.appendChild(row);
          });
        }
      } catch (e) { console.warn('Follow widget render failed:', e); }
    })
    .catch(err => console.error("Error fetching all profiles:", err));

  // Function to send vibe request
  function sendVibe(toUsername, btn) {
    fetch("/api/send_vibe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ to_username: toUsername })
    })
    .then(res => res.json())
    .then(data => {
      if(data.success) {
        btn.textContent = "Vibe Sent · Withdraw";
        btn.style.opacity = '0.7';
        btn.disabled = false;
        // Re-attach as withdraw listener
        const fresh = btn.cloneNode(true);
        fresh.textContent = "Vibe Sent · Withdraw";
        fresh.style.opacity = '0.7';
        fresh.addEventListener('click', () => withdrawVibe(toUsername, fresh));
        btn.replaceWith(fresh);
      } else {
        alert(data.message);
      }
    })
    .catch(err => console.error("Error sending vibe:", err));
  }

  // Function to withdraw a pending vibe request
  function withdrawVibe(toUsername, btn) {
    if (!confirm(`Cancel your vibe request to @${toUsername}?`)) return;
    fetch("/api/withdraw_vibe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ to_username: toUsername })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const fresh = btn.cloneNode(true);
        fresh.textContent = "Vibe";
        fresh.style.opacity = '1';
        fresh.disabled = false;
        fresh.addEventListener('click', () => sendVibe(toUsername, fresh));
        btn.replaceWith(fresh);
      } else {
        alert(data.message || 'Could not withdraw.');
      }
    })
    .catch(err => console.error("Error withdrawing vibe:", err));
  }

  // Function to unvibe (remove connection)
  function unvibe(toUsername, btn) {
    if (!confirm(`Are you sure you want to unvibe @${toUsername}? This will remove your connection.`)) return;
    fetch("/api/unvibe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ to_username: toUsername })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const fresh = btn.cloneNode(true);
        fresh.textContent = "Vibe";
        fresh.style.opacity = '1';
        fresh.disabled = false;
        fresh.addEventListener('click', () => sendVibe(toUsername, fresh));
        btn.replaceWith(fresh);
        alert(`You have unvibed @${toUsername}.`);
      } else {
        alert(data.message || 'Could not unvibe.');
      }
    })
    .catch(err => console.error("Error unvibing:", err));
  }

  // Populate Saved widget from liked posts
  fetch('/api/posts', { credentials: 'include' })
    .then(res => res.ok ? res.json() : Promise.reject(new Error('Posts load failed')))
    .then(posts => {
      const grid = document.querySelector('.widget-saved .saved-grid');
      if (!grid) return;
      grid.innerHTML = '';
      
      const saved = posts.filter(p => p.liked_by_me === 1).slice(0,4);
      if (saved.length === 0) {
        grid.innerHTML = '<div class="empty-state">No saved posts yet.</div>';
        return;
      }
      
      saved.forEach(p => {
        const t = document.createElement('div');
        t.className = 'thumb';
        t.style.overflow = 'hidden'; // Keep text/images neatly inside the rounded corners
        t.style.position = 'relative';

        // 🔥 Check if the post actually has an image!
        if (p.image_filename || p.image_url) {
          const img = document.createElement('img');
          img.src = `/api/image/${p.id}`;
          img.alt = p.caption || 'Saved post';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'contain';
          img.style.transform = 'scale(1.6)'; // Zoom in slightly
          t.style.backgroundColor = 'rgba(0,0,0,0.2)'; // Dark backdrop for pillarboxing
          img.style.objectPosition = 'center';
          img.onerror = () => { img.remove(); };
          t.appendChild(img);
        } else {
          // 🔥 If it's a Text-Only post, show a cool gradient snippet!
          const textSnippet = document.createElement('div');
          textSnippet.style.width = '100%';
          textSnippet.style.height = '100%';
          textSnippet.style.background = 'linear-gradient(135deg, #3b82f6, #8b5cf6)'; // Sleek blue-to-purple gradient
          textSnippet.style.color = 'white';
          textSnippet.style.padding = '8px';
          textSnippet.style.fontSize = '0.75rem';
          textSnippet.style.fontWeight = '500';
          textSnippet.style.display = '-webkit-box';
          textSnippet.style.webkitLineClamp = '4'; // Max 4 lines of text
          textSnippet.style.webkitBoxOrient = 'vertical';
          textSnippet.style.wordBreak = 'break-word';
          textSnippet.style.boxSizing = 'border-box';
          
          textSnippet.textContent = p.caption || 'Thought';
          t.appendChild(textSnippet);
        }
        
        grid.appendChild(t);
      });
    })
    .catch(err => console.error('Saved widget error:', err));

    // 🔥 NEW: Populate Recent Activity Widget
  fetch('/api/notifications_history', { credentials: 'include' })
    .then(res => res.json())
    .then(rows => {
      const list = document.querySelector('.widget-activity .activity-list');
      if (!list) return;
      
      // Clear the skeleton loading blobs
      list.innerHTML = ''; 

      if (!Array.isArray(rows) || rows.length === 0) {
        list.innerHTML = '<li class="activity-item"><div class="text">No recent activity</div></li>';
        return;
      }

      // Show only the 5 most recent activities
      rows.slice(0, 5).forEach(n => {
        const li = document.createElement('li');
        li.className = 'activity-item';
        li.style.display = 'flex';
        li.style.flexDirection = 'column';
        li.style.marginBottom = '12px';
        li.style.borderBottom = '1px solid rgba(128,128,128,0.2)'; // semi-transparent gray
        li.style.paddingBottom = '8px';

        const text = document.createElement('div');
        text.className = 'text';
        text.style.fontSize = '0.9rem';
        text.style.fontWeight = '500';
        text.textContent = n.message;

        const time = document.createElement('div');
        time.className = 'time';
        time.style.fontSize = '0.75rem';
        time.style.color = 'rgba(128,128,128,0.8)';
        
        // Format the date nicely
        const date = new Date(n.created_at);
        time.textContent = date.toLocaleString();

        li.append(text, time);
        list.appendChild(li);
      });
    })
    .catch(err => {
      console.error('Activity widget error:', err);
      const list = document.querySelector('.widget-activity .activity-list');
      if (list) list.innerHTML = '<li class="activity-item">Failed to load activity</li>';
    });


  // ==========================
  // 🔥 DYNAMIC STORIES SYSTEM
  // ==========================
  const storiesBar = document.querySelector(".stories-bar");
  const storyUploadInput = document.getElementById("storyUploadInput");
  
  // Modal Elements
  const storyUploadModal = document.getElementById("storyUploadModal");
  const storyPreviewImg = document.getElementById("storyPreviewImg");
  const storyCaptionInput = document.getElementById("storyCaptionInput");
  const postStoryBtn = document.getElementById("postStoryBtn");
  let selectedStoryFile = null;
  let convertedStoryBlob = null;

  function loadStories() {
    fetch("/api/stories_feed", { credentials: "include" })
      .then(res => res.json())
      .then(feed => {
        if (!storiesBar) return;
        storiesBar.innerHTML = ""; 
        
        const myStoryData = feed.find(s => s.username === currentUser);
        
        // 1. Render "You" Bubble
        const myStory = document.createElement("div");
        myStory.className = "story";
        
        if (myStoryData) {
          const ringClass = myStoryData.unseen_count > 0 ? "unseen" : "seen";
          // 🔥 Add a persistent '+' badge so you can ALWAYS add more stories!
          myStory.innerHTML = `
            <div style="position: relative; display: inline-block;">
              <div class="story-pic ${ringClass}"><img src="/api/profile_pic/${currentUser}"></div>
              <div onclick="document.getElementById('storyUploadInput').click(); event.stopPropagation();" style="position: absolute; bottom: 0; right: -5px; background: #3b82f6; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; cursor: pointer; border: 2px solid #111; z-index: 10; line-height: 1;">+</div>
            </div>
            <div class="story-name">You</div>
          `;
          myStory.onclick = () => viewStories(currentUser, myStoryData.profile_pic_url);
        } else {
          myStory.innerHTML = `<div class="story-pic add-story"><img src="/api/profile_pic/${currentUser}"></div><div class="story-name">Add Story</div>`;
          myStory.onclick = () => { if (storyUploadInput) storyUploadInput.click(); };
        }
        storiesBar.appendChild(myStory);

        // 2. Render Everyone Else
        feed.filter(s => s.username !== currentUser).forEach(user => {
          const userStory = document.createElement("div");
          userStory.className = "story";
          const ringClass = user.unseen_count > 0 ? "unseen" : "seen";
          
          userStory.innerHTML = `<div class="story-pic ${ringClass}"><img src="/api/profile_pic/${user.username}"></div><div class="story-name">${user.full_name.split(" ")[0]}</div>`;
          userStory.onclick = () => viewStories(user.username, user.profile_pic_url);
          storiesBar.appendChild(userStory);
        });
      });
  }

  // 🔥 INTERCEPT UPLOAD: Show Preview Modal Instead
  if (storyUploadInput) {
    storyUploadInput.addEventListener("change", (e) => {
      selectedStoryFile = e.target.files[0];
      convertedStoryBlob = null;
      if (!selectedStoryFile) return;
      
      if (selectedStoryFile.name.toLowerCase().endsWith('.heic') || selectedStoryFile.type === 'image/heic') {
        if (postStoryBtn) {
          postStoryBtn.disabled = true;
          postStoryBtn.textContent = "Converting...";
        }
        if (typeof heic2any !== 'undefined') {
          heic2any({ blob: selectedStoryFile, toType: 'image/jpeg' })
            .then(conversionResult => {
              const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
              convertedStoryBlob = blob;
              storyPreviewImg.src = URL.createObjectURL(blob);
              storyCaptionInput.value = "";
              storyUploadModal.style.display = "block";
            })
            .catch(err => {
              console.error('HEIC conversion error:', err);
              storyPreviewImg.alt = 'Preview not supported for this HEIC file.';
              storyCaptionInput.value = "";
              storyUploadModal.style.display = "block";
            })
            .finally(() => {
              if (postStoryBtn) {
                postStoryBtn.disabled = false;
                postStoryBtn.textContent = "Post Story";
              }
            });
        } else {
          storyPreviewImg.alt = 'HEIC preview not supported.';
          storyCaptionInput.value = "";
          storyUploadModal.style.display = "block";
          if (postStoryBtn) {
            postStoryBtn.disabled = false;
            postStoryBtn.textContent = "Post Story";
          }
        }
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => { storyPreviewImg.src = ev.target.result; };
        reader.readAsDataURL(selectedStoryFile);
        
        storyCaptionInput.value = "";
        storyUploadModal.style.display = "block";
      }
    });
  }

  document.getElementById("closeStoryUpload").onclick = () => {
    storyUploadModal.style.display = "none";
    storyUploadInput.value = "";
  };

  // 🔥 HANDLE FINAL POST
  if (postStoryBtn) {
    postStoryBtn.onclick = () => {
      if (!selectedStoryFile) return;
      postStoryBtn.disabled = true;
      postStoryBtn.textContent = "Posting...";

      const fd = new FormData();
      if (convertedStoryBlob) {
        fd.append("image", convertedStoryBlob, selectedStoryFile.name.replace(/\.heic$/i, '.jpg'));
      } else {
        fd.append("image", selectedStoryFile);
      }
      fd.append("caption", storyCaptionInput.value.trim());
      
      fetch("/api/stories", { method: "POST", credentials: "include", body: fd })
        .then(res => res.json())
        .then(resp => {
          postStoryBtn.disabled = false;
          postStoryBtn.textContent = "Post Story";
          storyUploadModal.style.display = "none";
          storyUploadInput.value = "";
          if (resp.success) {
            convertedStoryBlob = null;
            loadStories(); 
          }
          else alert("Failed to upload story.");
        });
    };
  }

  // Story Viewer Logic
  let currentStoryTimer;
  function viewStories(targetUsername, profilePicUrl) {
    fetch(`/api/stories/${targetUsername}`, { credentials: "include" })
      .then(res => res.json())
      .then(stories => {
        if (stories.length === 0) return;
        
        let currentIndex = 0;
        const modal = document.getElementById("storyViewerModal");
        const imgEl = document.getElementById("sv-image");
        const progEl = document.getElementById("sv-progress");
        
        if (!modal || !imgEl || !progEl) return;

        document.getElementById("sv-username").textContent = targetUsername;
        document.getElementById("sv-profile-pic").src = `/api/profile_pic/${targetUsername}`;
        modal.style.display = "block";

        function showNextStory() {
          if (currentIndex >= stories.length) {
            closeStory();
            loadStories();
            return;
          }

          const story = stories[currentIndex];
          // Hide left arrow if we are on the first story
          const prevBtn = document.getElementById("sv-nav-prev");
          if (prevBtn) prevBtn.style.display = currentIndex === 0 ? "none" : "flex";

          imgEl.src = `/api/story_image/${story.id}`;
          
          const viewersPanel = document.getElementById("sv-viewers-panel");
          const toggleViewersBtn = document.getElementById("toggleViewersBtn");
          const toggleRepliesBtn = document.getElementById("toggleRepliesBtn");
          const ownerActions = document.getElementById("sv-owner-actions");
          const repliesPanel = document.getElementById("sv-replies-panel");
          const interactionBar = document.getElementById("sv-interaction-bar");
          const commentInput = document.getElementById("sv-comment-input");
          const likeBtn = document.getElementById("sv-like-btn");
          const captionEl = document.getElementById("sv-caption");
          const deleteBtn = document.getElementById("sv-delete-btn");
          
          // Reset UI 
          if (viewersPanel) viewersPanel.style.display = "none";
          if (repliesPanel) repliesPanel.style.display = "none";
          if (likeBtn) { likeBtn.innerHTML = '<i class="bi bi-heart"></i>'; likeBtn.style.color = "white"; }
          if (commentInput) commentInput.value = "";
          if (captionEl) captionEl.textContent = story.caption || ""; // Show caption!

          if (targetUsername === currentUser) {
            // YOUR STORY
            if (ownerActions) ownerActions.style.display = "flex"; 
            if (interactionBar) interactionBar.style.display = "none"; 
            
            // 🔥 FIX 1: Mark your own story as seen so the ring stops glowing!
            fetch(`/api/stories/${story.id}/view`, { method: "POST", credentials: "include" });

            // Setup Delete Button
            if (deleteBtn) {
              deleteBtn.style.display = "flex";
              deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this story?")) {
                  fetch(`/api/stories/${story.id}`, { method: "DELETE", credentials: "include" })
                    .then(res => res.json())
                    .then(data => {
                      if (data.success) {
                        stories.splice(currentIndex, 1);
                        if (stories.length === 0) { closeStory(); loadStories(); } 
                        else {
                          if (currentIndex >= stories.length) currentIndex = stories.length - 1;
                          showNextStory();
                        }
                      }
                    });
                }
              };
            }
            
            fetch(`/api/stories/${story.id}/viewers`, { credentials: "include" })
              .then(res => res.json())
              .then(allViewers => {
                // 🔥 FIX 2: Filter yourself out so you don't show up in your own viewer list!
                const viewers = allViewers.filter(v => v.viewer_username !== currentUser);
                const count = viewers.length || 0;
                
                document.getElementById("sv-btn-count").textContent = count;
                const vList = document.getElementById("sv-viewers-list");
                vList.innerHTML = "";
                
                if (count === 0) {
                  vList.innerHTML = `<div style="font-size: 0.85rem; color: #ccc;">No views yet</div>`;
                } else {
                  viewers.forEach(v => {
                    const heartIcon = v.is_liked ? '<i class="bi bi-heart-fill" style="color: #e41955; font-size: 1.2rem;"></i>' : '';
                    vList.innerHTML += `
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                          <img src="/api/profile_pic/${v.viewer_username}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.3);">
                          <span style="font-size: 0.9rem; font-weight: 500;">${v.full_name || v.viewer_username}</span>
                        </div>
                        ${heartIcon}
                      </div>
                    `;
                  });
                }
              });

            fetch(`/api/stories/${story.id}/replies`, { credentials: "include" })
              .then(res => res.json())
              .then(replies => {
                const count = replies.length || 0;
                document.getElementById("sv-btn-replies-count").textContent = count;
                const rList = document.getElementById("sv-replies-list");
                rList.innerHTML = "";
                
                if (count === 0) {
                  rList.innerHTML = `<div style="font-size: 0.85rem; color: #ccc;">No replies yet</div>`;
                } else {
                  replies.forEach(r => {
                    rList.innerHTML += `
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                          <img src="/api/profile_pic/${r.sender_username}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.3);">
                          <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.9rem; font-weight: 500;">${r.full_name || r.sender_username}</span>
                            <span style="font-size: 0.8rem; color: #ccc;">${r.message_text}</span>
                          </div>
                        </div>
                      </div>
                    `;
                  });
                }
              });
          } else {
            // OTHERS' STORY
            if (ownerActions) ownerActions.style.display = "none";
            if (viewersPanel) viewersPanel.style.display = "none";
            if (repliesPanel) repliesPanel.style.display = "none";
            if (deleteBtn) deleteBtn.style.display = "none";
            if (interactionBar) interactionBar.style.display = "flex";
            
            fetch(`/api/stories/${story.id}/view`, { method: "POST", credentials: "include" });

            if (commentInput) {
              commentInput.onfocus = () => clearTimeout(currentStoryTimer);
              commentInput.onblur = () => { currentStoryTimer = setTimeout(() => { currentIndex++; showNextStory(); }, 5000); };
              commentInput.onkeydown = (e) => {
                if (e.key === 'Enter' && commentInput.value.trim()) {
                  fetch(`/api/stories/${story.id}/react`, {
                    method: "POST", credentials: "include", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({ type: 'comment', message: commentInput.value.trim() })
                  });
                  commentInput.value = "";
                  commentInput.blur(); 
                }
              };
            }

            if (likeBtn) {
              if (story.is_liked) {
                likeBtn.innerHTML = '<i class="bi bi-heart-fill"></i>';
                likeBtn.style.color = "#e41955";
              } else {
                likeBtn.innerHTML = '<i class="bi bi-heart"></i>';
                likeBtn.style.color = "white";
              }

              likeBtn.onclick = (e) => {
                e.stopPropagation(); 
                story.is_liked = !story.is_liked;
                
                if (story.is_liked) {
                  fetch(`/api/stories/${story.id}/react`, {
                    method: "POST", credentials: "include", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({ type: 'like' })
                  });
                  likeBtn.innerHTML = '<i class="bi bi-heart-fill"></i>';
                  likeBtn.style.color = "#e41955";
                  likeBtn.style.transform = "scale(1.2)";
                  setTimeout(() => likeBtn.style.transform = "scale(1)", 200);
                } else {
                  fetch(`/api/stories/${story.id}/react`, {
                    method: "POST", credentials: "include", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({ type: 'unlike' })
                  });
                  likeBtn.innerHTML = '<i class="bi bi-heart"></i>';
                  likeBtn.style.color = "white";
                  likeBtn.style.transform = "scale(0.8)";
                  setTimeout(() => likeBtn.style.transform = "scale(1)", 200);
                }
              };
            }
          }

          progEl.style.transition = "none";
          progEl.style.width = "0%";
          setTimeout(() => {
            progEl.style.transition = "width 5s linear";
            progEl.style.width = "100%";
          }, 50);

          clearTimeout(currentStoryTimer);
          currentStoryTimer = setTimeout(() => {
            currentIndex++;
            showNextStory();
          }, 5000); 
        }

        // 🔥 NEW: Free Will Navigation (Left = Back, Right = Next)
        imgEl.onclick = (e) => { 
          const clickX = e.clientX;
          const screenWidth = window.innerWidth;
          
          // If you click the left 33% of the screen, go back
          if (clickX < screenWidth / 3) {
            currentIndex--;
            if (currentIndex < 0) currentIndex = 0; // Don't go past the first story
          } else {
            // Otherwise, skip forward
            currentIndex++;
          }
          
          showNextStory(); 
        }; 
// 🔥 NEW: Visual Button Navigation
        const prevBtn = document.getElementById("sv-nav-prev");
        const nextBtn = document.getElementById("sv-nav-next");

        if (prevBtn) {
          prevBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering the image tap
            currentIndex--;
            if (currentIndex < 0) currentIndex = 0;
            showNextStory();
          };
        }

        if (nextBtn) {
          nextBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering the image tap
            currentIndex++;
            showNextStory();
          };
        }

        showNextStory();
      });
  }

  function closeStory() {
    clearTimeout(currentStoryTimer);
    const modal = document.getElementById("storyViewerModal");
    if (modal) modal.style.display = "none";
  }
  
  const closeBtn = document.getElementById("closeStoryViewer");
  if (closeBtn) closeBtn.onclick = closeStory;

  const toggleViewersBtn = document.getElementById("toggleViewersBtn");
  const toggleRepliesBtn = document.getElementById("toggleRepliesBtn");

  if (toggleViewersBtn) {
    toggleViewersBtn.addEventListener("click", (e) => {
      e.stopPropagation(); 
      const panel = document.getElementById("sv-viewers-panel");
      const rPanel = document.getElementById("sv-replies-panel");
      if (rPanel) rPanel.style.display = "none";
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
  }

  if (toggleRepliesBtn) {
    toggleRepliesBtn.addEventListener("click", (e) => {
      e.stopPropagation(); 
      const panel = document.getElementById("sv-replies-panel");
      const vPanel = document.getElementById("sv-viewers-panel");
      if (vPanel) vPanel.style.display = "none";
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
  }

  // Handle URL redirect to open a specific user's story
  const params = new URLSearchParams(window.location.search);
  const openStoryUser = params.get('openStory');
  if (openStoryUser) {
    // Wait briefly for the UI to settle before popping the modal
    setTimeout(() => {
      viewStories(openStoryUser, `/api/profile_pic/${openStoryUser}`);
      // Clean up URL so refresh doesn't reopen it
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 500);
  }

});