async function fetchJSON(url, options = {}) {
  const opts = { credentials: 'include', ...options };
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

let me = null;
let currentPeer = null;

async function loadMe() {
  try {
    const data = await fetchJSON('/api/user_profile');
    me = data;
    document.getElementById('me-username').textContent = `@${data.username}`;
    document.getElementById('me-fullname').textContent = data.full_name || '';
    document.getElementById('me-pic').src = `/api/profile_pic/${data.username}`;
  } catch (e) {
    console.error('Not logged in or unable to load profile:', e);
    const convList = document.getElementById('conv-list');
    convList.innerHTML = '<div style="color:#ccc">Please log in to use chat.</div>';
  }
}

async function loadConversations() {
  try {
    const convs = await fetchJSON('/api/chats');
    const list = document.getElementById('conv-list');
    list.innerHTML = '';
    convs.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item';
      item.dataset.username = conv.other_username;
      item.dataset.fullname = conv.full_name || '';

      const pic = document.createElement('img');
      pic.className = 'conv-pic';
      pic.src = `/api/profile_pic/${conv.other_username}`;

      const main = document.createElement('div');
      main.className = 'conv-main';
      const name = document.createElement('div');
      name.className = 'conv-name';
      name.textContent = conv.full_name ? `${conv.full_name} (@${conv.other_username})` : `@${conv.other_username}`;
      const last = document.createElement('div');
      last.className = 'conv-last';
      const cleanLastText = conv.last_text ? conv.last_text.replace(/\[STORY:\d+\]\s*$/, '').trim() : '';
      last.textContent = cleanLastText;
      const time = document.createElement('div');
      time.className = 'conv-time';
      time.textContent = conv.last_at ? fmtTime(conv.last_at) : '';

      main.appendChild(name);
      main.appendChild(last);
      main.appendChild(time);

      const unread = document.createElement('div');
      unread.className = 'conv-unread';
      unread.textContent = conv.unread_count > 0 ? conv.unread_count : '';

      item.appendChild(pic);
      item.appendChild(main);
      if (conv.unread_count > 0) item.appendChild(unread);

      item.addEventListener('click', () => openConversation(conv.other_username));
      list.appendChild(item);
    });

    // If URL has ?user=<username>, open it
    const params = new URLSearchParams(window.location.search);
    const peer = params.get('user');
    if (peer) openConversation(peer);

    // Also load contacts to start new conversations
    await loadContacts(convs.map(c => c.other_username));
    attachSearchFilter();
  } catch (e) {
    console.error('Error loading chats:', e);
    const list = document.getElementById('conv-list');
    list.innerHTML = '<div style="color:#ccc">Unable to load chats.</div>';
  }
}

async function loadContacts(existing = []) {
  const container = document.getElementById('contacts-list');
  if (!container) return;
  try {
    // 🔥 NEW: Fetch connections instead of all profiles
    const connections = await fetchJSON(`/api/connections/${me.username}`);
    
    // 🔥 NEW: Filter for mutual Vibes (they follow you AND you follow them)
    const followerUsernames = connections.followers.map(f => f.username);
    const mutualProfiles = connections.following.filter(p => followerUsernames.includes(p.username));

    const existingSet = new Set(Array.isArray(existing) ? existing : []);
    container.innerHTML = '';
    
    // Update the empty state message
    if (!Array.isArray(mutualProfiles) || mutualProfiles.length === 0) {
      container.innerHTML = '<div style="color:#777; padding:1rem;">You need to be Vibing with someone to chat!</div>';
      return;
    }
    
    mutualProfiles
      .filter(p => !existingSet.has(p.username))
      .forEach(profile => {
        const item = document.createElement('div');
        item.className = 'conv-item';
        item.dataset.username = profile.username;
        item.dataset.fullname = profile.full_name || '';

        const pic = document.createElement('img');
        pic.className = 'conv-pic';
        pic.src = `/api/profile_pic/${profile.username}`;
        pic.onerror = () => { pic.src = '/uploads/default.jpg'; };

        const main = document.createElement('div');
        main.className = 'conv-main';
        const name = document.createElement('div');
        name.className = 'conv-name';
        name.textContent = profile.full_name ? `${profile.full_name} (@${profile.username})` : `@${profile.username}`;
        const last = document.createElement('div');
        last.className = 'conv-last';
        last.textContent = 'Tap to start chat';
        main.appendChild(name);
        main.appendChild(last);

        item.appendChild(pic);
        item.appendChild(main);
        item.addEventListener('click', () => openConversation(profile.username));
        container.appendChild(item);
      });
    attachSearchFilter();
  } catch (e) {
    console.error('Error loading contacts:', e);
    container.innerHTML = '<div style="color:#ccc">Unable to load users. Please log in.</div>';
  }
}

