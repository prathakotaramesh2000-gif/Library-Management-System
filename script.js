
"use strict";

// Open Library's public search API does not require an API key.
const API_URL = "https://openlibrary.org/search.json";

const grid = document.getElementById("book-grid");
const savedGrid = document.getElementById("saved-grid");
const statusMessage = document.getElementById("status");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const savedCount = document.getElementById("saved-count");
const savedStat = document.getElementById("stat-saved");
const catalogCount = document.getElementById("catalog-count");
const catalogTitle = document.getElementById("catalog-title");
const catalogSubtitle = document.getElementById("catalog-subtitle");
const showAllButton = document.getElementById("show-all");
const loadMoreButton = document.getElementById("load-more");
const savedEmpty = document.getElementById("saved-empty");

let featuredBooks = [];
let visibleBooks = [];
let savedBooks = readSavedBooks();
let activeCategory = "All";
let currentQuery = "";
let currentPage = 1;
let loading = false;
let requestNumber = 0;

const PAGE_SIZE = 20;

// -------------------------------
// Safe text handling
// -------------------------------

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function normalizeBook(book) {
  return {
    id: String(book.id),
    title: book.title || "Untitled Book",
    author: book.author || "Unknown author",
    year: book.year || "",
    category: book.category || "General",
    cover: book.cover || "",
    description: book.description || "",
    link: book.link || "https://openlibrary.org/"
  };
}

function guessCategory(subjects = []) {
  const text = subjects.join(" ").toLowerCase();

  if (/programming|computer|software|technology|web development/.test(text)) {
    return "Technology";
  }

  if (/science|physics|biology|chemistry|astronomy/.test(text)) {
    return "Science";
  }

  if (/self-help|personal development|productivity|motivation/.test(text)) {
    return "Self-help";
  }

  if (/fiction|novel|short stories|fantasy|romance/.test(text)) {
    return "Fiction";
  }

  return "General";
}

// -------------------------------
// Reading list persistence
// -------------------------------

