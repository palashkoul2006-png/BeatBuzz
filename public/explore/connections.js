// Load session user first
fetch("/api/session_user", { credentials: "include" })
  .then(res => res.json())
  .then(user => {
    if (user.username) {
      loadConnections(user.username);
    }
  })
  .catch(err => console.error("Error fetching session user:", err));

function loadConnections(username) {
  fetch(`/api/connections/${username}`)
    .then(res => res.json())
    .then(data => {
      renderList("followers-list", data.followers);
      renderList("following-list", data.following);
    })
    .catch(err => console.error("Error loading connections:", err));
}

function renderList(containerId, users) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (!users.length) {
    container.innerHTML = "<p class='empty'>No users found</p>";
    return;
  }

  users.forEach(user => {
    const card = document.createElement("div");
    card.className = "user-card";

    const img = document.createElement("img");
    img.src = user.profile_pic_url || (user.profile_pic ? `/uploads/${user.profile_pic}` : "/uploads/default.jpg");
    img.onerror = () => { img.src = "/uploads/default.jpg"; };

    const name = document.createElement("div");
    name.className = "user-name";
    name.textContent = user.full_name;

    card.appendChild(img);
    card.appendChild(name);
    container.appendChild(card);
  });
}
