const API = 'https://english-book.yuki-548.workers.dev'
const token = localStorage.getItem('token')
if (!token) location.href = 'index.html'

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
}

// ===== 状態 =====
let allWords = []
let filtered = []
let rendered = 0
const PAGE = 50

let searchQuery = ''
let activeTag = ''
let allTags = []   // 全タグキャッシュ
let sortOrder = 'none'  // 'none' | 'desc' | 'asc'
let editOriginal = null  // 編集前の状態（キャンセル用）

// ===== 初期化 =====
async function init() {
  await Promise.all([loadWords(), loadTags()])
}

async function loadWords() {
  try {
    const res = await fetch(`${API}/api/words`, { headers })
    if (res.status === 401) { location.href = 'index.html'; return }
    allWords = await res.json()
    applyFilter()
  } catch {
    document.getElementById('wordList').innerHTML =
      '<div class="empty">読み込みに失敗しました</div>'
  }
}

async function loadTags() {
  try {
    const res = await fetch(`${API}/api/tags`, { headers })
    allTags = await res.json()
    renderFilterBar()
  } catch {}
}

// フィルターバーのタグチップを再描画
function renderFilterBar() {
  const bar = document.getElementById('filterBar')
  bar.querySelectorAll('.filter-chip:not([data-fixed])').forEach(c => c.remove())
  allTags.forEach(t => {
    const chip = document.createElement('div')
    chip.className = 'filter-chip'
    chip.dataset.tag = t.name
    chip.textContent = t.name
    chip.onclick = () => selectTag(chip)
    bar.appendChild(chip)
  })
}

// ===== フィルター =====
function applyFilter() {
  const q = searchQuery.toLowerCase()
  filtered = allWords.filter(w => {
    const matchSearch = !q ||
      w.en.toLowerCase().includes(q) ||
      w.ja.includes(q)
    const matchTag =
      activeTag === '' ? true :
      activeTag === '__memorized__' ? w.memorized === 1 :
      activeTag === '__unmemorized__' ? w.memorized === 0 :
      (w.tags || []).includes(activeTag)
    return matchSearch && matchTag
  })
  // ソート
  if (sortOrder === 'desc') {
    filtered.sort((a, b) => b.importance - a.importance)
  } else if (sortOrder === 'asc') {
    filtered.sort((a, b) => a.importance - b.importance)
  }

  rendered = 0
  document.getElementById('wordList').innerHTML = ''
  renderMore()
  updateStatus()
}

// ===== 描画 =====
function renderMore() {
  const list = document.getElementById('wordList')
  const chunk = filtered.slice(rendered, rendered + PAGE)
  if (chunk.length === 0 && rendered === 0) {
    list.innerHTML = '<div class="empty">該当する単語がありません</div>'
    return
  }
  chunk.forEach(w => list.appendChild(createCard(w)))
  rendered += chunk.length
}

function createCard(w) {
  const card = document.createElement('div')
  card.className = `word-card${w.memorized ? ' memorized' : ''}`
  card.dataset.id = w.id

  const tags = (w.tags || []).map(t =>
    `<span class="tag-badge">${escHtml(t)}</span>`
  ).join('')

  const stars = [1,2,3,4,5].map(i =>
    `<span class="star ${i <= w.importance ? 'on' : ''}"
      onclick="event.stopPropagation();setImportance(${w.id},${i})"
    >★</span>`
  ).join('')

  card.innerHTML = `
    <div class="word-main">
      <div class="word-en">${escHtml(w.en)}</div>
      <div class="word-ja">${escHtml(w.ja)}</div>
      ${tags ? `<div class="word-tags">${tags}</div>` : ''}
      ${w.memo ? `<div class="word-memo">📝 ${escHtml(w.memo)}</div>` : ''}
    </div>
    <div class="word-controls">
      <label class="memorized-check" onclick="event.stopPropagation()">
        <input type="checkbox" ${w.memorized ? 'checked' : ''}
          onchange="setMemorized(${w.id}, this.checked)">
        <span>習得</span>
      </label>
      <div class="stars">${stars}</div>
    </div>
  `
  card.addEventListener('click', () => openEditModal(w.id))
  return card
}

