// 教資案（數位教資遠距）TA 簽到單檢查：共通規則沿用 rules.js，這裡補上本案特有的比對
import { checkTimesheet } from "./rules.js?v=20260930f";

export const RATE = 196;
// 月保：每月工讀金要超過 6,000 元（時薪 196 元，約 31 小時）
export const MONTHLY_MIN_PAY = 6000;
// 計畫名稱開頭；計畫編號每位老師不同，只擋創新應用（A82，115609782）的編號，其餘黃框請學生跟老師確認
export const PLAN_NAME_PREFIX = "1151數位教資遠距";
const OTHER_PLAN = { name: /A82|雲端知識/, number: "115609782" };
// 計畫期間：到 12 月；起始月份待確認，先以 9 月起算
export const PERIOD_MONTHS = [9, 10, 11, 12];

export const PROFILE = {
  hourlyRate: RATE,
  // 週六日不排工作；平日的國定假日與學校公告休假日（人事行政總處 115 年辦公日曆表、中原大學 115 學年度行事曆）
  allowedWeekdays: [1, 2, 3, 4, 5],
  earliestStart: "",
  latestEnd: "",
  blockedDates: ["2026-09-25", "2026-09-28", "2026-10-09", "2026-10-26", "2026-12-24", "2026-12-25", "2027-01-01"],
  location: {
    schoolOnly: true,
    requireRoom: false,
    requiredKeywords: [],
    forbiddenKeywords: ["家裡", "家中", "住家", "宿舍", "咖啡", "麥當勞", "星巴克"],
    sampleValues: ["(填校內)", "（填校內）"],
    // 中原大學校區平面圖（www.cycu.edu.tw/campus.html）與校園配置圖上的大樓名稱；教室完整清單在 I-TOUCH 內要登入，改用「大樓＋號碼」判斷
    buildings: [
      "懷恩樓", "維澈樓", "行政大樓", "陸華樓", "真知教學大樓", "真知", "篤信大樓", "篤信", "電學大樓", "電學",
      "智信樓", "恩慈樓", "良善樓", "建築館", "建築學院", "祐生館", "設計學院", "地景建築館", "信樓", "望樓",
      "室設館", "土木館", "莊敬大樓", "莊敬", "工學館", "商設館", "資管樓", "資管大樓", "管理大樓", "自強商學大樓",
      "商學大樓", "化學館", "理學大樓", "科學館", "圖書館", "全人教育村", "全人村", "學生活動中心", "活動中心",
      "生物科技館", "生科館", "力行大樓", "力行", "喜樂樓", "忍耐樓", "和平樓", "仁愛樓", "體育館", "薄膜中心",
      "信實樓", "熱誠樓", "恩惠堂", "中正樓", "祐生建築中心", "景觀館", "知行領航館",
      // 學生常用的簡稱（例如「商設302」）
      "商設", "室設", "資管", "土木", "建築", "工學", "化學", "理學", "科學", "管理", "商學", "自強", "行政",
      "景觀", "地景", "生科", "祐生", "懷恩", "維澈", "陸華", "智信", "恩慈", "良善", "中正", "知行", "全人", "設計"
    ],
    // 這些地方沒有固定房號，寫名稱就可以
    noRoomNeeded: ["體育館"]
  },
  allowedWorkContents: []
};

function issue(code, severity, message, entryIds, field) {
  return { code, severity, message, ...(entryIds ? { entryIds } : {}), ...(field ? { field } : {}) };
}

