const profileList = document.querySelector("#profile-list");
const profileForm = document.querySelector("#profile-form");
const profileStatus = document.querySelector("#profile-status");
const lastProfileKey = "kallistis-reforged:last-profile-id";

let profiles = [];
let activeProfileId = null;

function showStatus(message, kind = "") {
  profileStatus.textContent = message;
  profileStatus.className = `form-status ${kind}`.trim();
}

async function requestProfiles() {
  const response = await fetch("/api/profiles", { headers: { accept: "application/json" } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Não foi possível ler os perfis.");
  return result.profiles;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderProfiles() {
  profileList.replaceChildren();
  profileList.setAttribute("aria-busy", "false");

  if (profiles.length === 0) {
    profileList.append(
      element("p", "empty-state", "Nenhum perfil foi criado neste banco local ainda."),
    );
    return;
  }

  for (const profile of profiles) {
    const isActive = profile.id === activeProfileId;
    const card = element("article", `profile-card${isActive ? " is-active" : ""}`);
    const identity = element("div", "profile-identity");
    const marker = element("span", "profile-marker", isActive ? "◆" : "◇");
    marker.setAttribute("aria-hidden", "true");
    const copy = element("div", "profile-copy");
    copy.append(element("h3", "profile-name", profile.name));
    copy.append(element("p", "profile-role", profile.role.toUpperCase()));
    identity.append(marker, copy);

    const button = element("button", isActive ? "select-button is-selected" : "select-button");
    button.type = "button";
    button.textContent = isActive ? "PERFIL ATIVO" : "ATIVAR PERFIL";
    button.disabled = isActive;
    button.setAttribute("aria-pressed", String(isActive));
    button.addEventListener("click", () => selectProfile(profile));

    card.append(identity, button);
    profileList.append(card);
  }
}

function selectProfile(profile) {
  try {
    localStorage.setItem(lastProfileKey, profile.id);
    activeProfileId = profile.id;
    renderProfiles();
    showStatus(`${profile.name} está selecionado neste navegador.`, "is-success");
  } catch {
    showStatus("O navegador não conseguiu guardar a seleção local. Tente novamente.", "is-error");
  }
}

async function loadProfiles({ restoreSelection = false } = {}) {
  profiles = await requestProfiles();
  if (restoreSelection) {
    const rememberedId = localStorage.getItem(lastProfileKey);
    activeProfileId = profiles.some((profile) => profile.id === rememberedId) ? rememberedId : null;
    if (!activeProfileId) localStorage.removeItem(lastProfileKey);
  } else if (!profiles.some((profile) => profile.id === activeProfileId)) {
    activeProfileId = null;
  }
  renderProfiles();
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const submitButton = profileForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  showStatus("Gravando perfil no banco local…");

  try {
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        role: formData.get("role"),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "Não foi possível criar o perfil.");

    profileForm.reset();
    await loadProfiles();
    showStatus(`Perfil ${result.profile.name} criado e salvo.`, "is-success");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Falha ao criar o perfil.", "is-error");
  } finally {
    submitButton.disabled = false;
  }
});

try {
  await loadProfiles({ restoreSelection: true });
} catch (error) {
  profileList.setAttribute("aria-busy", "false");
  profileList.replaceChildren(
    element(
      "p",
      "empty-state is-error",
      error instanceof Error ? error.message : "Não foi possível abrir os perfis locais.",
    ),
  );
  showStatus("A leitura do banco local falhou.", "is-error");
}
