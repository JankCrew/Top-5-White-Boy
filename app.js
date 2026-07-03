const CONFIG_KEY = "rank-circle-supabase-config";
const THEME_KEY = "rank-circle-theme";
const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const state = {
  client: null,
  session: null,
  authMode: "signIn",
  profile: null,
  membership: null,
  group: null,
  members: [],
  personalOrder: [],
  quotes: [],
  ideas: [],
  avatarFile: null,
  avatarPreviewUrl: null
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
  settingsButton: document.querySelector("#settingsButton"),
  headerAvatar: document.querySelector("#headerAvatar"),
  themeToggle: document.querySelector("#themeToggle"),
  refreshButton: document.querySelector("#refreshButton"),
  homeNavItem: document.querySelector("#homeNavItem"),
  rankingNavItem: document.querySelector("#rankingNavItem"),
  featuresNavItem: document.querySelector("#featuresNavItem"),
  groupNavItem: document.querySelector("#groupNavItem"),
  groupTitle: document.querySelector("#groupTitle"),
  rankingSubtext: document.querySelector("#rankingSubtext"),
  overallList: document.querySelector("#overallList"),
  personalRankingList: document.querySelector("#personalRankingList"),
  saveRankingButton: document.querySelector("#saveRankingButton"),
  featuresHub: document.querySelector("#featuresHub"),
  quoteBook: document.querySelector("#quoteBook"),
  quoteList: document.querySelector("#quoteList"),
  quoteBackButton: document.querySelector("#quoteBackButton"),
  addQuoteButton: document.querySelector("#addQuoteButton"),
  quoteComposer: document.querySelector("#quoteComposer"),
  quoteForm: document.querySelector("#quoteForm"),
  quoteInput: document.querySelector("#quoteInput"),
  quoteDateInput: document.querySelector("#quoteDateInput"),
  quoteContextInput: document.querySelector("#quoteContextInput"),
  closeQuoteButton: document.querySelector("#closeQuoteButton"),
  saveQuoteButton: document.querySelector("#saveQuoteButton"),
  ideasFeatureTitle: document.querySelector("#ideasFeatureTitle"),
  ideaBook: document.querySelector("#ideaBook"),
  ideaBookTitle: document.querySelector("#ideaBookTitle"),
  ideaList: document.querySelector("#ideaList"),
  ideaBackButton: document.querySelector("#ideaBackButton"),
  addIdeaButton: document.querySelector("#addIdeaButton"),
  ideaComposer: document.querySelector("#ideaComposer"),
  ideaForm: document.querySelector("#ideaForm"),
  ideaInput: document.querySelector("#ideaInput"),
  ideaContextInput: document.querySelector("#ideaContextInput"),
  closeIdeaButton: document.querySelector("#closeIdeaButton"),
  saveIdeaButton: document.querySelector("#saveIdeaButton"),
  createGroupForm: document.querySelector("#createGroupForm"),
  groupNameInput: document.querySelector("#groupNameInput"),
  joinGroupForm: document.querySelector("#joinGroupForm"),
  inviteCodeInput: document.querySelector("#inviteCodeInput"),
  currentInviteCode: document.querySelector("#currentInviteCode"),
  groupSettings: document.querySelector("#groupSettings"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  leaveGroupButton: document.querySelector("#leaveGroupButton"),
  memberList: document.querySelector("#memberList"),
  profileForm: document.querySelector("#profileForm"),
  nicknameInput: document.querySelector("#nicknameInput"),
  avatarFileInput: document.querySelector("#avatarFileInput"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
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

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  el.themeToggle.checked = theme === "dark";
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
  el.themeToggle.checked = document.documentElement.dataset.theme === "dark";

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
  el.groupSettings.classList.toggle("hidden", !state.group);
  el.ideasFeatureTitle.textContent = `${state.group?.name || "Group"} Ideas`;
  el.ideaBookTitle.textContent = `${state.group?.name || "Group"} Ideas`;
  updateNavigation();
  el.settingsButton.innerHTML = avatarMarkup(state.profile || {}, "header-avatar");
  el.nicknameInput.value = state.profile?.nickname || "";
  el.avatarFileInput.value = "";
  state.avatarFile = null;
  renderAvatarPreview();
  renderMembers();
  renderPersonalRanking();
}

function updateNavigation() {
  const hasGroup = Boolean(state.group);
  el.homeNavItem.classList.toggle("hidden", !hasGroup);
  el.rankingNavItem.classList.toggle("hidden", !hasGroup);
  el.featuresNavItem.classList.toggle("hidden", !hasGroup);
  el.groupNavItem.classList.toggle("hidden", hasGroup);

  const activeView = document.querySelector(".view.active")?.id;
  if (!hasGroup && activeView !== "groupView" && activeView !== "profileView") {
    switchView("groupView");
  } else if (hasGroup && activeView === "groupView") {
    switchView("rankingsView");
  }
}

function renderAvatarPreview() {
  const previewUrl = state.avatarPreviewUrl || state.profile?.avatar_url;
  if (previewUrl) {
    el.avatarPreview.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Profile preview" />`;
    return;
  }
  el.avatarPreview.textContent = initials(el.nicknameInput.value || state.profile?.nickname);
}

function selectAvatarFile() {
  const file = el.avatarFileInput.files[0] || null;
  if (!file) {
    state.avatarFile = null;
    if (state.avatarPreviewUrl) URL.revokeObjectURL(state.avatarPreviewUrl);
    state.avatarPreviewUrl = null;
    renderAvatarPreview();
    return;
  }

  if (!["image/png", "image/jpeg"].includes(file.type)) {
    el.avatarFileInput.value = "";
    showToast("Choose a PNG or JPEG image");
    return;
  }

  if (file.size > MAX_AVATAR_SIZE) {
    el.avatarFileInput.value = "";
    showToast("Profile pictures must be 5 MB or smaller");
    return;
  }

  if (state.avatarPreviewUrl) URL.revokeObjectURL(state.avatarPreviewUrl);
  state.avatarFile = file;
  state.avatarPreviewUrl = URL.createObjectURL(file);
  renderAvatarPreview();
}

async function uploadAvatar(file) {
  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${state.session.user.id}/avatar.${extension}`;
  const { error } = await state.client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: true });

  if (error) throw error;

  const { data } = state.client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
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
          <button type="button" aria-label="Move up" data-move="up" data-user-id="${member.id}">&#8593;</button>
          <button type="button" aria-label="Move down" data-move="down" data-user-id="${member.id}">&#8595;</button>
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
  el.saveProfileButton.disabled = true;
  el.saveProfileButton.textContent = state.avatarFile ? "Uploading..." : "Saving...";

  try {
    const avatarUrl = state.avatarFile
      ? await uploadAvatar(state.avatarFile)
      : state.profile?.avatar_url || null;

    const { error } = await state.client
      .from("profiles")
      .update({ nickname, avatar_url: avatarUrl })
      .eq("id", state.session.user.id);

    if (error) throw error;

    if (state.avatarPreviewUrl) URL.revokeObjectURL(state.avatarPreviewUrl);
    state.avatarPreviewUrl = null;
    showToast("Profile saved");
    await loadAppData();
  } catch (error) {
    showToast(error.message || "Could not save profile");
  } finally {
    el.saveProfileButton.disabled = false;
    el.saveProfileButton.textContent = "Save profile";
  }
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
    .insert({ group_id: group.id, user_id: state.session.user.id });

  if (memberError) {
    showToast(memberError.message);
    return;
  }

  el.inviteCodeInput.value = "";
  showToast("Joined group");
  await loadAppData();
}

function localDateValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function formatQuoteDate(value) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function renderQuotes() {
  if (!state.quotes.length) {
    el.quoteList.innerHTML = '<div class="empty-state">No quotes yet. Add the first one.</div>';
    return;
  }

  el.quoteList.innerHTML = state.quotes.map((item) => `
    <details class="quote-entry">
      <summary>
        <span class="quote-mark" aria-hidden="true">&ldquo;</span>
        <span>${escapeHtml(item.quote)}</span>
        <span class="quote-chevron" aria-hidden="true">&#8964;</span>
      </summary>
      <div class="quote-details">
        <div><strong>Date</strong><span>${escapeHtml(formatQuoteDate(item.quote_date))}</span></div>
        <div><strong>Added by</strong><span>${escapeHtml(item.author?.nickname || "Group member")}</span></div>
        ${item.context ? `<div class="quote-context"><strong>Context</strong><p>${escapeHtml(item.context)}</p></div>` : ""}
      </div>
    </details>
  `).join("");
}

async function loadQuotes() {
  const { data, error } = await state.client
    .from("quotes")
    .select("id, quote, quote_date, context, created_at, profiles(nickname)")
    .eq("group_id", state.group.id)
    .order("quote_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  state.quotes = data || [];
  renderQuotes();
}

async function openFeature(feature) {
  if (feature === "hangouts") {
    showToast("That feature is coming next");
    return;
  }

  el.featuresHub.classList.add("hidden");
  if (feature === "quotes") {
    el.quoteBook.classList.remove("hidden");
    await loadQuotes();
  } else if (feature === "ideas") {
    el.ideaBook.classList.remove("hidden");
    await loadIdeas();
  }
}

function showFeaturesHub() {
  el.quoteBook.classList.add("hidden");
  el.ideaBook.classList.add("hidden");
  el.featuresHub.classList.remove("hidden");
}

function openQuoteComposer() {
  el.quoteForm.reset();
  el.quoteDateInput.value = localDateValue();
  el.quoteComposer.classList.remove("hidden");
  el.quoteInput.focus();
}

function closeQuoteComposer() {
  el.quoteComposer.classList.add("hidden");
}

async function saveQuote(event) {
  event.preventDefault();
  const quote = el.quoteInput.value.trim();
  const context = el.quoteContextInput.value.trim() || null;
  if (!quote || !state.group) return;

  el.saveQuoteButton.disabled = true;
  el.saveQuoteButton.textContent = "Saving...";

  const { error } = await state.client.from("quotes").insert({
    group_id: state.group.id,
    author_id: state.session.user.id,
    quote,
    quote_date: el.quoteDateInput.value,
    context
  });

  el.saveQuoteButton.disabled = false;
  el.saveQuoteButton.textContent = "Save quote";

  if (error) {
    showToast(error.message);
    return;
  }

  closeQuoteComposer();
  showToast("Quote added");
  await loadQuotes();
}

function renderIdeas() {
  if (!state.ideas.length) {
    el.ideaList.innerHTML = '<div class="empty-state">No ideas yet. Add the first one.</div>';
    return;
  }

  el.ideaList.innerHTML = state.ideas.map((item) => {
    const votes = item.idea_votes || [];
    const score = votes.reduce((total, vote) => total + Number(vote.value), 0);
    const ownVote = votes.find((vote) => vote.voter_id === state.session.user.id)?.value || 0;
    return `
      <article class="idea-entry">
        <details>
          <summary>
            <span class="feature-icon idea-bulb" aria-hidden="true">&#9733;</span>
            <span>${escapeHtml(item.idea)}</span>
            <span class="quote-chevron" aria-hidden="true">&#8964;</span>
          </summary>
          <div class="quote-details">
            <div><strong>Added by</strong><span>${escapeHtml(item.profiles?.nickname || "Group member")}</span></div>
            ${item.context ? `<div class="quote-context"><strong>Context</strong><p>${escapeHtml(item.context)}</p></div>` : ""}
          </div>
        </details>
        <div class="vote-row">
          <button class="vote-button ${ownVote === 1 ? "active" : ""}" type="button" data-vote="1" data-idea-id="${item.id}" aria-label="Upvote">&#8593;</button>
          <strong class="vote-score" aria-label="Vote score">${score}</strong>
          <button class="vote-button ${ownVote === -1 ? "active" : ""}" type="button" data-vote="-1" data-idea-id="${item.id}" aria-label="Downvote">&#8595;</button>
        </div>
      </article>
    `;
  }).join("");
}

async function loadIdeas() {
  const { data, error } = await state.client
    .from("ideas")
    .select("id, idea, context, created_at, author:profiles!ideas_author_id_fkey(nickname), idea_votes(voter_id, value)")
    .eq("group_id", state.group.id)
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  state.ideas = data || [];
  renderIdeas();
}

function openIdeaComposer() {
  el.ideaForm.reset();
  el.ideaComposer.classList.remove("hidden");
  el.ideaInput.focus();
}

function closeIdeaComposer() {
  el.ideaComposer.classList.add("hidden");
}

async function saveIdea(event) {
  event.preventDefault();
  const idea = el.ideaInput.value.trim();
  const context = el.ideaContextInput.value.trim() || null;
  if (!idea || !state.group) return;

  el.saveIdeaButton.disabled = true;
  el.saveIdeaButton.textContent = "Saving...";
  const { error } = await state.client.from("ideas").insert({
    group_id: state.group.id,
    author_id: state.session.user.id,
    idea,
    context
  });
  el.saveIdeaButton.disabled = false;
  el.saveIdeaButton.textContent = "Save idea";

  if (error) {
    showToast(error.message);
    return;
  }

  closeIdeaComposer();
  showToast("Idea added");
  await loadIdeas();
}

async function voteOnIdea(ideaId, value) {
  const idea = state.ideas.find((item) => item.id === ideaId);
  const ownVote = idea?.idea_votes?.find((vote) => vote.voter_id === state.session.user.id)?.value || 0;
  let error;

  if (Number(ownVote) === value) {
    ({ error } = await state.client
      .from("idea_votes")
      .delete()
      .eq("idea_id", ideaId)
      .eq("voter_id", state.session.user.id));
  } else {
    ({ error } = await state.client
      .from("idea_votes")
      .upsert(
        { idea_id: ideaId, voter_id: state.session.user.id, value },
        { onConflict: "idea_id,voter_id" }
      ));
  }

  if (error) {
    showToast(error.message);
    return;
  }
  await loadIdeas();
}

async function copyInviteCode() {
  if (!state.group) return;
  try {
    await navigator.clipboard.writeText(state.group.invite_code);
    showToast("Invite code copied");
  } catch {
    showToast(`Invite code: ${state.group.invite_code}`);
  }
}

async function leaveGroup() {
  if (!state.group || !window.confirm("Leave this group?")) return;

  el.leaveGroupButton.disabled = true;
  const { error } = await state.client
    .from("group_members")
    .delete()
    .eq("group_id", state.group.id)
    .eq("user_id", state.session.user.id);

  el.leaveGroupButton.disabled = false;
  if (error) {
    showToast(error.message);
    return;
  }

  showToast("You left the group");
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
  el.settingsButton.addEventListener("click", () => switchView("profileView"));
  el.copyInviteButton.addEventListener("click", copyInviteCode);
  el.leaveGroupButton.addEventListener("click", leaveGroup);
  el.themeToggle.addEventListener("change", () => setTheme(el.themeToggle.checked ? "dark" : "light"));
  el.refreshButton.addEventListener("click", loadAppData);
  el.profileForm.addEventListener("submit", saveProfile);
  el.createGroupForm.addEventListener("submit", createGroup);
  el.joinGroupForm.addEventListener("submit", joinGroup);
  el.saveRankingButton.addEventListener("click", saveRanking);
  el.quoteBackButton.addEventListener("click", showFeaturesHub);
  el.ideaBackButton.addEventListener("click", showFeaturesHub);
  el.addIdeaButton.addEventListener("click", openIdeaComposer);
  el.closeIdeaButton.addEventListener("click", closeIdeaComposer);
  el.ideaForm.addEventListener("submit", saveIdea);
  el.ideaList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-vote]");
    if (!button) return;
    voteOnIdea(button.dataset.ideaId, Number(button.dataset.vote));
  });
  el.addQuoteButton.addEventListener("click", openQuoteComposer);
  el.closeQuoteButton.addEventListener("click", closeQuoteComposer);
  el.quoteForm.addEventListener("submit", saveQuote);
  document.querySelectorAll("[data-feature]").forEach((button) => {
    button.addEventListener("click", () => openFeature(button.dataset.feature));
  });
  el.nicknameInput.addEventListener("input", renderAvatarPreview);
  el.avatarFileInput.addEventListener("change", selectAvatarFile);

  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
    switchView(button.dataset.view);
    if (button.dataset.view === "featuresView") showFeaturesHub();
  }));

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