function updateStatus() {
  const memorized = allWords.filter(w => w.memorized).length
  document.getElementById('statusText').textContent =
    `${filtered.length}件表示 / 全${allWords.length}語 ・ 習得済み ${memorized}語`
}

// ===== 検索 =====
let searchTimer
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery = document.getElementById('searchInput').value
    applyFilter()
  }, 200)
}

// ===== タグフィルター選択 =====
function selectTag(el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
  el.classList.add('active')
  activeTag = el.dataset.tag
  applyFilter()
}

// ===== ソート =====
function toggleSort() {
  const btn = document.getElementById('sortBtn')
  if (sortOrder === 'none' || sortOrder === 'asc') {
    sortOrder = 'desc'
    btn.textContent = '重要度 ↓'
    btn.className = 'sort-btn desc'
  } else {
    sortOrder = 'asc'
    btn.textContent = '重要度 ↑'
    btn.className = 'sort-btn asc'
  }
  applyFilter()
}

// ===== 重要度 =====
async function setImportance(wordId, val) {
  const w = allWords.find(w => w.id === wordId)
  if (!w) return
  w.importance = val
  refreshCard(w)
  await fetch(`${API}/api/me/words/${wordId}/status`, {
    method: 'PUT', headers,
    body: JSON.stringify({ importance: val, memorized: w.memorized, memo: w.memo })
  })
}

// ===== 習得フラグ =====
async function setMemorized(wordId, checked) {
  const w = allWords.find(w => w.id === wordId)
  if (!w) return
  w.memorized = checked ? 1 : 0
  refreshCard(w)
  updateStatus()
  await fetch(`${API}/api/me/words/${wordId}/status`, {
    method: 'PUT', headers,
    body: JSON.stringify({ importance: w.importance, memorized: w.memorized, memo: w.memo })
  })
}

// ===== 編集モーダル =====
function openEditModal(wordId) {
  const w = allWords.find(w => w.id === wordId)
  if (!w) return

  document.getElementById('editWordId').value = wordId
  document.getElementById('editEn').value = w.en
  document.getElementById('editJa').value = w.ja
  document.getElementById('editMemo').value = w.memo || ''
  setEditStars(w.importance)
  document.getElementById('editMemorized').checked = w.memorized === 1
  document.getElementById('newTagInput').value = ''

  renderEditTags(wordId)
  // 編集前の状態を保存
  editOriginal = { en: w.en, ja: w.ja, memo: w.memo || '', importance: w.importance, memorized: w.memorized }

  document.getElementById('editModal').classList.add('show')
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show')
}

function onOverlayClick(e) {
  if (e.target === document.getElementById('editModal')) closeEditModal()
}

function setEditStars(val) {
  document.querySelectorAll('.edit-star').forEach(s => {
    s.classList.toggle('on', parseInt(s.dataset.val) <= val)
  })
  document.getElementById('editImportance').value = val
}

// 編集モーダル内のタグ表示を更新
function renderEditTags(wordId) {
  const w = allWords.find(w => w.id === wordId)
  const currentTags = w ? (w.tags || []) : []

  // 付いているタグ
  const attached = document.getElementById('editTagsAttached')
  attached.innerHTML = currentTags.length === 0
    ? '<span style="color:#aaa;font-size:12px;">タグなし</span>'
    : currentTags.map(t => `
        <span class="edit-tag-chip attached" onclick="removeTag(${wordId},'${escAttr(t)}')">
          ${escHtml(t)} ✕
        </span>
      `).join('')

  // 追加できるタグ（まだ付いていないもの）
  const available = allTags.filter(t => !currentTags.includes(t.name))
  const addable = document.getElementById('editTagsAddable')
  addable.innerHTML = available.length === 0
    ? '<span style="color:#aaa;font-size:12px;">追加できるタグなし</span>'
    : available.map(t => `
        <span class="edit-tag-chip addable" onclick="addTag(${wordId},'${escAttr(t.name)}',${t.id})">
          + ${escHtml(t.name)}
        </span>
      `).join('')
}

