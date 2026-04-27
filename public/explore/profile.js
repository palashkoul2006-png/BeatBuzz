// Profile page script: loads a user's profile and, if viewing your own,
// enables inline editing of a single field plus profile picture upload.

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

const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get("username");

function maybeEnableEditControls(user) {
  fetch('/api/session_user', { credentials: 'include' })
    .then(r => r.json())
    .then(me => {
      if (!me || !me.username || me.username !== user.username) return;

      const editBtn = document.querySelector('.edit-btn');
      const editPanel = document.querySelector('.edit-panel');
      if (!editBtn || !editPanel) return;

      editBtn.style.display = 'inline-block';
      editBtn.addEventListener('click', () => {
        editPanel.style.display = editPanel.style.display === 'none' ? 'block' : 'none';
      });

      const fieldSelect = document.getElementById('edit-field');
      const valueInput = document.getElementById('edit-value');
      const saveFieldBtn = document.getElementById('save-field');
      const statusEl = document.querySelector('.edit-status');
      const picInput = document.getElementById('edit-pic');
      const savePicBtn = document.getElementById('save-pic');
      const picPreview = document.getElementById('edit-pic-preview');
      let convertedPicBlob = null;

      if (picInput && picPreview) {
        picInput.addEventListener('change', function() {
          const file = this.files[0];
          if (file) {
            if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
              if (savePicBtn) {
                savePicBtn.disabled = true;
                savePicBtn.textContent = 'Converting...';
              }
              if (typeof heic2any !== 'undefined') {
                heic2any({ blob: file, toType: 'image/jpeg' })
                  .then(conversionResult => {
                    const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
                    convertedPicBlob = blob;
                    picPreview.src = URL.createObjectURL(blob);
                    picPreview.style.display = 'block';
                  })
                  .catch(err => {
                    console.error('HEIC conversion error:', err);
                    picPreview.alt = 'Preview not supported for this HEIC file.';
                    picPreview.style.display = 'block';
                  })
                  .finally(() => {
                    if (savePicBtn) {
                      savePicBtn.disabled = false;
                      savePicBtn.textContent = 'Upload';
                    }
                  });
              } else {
                picPreview.alt = 'HEIC preview not supported.';
                picPreview.style.display = 'block';
                if (savePicBtn) {
                  savePicBtn.disabled = false;
                  savePicBtn.textContent = 'Upload';
                }
              }
            } else {
              const reader = new FileReader();
              reader.onload = function(e) {
                picPreview.src = e.target.result;
                picPreview.style.display = 'block';
              }
              reader.readAsDataURL(file);
            }
          } else {
            convertedPicBlob = null;
            picPreview.src = '';
            picPreview.style.display = 'none';
          }
        });
      }

      if (saveFieldBtn) {
        saveFieldBtn.addEventListener('click', () => {
          const field = fieldSelect ? fieldSelect.value : '';
          let value = valueInput ? valueInput.value.trim() : '';
          if (statusEl) statusEl.textContent = '';
          if (!field) { if (statusEl) statusEl.textContent = 'Please select a field to update.'; return; }
          if (value.length === 0) { if (statusEl) statusEl.textContent = 'Please enter a value.'; return; }
          if (field === 'year') {
            const n = Number(value);
            if (!Number.isInteger(n)) { if (statusEl) statusEl.textContent = 'Year must be an integer.'; return; }
            value = n;
          }
          saveFieldBtn.disabled = true;
          saveFieldBtn.textContent = 'Updating...';
          fetch('/api/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ field, value })
          })
            .then(resp => resp.json().then(d => ({ ok: resp.ok, data: d })))
            .then(({ ok, data }) => {
              if (!ok) throw new Error(data.error || 'Update failed');
              if (statusEl) statusEl.textContent = 'Updated successfully.';
              // Update UI
              switch (field) {
                case 'full_name': document.querySelector('.profile-fullname').textContent = String(value); break;
                case 'bio': document.querySelector('.profile-bio').textContent = String(value); break;
                case 'zodiac_sign': document.querySelector('.profile-zodiac').textContent = String(value); break;
                case 'hometown': document.querySelector('.profile-hometown').textContent = String(value); break;
                case 'year': document.querySelector('.profile-year').textContent = String(value); break;
                case 'branch': document.querySelector('.profile-branch').textContent = String(value); break;
                case 'clubs_part_of': document.querySelector('.profile-clubs').textContent = String(value); break;
                case 'domain': document.querySelector('.profile-domain').textContent = String(value); break;
                case 'position': document.querySelector('.profile-position').textContent = String(value); break;
              }
            })
            .catch(err => { if (statusEl) statusEl.textContent = `Error: ${err.message}`; })
            .finally(() => { saveFieldBtn.disabled = false; saveFieldBtn.textContent = 'Update'; });
        });
      }

      if (savePicBtn) {
        savePicBtn.addEventListener('click', () => {
          if (statusEl) statusEl.textContent = '';
          const file = picInput && picInput.files && picInput.files[0];
          if (!file) { if (statusEl) statusEl.textContent = 'Please choose a picture file.'; return; }
          const formData = new FormData();
          if (convertedPicBlob) {
            formData.append('profile_pic', convertedPicBlob, file.name.replace(/\.heic$/i, '.jpg'));
          } else {
            formData.append('profile_pic', file);
          }
          savePicBtn.disabled = true;
          savePicBtn.textContent = 'Uploading...';
          fetch('/api/profile/pic', { method: 'POST', credentials: 'include', body: formData })
            .then(resp => resp.json().then(d => ({ ok: resp.ok, data: d })))
            .then(({ ok, data }) => {
              if (!ok) throw new Error(data.error || 'Upload failed');
              let img = data.profile_pic_url;

if (img && img.includes("mega.nz")) {
  img = img.replace("/file/", "/thumbnail/");
}

document.querySelector('.profile-pic').src = `/api/profile_pic/${user.username}`;
              if (statusEl) statusEl.textContent = 'Profile picture updated.';
              convertedPicBlob = null;
              if (picPreview) {
                picPreview.src = '';
                picPreview.style.display = 'none';
              }
              if (picInput) picInput.value = '';
            })
            .catch(err => { if (statusEl) statusEl.textContent = `Error: ${err.message}`; })
            .finally(() => { savePicBtn.disabled = false; savePicBtn.textContent = 'Upload'; });
        });
      }
    })
    .catch(err => console.error('Session check error', err));
}

