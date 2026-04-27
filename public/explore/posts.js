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

document.addEventListener('DOMContentLoaded', () => {
  let currentUser = null;
  let allFetchedPosts = [];
  let currentFeedType = 'community'; // 'community' or 'myposts'

  // Populate right panel with logged-in user
  fetch('/api/user_profile', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      currentUser = data.username;
      document.querySelector('.your-name').textContent = data.full_name;
      document.querySelector('.your-zodiac').textContent = data.zodiac_sign || '♒';
      const bioEl = document.querySelector('.your-bio');
      if (bioEl) bioEl.innerHTML = formatBio(data.bio);
      const pic = document.querySelector('.your-pic');
      pic.src = `/api/profile_pic/${data.username}`;
      pic.onerror = () => { pic.src = '/uploads/default.jpg'; };
    })
    .catch(() => {
      document.querySelector('.your-name').textContent = 'Guest User';
    })
    .finally(() => {
      loadPosts();
    });

  // Feed Type Tab switching logic
  const tabCommunity = document.getElementById('tabCommunity');
  const tabMyPosts = document.getElementById('tabMyPosts');
  const feedTitle = document.getElementById('feedTitle');

  if (tabCommunity && tabMyPosts) {
    tabCommunity.addEventListener('click', () => {
      tabCommunity.classList.add('active');
      tabMyPosts.classList.remove('active');
      currentFeedType = 'community';
      if (feedTitle) feedTitle.textContent = 'Community Posts';
      renderPosts();
    });
    tabMyPosts.addEventListener('click', () => {
      tabMyPosts.classList.add('active');
      tabCommunity.classList.remove('active');
      currentFeedType = 'myposts';
      if (feedTitle) feedTitle.textContent = 'My Posts';
      renderPosts();
    });
  }

  // Tab switching logic
  const tabVisuals = document.getElementById('tabVisuals');
  const tabThoughts = document.getElementById('tabThoughts');
  const visualContainer = document.getElementById('visualPostsContainer');
  const textContainer = document.getElementById('textPostsContainer');

  if (tabVisuals && tabThoughts) {
    tabVisuals.addEventListener('click', () => {
      tabVisuals.classList.add('active');
      tabThoughts.classList.remove('active');
      visualContainer.style.display = '';
      textContainer.style.display = 'none';
    });
    tabThoughts.addEventListener('click', () => {
      tabThoughts.classList.add('active');
      tabVisuals.classList.remove('active');
      textContainer.style.display = '';
      visualContainer.style.display = 'none';
    });
  }

  // Upload form handling
  const form = document.getElementById('postForm');
  const imageInput = document.getElementById('postImage');
  const imagePreview = document.getElementById('postImagePreview');
  const captionInput = document.getElementById('postCaption');
  let convertedBlob = null;

  if (imageInput && imagePreview) {
    imageInput.addEventListener('change', function() {
      const file = this.files[0];
      const fileNameDisplay = document.getElementById('file-name-display');
      if (fileNameDisplay) {
        fileNameDisplay.textContent = file ? file.name : '';
      }
      if (file) {
        if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Converting...';
          }
          if (typeof heic2any !== 'undefined') {
            heic2any({ blob: file, toType: 'image/jpeg' })
              .then(conversionResult => {
                const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
                convertedBlob = blob;
                imagePreview.src = URL.createObjectURL(blob);
                imagePreview.style.display = 'block';
              })
              .catch(err => {
                console.error('HEIC conversion error:', err);
                imagePreview.alt = 'Preview not supported for this HEIC file.';
                imagePreview.style.display = 'block';
              })
              .finally(() => {
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Launch Post';
                }
              });
          } else {
            imagePreview.alt = 'HEIC preview not supported.';
            imagePreview.style.display = 'block';
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Launch Post';
            }
          }
        } else {
          const reader = new FileReader();
          reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
          }
          reader.readAsDataURL(file);
        }
      } else {
        convertedBlob = null;
        imagePreview.src = '';
        imagePreview.style.display = 'none';
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = imageInput.files[0];
    const captionText = captionInput.value.trim();

    // 🔥 NEW: Check if BOTH are empty. If they have at least one, let it pass!
    if (!file && !captionText) {
      alert('Please select an image or write a thought!');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Launching...';
    }

    const fd = new FormData();
    if (convertedBlob) {
      fd.append('image', convertedBlob, file.name.replace(/\.heic$/i, '.jpg'));
    } else if (file) {
      fd.append('image', file);
    }
    fd.append('caption', captionText);

    fetch('/api/posts', {
      method: 'POST',
      credentials: 'include',
      body: fd
    })
    // ... keep the rest of the .then() block the same ...
    .then(res => res.json())
    .then(resp => {
      if (resp.success) {
        imageInput.value = '';
        captionInput.value = '';
        const fileNameDisplay = document.getElementById('file-name-display');
        if (fileNameDisplay) fileNameDisplay.textContent = '';
        convertedBlob = null;
        if (imagePreview) {
          imagePreview.src = '';
          imagePreview.style.display = 'none';
        }
        loadPosts();
      } else {
        alert(resp.error || 'Failed to create post');
      }
    })
    .catch(err => console.error('Error creating post:', err))
    .finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Launch Post';
      }
    });
  });

  // Load posts
  function loadPosts() {
    fetch('/api/posts', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Not logged in or failed to load');
        return res.json();
      })
      .then(posts => {
        allFetchedPosts = posts;
        renderPosts();
      })
      .catch(err => {
        console.error(err);
      });
  }

  function renderPosts() {
    const vContainer = document.getElementById('visualPostsContainer');
    const tContainer = document.getElementById('textPostsContainer');
    if (!vContainer || !tContainer) return;
    
    vContainer.innerHTML = '';
    tContainer.innerHTML = '';
    
    let hasVisuals = false;
    let hasTexts = false;

    let postsToRender = allFetchedPosts;
    if (currentFeedType === 'myposts') {
      postsToRender = allFetchedPosts.filter(p => p.author_username === currentUser);
    }

    if (!Array.isArray(postsToRender) || postsToRender.length === 0) {
      if (currentFeedType === 'myposts') {
        vContainer.innerHTML = '<p style="text-align: center; width: 100%; color: #888;">You haven\'t made any visual posts yet.</p>';
        tContainer.innerHTML = '<p style="text-align: center; width: 100%; color: #888;">You haven\'t shared any thoughts yet.</p>';
      } else {
        vContainer.innerHTML = '<p style="text-align: center; width: 100%; color: #888;">No visual posts yet. Be the first to share!</p>';
        tContainer.innerHTML = '<p style="text-align: center; width: 100%; color: #888;">No thoughts shared yet. Be the first!</p>';
      }
      return;
    }
    
    postsToRender.forEach(post => {
          const card = document.createElement('div');
          card.className = 'profile-card';

          // 🔥 NEW: Only create and attach an image if the database says one exists!
          if (post.image_filename || post.image_url) {
            const img = document.createElement('img');
            img.className = 'post-image';
            img.src = `/api/image/${post.id}`;
            img.style.objectFit = 'cover';
            // If the image fails, hide it completely instead of showing a default avatar
            img.onerror = () => { img.style.display = 'none'; }; 
            
            img.addEventListener('click', () => {
              openImageModal(img.src, post.caption, `${post.full_name || post.author_username} (@${post.author_username})`);
            });
            card.appendChild(img); // Put image at the top of the card
          }

          const name = document.createElement('div');
          name.className = 'profile-name';
          name.style.display = 'flex';
          name.style.justifyContent = 'space-between';
          name.style.alignItems = 'center';
          
          const nameSpan = document.createElement('span');
          nameSpan.textContent = `${post.full_name || post.author_username} (@${post.author_username})`;
          name.appendChild(nameSpan);

          if (currentUser && post.author_username === currentUser) {
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '<i class="bi bi-trash"></i>';
            delBtn.style.background = 'none';
            delBtn.style.border = 'none';
            delBtn.style.color = '#ef4444';
            delBtn.style.cursor = 'pointer';
            delBtn.style.fontSize = '1.1rem';
            delBtn.title = 'Delete Post';
            delBtn.onclick = (e) => {
              e.stopPropagation();
              if (confirm('Are you sure you want to delete this post?')) {
                fetch(`/api/posts/${post.id}`, { method: 'DELETE', credentials: 'include' })
                  .then(r => r.json())
                  .then(d => {
                    if (d.success) card.remove();
                    else alert(d.error || 'Failed to delete');
                  });
              }
            };
            name.appendChild(delBtn);
          }

          const caption = document.createElement('div');
          caption.className = 'profile-bio';
          caption.textContent = post.caption || '';
          
          // 🔥 Make text-only "Thoughts" stand out a bit more!
          if (!post.image_filename && !post.image_url) {
            caption.style.fontSize = '1.15rem';
            caption.style.marginTop = '10px';
          }

          const meta = document.createElement('div');
          meta.className = 'profile-zodiac';
          const date = new Date(post.created_at);
          
          // 🔥 Make the likes count clickable!
          function updateMeta() {
            meta.innerHTML = `
              <span>${date.toLocaleString()}</span> • 
              <span class="likes-count" style="cursor: pointer; font-weight: 600; color: #3b82f6; text-decoration: underline;">${post.likes_count} likes</span> • 
              <span>${post.comments_count} comments</span>
            `;
            meta.querySelector('.likes-count').addEventListener('click', () => openLikesModal(post.id));
          }
          updateMeta(); // Run it once to set the text

          const likeBtn = document.createElement('button');
          likeBtn.className = 'view-btn';
          likeBtn.textContent = post.liked_by_me ? 'Liked' : 'Like';
          likeBtn.style.marginRight = '8px';
          likeBtn.addEventListener('click', () => {
            const method = post.liked_by_me ? 'DELETE' : 'POST';
            fetch(`/api/posts/${post.id}/like`, {
              method,
              credentials: 'include'
            })
            .then(res => res.json())
            .then(resp => {
              if (resp.success) {
                post.liked_by_me = !post.liked_by_me;
                post.likes_count = resp.likes_count; // <--- ADD THIS
                likeBtn.textContent = post.liked_by_me ? 'Liked' : 'Like';
                updateMeta(); // <--- ADD THIS
              }
            });
          });

          const commentsToggle = document.createElement('button');
          commentsToggle.className = 'view-btn';
          commentsToggle.textContent = 'Comments';

          const commentsSection = document.createElement('div');
          commentsSection.style.marginTop = '8px';
          commentsSection.style.display = 'none';

          commentsToggle.addEventListener('click', () => {
            if (commentsSection.style.display === 'none') {
              commentsSection.style.display = 'block';
              loadComments(post.id, commentsSection, (newCount) => {
                post.comments_count = newCount;
                updateMeta(); 
              });
            } else {
              commentsSection.style.display = 'none';
            }
          });

          card.append(name, caption, meta, likeBtn, commentsToggle, commentsSection);
          
          if (post.image_filename || post.image_url) {
            vContainer.appendChild(card);
            hasVisuals = true;
          } else {
            tContainer.appendChild(card);
            hasTexts = true;
          }
        });
        
        if (!hasVisuals) {
          vContainer.innerHTML = `<p style="text-align: center; width: 100%; color: #888;">No visual posts found.</p>`;
        }
        if (!hasTexts) {
          tContainer.innerHTML = `<p style="text-align: center; width: 100%; color: #888;">No thoughts found.</p>`;
        }
  }

  function loadComments(postId, container, updateCount) {
    fetch(`/api/posts/${postId}/comments`, { credentials: 'include' })
      .then(res => res.json())
      .then(comments => {
        container.innerHTML = '';
        const list = document.createElement('div');
        list.style.marginBottom = '12px';
        list.style.maxHeight = '250px';
        list.style.overflowY = 'auto';
        list.style.paddingRight = '5px';
        
        if (!Array.isArray(comments) || comments.length === 0) {
          list.innerHTML = '<p style="color: #888; font-size: 0.9rem; text-align: center; margin: 15px 0;">No comments yet. Be the first to comment!</p>';
        } else {
          comments.forEach(c => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'flex-start';
            row.style.gap = '10px';
            row.style.marginBottom = '12px';
            
            // Avatar
            const avatar = document.createElement('img');
            avatar.src = `/api/profile_pic/${c.username}`;
            avatar.onerror = () => { avatar.src = '/uploads/default.jpg'; };
            avatar.style.width = '34px';
            avatar.style.height = '34px';
            avatar.style.borderRadius = '50%';
            avatar.style.objectFit = 'cover';
            
            // Text container
            const textWrap = document.createElement('div');
            textWrap.style.background = 'rgba(128,128,128,0.1)';
            textWrap.style.padding = '8px 14px';
            textWrap.style.borderRadius = '18px';
            textWrap.style.flex = '1';
            textWrap.style.fontSize = '0.95rem';
            textWrap.style.lineHeight = '1.4';
            textWrap.style.wordBreak = 'break-word';
            
            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = '700';
            nameSpan.style.marginRight = '6px';
            nameSpan.textContent = c.full_name || c.username;
            
            const commentSpan = document.createElement('span');
            commentSpan.textContent = c.comment_text;
            
            textWrap.append(nameSpan, commentSpan);
            row.append(avatar, textWrap);
            list.appendChild(row);
          });
        }

        const form = document.createElement('form');
        form.style.display = 'flex';
        form.style.alignItems = 'center';
        form.style.gap = '10px';
        form.style.marginTop = '15px';
        form.style.position = 'relative';
        
        const myAvatar = document.createElement('img');
        myAvatar.src = currentUser ? `/api/profile_pic/${currentUser}` : '/uploads/default.jpg';
        myAvatar.onerror = () => { myAvatar.src = '/uploads/default.jpg'; };
        myAvatar.style.width = '34px';
        myAvatar.style.height = '34px';
        myAvatar.style.borderRadius = '50%';
        myAvatar.style.objectFit = 'cover';

        const inputWrap = document.createElement('div');
        inputWrap.style.flex = '1';
        inputWrap.style.display = 'flex';
        inputWrap.style.alignItems = 'center';
        inputWrap.style.background = 'transparent';
        inputWrap.style.border = '1px solid rgba(128,128,128,0.3)';
        inputWrap.style.borderRadius = '24px';
        inputWrap.style.padding = '4px 16px';
        inputWrap.style.transition = 'border-color 0.2s';
        
        // Add focus effect via JS since it's inline
        inputWrap.onfocus = () => inputWrap.style.borderColor = '#3b82f6';
        inputWrap.onblur = () => inputWrap.style.borderColor = 'rgba(128,128,128,0.3)';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add a comment...';
        input.style.flex = '1';
        input.style.border = 'none';
        input.style.background = 'transparent';
        input.style.outline = 'none';
        input.style.padding = '8px 0';
        input.style.fontSize = '0.95rem';
        input.style.color = 'inherit';
        input.required = true;
        
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.innerHTML = '<i class="bi bi-send-fill"></i>';
        submit.style.background = 'none';
        submit.style.border = 'none';
        submit.style.color = '#3b82f6';
        submit.style.cursor = 'pointer';
        submit.style.fontSize = '1.2rem';
        submit.style.padding = '4px 0 4px 8px';
        submit.style.display = 'flex';
        submit.style.alignItems = 'center';
        submit.style.justifyContent = 'center';
        submit.style.transition = 'transform 0.2s';
        submit.onmouseover = () => submit.style.transform = 'scale(1.1)';
        submit.onmouseout = () => submit.style.transform = 'scale(1)';

        inputWrap.append(input, submit);
        form.append(myAvatar, inputWrap);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const comment = input.value.trim();
          if (!comment) return;
          fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ comment })
          })
          .then(res => res.json())
          .then(resp => {
            if (resp.success) {
              input.value = '';
              updateCount(resp.comments_count);
              loadComments(postId, container, updateCount);
            }
          });
        });

        container.append(list, form);
      })
      .catch(err => console.error('Error loading comments:', err));
  }

  // Image Modal Functions
  function openImageModal(imageSrc, caption, author) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalCaption = document.querySelector('.image-modal-caption');
    
    modalImage.src = imageSrc;
    modalCaption.innerHTML = `
      <strong>${author}</strong><br>
      ${caption || 'No caption'}
    `;
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Restore scrolling
  }

  // Modal event listeners
  const modal = document.getElementById('imageModal');
  const closeBtn = document.querySelector('.image-modal-close');
  
  // Close modal when clicking the X button
  closeBtn.addEventListener('click', closeImageModal);
  
  // Close modal when clicking outside the image
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeImageModal();
    }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'block') {
      closeImageModal();
    }
  });