// タグを単語に追加
async function addTag(wordId, tagName, tagId) {
  await fetch(`${API}/api/words/${wordId}/tags`, {
    method: 'POST', headers,
    body: JSON.stringify({ tagId })
  })
  const w = allWords.find(w => w.id === wordId)
  if (w) {
    w.tags = [...(w.tags || []), tagName]
    refreshCard(w)
  }
  renderEditTags(wordId)
}

// タグを単語から外す
async function removeTag(wordId, tagName) {
  const tag = allTags.find(t => t.name === tagName)
  if (!tag) return
  await fetch(`${API}/api/words/${wordId}/tags/${tag.id}`, {
    method: 'DELETE', headers
  })
  const w = allWords.find(w => w.id === wordId)
  if (w) {
    w.tags = (w.tags || []).filter(t => t !== tagName)
    refreshCard(w)
  }
  renderEditTags(wordId)
}

// 新しいタグを作成（フィルターバー横から呼ぶ）
async function createAndAddTag() {
  const input = document.getElementById('newTagInput')
  const name = input.value.trim()
  if (!name) return

  // すでに同名タグがあればスキップ
  if (allTags.find(t => t.name === name)) {
    input.value = ''
    return
  }

  const res = await fetch(`${API}/api/tags`, {
    method: 'POST', headers,
    body: JSON.stringify({ name })
  })
  const data = await res.json()
  allTags.push({ id: data.id, name })
  renderFilterBar()

  // 編集モーダルが開いていたらタグ表示も更新
  const wordId = parseInt(document.getElementById('editWordId').value)
  if (wordId) renderEditTags(wordId)

  input.value = ''
}

// Enterキーでタグ作成
function onNewTagKeydown(e) {
  if (e.key === 'Enter') createAndAddTag()
}

// ===== 保存 =====
async function saveEdit() {
  const wordId = parseInt(document.getElementById('editWordId').value)
  const en = document.getElementById('editEn').value.trim()
  const ja = document.getElementById('editJa').value.trim()
  const memo = document.getElementById('editMemo').value.trim()
  const importance = parseInt(document.getElementById('editImportance').value)
  const memorized = document.getElementById('editMemorized').checked ? 1 : 0

  if (!en || !ja) { alert('英語と日本語は必須です'); return }

  const saveBtn = document.getElementById('editSaveBtn')
  saveBtn.disabled = true
  saveBtn.textContent = '保存中...'

  try {
    await fetch(`${API}/api/words/${wordId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ en, ja })
    })
    await fetch(`${API}/api/me/words/${wordId}/status`, {
      method: 'PUT', headers,
      body: JSON.stringify({ importance, memorized, memo })
    })

    const w = allWords.find(w => w.id === wordId)
    if (w) {
      w.en = en; w.ja = ja; w.memo = memo
      w.importance = importance; w.memorized = memorized
      refreshCard(w)
    }
    updateStatus()
    editOriginal = null
    document.getElementById('editModal').classList.remove('show')
  } catch {
    alert('保存に失敗しました')
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = '保存'
  }
}

// ===== 削除 =====
async function deleteWord() {
  const wordId = parseInt(document.getElementById('editWordId').value)
  const w = allWords.find(w => w.id === wordId)
  if (!w) return
  if (!confirm(`「${w.en}」を削除しますか？`)) return

  await fetch(`${API}/api/words/${wordId}`, { method: 'DELETE', headers })
  allWords = allWords.filter(w => w.id !== wordId)
  closeEditModal()
  applyFilter()
}

// ===== カードDOM差し替え =====
function refreshCard(w) {
  const old = document.querySelector(`.word-card[data-id="${w.id}"]`)
  if (!old) return
  old.replaceWith(createCard(w))
}

// ===== 無限スクロール =====
const sentinel = document.createElement('div')
sentinel.style.height = '1px'
document.getElementById('wordList').after(sentinel)

new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && rendered < filtered.length) renderMore()
}, { rootMargin: '200px' }).observe(sentinel)

// ===== ログアウト =====
function logout() {
  localStorage.clear()
  location.href = 'index.html'
}

// ===== ユーティリティ =====
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function escAttr(s) {
  return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;')
}

init()