function minutes(value) {
  const m = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 星期對照：用來檢查學生在日期欄寫的星期對不對
const WEEKDAY = "日一二三四五六";
export function mdw(value) {
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}
const md = (value) => { const d = value instanceof Date ? value : new Date(`${value}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; };
export function withMonthDay(message) {
  return String(message).replaceAll(/\d{4}-\d{2}-\d{2}/g, (iso) => md(iso));
}

function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${md(monday)} 那一週`;
}

const money = (n) => Number(n).toLocaleString("en-US");

export function checkEduTA(sheet, options = {}) {
  const samples = sheet.entries.filter((e) => e.isSample);
  const entries = sheet.entries.filter((e) => !e.isSample);
  // 計畫名稱、編號、執行單位每位老師不同，不跟固定值比對，改在下面檢查有沒有填
  const profile = { ...PROFILE, planName: sheet.planName, planNumber: sheet.planNumber, unit: sheet.unit };
  const base = checkTimesheet({ ...sheet, entries }, profile);
  const issues = base.issues.filter((i) => !["LOCATION_CONFIRM", "WORK_CONTENT_CONFIRM", "SIGNATURE_CHECK", "FOOTER_SIGNATURE_CHECK"].includes(i.code));
  for (const i of issues) {
    if (i.code === "ENTRIES_UNREADABLE") i.message = "沒有讀到任何工作紀錄。請確認表格裡已填工作日期與起迄時間。";
    if (i.code === "BLOCKED_DATE") i.message = "這一天是國定假日或學校公告的休假日，不能排工作。";
    if (i.code === "WEEKDAY_NOT_ALLOWED") i.message = "這一天是週六或週日，不能排工作。";
    if (i.code === "WEEKLY_HOURS_EXCEEDED") {
      const first = entries.filter((e) => i.entryIds?.includes(e.id) && e.date).map((e) => e.date).sort()[0];
      if (first) i.message = i.message.replace(/^\S+ 在這份文件中/, `${weekKey(first)}`);
    }
    i.message = withMonthDay(i.message);
  }
  const extra = [];

  const planName = String(sheet.planName ?? "").replaceAll(/\s+/g, "");
  const planNumber = String(sheet.planNumber ?? "").replaceAll(/\s+/g, "");
  if (OTHER_PLAN.name.test(planName) || planNumber === OTHER_PLAN.number) {
    extra.push(issue("WRONG_PLAN", "error", "這是創新應用補助（A82 發展雲端知識體系計畫，115609782）的名稱或編號。教資案要填教資案自己的計畫名稱與編號。", null, "planName"));
  } else if (!planName.startsWith(PLAN_NAME_PREFIX)) {
    extra.push(issue("PLAN_NAME_WRONG", "error", `計畫名稱應為「${PLAN_NAME_PREFIX}-老師姓名」。`, null, "planName"));
  } else if (/○|〇|老師姓名/.test(planName) || planName.replace(/^1151數位教資遠距[-－—]?/, "") === "") {
    extra.push(issue("PLAN_TEACHER_MISSING", "error", "計畫名稱的「○○○(老師姓名)」要改成授課老師的姓名。", null, "planName"));
  }
  if (!String(sheet.unit ?? "").trim()) extra.push(issue("UNIT_MISSING", "error", "執行單位沒有填，請問老師要填哪個單位。", null, "unit"));
  if (!planNumber) {
    extra.push(issue("PLAN_NUMBER_MISSING", "error", "計畫編號沒有填，請問老師。", null, "planNumber"));
  } else if (planNumber !== OTHER_PLAN.number) {
    extra.push(issue("PLAN_NUMBER_CONFIRM", "review", "計畫編號每位老師不同，請跟老師確認有沒有寫對。", null, "planNumber"));
  }

  if (samples.length) {
    extra.push(issue("SAMPLE_ROW", "error", "表單上的範例列（9/1、9:00–12:00）還在，請刪除或改成實際資料。", samples.map((e) => e.id), "date"));
  }
  if (sheet.outsider) {
    extra.push(issue("OUTSIDER", "error", "勾選了「校外人士」。外校生或已畢業的學生不能擔任本案 TA。"));
  }
  if (!sheet.period.written) {
    extra.push(issue("MONTH_MISSING", "error", "表頭「115年　月」的月份沒有填。"));
  } else {
    const other = entries.filter((e) => e.date && Number(e.date.slice(5, 7)) !== sheet.period.month);
    if (other.length) extra.push(issue("MONTH_MISMATCH", "error", `有工作日期不在表頭的 ${sheet.period.month} 月。每個月要分開填一張簽到單。`, other.map((e) => e.id), "date"));
  }
  const outside = entries.filter((e) => e.date && !PERIOD_MONTHS.includes(Number(e.date.slice(5, 7))));
  if (outside.length) {
    extra.push(issue("OUTSIDE_PERIOD", "error", `有工作日期不在計畫期間（${PERIOD_MONTHS[0]}–${PERIOD_MONTHS.at(-1)} 月）內。`, outside.map((e) => e.id), "date"));
  }

  const foreign = sheet.foreign || options.foreign;
  if (foreign) {
    const weeks = new Map();
    for (const e of entries) {
      const s = minutes(e.start), t = minutes(e.end);
      if (!e.date || s === null || t === null || t <= s) continue;
      const k = weekKey(e.date);
      weeks.set(k, [(weeks.get(k)?.[0] ?? 0) + (t - s), [...(weeks.get(k)?.[1] ?? []), e.id]]);
    }
    for (const [k, [m, ids]] of weeks) {
      if (m > 20 * 60) extra.push(issue("FOREIGN_WEEKLY", "error", `外籍生每週最多 20 小時，${k}合計 ${Math.round(m / 6) / 10} 小時。`, ids, "date"));
    }
  }

  // 日期欄要由學生自己寫上星期，例如 11/12(四)，承辦核對比較快
  const noWeekday = [], wrongWeekday = [];
  for (const e of entries) {
    if (!e.date) continue;
    const written = /[（(]\s*(?:星期|週|周)?\s*([一二三四五六日天])\s*[)）]/.exec(e.dateText ?? "");
    if (!written) { noWeekday.push(e); continue; }
    const actual = WEEKDAY[new Date(`${e.date}T00:00:00`).getDay()];
    if ((written[1] === "天" ? "日" : written[1]) !== actual) wrongWeekday.push([e, actual, written[1]]);
  }
  if (noWeekday.length) {
    extra.push(issue("WEEKDAY_MISSING", "error", `工作日期要寫上星期，例如「${mdw(noWeekday[0].date)}」。`, noWeekday.map((e) => e.id), "date"));
  }
  for (const [e, actual, written] of wrongWeekday) {
    extra.push(issue("WEEKDAY_WRONG", "error", `${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8))} 是星期${actual}，不是星期${written}。`, [e.id], "date"));
  }

  // 網頁只寫「正常工作時間」，簽到單檢查才抓 7:00 前、20:00 後
  const offHours = entries.filter((e) => {
    const s = minutes(e.start), t = minutes(e.end);
    return s !== null && t !== null && (s < 7 * 60 || t > 20 * 60);
  });
  if (offHours.length) extra.push(issue("OFF_HOURS", "error", "有工作時間在早上 7 點以前或晚上 8 點以後，請改到正常工作時間。", offHours.map((e) => e.id), "time"));

  // 簽名一律用黃框提醒本人列印後親筆簽
  if (entries.length) extra.push(issue("SIGN_HERE", "review", "列印後，每一列的簽章欄都要本人親筆簽名（Word 裡打字的簽名不算）。", entries.map((e) => e.id), "signature"));
  extra.push(issue("SIGN_FOOTER", "review", "列印後，頁尾聲明的「簽名」要本人親筆簽名。", null, "footerSignature"));

  // 月保：本月工讀金要超過 6,000 元
  const { totalHours, totalPay } = base.calculated;
  if (entries.length && !(totalPay > MONTHLY_MIN_PAY)) {
    const need = Math.floor(MONTHLY_MIN_PAY / RATE) + 1;
    extra.push(issue("MONTHLY_MINIMUM", "error", `月保制度：每月工讀金要超過 ${money(MONTHLY_MIN_PAY)} 元（至少 ${need} 小時）。這張合計 ${totalHours} 小時、${money(totalPay)} 元，還差 ${Math.round((need - totalHours) * 100) / 100} 小時。`, null, "totalHours"));
  }

  return {
    rate: RATE,
    entries,
    issues: [...extra, ...issues],
    calculated: base.calculated,
    declarations: [
      { code: "NOT_IN_CLASS", label: "工作時間沒有跟我自己的上課時間重疊。" },
      ...base.declarations
    ]
  };
}
