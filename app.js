const CONFIG_KEY = "rank-circle-supabase-config";

const state = {
  client: null,
  session: null,
  authMode: "signIn",
  profile: null,
  membership: null,
  group: null,
  members: [],
  personalOrder: []
};

const el = {
  setupPanel: document.querySelector("#setupPanel"),
  authPanel: document.querySelector("#authPanel"),
  appPanel: document.querySelector("#appPanel"),
  supabaseUrl: document.querySelector("#supabaseUrl"),
  supabaseAnonKey: document.querySelector("#supabaseAnonKey"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  signInTab: document.querySelector("#signInTab"),
  signUpTab: document.querySelector("#signUpTab"),
  authForm: document.querySelector("#authForm"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  signOutButton: document.querySelector("#signOutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  groupTitle: document.querySelector("#groupTitle"),
  rankingSubtext: document.querySelector("#rankingSubtext"),
  overallList: document.querySelector("#overallList"),
  personalRankingList: document.querySelector("#personalRankingList"),
  saveRankingButton: document.querySelector("#saveRankingButton"),
  createGroupForm: document.querySelector("#createGroupForm"),
  groupNameInput: document.querySelector("#groupNameInput"),
  joinGroupForm: document.querySelector("#joinGroupForm"),
  inviteCodeInput: document.querySelector("#inviteCodeInput"),
  currentInviteCode: document.querySelector("#currentInviteCode"),
  memberList: document.querySelector("#memberList"),
  profileForm: document.querySelector("#profileForm"),
  nicknameInput: document.querySelector("#nicknameInput"),
  avatarUrlInput: document.querySelector("#avatarUrlInput"),
  avatarPreview: document.querySelector("#avatarPreview"),
  toast: document.querySelector("#toast")
};

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function connectSupabase(config) {
  state.client = window.supabase.createClient(config.url, config.anonKey);
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  window.setTimeout(() => el.toast.classList.add("hidden"), 3000);
}

function showPanel(panelName) {
  el.setupPanel.classList.toggle("hidden", panelName !== "setup");
  el.authPanel.classList.toggle("hidden", panelName !== "auth");
  el.appPanel.classList.toggle("hidden", panelName !== "app");
}

function initials(name) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);
}

function avatarMarkup(person, className = "avatar") {
  if (person.avatar_url) {
    return `<img class="${className}" src="${escapeHtml(person.avatar_url)}" alt="${escapeHtml(person.nickname || "Member")}" />`;
  }
  return `<div class="${className}" aria-hidden="true">${escapeHtml(initials(person.nickname))}</div>`;
}

function setAuthMode(mode) {
  state.authMode = mode;
  el.signInTab.classList.toggle("active", mode === "signIn");
  el.signUpTab.classList.toggle("active", mode === "signUp");
  el.authSubmitButton.textContent = mode === "signIn" ? "Sign in" : "Create account";
}

async function bootstrap() {
  const config = loadConfig();
  if (!config?.url || !config?.anonKey) {
    showPanel("setup");
    return;
  }

  el.supabaseUrl.value = config.url;
  el.supabaseAnonKey.value = config.anonKey;
  connectSupabase(config);

  const { data } = await state.client.auth.getSession();
  state.session = data.session;

  state.client.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session) {
      await loadAppData();
      showPanel("app");
    } else {
      showPanel("auth");
    }
  });

  if (state.session) {
    await loadAppData();
    showPanel("app");
  } else {
    showPanel("auth");
  }
}

async function ensureProfile() {
  const user = state.session.user;
  const { data: existingProfile, error: lookupError } = await state.client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existingProfile) {
    state.profile = existingProfile;
    return;
  }

  const fallbackNickname = user.email?.split("@")[0] || "New friend";
  const { data: newProfile, error: insertError } = await state.client
    .from("profiles")
    .insert({ id: user.id, email: user.email, nickname: fallbackNickname })
    .select()
    .single();

  if (insertError) throw insertError;
  state.profile = newProfile;
}

