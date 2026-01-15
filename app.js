const DATA_URL = "data/dizionario_parmigiano.json";
const PARTS_URL = "data/parts.json";
const PAGE_SIZE = 40;

const searchInput = document.getElementById("search");
const modeForward = document.getElementById("modeForward");
const modeReverse = document.getElementById("modeReverse");
const toggleRaw = document.getElementById("toggleRaw");
const resultsEl = document.getElementById("results");
const loadMoreBtn = document.getElementById("loadMore");
const entryCountEl = document.getElementById("entryCount");
const matchCountEl = document.getElementById("matchCount");

let entries = [];
let filtered = [];
let visibleCount = PAGE_SIZE;
let showRaw = false;
let searchMode = "forward";

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const buildSearchIndex = (entry) => {
  const raw = entry.senses.map((sense) => sense.text || "").join(" ");
  const italian = normalize(raw);
  const dialect = normalize(raw);
  const dialectTokens = dialect.split(/[^a-zàèéìòùáíóúäëïöü]+/i).filter(Boolean);
  return { italian, dialect, dialectTokens };
};

const scoreEntry = (entry, query, index) => {
  if (!query) return 0;
  const lemma = normalize(entry.lemma);
  const italian = index.italian;
  const dialect = index.dialect;
  const dialectTokens = index.dialectTokens;

  if (searchMode === "forward") {
    if (lemma === query) return 0;
    if (lemma.startsWith(query)) return 1;
    if (lemma.includes(query)) return 2;
    if (italian.includes(query)) return 3;
    if (dialect.includes(query)) return 4;
    return 5;
  }

  if (dialectTokens.includes(query)) return 0;
  if (dialectTokens.some((token) => token.startsWith(query))) return 1;
  if (dialect.includes(query)) return 2;
  if (lemma === query) return 3;
  if (lemma.startsWith(query)) return 4;
  if (lemma.includes(query)) return 5;
  if (italian.includes(query)) return 6;
  return 7;
};

const filterEntries = () => {
  const query = normalize(searchInput.value);
  filtered = entries.filter((entry) => {
    if (!query) return true;
    const lemma = normalize(entry.lemma);
    const index = entry._index;
    if (searchMode === "forward") {
      return lemma.includes(query) || index.italian.includes(query);
    }
    return index.dialect.includes(query);
  });

  if (query) {
    filtered.sort((a, b) => {
      const scoreDiff =
        scoreEntry(a, query, a._index) - scoreEntry(b, query, b._index);
      if (scoreDiff !== 0) return scoreDiff;
      return normalize(a.lemma).localeCompare(normalize(b.lemma));
    });
  }

  visibleCount = PAGE_SIZE;
  render();
};

const collapseExpanded = () => {
  document
    .querySelectorAll(".entry.is-expanded")
    .forEach((item) => item.classList.remove("is-expanded"));
};

const toggleCard = (card) => {
  const isExpanded = card.classList.contains("is-expanded");
  collapseExpanded();
  if (!isExpanded) {
    card.classList.add("is-expanded");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

const renderEntry = (entry) => {
  const card = document.createElement("article");
  card.className = "entry";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-expanded", "false");

  const header = document.createElement("div");
  header.className = "entry-header";
  const lemma = document.createElement("div");
  lemma.className = "lemma";
  lemma.innerHTML = entry.lemma_formatted || entry.lemma;
  const pos = document.createElement("div");
  pos.className = "pos";
  if (entry.pos_formatted || entry.pos) {
    pos.innerHTML = entry.pos_formatted || entry.pos;
    header.appendChild(lemma);
    header.appendChild(pos);
  } else {
    header.appendChild(lemma);
  }

  const senses = document.createElement("div");
  senses.className = "sense";
  entry.senses.forEach((sense) => {
    const row = document.createElement("div");
    if (sense.label) {
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = `${sense.label})`;
      row.appendChild(label);
    }
    if (sense.pos_formatted || sense.pos) {
      const posTag = document.createElement("span");
      posTag.className = "pos-inline";
      posTag.innerHTML = sense.pos_formatted || sense.pos;
      row.appendChild(posTag);
    }
    const text = document.createElement("span");
    text.innerHTML = sense.formatted || sense.text || "";
    row.appendChild(text);
    senses.appendChild(row);
  });

  card.appendChild(header);
  card.appendChild(senses);

  if (showRaw) {
    const raw = document.createElement("div");
    raw.className = "raw";
    raw.textContent = entry.senses.map((sense) => sense.text || "").join(" ");
    card.appendChild(raw);
  }

  return card;
};

const render = () => {
  resultsEl.innerHTML = "";

  const visible = filtered.slice(0, visibleCount);
  visible.forEach((entry) => resultsEl.appendChild(renderEntry(entry)));

  entryCountEl.textContent = entries.length.toLocaleString("it-IT");
  matchCountEl.textContent = filtered.length.toLocaleString("it-IT");

  loadMoreBtn.style.display = visibleCount < filtered.length ? "block" : "none";
};

const loadParts = async () => {
  const response = await fetch(PARTS_URL, { cache: "no-store" });
  if (!response.ok) return null;
  const parts = await response.json();
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const datasets = await Promise.all(
    parts.map((part) => fetch(`data/parts/${part}`, { cache: "no-store" }).then((res) => res.json()))
  );
  return datasets.flat();
};

const init = async () => {
  const chunked = await loadParts();
  if (chunked) {
    entries = chunked;
  } else {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    entries = await response.json();
  }
  entries = entries.map((entry) => ({
    ...entry,
    _index: buildSearchIndex(entry),
  }));
  filtered = entries;
  render();
};

searchInput.addEventListener("input", filterEntries);
resultsEl.addEventListener("click", (event) => {
  const card = event.target.closest(".entry");
  if (!card) return;
  toggleCard(card);
});
resultsEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".entry");
  if (!card) return;
  event.preventDefault();
  toggleCard(card);
});
toggleRaw.addEventListener("click", () => {
  showRaw = !showRaw;
  toggleRaw.classList.toggle("active", showRaw);
  toggleRaw.textContent = showRaw ? "Nascondi testo grezzo" : "Mostra testo grezzo";
  render();
});
loadMoreBtn.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  render();
});

modeForward.addEventListener("click", () => {
  searchMode = "forward";
  modeForward.classList.add("active");
  modeReverse.classList.remove("active");
  filterEntries();
});

modeReverse.addEventListener("click", () => {
  searchMode = "reverse";
  modeReverse.classList.add("active");
  modeForward.classList.remove("active");
  filterEntries();
});

init().catch((error) => {
  resultsEl.innerHTML = `<p>Errore nel caricamento del dataset: ${error.message}</p>`;
});
