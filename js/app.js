import { parseTimesheet } from "./parse.js?v=20260930d";
import { checkEduTA, MONTHLY_MIN_PAY, mdw } from "./check.js?v=20260930d";
import { annotateRenderedDocx, buildAnnotations } from "./annotations.js?v=20260930d";

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ---------- 深色模式 ---------- */
const root = document.documentElement;
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
const toggle = $("#theme-toggle");
function syncToggle() {
  toggle.setAttribute("aria-label", isDark() ? "切換成淺色模式" : "切換成深色模式");
  toggle.title = toggle.getAttribute("aria-label");
}
toggle.addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  syncToggle();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncToggle);
syncToggle();

/* ---------- 簽到單檢查 ---------- */
const LABEL = { error: "要修正", review: "請確認" };
const sheets = []; // { id, fileName, sheet, foreign, error }
let seq = 0;

async function addFiles(fileList) {
  for (const file of fileList) {
    const item = { id: ++seq, fileName: file.name, foreign: false };
    try {
      item.bytes = await file.arrayBuffer();
      item.sheet = await parseTimesheet(item.bytes.slice(0));
      item.isDocx = /\.docx$/i.test(file.name);
      item.foreign = item.sheet.foreign;
    } catch (err) {
      item.error = err.message;
    }
    sheets.push(item);
  }
  renderSheets();
}

// 列號後面帶上那一列的日期與星期，例如「第 3 列 10/5(一)」；列數太多時只列號碼
function rowsLabel(ids, entries = []) {
  if (!ids?.length) return "";
  const dateOf = (id) => entries.find((e) => e.id === id)?.date;
  if (ids.length > 4 || !ids.every(dateOf)) return `第 ${ids.join("、")} 列：`;
  return `${ids.map((id) => `第 ${id} 列 ${mdw(dateOf(id))}`).join("、")}：`;
}

function renderSheet(item) {
  if (item.error) {
    return `<div class="panel sheet"><div class="sheet-head"><h3>${esc(item.fileName)}</h3><button class="remove" data-remove="${item.id}">移除</button></div><div class="note"><b>無法檢查：</b>${esc(item.error)}</div></div>`;
  }
  const r = checkEduTA(item.sheet, item);
  const errors = r.issues.filter((i) => i.severity === "error");
  const reviews = r.issues.filter((i) => i.severity === "review");
  const notes = buildAnnotations([...errors, ...reviews], item.sheet);
  item.notes = notes;
  const s = item.sheet;
  const who = [s.name, s.studentId].filter(Boolean).map(esc).join("　") || "（姓名、學號未填）";
  const pay = r.calculated.totalPay;
  return `<div class="panel sheet">
    <div class="sheet-head">
      <h3>${who}<span class="fmt">${esc(item.fileName)}</span></h3>
      <button class="remove" data-remove="${item.id}">移除</button>
    </div>
    <div class="opts-row">
      <label><input type="checkbox" id="fr-${item.id}" data-field="foreign" data-id="${item.id}" ${item.foreign ? "checked" : ""}> 外籍生</label>
    </div>
    <div class="stats">
      <span>${s.period.written ? `${s.period.year - 1911} 年 ${s.period.month} 月` : "月份未填"}</span>
      <span>工作紀錄 <b>${r.entries.length}</b> 筆</span>
      <span>應為 <b>${r.calculated.totalHours}</b> 小時、<b>${pay.toLocaleString("en-US")}</b> 元</span>
      <span>${pay > MONTHLY_MIN_PAY ? "月保門檻：已超過 6,000 元" : "月保門檻：未超過 6,000 元"}</span>
    </div>
    ${notes.length
      ? `<ul class="issues">${notes.map((i) => `<li><button class="num" data-sev="${i.severity}" data-focus="${item.id}:${i.number}" title="在簽到單上找到這一處">${i.number}</button><span class="pill ${i.severity === "error" ? "no" : "warn"}">${LABEL[i.severity]}</span><span>${rowsLabel(i.entryIds, s.entries)}${esc(i.message)}</span></li>`).join("")}</ul>`
      : `<div class="allgood">沒有發現需要修正的地方。網頁只能幫忙抓常見錯誤，送出前請再對著簽到單自己看一次。</div>`}
    <figure class="doc-fig"><figcaption>簽到單上有編號框線的地方，就是要改或要確認的位置</figcaption><div class="doc-view" id="doc-${item.id}"></div></figure>
    <div class="decl"><b>送出前請自己確認：</b>${r.declarations.map((d, n) => `<label><input type="checkbox" id="d-${item.id}-${n}"> ${esc(d.label)}</label>`).join("")}</div>
  </div>`;
}