if (username) {
  // Load the specified user's profile
  fetch(`/api/get_profile/${encodeURIComponent(username)}`)
    .then(res => {
      if (!res.ok) throw new Error("Profile not found");
      return res.json();
    })
    .then(user => {
      // Top section
      document.querySelector(".profile-fullname").textContent = user.full_name;
      document.querySelector(".profile-username").textContent = "@" + user.username;
      document.querySelector(".profile-zodiac").textContent = user.zodiac_sign || "♒";
      document.querySelector(".profile-bio").innerHTML = formatBio(user.bio);

      const pic = document.querySelector(".profile-pic");
      pic.src = `/api/profile_pic/${user.username}`;
      pic.onerror = () => { pic.src = "/uploads/default.jpg"; };

      // About section
      document.querySelector(".profile-username-about").textContent = user.username;
      document.querySelector(".profile-hometown").textContent = user.hometown || "Not specified";
      document.querySelector(".profile-year").textContent = user.year || "Not specified";
      document.querySelector(".profile-branch").textContent = user.branch || "Not specified";
      document.querySelector(".profile-domain").textContent = user.domain || "None";
      document.querySelector(".profile-clubs").textContent = user.clubs_part_of || "None";
      document.querySelector(".profile-position").textContent = user.position || "None";

      // Contact section
      document.querySelector(".profile-email").textContent = user.email || "Not available";

      // Enable edit controls if viewing own profile
      maybeEnableEditControls(user);

      // Vibe count
      fetch(`/api/vibe_count/${encodeURIComponent(user.username)}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => { document.querySelector(".vibe-count").textContent = `${data.vibes} Vibes`; })
        .catch(err => console.error("Error fetching vibe count:", err));
    })
    .catch(err => {
      console.error("Error loading profile:", err);
      document.querySelector(".profile-fullname").textContent = "Profile not found";
      document.querySelector(".profile-bio").textContent = "";
    });
} else {
  // No username param: load the logged-in user's profile
  fetch('/api/my_profile', { credentials: 'include' })
    .then(res => {
      if (!res.ok) throw new Error('Not logged in or profile unavailable');
      return res.json();
    })
    .then(user => {
      // Top section
      document.querySelector(".profile-fullname").textContent = user.full_name;
      document.querySelector(".profile-username").textContent = "@" + user.username;
      document.querySelector(".profile-zodiac").textContent = user.zodiac_sign || "♒";
      document.querySelector(".profile-bio").innerHTML = formatBio(user.bio);

      const pic = document.querySelector(".profile-pic");
pic.src = `/api/profile_pic/${user.username}`;
pic.onerror = () => { pic.src = "/uploads/default.jpg"; };

      // About section
      document.querySelector(".profile-username-about").textContent = user.username;
      document.querySelector(".profile-hometown").textContent = user.hometown || "Not specified";
      document.querySelector(".profile-year").textContent = user.year || "Not specified";
      document.querySelector(".profile-branch").textContent = user.branch || "Not specified";
      document.querySelector(".profile-domain").textContent = user.domain || "None";
      document.querySelector(".profile-clubs").textContent = user.clubs_part_of || "None";
      document.querySelector(".profile-position").textContent = user.position || "None";

      // Contact section
      document.querySelector(".profile-email").textContent = user.email || "Not available";

      // Enable edit controls (own profile)
      maybeEnableEditControls(user);

      // Vibe count for own profile
      fetch(`/api/vibe_count/${encodeURIComponent(user.username)}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => { document.querySelector(".vibe-count").textContent = `${data.vibes} Vibes`; })
        .catch(err => console.error("Error fetching vibe count:", err));
    })
    .catch(err => {
      console.error('Error loading my profile:', err);
      document.querySelector(".profile-fullname").textContent = "Please log in to view your profile";
      document.querySelector(".profile-bio").textContent = "";
    });
}  
    // 🔥 Move this to the very bottom of your profile.js file
document.addEventListener("DOMContentLoaded", () => {
  const pic = document.getElementById("profilePic");
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImg");

  if (pic && modal && modalImg) {
    pic.onclick = () => {
      modal.style.display = "flex";
      modalImg.src = pic.src;
      document.body.style.overflow = "hidden"; // Prevent scrolling while viewing pic
    };

    modal.onclick = () => {
      modal.style.display = "none";
      document.body.style.overflow = "auto"; // Restore scrolling
    };
  }
});