function attachSearchFilter() {
  const input = document.getElementById('conv-search');
  if (!input) return;
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    const items = Array.from(document.querySelectorAll('#conv-list .conv-item, #contacts-list .conv-item'));
    items.forEach(el => {
      const u = (el.dataset.username || '').toLowerCase();
      const f = (el.dataset.fullname || '').toLowerCase();
      el.style.display = (!q || u.includes(q) || f.includes(q)) ? '' : 'none';
    });
  };
}

async function openConversation(username) {
  currentPeer = username;
  // highlight
  document.querySelectorAll('.conv-item').forEach(i => {
    i.classList.toggle('active', i.dataset.username === username);
  });

  // load peer profile
  try {
    const prof = await fetchJSON(`/api/get_profile/${encodeURIComponent(username)}`);
    document.getElementById('peer-username').textContent = `@${prof.username}`;
    document.getElementById('peer-fullname').textContent = prof.full_name || '';
    document.getElementById('peer-pic').src = `/api/profile_pic/${prof.username}`;
  } catch (e) {
    console.warn('Peer profile not available:', e);
    document.getElementById('peer-username').textContent = `@${username}`;
    document.getElementById('peer-fullname').textContent = '';
    document.getElementById('peer-pic').src = '/uploads/default.jpg';
  }

  // load messages
  await loadMessages(username);
  // mark read
  try { await fetchJSON(`/api/messages/${encodeURIComponent(username)}/mark_read`, { method: 'POST' }); } catch {}
}

async function loadMessages(username) {
  const wrap = document.getElementById('messages');
  wrap.innerHTML = '';
  try {
    const msgs = await fetchJSON(`/api/messages/${encodeURIComponent(username)}`);
    msgs.forEach(m => {
      const isMe = m.sender_username === me?.username;
      const isDeleted = m.is_deleted_for_everyone === 1;

      const b = document.createElement('div');
      b.className = 'bubble ' + (isMe ? 'me' : 'them');
      
      if (isDeleted) {
        b.style.opacity = '0.6';
        b.style.fontStyle = 'italic';
      }

      const storyMatch = m.message_text.match(/\[STORY:(\d+)\]\s*$/);
      if (storyMatch) {
        const storyId = storyMatch[1];
        b.textContent = m.message_text.replace(storyMatch[0], '').trim();
        
        const preview = document.createElement('img');
        preview.src = `/api/story_image/${storyId}`;
        preview.style.display = 'block';
        preview.style.width = '100px';
        preview.style.height = '150px';
        preview.style.objectFit = 'cover';
        preview.style.borderRadius = '10px';
        preview.style.marginTop = '10px';
        preview.style.cursor = 'pointer';
        preview.style.border = '2px solid rgba(255,255,255,0.2)';
        
        const storyAuthor = isMe ? currentPeer : me?.username;
        preview.onclick = () => window.location.href = `/explore/explore.html?openStory=${storyAuthor}`;
        
        b.appendChild(preview);
      } else {
        b.textContent = m.message_text;
      }
      
      // Add right-click to delete
      b.oncontextmenu = (e) => {
        e.preventDefault();
        const deleteForMe = confirm('Delete this message for yourself?');
        if (deleteForMe) {
          fetchJSON(`/api/messages/${m.id}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'me' })
          }).then(() => loadMessages(username));
        } else if (isMe && !isDeleted) {
          const deleteForEveryone = confirm('Delete this message for everyone?');
          if (deleteForEveryone) {
            fetchJSON(`/api/messages/${m.id}/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'everyone' })
            }).then(() => loadMessages(username));
          }
        }
      };

      const t = document.createElement('div');
      t.className = 'timestamp';
      t.textContent = fmtTime(m.created_at);
      wrap.appendChild(b);
      wrap.appendChild(t);
    });
    wrap.scrollTop = wrap.scrollHeight;
  } catch (e) {
    console.error('Error loading messages:', e);
    wrap.innerHTML = '<div style="color:#ccc;padding:10px">Unable to load messages. Are you logged in?</div>';
  }
}

async function sendMessage(text) {
  if (!currentPeer) return;
  try {
    const resp = await fetchJSON(`/api/messages/${encodeURIComponent(currentPeer)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    // 🔥 NEW: Catch the backend security block and alert the user
    if (resp.success === false) {
      alert(resp.error || 'Cannot send message.');
      return;
    }

    // reload messages and conversations
    await loadMessages(currentPeer);
    await loadConversations();
  } catch (e) {
    console.error('Send message error:', e);
    alert('Failed to send message');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadMe().then(() => {
    loadConversations();
  });

  const form = document.getElementById('send-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    if (text.length > 1000) {
      alert('Message too long');
      return;
    }
    await sendMessage(text);
    input.value = '';
  });
});