function readSavedBooks() {
  try {
    const stored = JSON.parse(localStorage.getItem("libraspace-books") || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function persistSavedBooks() {
  try {
    localStorage.setItem("libraspace-books", JSON.stringify(savedBooks));
  } catch {
    statusMessage.textContent =
      "Browser storage is unavailable. Your reading list may not persist.";
  }

  updateSavedCount();
  renderSavedBooks();
}

function updateSavedCount() {
  savedCount.textContent = savedBooks.length;
  savedStat.textContent = savedBooks.length;
}

function isSaved(id) {
  return savedBooks.some(book => book.id === id);
}

function toggleSaved(id) {
  const existing = savedBooks.some(book => book.id === id);

  if (existing) {
    savedBooks = savedBooks.filter(book => book.id !== id);
  } else {
    const book = visibleBooks.find(item => item.id === id)
      || featuredBooks.find(item => item.id === id);

    if (book) savedBooks = [...savedBooks, book];
  }

  persistSavedBooks();
  renderBooks();
}

// -------------------------------
// Book card rendering
// -------------------------------

function createBookCard(book) {
  const saved = isSaved(book.id);
  const cover = book.cover
    ? `<img class="cover" src="${escapeHTML(book.cover)}"
         alt="Cover of ${escapeHTML(book.title)}"
         loading="lazy"
         onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
    : "";

  return `
    <article class="book-card">
      <div class="cover-wrap">
        ${cover}
        <div class="cover-placeholder" ${book.cover ? "hidden" : ""}>
          ${escapeHTML(book.title)}
        </div>
      </div>
      <div class="book-body">
        <span class="category-label">${escapeHTML(book.category)}</span>
        <h3 class="book-title">${escapeHTML(book.title)}</h3>
        <p class="book-author">${escapeHTML(book.author)}</p>
        <p class="book-meta">${book.year ? `Published ${escapeHTML(book.year)}` : "Publication year unavailable"}</p>
        <div class="card-actions">
          <a class="view-button"
             href="${escapeHTML(book.link)}"
             target="_blank"
             rel="noopener noreferrer">View Book</a>
          <button class="save-button ${saved ? "saved" : ""}"
             data-save-id="${escapeHTML(book.id)}"
             type="button"
             aria-pressed="${saved}">
             ${saved ? "♥ Saved" : "♡ Save"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderBooks() {
  const filtered = activeCategory === "All"
    ? visibleBooks
    : visibleBooks.filter(book => book.category === activeCategory);

  grid.innerHTML = filtered.map(createBookCard).join("");
  catalogCount.textContent = filtered.length;

  if (filtered.length === 0 && !loading) {
    statusMessage.textContent = currentQuery
      ? "No matching books found. Try another search."
      : "No books found in this category.";
  } else if (filtered.length > 0) {
    statusMessage.textContent = "";
  }
}

function renderSavedBooks() {
  savedGrid.innerHTML = savedBooks.map(createBookCard).join("");
  savedEmpty.classList.toggle("hidden", savedBooks.length > 0);
}

function setCategory(category) {
  activeCategory = category;

  document.querySelectorAll(".filter").forEach(button => {
    const active = button.dataset.category === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  renderBooks();
}

// -------------------------------
// Load sample JSON data
// -------------------------------

async function loadFeaturedBooks() {
  statusMessage.textContent = "Loading featured books...";

  try {
    const response = await fetch("./users.json");

    if (!response.ok) {
      throw new Error("Could not load users.json");
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Sample data must be a JSON array.");
    }

    featuredBooks = data.map(normalizeBook);
    visibleBooks = [...featuredBooks];

    catalogTitle.textContent = "Featured Books";
    catalogSubtitle.textContent = "A handpicked selection to get you started.";
    loadMoreButton.classList.add("hidden");
    statusMessage.textContent = "";

    renderBooks();
  } catch (error) {
    console.error(error);
    statusMessage.textContent =
      "Could not load local books. Run this project using VS Code Live Server.";
  }
}

// -------------------------------
// Search live book API
// -------------------------------

async function searchBooks(query, page = 1) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    currentQuery = "";
    currentPage = 1;
    visibleBooks = [...featuredBooks];
    catalogTitle.textContent = "Featured Books";
    catalogSubtitle.textContent = "A handpicked selection to get you started.";
    statusMessage.textContent = "";
    loadMoreButton.classList.add("hidden");
    renderBooks();
    return;
  }

  const thisRequest = ++requestNumber;
  currentQuery = trimmedQuery;
  currentPage = page;
  loading = true;

  catalogTitle.textContent = "Search Results";
  catalogSubtitle.textContent = `Results for "${trimmedQuery}"`;
  statusMessage.textContent = "Searching the Open Library catalog...";
  loadMoreButton.classList.add("hidden");

  if (page === 1) {
    visibleBooks = [];
    renderBooks();
  }

  try {
    const params = new URLSearchParams({
      q: trimmedQuery,
      page: String(page),
      limit: String(PAGE_SIZE),
      fields: "key,title,author_name,first_publish_year,cover_i,subject"
    });

    const response = await fetch(`${API_URL}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Book API returned ${response.status}`);
    }

    const data = await response.json();

    // Ignore stale responses if another search was started.
    if (thisRequest !== requestNumber) return;

    const results = (data.docs || []).map(item => {
      const key = item.key || "";
      const subjects = item.subject || [];

      return normalizeBook({
        id: key || `${item.title}-${item.first_publish_year}`,
        title: item.title,
        author: (item.author_name || []).slice(0, 3).join(", "),
        year: item.first_publish_year,
        category: guessCategory(subjects),
        cover: item.cover_i
          ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
          : "",
        link: key
          ? `https://openlibrary.org${key}`
          : `https://openlibrary.org/search?q=${encodeURIComponent(item.title || "")}`
      });
    });

    if (page === 1) {
      visibleBooks = results;
    } else {
      const knownIds = new Set(visibleBooks.map(book => book.id));
      visibleBooks = [
        ...visibleBooks,
        ...results.filter(book => !knownIds.has(book.id))
      ];
    }

    loading = false;
    statusMessage.textContent = results.length
      ? `Found ${data.numFound ?? results.length} matching books.`
      : "No matching books found. Try a different title or author.";

    loadMoreButton.classList.toggle(
      "hidden",
      results.length < PAGE_SIZE || visibleBooks.length >= (data.numFound || 0)
    );

    renderBooks();
  } catch (error) {
    if (thisRequest !== requestNumber) return;

    loading = false;
    console.error(error);
    statusMessage.textContent =
      "Unable to contact the book API. Check your internet connection and try again.";
    loadMoreButton.classList.add("hidden");
  } finally {
    if (thisRequest === requestNumber) {
      loading = false;
    }
  }
}

// -------------------------------
// Events
// -------------------------------

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  setCategory("All");
  searchBooks(searchInput.value);
});

document.getElementById("filters").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (button) setCategory(button.dataset.category);
});

// Event delegation handles buttons in both book grids.
document.addEventListener("click", event => {
  const button = event.target.closest("[data-save-id]");
  if (button) toggleSaved(button.dataset.saveId);
});

showAllButton.addEventListener("click", () => {
  searchInput.value = "";
  setCategory("All");
  searchBooks("");
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth" });
});

loadMoreButton.addEventListener("click", () => {
  if (!loading && currentQuery) {
    searchBooks(currentQuery, currentPage + 1);
  }
});

// -------------------------------
// Start application
// -------------------------------

updateSavedCount();
renderSavedBooks();
loadFeaturedBooks();
