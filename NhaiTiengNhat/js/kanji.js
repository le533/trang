const kanjiGrid = document.querySelector("#kanji-grid");

if (kanjiGrid) {
  const KANJI_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : `${window.location.origin}/api`);
  const totalCount = document.querySelector("#kanji-total");
  const gridCount = document.querySelector("#kanji-grid-count");
  const loadError = document.querySelector("#kanji-load-error");
  const loadErrorMessage = loadError.querySelector("[data-kanji-error-message]");
  const emptyState = document.querySelector("#kanji-empty-state");
  const searchForm = document.querySelector("#kanji-search-form");
  const searchInput = document.querySelector("#kanji-search-input");
  const strokeFilter = document.querySelector("#kanji-stroke-filter");
  const radicalFilter = document.querySelector("#kanji-radical-filter");
  const clearFiltersButton = document.querySelector("#clear-kanji-filters");
  const levelButtons = [...document.querySelectorAll("[data-level]")];
  const adminAddButton = document.createElement("button");
  const detailDialog = document.querySelector("#kanji-dialog");
  const detailContent = document.querySelector("#kanji-detail-content");
  const closeDetailButton = document.querySelector("#close-kanji-detail");
  let kanjiEntries = [];
  let activeLevel = "all";

  function getKanjiToken() {
    return localStorage.getItem("nihongo_token") || sessionStorage.getItem("nihongo_token");
  }

  async function kanjiRequest(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    const token = getKanjiToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${KANJI_API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({ message: "Phản hồi không hợp lệ từ máy chủ." }));
    if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
    return data;
  }

  function ensureAdminDialogStyles() {
    if (document.querySelector("#kanji-admin-dialog-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "kanji-admin-dialog-styles";
    style.textContent = `
      .content-admin-dialog {
        width: min(100%, 560px);
        padding: 0;
        border: 1px solid rgba(39, 103, 93, 0.12);
        border-radius: 18px;
        background: #fff;
      }
      .content-admin-dialog::backdrop {
        background: rgba(13, 23, 21, 0.42);
      }
      .content-admin-form {
        display: grid;
        gap: 16px;
        padding: 24px;
      }
      .content-admin-form h3 {
        margin: 0;
        font-size: 1.45rem;
      }
      .content-admin-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .content-admin-field {
        display: grid;
        gap: 7px;
      }
      .content-admin-field label {
        color: var(--color-ink);
        font-size: 12px;
        font-weight: 700;
      }
      .content-admin-field input,
      .content-admin-field textarea,
      .content-admin-field select {
        width: 100%;
        min-height: 42px;
        padding: 10px 12px;
        border: 1px solid var(--color-border);
        border-radius: 10px;
        font: inherit;
        background: #f9faf8;
      }
      .content-admin-field textarea {
        min-height: 88px;
        resize: vertical;
      }
      .content-admin-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 8px;
      }
      .content-admin-button {
        min-height: 42px;
      }
      @media (max-width: 640px) {
        .content-admin-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.append(style);
  }

  function showKanjiAdminDialog(entry) {
    ensureAdminDialogStyles();

    const dialog = document.createElement("dialog");
    dialog.className = "content-admin-dialog";
    const isEditing = Boolean(entry && entry.id);
    const title = isEditing ? "Sửa Kanji" : "Thêm Kanji";
    const form = document.createElement("form");
    form.method = "dialog";
    form.className = "content-admin-form";
    form.innerHTML = `
      <h3>${title}</h3>
      <div class="content-admin-grid">
        <div class="content-admin-field">
          <label for="admin-kanji-character">Kanji</label>
          <input id="admin-kanji-character" name="kanji" required />
        </div>
        <div class="content-admin-field">
          <label for="admin-kanji-hanviet">Hán Việt</label>
          <input id="admin-kanji-hanviet" name="hanViet" />
        </div>
        <div class="content-admin-field" style="grid-column: 1 / -1;">
          <label for="admin-kanji-meaning">Nghĩa</label>
          <input id="admin-kanji-meaning" name="meaning" required />
        </div>
        <div class="content-admin-field">
          <label for="admin-kanji-jlpt">JLPT</label>
          <select id="admin-kanji-jlpt" name="jlpt">
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3">N3</option>
            <option value="N2">N2</option>
            <option value="N1">N1</option>
          </select>
        </div>
        <div class="content-admin-field">
          <label for="admin-kanji-strokes">Số nét</label>
          <input id="admin-kanji-strokes" name="strokes" type="number" min="1" required />
        </div>
        <div class="content-admin-field">
          <label for="admin-kanji-kun">Kun</label>
          <textarea id="admin-kanji-kun" name="kun"></textarea>
        </div>
        <div class="content-admin-field">
          <label for="admin-kanji-on">On</label>
          <textarea id="admin-kanji-on" name="on"></textarea>
        </div>
        <div class="content-admin-field" style="grid-column: 1 / -1;">
          <label for="admin-kanji-radicals">Bộ thủ</label>
          <textarea id="admin-kanji-radicals" name="radicals"></textarea>
        </div>
      </div>
      <div class="content-admin-actions">
        <button class="button button-secondary content-admin-button" type="button" data-close-dialog>Hủy</button>
        <button class="button button-primary content-admin-button" type="submit">Lưu</button>
      </div>
    `;

    form.elements.kanji.value = entry?.kanji || "";
    form.elements.hanViet.value = entry?.hanViet || "";
    form.elements.meaning.value = entry?.meaning || "";
    form.elements.jlpt.value = entry?.jlpt || "N5";
    form.elements.strokes.value = entry?.strokes || 1;
    form.elements.kun.value = (entry?.kun || []).join("\n");
    form.elements.on.value = (entry?.on || []).join("\n");
    form.elements.radicals.value = (entry?.radicals || []).join("\n");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const value = {
        kanji: String(formData.get("kanji") || "").trim(),
        hanViet: String(formData.get("hanViet") || "").trim(),
        meaning: String(formData.get("meaning") || "").trim(),
        jlpt: String(formData.get("jlpt") || "N5"),
        strokes: Number(formData.get("strokes") || 1),
        kun: String(formData.get("kun") || "")
          .split(/\n|,/) 
          .map((value) => value.trim())
          .filter(Boolean),
        on: String(formData.get("on") || "")
          .split(/\n|,/) 
          .map((value) => value.trim())
          .filter(Boolean),
        radicals: String(formData.get("radicals") || "")
          .split(/\n|,/) 
          .map((value) => value.trim())
          .filter(Boolean),
      };

      if (!value.kanji || !value.meaning) {
        return;
      }

      const submitButton = form.querySelector('[type="submit"]');
      submitButton.disabled = true;
      try {
        await kanjiRequest(entry ? `/kanji/${encodeURIComponent(entry.id)}` : "/kanji", {
          method: entry ? "PUT" : "POST",
          body: JSON.stringify(value),
        });
        dialog.close();
        await loadKanji();
      } catch (error) {
        window.alert(`Không thể lưu Kanji: ${error.message}`);
      } finally {
        submitButton.disabled = false;
      }
    });

    form.querySelector("[data-close-dialog]").addEventListener("click", () => {
      dialog.close();
    });

    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  }

  async function deleteKanji(entryId) {
    const confirmed = window.confirm("Bạn có chắc muốn xóa Kanji này?");
    if (!confirmed) {
      return;
    }

    try {
      await kanjiRequest(`/kanji/${encodeURIComponent(entryId)}`, { method: "DELETE" });
      await loadKanji();
    } catch (error) {
      window.alert(`Không thể xóa Kanji: ${error.message}`);
    }
  }

  function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function createReadingRow(label, readings) {
    const row = document.createElement("p");
    const labelElement = createTextElement("span", "", label);
    const readingElement = createTextElement(
      "strong",
      "",
      readings.length ? readings.join(" · ") : "Chưa có dữ liệu",
    );

    row.append(labelElement, readingElement);
    return row;
  }

  function toKatakana(readings) {
    return readings.map((reading) =>
      Array.from(reading, (character) => {
        const codePoint = character.codePointAt(0);
        return codePoint >= 0x3041 && codePoint <= 0x3096
          ? String.fromCodePoint(codePoint + 0x60)
          : character;
      }).join(""),
    );
  }

  function normalizeSearchText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("vi");
  }

  function populateFilter(select, values, label) {
    [...select.options].slice(1).forEach(option => option.remove());
    const options = values.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label(value);
      return option;
    });

    select.append(...options);
  }

  function updateAdminControls() {
    if (!adminAddButton || !clearFiltersButton) {
      return;
    }

    const isAdminUser = typeof isAdmin === "function" && isAdmin();
    adminAddButton.className = "button button-primary";
    adminAddButton.type = "button";
    adminAddButton.textContent = "Thêm Kanji";
    adminAddButton.hidden = !isAdminUser;
    adminAddButton.style.marginLeft = "12px";
    if (!adminAddButton.dataset.bound) {
      adminAddButton.addEventListener("click", () => showKanjiAdminDialog());
      adminAddButton.dataset.bound = "true";
    }

    const toolbar = document.querySelector(".kanji-filters");
    if (toolbar && !toolbar.contains(adminAddButton)) {
      toolbar.append(adminAddButton);
    }
  }

  function updateLevelButtons() {
    levelButtons.forEach((button) => {
      const selected = button.dataset.level === activeLevel;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function filterKanji() {
    const query = normalizeSearchText(searchInput.value.trim());
    const selectedStrokes = strokeFilter.value;
    const selectedRadical = radicalFilter.value;
    const filteredEntries = kanjiEntries.filter((entry) => {
      if (activeLevel !== "all" && entry.jlpt !== activeLevel) {
        return false;
      }

      if (
        selectedStrokes !== "all" &&
        String(entry.strokes) !== selectedStrokes
      ) {
        return false;
      }

      if (
        selectedRadical !== "all" &&
        !entry.radicals.includes(selectedRadical)
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableFields = [
        entry.kanji,
        entry.hanViet,
        entry.meaning,
        ...entry.kun,
        ...entry.on,
      ];

      return searchableFields.some((field) =>
        normalizeSearchText(field).includes(query),
      );
    });

    renderKanji(filteredEntries);
  }

  function openKanjiDetail(entry) {
    detailContent.replaceChildren();

    const hero = document.createElement("div");
    hero.className = "kanji-detail-hero";
    hero.append(createTextElement("p", "kanji-detail-character", entry.kanji));

    const summary = document.createElement("div");
    summary.className = "kanji-detail-summary";
    const detailTitle = createTextElement("h2", "", entry.meaning);
    detailTitle.id = "detail-title";
    summary.append(
      createTextElement("p", "kanji-detail-hanviet", entry.hanViet || ""),
      detailTitle,
    );

    const badges = document.createElement("div");
    badges.className = "kanji-detail-badges";
    badges.append(
      createTextElement("span", "kanji-level-badge", entry.jlpt),
      createTextElement("span", "detail-strokes", `${entry.strokes} nét`),
    );
    summary.append(badges);
    hero.append(summary);

    const readings = document.createElement("section");
    readings.className = "kanji-detail-section";
    readings.append(createTextElement("h3", "", "Cách đọc"));
    const readingList = document.createElement("div");
    readingList.className = "kanji-detail-readings";
    readingList.append(
      createReadingRow("KUN", entry.kun),
      createReadingRow("ON", toKatakana(entry.on)),
    );
    readings.append(readingList);

    detailContent.append(hero, readings);

    if (entry.vocabulary?.length) {
      const vocabularySection = document.createElement("section");
      vocabularySection.className = "kanji-detail-section";
      vocabularySection.append(
        createTextElement("h3", "", "Từ vựng liên quan"),
      );

      const vocabularyList = document.createElement("div");
      vocabularyList.className = "related-vocabulary-list";

      entry.vocabulary.forEach((word) => {
        const wordItem = document.createElement("article");
        wordItem.className = "related-vocabulary-item";
        wordItem.append(
          createTextElement("strong", "", word.word),
          createTextElement("span", "", word.reading),
          createTextElement("p", "", word.meaning),
        );
        vocabularyList.append(wordItem);
      });

      vocabularySection.append(vocabularyList);
      detailContent.append(vocabularySection);
    }

    detailDialog.showModal();
  }

  function renderKanji(entries) {
    const fragment = document.createDocumentFragment();

    entries.forEach((entry) => {
      const card = document.createElement("button");
      card.className = "kanji-card";
      card.type = "button";
      card.setAttribute(
        "aria-label",
        `${entry.kanji}, ${entry.hanViet || ""}, ${entry.meaning}, ${entry.jlpt}`,
      );

      const meta = document.createElement("span");
      meta.className = "kanji-card-meta";
      meta.append(
        createTextElement("span", "kanji-level-badge", entry.jlpt),
        createTextElement("span", "", `${entry.strokes} nét`),
      );

      const cardContent = document.createElement("div");
      cardContent.className = "kanji-card-content";
      cardContent.append(
        meta,
        createTextElement("span", "kanji-character", entry.kanji),
        createTextElement("span", "kanji-card-hanviet", entry.hanViet || ""),
        createTextElement("span", "kanji-card-meaning", entry.meaning),
        createTextElement(
          "span",
          "kanji-card-reading",
          entry.kun.length ? entry.kun.join(" · ") : "",
        ),
        createTextElement("span", "kanji-card-detail-link", "Xem chi tiết →"),
      );
      card.append(cardContent);

      if (typeof isAdmin === "function" && isAdmin()) {        const actionRow = document.createElement("div");
        actionRow.className = "kanji-admin-actions";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "button button-secondary";
        editButton.textContent = "Sửa";
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          showKanjiAdminDialog(entry);
        });
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "button button-secondary";
        deleteButton.textContent = "Xóa";
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteKanji(entry.id);
        });
        actionRow.append(editButton, deleteButton);
        card.append(actionRow);
      }

      card.addEventListener("click", () => openKanjiDetail(entry));
      fragment.append(card);
    });

    kanjiGrid.replaceChildren(fragment);
    gridCount.textContent = `${entries.length} / ${kanjiEntries.length} Kanji`;
    emptyState.hidden = entries.length > 0;
  }

  async function loadKanji() {
    loadError.hidden = true;
    gridCount.textContent = "Đang tải danh sách...";
    try {
      const first = await kanjiRequest("/kanji?page=1&limit=200");
      kanjiEntries = first.data || [];
      for (let page = 2; kanjiEntries.length < first.total; page++) {
        const next = await kanjiRequest(`/kanji?page=${page}&limit=200`);
        kanjiEntries.push(...(next.data || []));
        if (!next.data?.length) break;
      }

      totalCount.textContent = String(kanjiEntries.length);
      // Dùng onAuthReady để đảm bảo role đã được verify với server
      if (typeof onAuthReady === 'function') {
        onAuthReady(function (isAdminVerified) {
          if (isAdminVerified) updateAdminControls();
        });
      }
      populateFilter(        strokeFilter,
        [...new Set(kanjiEntries.map(entry => entry.strokes))].filter(Number.isFinite).sort((a, b) => a - b),
        strokes => `${strokes} nét`,
      );
      populateFilter(
        radicalFilter,
        [...new Set(kanjiEntries.flatMap(entry => entry.radicals || []))].sort((a, b) => a.localeCompare(b, "ja")),
        radical => radical,
      );
      filterKanji();
    } catch (error) {
      kanjiEntries = [];
      kanjiGrid.replaceChildren();
      totalCount.textContent = "0";
      gridCount.textContent = "Không tải được dữ liệu Kanji";
      loadErrorMessage.textContent = error.message;
      loadError.hidden = false;
    }
  }

  searchInput.addEventListener("input", filterKanji);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    filterKanji();
  });
  strokeFilter.addEventListener("change", filterKanji);
  radicalFilter.addEventListener("change", filterKanji);
  levelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeLevel = button.dataset.level;
      updateLevelButtons();
      filterKanji();
    });
  });
  clearFiltersButton.addEventListener("click", () => {
    searchInput.value = "";
    strokeFilter.value = "all";
    radicalFilter.value = "all";
    activeLevel = "all";
    updateLevelButtons();
    filterKanji();
    searchInput.focus();
  });

  closeDetailButton.addEventListener("click", () => detailDialog.close());
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) {
      detailDialog.close();
    }
  });

  document.querySelector("#retry-kanji-load").addEventListener("click", loadKanji);
  loadKanji();
}