function renderSheets() {
  $("#sheets").innerHTML = sheets.map(renderSheet).join("");
  $("#check-empty").hidden = sheets.length > 0;
  sheets.filter((s) => s.sheet).forEach(renderDoc);
}

// 簽到單原貌＋標記：Word 檔照原排版顯示；ODT 或無法顯示時，用讀到的內容重畫成表格
let previewLib;
function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
}
function docxPreview() {
  previewLib ??= loadScript("js/vendor/jszip.min.js?v=20260930d").then(() => loadScript("js/vendor/docx-preview.min.js?v=20260930d")).then(() => window.docx);
  return previewLib;
}
function fallbackPaper(s) {
  const cell = (v, tag = "td") => `<${tag}>${esc(v)}</${tag}>`;
  return `<div class="paper">
    <h4>計畫案兼任教學助理／工讀生簽到單</h4>
    <div class="paper-meta">${[["計畫名稱", s.planName], ["執行單位", s.unit], ["計畫編號", s.planNumber], ["姓名", s.name], ["學系", s.department], ["學號", s.studentId], ["聯絡電話", s.phone]].map(([k, v]) => `<p>${k}：${esc(v)}</p>`).join("")}</div>
    <table><tr>${["編號", "工作日期", "開始", "結束", "工作時數", "工作酬金", "工作地點", "工作內容", "簽章"].map((v) => cell(v, "th")).join("")}</tr>
    ${s.entries.map((e) => `<tr>${[e.id, e.date ? mdw(e.date) : "", e.start, e.end, e.hours, e.pay, e.location, e.workContent, e.signature].map((v) => cell(v)).join("")}</tr>`).join("")}</table>
    <p class="paper-total">計酬基準 X ${esc(s.claimedTotalHours)} 小時　金額：${esc(s.claimedTotalPay)} 元</p>
    <p>簽名：${esc(s.footerSignature)}</p>
  </div>`;
}
async function renderDoc(item) {
  const box = document.getElementById(`doc-${item.id}`);
  if (!box) return;
  if (item.isDocx) {
    try {
      const lib = await docxPreview();
      const holder = document.createElement("div");
      holder.className = "docx-render";
      await lib.renderAsync(item.bytes.slice(0), holder, null, { inWrapper: true, ignoreWidth: false, ignoreHeight: false, debug: false });
      if (!box.isConnected) return;
      box.replaceChildren(holder);
      annotateRenderedDocx(holder, item.notes);
      return;
    } catch { /* 顯示不了就改用重畫的表格 */ }
  }
  box.innerHTML = fallbackPaper(item.sheet);
  annotateRenderedDocx(box, item.notes);
}

const find = (id) => sheets.find((s) => s.id === Number(id));
$("#sheets").addEventListener("click", (e) => {
  const focus = e.target.closest("[data-focus]");
  if (focus) {
    const [id, n] = focus.dataset.focus.split(":");
    const marks = [...document.querySelectorAll(`#doc-${id} [data-annotation-number="${n}"]`)];
    marks.forEach((m) => { m.dataset.active = "true"; });
    marks[0]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setTimeout(() => marks.forEach((m) => delete m.dataset.active), 1600);
    return;
  }
  const rm = e.target.closest("[data-remove]");
  if (rm) { sheets.splice(sheets.indexOf(find(rm.dataset.remove)), 1); renderSheets(); }
});
$("#sheets").addEventListener("change", (e) => {
  const el = e.target.closest("[data-field]");
  if (!el) return;
  find(el.dataset.id)[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
  renderSheets();
});

const input = $("#file-input"), drop = $("#drop");
input.addEventListener("change", () => { addFiles([...input.files]); input.value = ""; });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