async function loadAppData() {
  await ensureProfile();

  const { data: membership, error: membershipError } = await state.client
    .from("group_members")
    .select("*, groups(*)")
    .eq("user_id", state.session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;

  state.membership = membership;
  state.group = membership?.groups || null;
  state.members = [];
  state.personalOrder = [];

  if (state.group) {
    const { data: members, error: membersError } = await state.client
      .from("group_members")
      .select("user_id, profiles(id, nickname, avatar_url)")
      .eq("group_id", state.group.id)
      .order("created_at", { ascending: true });

    if (membersError) throw membersError;
    state.members = members.map((member) => member.profiles).filter(Boolean);

    const { data: ranking } = await state.client
      .from("rankings")
      .select("ranked_user_id, position")
      .eq("group_id", state.group.id)
      .eq("ranker_id", state.session.user.id)
      .order("position", { ascending: true });

    const rankedIds = (ranking || []).map((item) => item.ranked_user_id);
    const missingIds = state.members.map((member) => member.id).filter((id) => !rankedIds.includes(id));
    state.personalOrder = [...rankedIds, ...missingIds];
  }

  render();
  await renderOverallRanking();
}

function render() {
  el.groupTitle.textContent = state.group?.name || "Rank Circle";
  el.currentInviteCode.textContent = state.group?.invite_code || "None yet";
  el.nicknameInput.value = state.profile?.nickname || "";
  el.avatarUrlInput.value = state.profile?.avatar_url || "";
  renderAvatarPreview();
  renderMembers();
  renderPersonalRanking();
}

function renderAvatarPreview() {
  if (el.avatarUrlInput.value) {
    el.avatarPreview.innerHTML = `<img src="${escapeHtml(el.avatarUrlInput.value)}" alt="Profile preview" />`;
    return;
  }
  el.avatarPreview.textContent = initials(el.nicknameInput.value || state.profile?.nickname);
}

function renderMembers() {
  if (!state.members.length) {
    el.memberList.innerHTML = `<div class="empty-state">Create or join a group to see members.</div>`;
    return;
  }

  el.memberList.innerHTML = state.members.map((member) => `
    <article class="member-card">
      ${avatarMarkup(member)}
      <div>
        <div class="person-name">${escapeHtml(member.nickname)}</div>
        <div class="score">${member.id === state.session.user.id ? "You" : "Member"}</div>
      </div>
    </article>
  `).join("");
}

function renderPersonalRanking() {
  if (!state.group || !state.members.length) {
    el.personalRankingList.className = "rank-list empty-state";
    el.personalRankingList.textContent = "Join a group before making a ranking.";
    return;
  }

  el.personalRankingList.className = "rank-list";
  const memberById = new Map(state.members.map((member) => [member.id, member]));
  el.personalRankingList.innerHTML = state.personalOrder.map((id, index) => {
    const member = memberById.get(id);
    if (!member) return "";
    return `
      <article class="rank-card drag-card" draggable="true" data-user-id="${member.id}">
        <span class="drag-handle">::</span>
        <span class="rank-number">${index + 1}</span>
        <div>
          <div class="person-name">${escapeHtml(member.nickname)}</div>
          <div class="score">${member.id === state.session.user.id ? "You" : "Friend"}</div>
        </div>
        <div class="reorder-actions">
          <button type="button" aria-label="Move up" data-move="up" data-user-id="${member.id}">Up</button>
          <button type="button" aria-label="Move down" data-move="down" data-user-id="${member.id}">Down</button>
        </div>
      </article>
    `;
  }).join("");
}

async function renderOverallRanking() {
  if (!state.group) {
    el.overallList.className = "rank-list empty-state";
    el.overallList.textContent = "Join or create a group to see rankings.";
    el.rankingSubtext.textContent = "Averages update when members submit rankings.";
    return;
  }

  const { data, error } = await state.client
    .from("group_rankings")
    .select("*")
    .eq("group_id", state.group.id)
    .order("average_position", { ascending: true });

  if (error) {
    showToast(error.message);
    return;
  }

  if (!data.length) {
    el.overallList.className = "rank-list empty-state";
    el.overallList.textContent = "No rankings submitted yet.";
    el.rankingSubtext.textContent = "Be the first to save a ranking.";
    return;
  }

  el.overallList.className = "rank-list";
  el.rankingSubtext.textContent = `${data.length} ranked member${data.length === 1 ? "" : "s"}`;
  el.overallList.innerHTML = data.map((person, index) => `
    <article class="rank-card">
      <span class="rank-number">${index + 1}</span>
      ${avatarMarkup(person)}
      <div>
        <div class="person-name">${escapeHtml(person.nickname)}</div>
        <div class="score">Average rank ${Number(person.average_position).toFixed(2)}</div>
      </div>
    </article>
  `).join("");
}

async function saveProfile(event) {
  event.preventDefault();
  const nickname = el.nicknameInput.value.trim();
  const avatarUrl = el.avatarUrlInput.value.trim() || null;

  const { error } = await state.client
    .from("profiles")
    .update({ nickname, avatar_url: avatarUrl })
    .eq("id", state.session.user.id);

  if (error) {
    showToast(error.message);
    return;
  }

  showToast("Profile saved");
  await loadAppData();
}

function randomInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

async function createGroup(event) {
  event.preventDefault();
  const name = el.groupNameInput.value.trim();
  if (!name) return;

  const { data: group, error: groupError } = await state.client
    .from("groups")
    .insert({ name, invite_code: randomInviteCode(), created_by: state.session.user.id })
    .select()
    .single();

  if (groupError) {
    showToast(groupError.message);
    return;
  }

  const { error: memberError } = await state.client.from("group_members").insert({ group_id: group.id, user_id: state.session.user.id });
  if (memberError) {
    showToast(memberError.message);
    return;
  }

  el.groupNameInput.value = "";
  showToast("Group created");
  await loadAppData();
}

async function joinGroup(event) {
  event.preventDefault();
  const inviteCode = el.inviteCodeInput.value.trim().toUpperCase();
  if (!inviteCode) return;

  const { data: group, error: groupError } = await state.client
    .from("groups")
    .select("*")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (groupError || !group) {
    showToast("No group found for that code");
    return;
  }

  const { error: memberError } = await state.client
    .from("group_members")
    .upsert({ group_id: group.id, user_id: state.session.user.id }, { onConflict: "group_id,user_id" });

  if (memberError) {
    showToast(memberError.message);
    return;
  }

  el.inviteCodeInput.value = "";
  showToast("Joined group");
  await loadAppData();
}

function moveRanking(userId, direction) {
  const index = state.personalOrder.indexOf(userId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.personalOrder.length) return;
  const nextOrder = [...state.personalOrder];
  [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
  state.personalOrder = nextOrder;
  renderPersonalRanking();
}

async function saveRanking() {
  if (!state.group) {
    showToast("Join a group first");
    return;
  }

  const rows = state.personalOrder.map((rankedUserId, index) => ({
    group_id: state.group.id,
    ranker_id: state.session.user.id,
    ranked_user_id: rankedUserId,
    position: index + 1
  }));

  const { error } = await state.client
    .from("rankings")
    .upsert(rows, { onConflict: "group_id,ranker_id,ranked_user_id" });

  if (error) {
    showToast(error.message);
    return;
  }

  showToast("Ranking saved");
  await renderOverallRanking();
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
}

function wireEvents() {
  el.saveConfigButton.addEventListener("click", () => {
    const config = { url: el.supabaseUrl.value.trim(), anonKey: el.supabaseAnonKey.value.trim() };
    if (!config.url || !config.anonKey) {
      showToast("Add your Supabase URL and anon key");
      return;
    }
    saveConfig(config);
    connectSupabase(config);
    showPanel("auth");
  });

  el.signInTab.addEventListener("click", () => setAuthMode("signIn"));
  el.signUpTab.addEventListener("click", () => setAuthMode("signUp"));

  el.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = el.emailInput.value.trim();
    const password = el.passwordInput.value;
    const authCall = state.authMode === "signIn"
      ? state.client.auth.signInWithPassword({ email, password })
      : state.client.auth.signUp({ email, password });

    const { error } = await authCall;
    if (error) {
      showToast(error.message);
      return;
    }

    showToast(state.authMode === "signIn" ? "Signed in" : "Account created. Check email if confirmation is on.");
  });

  el.signOutButton.addEventListener("click", () => state.client.auth.signOut());
  el.refreshButton.addEventListener("click", loadAppData);
  el.profileForm.addEventListener("submit", saveProfile);
  el.createGroupForm.addEventListener("submit", createGroup);
  el.joinGroupForm.addEventListener("submit", joinGroup);
  el.saveRankingButton.addEventListener("click", saveRanking);
  el.nicknameInput.addEventListener("input", renderAvatarPreview);
  el.avatarUrlInput.addEventListener("input", renderAvatarPreview);

  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));

  el.personalRankingList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-move]");
    if (!button) return;
    moveRanking(button.dataset.userId, button.dataset.move);
  });

  let draggedId = null;
  el.personalRankingList.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-user-id]");
    draggedId = card?.dataset.userId || null;
  });
  el.personalRankingList.addEventListener("dragover", (event) => event.preventDefault());
  el.personalRankingList.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = event.target.closest("[data-user-id]");
    if (!draggedId || !target || draggedId === target.dataset.userId) return;
    const nextOrder = state.personalOrder.filter((id) => id !== draggedId);
    const targetIndex = nextOrder.indexOf(target.dataset.userId);
    nextOrder.splice(targetIndex, 0, draggedId);
    state.personalOrder = nextOrder;
    renderPersonalRanking();
  });
}

wireEvents();
bootstrap().catch((error) => {
  console.error(error);
  showToast(error.message || "Something went wrong");
});