// 🔥 NEW: Logic to open the likes modal
  function openLikesModal(postId) {
    fetch(`/api/posts/${postId}/likes`, { credentials: 'include' })
      .then(res => res.json())
      .then(likers => {
        const list = document.getElementById('likesList');
        list.innerHTML = '';
        
        if (likers.length === 0) {
          list.innerHTML = '<p style="color: #666; text-align: center;">No likes yet.</p>';
        } else {
          likers.forEach(user => {
            list.innerHTML += `
              <div style="display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;">
                <img src="/api/profile_pic/${user.username}" onerror="this.src='/uploads/default.jpg'" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid #eee;">
                <span style="font-weight: 600; color: #111; font-size: 1.05rem;">${user.full_name || user.username}</span>
              </div>
            `;
          });
        }
        document.getElementById('likesModal').style.display = 'flex';
      })
      .catch(err => console.error('Error fetching likes:', err));
  }

  // Close modal clicks
  const likesModal = document.getElementById('likesModal');
  const closeLikesBtn = document.querySelector('.likes-modal-close');
  if (closeLikesBtn) closeLikesBtn.addEventListener('click', () => likesModal.style.display = 'none');
  if (likesModal) likesModal.addEventListener('click', (e) => {
    if (e.target === likesModal) likesModal.style.display = 'none';
  });
});