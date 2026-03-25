const APP_KEY = "lifecounter_v17_0";

// ---------------------------------------------------------------------------
// バックエンド設定
// ---------------------------------------------------------------------------
const BACKEND_URL = "http://localhost:8000";
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60秒ごとに定期ハートビート

// ユーザーIDをlocalStorageで永続化（初回起動時にUUIDを生成）
function getOrCreateUserId() {
    let uid = localStorage.getItem(APP_KEY + '_user_id');
    if (!uid) {
        uid = crypto.randomUUID();
        localStorage.setItem(APP_KEY + '_user_id', uid);
    }
    return uid;
}
const USER_ID = getOrCreateUserId();

let EMERGENCY_SEC = parseInt(localStorage.getItem(APP_KEY + '_emergency')) || 3600;
let GRACE_SEC = parseInt(localStorage.getItem(APP_KEY + '_grace')) || 600;
let USER_NAME = localStorage.getItem(APP_KEY + '_name') || "";
let EMERGENCY_EMAILS = JSON.parse(localStorage.getItem(APP_KEY + '_emails') || '["","",""]');
let CURRENT_THEME = localStorage.getItem(APP_KEY + '_theme') || "glass";

// デフォルト値をスマート化（1000日単位は裏側で自動計算）
let FUTURE_NOTIFY_DAYS = localStorage.getItem(APP_KEY + '_future_notify') || "365, 100, 50, 30, 20, 10, 7, 3, 2, 1, 0";
let PAST_NOTIFY_DAYS = localStorage.getItem(APP_KEY + '_past_notify') || "100, 365";

let birthDate = null;
let pastEvents = JSON.parse(localStorage.getItem(APP_KEY + '_past')) || [];
let futureEvents = JSON.parse(localStorage.getItem(APP_KEY + '_future')) || [];
let deadline = Date.now() + (EMERGENCY_SEC * 1000);
let clickCount = 0;
let emergencySent = false;
let currentModalType = 'past';
let editingIndex = null;

window.onload = () => {
    applyTheme(CURRENT_THEME);
    const saved = localStorage.getItem(APP_KEY + '_birth');
    if (saved && saved !== "null") {
        birthDate = new Date(saved);
        checkDailyLog();
    } else {
        showOnboarding();
    }
};

function checkDailyLog() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('appContainer').style.display = 'flex';
    if (localStorage.getItem(APP_KEY + '_last_log') !== today) {
        document.getElementById('bootScreen').style.display = 'flex';
    } else {
        document.getElementById('bootScreen').style.display = 'none';
        startApp();
    }
}

function showOnboarding() {
    document.getElementById('onboardingScreen').style.display = 'flex';

    // STEP1: ウェルカムアニメーション
    const lines = [
        { text: "SYSTEM BOOT SEQUENCE ......... OK",   delay: 300,  cls: "ob-line-sys" },
        { text: "TIME ENGINE .................. INITIALIZED", delay: 800,  cls: "ob-line-sys" },
        { text: "MEMORY CORE .................. ONLINE", delay: 1300, cls: "ob-line-sys" },
        { text: "─────────────────────────────────", delay: 1900, cls: "ob-line-div" },
        { text: "あなたの誕生の瞬間から——今この瞬間まで",       delay: 2400, cls: "ob-line-msg" },
        { text: "そして、これから先へ。",                      delay: 3100, cls: "ob-line-msg" },
        { text: "Lifecounterの世界へ、ようこそ。",             delay: 3800, cls: "ob-line-welcome" },
    ];
    const container = document.getElementById('obWelcomeLines');
    container.innerHTML = '';
    document.getElementById('obStartBtn').style.opacity = '0';

    lines.forEach(({ text, delay, cls }) => {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'ob-line ' + cls;
            el.textContent = text;
            container.appendChild(el);
            // CSSアニメーションで確実にフェードイン
            setTimeout(() => { el.classList.add('show'); }, 20);
        }, delay);
    });

    // 全行表示後にSTARTボタンをフェードイン
    setTimeout(() => {
        const btn = document.getElementById('obStartBtn');
        btn.style.animation = 'obFadeIn 0.8s forwards';
    }, 4600);
}

function showTerms() {
    document.getElementById('obStep1').style.display = 'none';
    const s2 = document.getElementById('obStep2');
    s2.style.display = 'flex';
    s2.style.opacity = '0';
    requestAnimationFrame(() => { requestAnimationFrame(() => { s2.style.opacity = '1'; }); });
}

function toggleAgreeBtn() {
    const checked = document.getElementById('obAgreeCheck').checked;
    const btn = document.getElementById('obAgreeBtn');
    btn.disabled = !checked;
    btn.style.opacity = checked ? '1' : '0.3';
}

function showBirthInput() {
    document.getElementById('obStep2').style.display = 'none';
    const s3 = document.getElementById('obStep3');
    s3.style.display = 'flex';
    s3.style.opacity = '0';
    // 未来日入力禁止
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('obDate').max = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    requestAnimationFrame(() => { requestAnimationFrame(() => { s3.style.opacity = '1'; }); });
}

function finishOnboarding() {
    const val = document.getElementById('obDate').value; if(!val) return;
    // 未来日チェック（念のためJS側でも検証）
    if (new Date(val) > new Date()) { alert("未来の日時は設定できません。"); return; }
    localStorage.setItem(APP_KEY + '_birth', val); birthDate = new Date(val);
    if (pastEvents.length === 0) {
        pastEvents.push({t: "SYSTEM START (BIRTH)", d: val});
        localStorage.setItem(APP_KEY + '_past', JSON.stringify(pastEvents));
    }
    document.getElementById('onboardingScreen').style.display = 'none';
    checkDailyLog();
}

// ZEN: 若冲の達磨図 — 顔部分だけクロップして拡大表示
const DARUMA_IMG = `<div style="
  width:100%; height:100%;
  background-image: url('https://www.miho.jp/booth/img-big/00015659.jpg');
  background-size: 280%;
  background-position: 50% 18%;
  background-repeat: no-repeat;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(180,150,60,0.45);
  filter: sepia(0.1) contrast(1.08);
"></div>`;

// Kawaii: かわいい死神ドクロ（黒マント＋鎌）
const KAWAII_REAPER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 130">
  <!-- 鎌の柄 -->
  <line x1="76" y1="10" x2="90" y2="118" stroke="#443322" stroke-width="5" stroke-linecap="round"/>
  <!-- 鎌の刃 -->
  <path d="M76 10 Q108 2 104 36 Q100 52 80 46 Q96 28 76 10Z" fill="#b8b8c8" stroke="#888899" stroke-width="1.5"/>
  <!-- 刃のハイライト -->
  <path d="M76 10 Q100 8 98 30 Q96 40 86 38 Q96 22 76 10Z" fill="rgba(255,255,255,0.3)"/>
  <!-- マント本体 -->
  <path d="M16 70 Q8 102 6 128 Q55 134 104 128 Q102 102 94 70 Q76 58 55 55 Q34 58 16 70Z" fill="#1a1a28"/>
  <!-- マントのしわ -->
  <path d="M30 80 Q28 105 22 125" stroke="#2a2a3a" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M55 78 Q55 108 52 127" stroke="#2a2a3a" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M80 80 Q82 105 88 125" stroke="#2a2a3a" stroke-width="2" fill="none" opacity="0.7"/>
  <!-- フード -->
  <path d="M22 74 Q26 40 55 30 Q84 40 88 74 Q74 60 55 57 Q36 60 22 74Z" fill="#111120"/>
  <!-- 頭蓋骨 -->
  <ellipse cx="55" cy="53" rx="22" ry="23" fill="#f0eeea"/>
  <ellipse cx="55" cy="43" rx="19" ry="15" fill="#f8f7f4"/>
  <!-- 目（大きいかわいい丸目） -->
  <circle cx="44" cy="50" r="9" fill="white" stroke="#e0ddd8" stroke-width="1"/>
  <circle cx="66" cy="50" r="9" fill="white" stroke="#e0ddd8" stroke-width="1"/>
  <!-- 瞳（ハートの瞳） -->
  <text x="39.5" y="55" font-size="11" fill="#ff66aa">♥</text>
  <text x="61.5" y="55" font-size="11" fill="#ff66aa">♥</text>
  <!-- 目のハイライト -->
  <circle cx="48" cy="46" r="2.5" fill="white" opacity="0.7"/>
  <circle cx="70" cy="46" r="2.5" fill="white" opacity="0.7"/>
  <!-- ほっぺ -->
  <circle cx="34" cy="57" r="6" fill="rgba(255,110,160,0.38)"/>
  <circle cx="76" cy="57" r="6" fill="rgba(255,110,160,0.38)"/>
  <!-- 鼻穴 -->
  <ellipse cx="51" cy="61" rx="2.5" ry="3" fill="#d8d5d0"/>
  <ellipse cx="59" cy="61" rx="2.5" ry="3" fill="#d8d5d0"/>
  <!-- 歯 -->
  <path d="M40 70 Q55 79 70 70" stroke="#c8c5c0" stroke-width="1.5" fill="none"/>
  <rect x="46" y="69" width="5" height="7" rx="2" fill="#f0eeea" stroke="#ccc" stroke-width="0.8"/>
  <rect x="52" y="69" width="6" height="8" rx="2" fill="#f0eeea" stroke="#ccc" stroke-width="0.8"/>
  <rect x="59" y="69" width="5" height="7" rx="2" fill="#f0eeea" stroke="#ccc" stroke-width="0.8"/>
  <!-- 星デコ -->
  <text x="4"  y="22" font-size="13" fill="#ffaacc" opacity="0.85">✦</text>
  <text x="90" y="18" font-size="10" fill="#ffaacc" opacity="0.75">✦</text>
  <text x="2"  y="58" font-size="9"  fill="#cc88bb" opacity="0.60">★</text>
  <text x="96" y="55" font-size="9"  fill="#cc88bb" opacity="0.60">★</text>
</svg>`;

function applyTheme(theme) {
    // neo は glass に移行
    if (theme === 'neo') theme = 'glass';
    CURRENT_THEME = theme;
    document.body.className = 'theme-' + theme;
    localStorage.setItem(APP_KEY + '_theme', theme);
    const label = document.getElementById('mainLabel');
    if (theme === 'zen') { label.innerText = "心身の調和（継続日数）"; }
    else if (theme === 'kawaii') { label.innerText = "今日も生きててエライ！💖"; }
    else { label.innerText = "TOTAL SURVIVAL"; }
    // テーマ別ウォーターマーク
    const skull = document.getElementById('skullWatermark');
    if (skull) {
        if (theme === 'zen')         { skull.innerHTML = DARUMA_IMG; }
        else if (theme === 'kawaii') { skull.innerHTML = KAWAII_REAPER; }
        else                         { skull.innerHTML = '💀'; }
    }
    renderLists();
}

function startApp() {
    setInterval(tick, 100);
    renderLists();
    dailyCheck();
    requestAnimationFrame(initScrollPosition);
    sendHeartbeat();
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // 波紋リスナー
    const gw = document.querySelector('.gauge-wrapper');
    if (gw) gw.addEventListener('pointerdown', spawnRipple);
}

function spawnRipple(e) {
    const gw   = e.currentTarget;
    const rect = gw.getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    // 3重波紋
    for (let i = 0; i < 3; i++) {
        const r = document.createElement('div');
        r.className = 'gauge-ripple';
        r.style.left = cx + 'px';
        r.style.top  = cy + 'px';
        r.style.animationDelay = (i * 0.13) + 's';
        gw.appendChild(r);
        r.addEventListener('animationend', () => r.remove());
    }
}

/**
 * タイムラインの初期スクロール位置を設定する。
 * #now-spacer の上端が NOWパネルの上端と一致するように scrollTop を計算する。
 */
function initScrollPosition() {
    const timeline = document.getElementById('timeline');
    const nowPanel = document.getElementById('now-panel');
    const spacer   = document.getElementById('now-spacer');
    if (!timeline || !nowPanel || !spacer) return;

    const tlRect     = timeline.getBoundingClientRect();
    const spacerRect = spacer.getBoundingClientRect();

    // スペーサーの timeline 内絶対位置（現在の scrollTop を加算）
    const spacerTopInContent = spacerRect.top - tlRect.top + timeline.scrollTop;

    // NOWパネルの上端が timeline 可視領域の何px目に来るか
    const nowPanelTopInVisible = (window.innerHeight / 2) - (nowPanel.offsetHeight / 2) - tlRect.top;

    // スペーサー上端 = NOWパネル上端 となる scrollTop
    timeline.scrollTop = Math.max(0, spacerTopInContent - nowPanelTopInVisible);
}

// 1000日自動判定ハイブリッド通知ロジック
function dailyCheck() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (localStorage.getItem(APP_KEY + '_last_daily_check') === todayStr) return;

    let alerts = [];
    const nowTime = new Date().getTime();

    const futureArr = FUTURE_NOTIFY_DAYS.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    const pastArr = PAST_NOTIFY_DAYS.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

    // Futureイベント: 指定日 ＋ 365日より前は1000日毎
    futureEvents.forEach(ev => {
        const diffDays = Math.ceil((new Date(ev.d).getTime() - nowTime) / 86400000);
        const isAuto1000 = (diffDays > 365 && diffDays % 1000 === 0);

        if (futureArr.includes(diffDays) || isAuto1000) {
            if (diffDays === 0) alerts.push(`【当日】目標「${ev.t}」の日が来ました！`);
            else alerts.push(`【未来リマインド】「${ev.t}」まであと ${diffDays}日です`);
        }
    });

    // Pastイベント: 指定日 ＋ 以降は1000日毎
    pastEvents.forEach(ev => {
        const diffDays = Math.floor((nowTime - new Date(ev.d).getTime()) / 86400000);
        const isAuto1000 = (diffDays >= 1000 && diffDays % 1000 === 0);

        if (pastArr.includes(diffDays) || isAuto1000) {
            alerts.push(`【過去アニバーサリー】「${ev.t}」から ${diffDays}日 経過しました！`);
        }
    });

    if (alerts.length > 0) {
        const msg = "Lifecounter イベント通知\n\n" + alerts.join("\n");
        sendGasNotification("EVENT NOTIFICATION", msg);
    }
    localStorage.setItem(APP_KEY + '_last_daily_check', todayStr);
}

function tick() {
    if (!birthDate) return;
    const now = Date.now();
    const diff = now - birthDate.getTime();

    document.getElementById('heroDays').innerText = Math.floor(diff/86400000);

    const rem = Math.max(0, (deadline - now)/1000);
    const ratio = EMERGENCY_SEC > 0 ? rem / EMERGENCY_SEC : 0;
    const circumference = 553;

    // --- カウントダウン表示 ---
    const deadlineDisplay = document.getElementById('deadlineDisplay');
    if (deadlineDisplay) {
        deadlineDisplay.innerText = rem.toFixed(1) + "s";
        if (ratio <= 0) {
            deadlineDisplay.style.color = "#ff0000";
            deadlineDisplay.style.borderColor = "#ff0000";
        } else if (ratio < 0.3) {
            deadlineDisplay.style.color = "var(--sub-color)";
            deadlineDisplay.style.borderColor = "var(--sub-color)";
        } else {
            deadlineDisplay.style.color = "var(--main-color)";
            deadlineDisplay.style.borderColor = "var(--border)";
        }
    }

    // --- ゲージ弧 + 色クラス ---
    const ring = document.getElementById('lifeGaugeRing');
    if (ring) {
        ring.style.strokeDashoffset = circumference * (1 - Math.min(1, ratio));
        ring.className = 'gauge-ring';
        if      (ratio <= 0)   ring.classList.add('g-emergency');
        else if (ratio < 0.1)  ring.classList.add('g-critical');
        else if (ratio < 0.3)  ring.classList.add('g-danger');
        else if (ratio < 0.5)  ring.classList.add('g-warn');
    }

    // --- 生存日数テキストカラー（タイムオーバーで赤） ---
    const heroDays = document.getElementById('heroDays');
    if (heroDays) {
        heroDays.style.color = rem <= 0 ? '#ff0000' : '';
    }

    // --- ドクロ＋heartbeat（300秒起点） ---
    const skull = document.getElementById('skullWatermark');
    const gw    = document.querySelector('.gauge-wrapper');
    if (skull && gw) {
        gw.classList.remove('hb-warning','hb-danger','hb-critical','hb-emergency');
        if (rem >= 300) {
            skull.style.opacity = '0';
        } else if (rem <= 0) {
            gw.classList.add('hb-emergency');
            skull.style.opacity = '1';
        } else if (rem < 60) {
            gw.classList.add('hb-critical');
            skull.style.opacity = '0.75';
        } else if (rem < 150) {
            gw.classList.add('hb-danger');
            skull.style.opacity = '0.45';
        } else {
            // 300→150秒でじわっと出現
            gw.classList.add('hb-warning');
            skull.style.opacity = ((1 - (rem - 150) / 150) * 0.25).toFixed(3);
        }
    }

    // --- ゲージラベル ---
    const gaugeLabel = document.getElementById('gaugeLabel');
    if (gaugeLabel) {
        if (ratio <= 0) {
            gaugeLabel.innerText = "⚠ EMERGENCY ⚠";
            gaugeLabel.style.color = "#ff0000";
        } else if (ratio < 0.3) {
            gaugeLabel.innerText = "TAP TO RESET";
            gaugeLabel.style.color = "var(--sub-color)";
        } else {
            gaugeLabel.innerText = "TAP TO RESET";
            gaugeLabel.style.color = "var(--dim-text)";
        }
    }

    // --- 緊急プロトコル ---
    if (rem <= 0) {
        document.body.style.backgroundColor = "#660000";
        if (!emergencySent && EMERGENCY_EMAILS.some(e => e)) {
            emergencySent = true;
            console.log("💀 緊急プロトコル発動...");
            const name = USER_NAME || "登録者";
            const subject = "【緊急】ライフカウンター生存確認アプリ";
            const msg = `こちらはLifeCounterアプリです。${name}さんから設定時間内に応答がありません！至急ご本人に連絡し生きているか確認してください！\n\n総生存日数: ${Math.floor(diff/86400000)}日\n最終ログ: ${new Date().toLocaleString()}`;
            sendGasNotification("EMERGENCY ALERT", msg, subject);
        }
    } else {
        document.body.style.backgroundColor = "var(--bg-color)";
        emergencySent = false;
    }
}

async function sendGasNotification(type, message, subject = "") {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwfymOuNu5UNAPnXtNNpPqvE0AR3czyLJN2X-EN02wgI-ZHOztOWwsY8oTJf037PeElMg/exec";
    const activeEmails = EMERGENCY_EMAILS.filter(e => e.trim());
    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: type,
                message: message,
                subject: subject,
                emails: activeEmails,
            })
        });
        return true;
    } catch (error) {
        console.error("GAS送信失敗:", error);
        return false;
    }
}

function openModal(type) {
    currentModalType = type;
    editingIndex = null;
    const isSettings = (type === 'settings');
    const saveBtn = document.getElementById('btnSaveEvent');

    document.getElementById('formFields').style.display = isSettings ? 'none' : 'block';
    document.getElementById('settingsFields').style.display = isSettings ? 'block' : 'none';
    document.getElementById('modalTitle').innerText = isSettings ? "SETTINGS" : type.toUpperCase() + " EVENT";

    saveBtn.className = "btn-modal btn-save" + (type === 'future' ? " future-mode" : "");

    if (isSettings) {
        document.getElementById('inpTheme').value = CURRENT_THEME;
        document.getElementById('inpName').value = USER_NAME;
        document.getElementById('inpEmail1').value = EMERGENCY_EMAILS[0] || "";
        document.getElementById('inpEmail2').value = EMERGENCY_EMAILS[1] || "";
        document.getElementById('inpEmail3').value = EMERGENCY_EMAILS[2] || "";
        document.getElementById('inpEmergency').value = EMERGENCY_SEC;
        document.getElementById('inpGrace').value = GRACE_SEC;
        document.getElementById('inpFutureNotify').value = FUTURE_NOTIFY_DAYS;
        document.getElementById('inpPastNotify').value = PAST_NOTIFY_DAYS;
        // 現在の生年月日をinputにセット（datetime-local形式に変換）
        const birthVal = localStorage.getItem(APP_KEY + '_birth') || '';
        document.getElementById('inpBirth').value = birthVal.length > 16 ? birthVal.slice(0, 16) : birthVal;
        // 未来日禁止
        const now2 = new Date();
        const pad2 = n => String(n).padStart(2, '0');
        document.getElementById('inpBirth').max = `${now2.getFullYear()}-${pad2(now2.getMonth()+1)}-${pad2(now2.getDate())}T${pad2(now2.getHours())}:${pad2(now2.getMinutes())}`;
    }
    document.getElementById('addModal').style.display = 'flex';
}

function saveEvent() {
    if (currentModalType === 'settings') {
        EMERGENCY_SEC = parseInt(document.getElementById('inpEmergency').value) || 3600;
        GRACE_SEC = parseInt(document.getElementById('inpGrace').value) || 600;
        USER_NAME = document.getElementById('inpName').value.trim();
        EMERGENCY_EMAILS = [
            document.getElementById('inpEmail1').value.trim(),
            document.getElementById('inpEmail2').value.trim(),
            document.getElementById('inpEmail3').value.trim(),
        ];
        FUTURE_NOTIFY_DAYS = document.getElementById('inpFutureNotify').value || "365, 100, 50, 30, 20, 10, 7, 3, 2, 1, 0";
        PAST_NOTIFY_DAYS = document.getElementById('inpPastNotify').value || "100, 365";

        localStorage.setItem(APP_KEY + '_emergency', EMERGENCY_SEC);
        localStorage.setItem(APP_KEY + '_grace', GRACE_SEC);
        localStorage.setItem(APP_KEY + '_name', USER_NAME);
        localStorage.setItem(APP_KEY + '_emails', JSON.stringify(EMERGENCY_EMAILS));
        localStorage.setItem(APP_KEY + '_future_notify', FUTURE_NOTIFY_DAYS);
        localStorage.setItem(APP_KEY + '_past_notify', PAST_NOTIFY_DAYS);
        // 生年月日の変更
        const newBirth = document.getElementById('inpBirth').value;
        if (newBirth && new Date(newBirth) <= new Date()) {
            localStorage.setItem(APP_KEY + '_birth', newBirth);
            birthDate = new Date(newBirth);
        }
    } else {
        const t = document.getElementById('inpTitle').value, d = document.getElementById('inpDate').value;
        if(!t || !d) return;
        const arr = (currentModalType === 'past' ? pastEvents : futureEvents);
        if (editingIndex !== null) {
            arr[editingIndex] = {t, d};
        } else {
            arr.push({t, d});
        }
        editingIndex = null;
        localStorage.setItem(APP_KEY + '_' + currentModalType, JSON.stringify(arr));
    }
    renderLists(); closeModal();
}

function resetAllData() {
    if (!confirm("⚠ 全データを削除してリセットします。\n生年月日・イベント・設定がすべて消去されます。\n本当によろしいですか？")) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith(APP_KEY));
    keys.forEach(k => localStorage.removeItem(k));
    location.reload();
}

function editEvent(type, index) {
    const arr = (type === 'past' ? pastEvents : futureEvents);
    const ev  = arr[index];
    currentModalType = type;
    editingIndex = index;
    const saveBtn = document.getElementById('btnSaveEvent');
    document.getElementById('formFields').style.display = 'block';
    document.getElementById('settingsFields').style.display = 'none';
    document.getElementById('modalTitle').innerText = "EDIT " + type.toUpperCase();
    saveBtn.className = "btn-modal btn-save" + (type === 'future' ? " future-mode" : "");
    document.getElementById('inpTitle').value = ev.t;
    document.getElementById('inpDate').value  = ev.d;
    document.getElementById('addModal').style.display = 'flex';
}

function delEvent(type, index) {
    if (!confirm("本当にこのイベントを削除しますか？")) return;
    const arr = (type === 'past' ? pastEvents : futureEvents);
    arr.splice(index, 1);
    localStorage.setItem(APP_KEY + '_' + type, JSON.stringify(arr));
    renderLists();
}

// 距離に応じた動的カラーを返す
// future: 遠い=黄色(255,170,0) → 近い=オレンジ(255,60,0)
// past:   近い=濃い青(0,80,210) → 遠い=水色(0,240,255)
function eventColor(type, days) {
    // Kawaii テーマ専用カラー（マイメロ×クロミ）
    if (CURRENT_THEME === 'kawaii') {
        if (type === 'past') {
            // クロミパープル: 近い=濃い紫、遠い=淡い薄紫
            const r = Math.max(0, Math.min(1, days / 730));
            const R = Math.round(105 + 75  * r); // 105 → 180
            const G = Math.round(60  + 100 * r); //  60 → 160
            const B = Math.round(180 + 40  * r); // 180 → 220
            return `rgb(${R},${G},${B})`;
        } else {
            // マイメロピンク: 近い=濃いピンク、遠い=淡いピンク
            const r = Math.max(0, Math.min(1, 1 - days / 365));
            const R = Math.round(172 + 60  * r); // 172 → 232
            const G = Math.round(148 - 80  * r); // 148 →  68
            const B = Math.round(224 - 70  * r); // 224 → 154
            return `rgb(${R},${G},${B})`;
        }
    }
    // ZEN テーマ専用カラー（LUPICIA: 抹茶 × 琥珀）
    if (CURRENT_THEME === 'zen') {
        if (type === 'past') {
            // 抹茶グリーン: 近い=#356200(深緑) → 遠い=#cce693(若草)
            const r = Math.max(0, Math.min(1, days / 730));
            const R = Math.round(53  + 151 * r); //  53 → 204
            const G = Math.round(98  + 132 * r); //  98 → 230
            const B = Math.round(0   + 147 * r); //   0 → 147
            return `rgb(${R},${G},${B})`;
        } else {
            // 琥珀ブラウン: 近い=#7a5010(濃茶) → 遠い=#d4b878(砂色)
            const r = Math.max(0, Math.min(1, 1 - days / 365));
            const R = Math.round(212 - 90  * r); // 212 → 122
            const G = Math.round(184 - 104 * r); // 184 →  80
            const B = Math.round(120 - 104 * r); // 120 →  16
            return `rgb(${R},${G},${B})`;
        }
    }
    // 他テーマの既存ロジック
    if (type === 'future') {
        const r = Math.max(0, Math.min(1, 1 - days / 365));
        const g = Math.round(170 - 110 * r); // 170 → 60
        return `rgb(255,${g},0)`;
    } else {
        const r = Math.max(0, Math.min(1, days / 730)); // 2年で最大
        const g = Math.round(80  + 160 * r); // 80  → 240
        const b = Math.round(210 + 45  * r); // 210 → 255
        return `rgb(0,${g},${b})`;
    }
}

function renderLists(){
    const now = Date.now();
    ['past', 'future'].forEach(type => {
        const container = document.getElementById(type + 'List');
        const source = (type === 'past' ? pastEvents : futureEvents);

        if (source.length === 0) {
            container.innerHTML = `<div style="padding:10px 0; font-size:0.7rem; color:var(--dim-text); text-align:center; opacity:0.6;">— no entries —</div>`;
            return;
        }

        // 元配列のインデックスを保持したままソート（非破壊）
        const sorted = source
            .map((ev, index) => ({ ev, index }))
            .sort((a, b) => {
                const ta = new Date(a.ev.d).getTime();
                const tb = new Date(b.ev.d).getTime();
                return tb - ta;
            });

        container.innerHTML = sorted.map(({ ev, index }) => {
            const days  = Math.abs(Math.floor((now - new Date(ev.d)) / 86400000));
            const color = eventColor(type, days);
            return `<div class="card card-${type}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
                    <div style="flex:1; min-width:0;">
                        <div class="card-title" style="color:${color}">${ev.t}</div>
                        <div class="card-days"  style="color:${color}">${days} DAYS</div>
                    </div>
                    <div class="card-actions">
                        <div onclick="delEvent('${type}', ${index})" class="card-btn-del">×</div>
                        <div onclick="editEvent('${type}', ${index})" class="card-btn-edit">✎</div>
                    </div>
                </div>
            </div>`;
        }).join('');
    });
}

function titleClickCount() { clickCount++; if(clickCount >= 3) { clickCount=0; openModal('settings'); } setTimeout(() => clickCount = 0, 2000); }
function closeModal(){ document.getElementById('addModal').style.display='none'; }

function resetDeathTimer() {
    deadline = Date.now() + (EMERGENCY_SEC * 1000);
    // スイッチリセット時にサーバー側の期限も即座に更新
    sendHeartbeat();
}

/**
 * バックエンドへ生存報告（ハートビート）を送信する。
 * deadline はUNIXタイムスタンプ（秒）に変換して送る。
 */
async function sendHeartbeat() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: USER_ID,
                deadline: deadline / 1000,   // msec → sec
                email: EMERGENCY_EMAILS[0] || "",
                emails: EMERGENCY_EMAILS.filter(e => e.trim()),
                message: `こちらはLifeCounterアプリです。${USER_NAME || "登録者"}さんから設定時間内に応答がありません！至急ご本人に連絡し生きているか確認してください！`,
                emergency_sec: EMERGENCY_SEC,
            }),
        });
        if (!res.ok) {
            console.warn("Heartbeat: server returned", res.status);
        }
    } catch (e) {
        // バックエンドが落ちていてもフロントの動作は継続する
        console.warn("Heartbeat failed (backend unreachable):", e.message);
    }
}

async function startCamera() {
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        document.getElementById('videoFeed').srcObject = s;
        document.getElementById('cameraModal').style.display = 'flex';
        document.getElementById('bootScreen').style.display = 'none';
    } catch(e){
        alert("カメラの許可が必要です。");
    }
}

async function takePhoto() {
    const today = new Date().toISOString().split('T')[0];
    const video = document.getElementById('videoFeed');

    // Canvasにフレームを描画して画像データを取得（CSS mirrorに合わせて反転）
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    // IndexedDBに保存
    try {
        await savePhotoToAlbum(today, dataUrl);
    } catch(e) {
        console.warn('Album save failed:', e);
    }

    localStorage.setItem(APP_KEY + '_last_log', today);
    document.getElementById('cameraModal').style.display = 'none';

    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }

    checkDailyLog();
}

// --- IndexedDB（アルバム） ---
function openAlbumDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('lifecounter_album', 1);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore('photos', { keyPath: 'date' });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function savePhotoToAlbum(date, dataUrl) {
    const db = await openAlbumDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').put({ date, dataUrl });
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
    });
}

async function getAllPhotos() {
    const db = await openAlbumDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function openAlbum() {
    const photos = await getAllPhotos();
    photos.sort((a, b) => b.date.localeCompare(a.date));

    const grid = document.getElementById('albumGrid');
    if (photos.length === 0) {
        grid.innerHTML = '<div style="color:var(--dim-text); text-align:center; padding:40px; width:100%; grid-column:1/-1;">まだ写真がありません</div>';
    } else {
        grid.innerHTML = photos.map(p => `
            <div class="album-item" onclick="openPhotoViewer('${p.dataUrl}','${p.date}')">
                <img src="${p.dataUrl}" alt="${p.date}">
                <div class="album-date">${p.date}</div>
            </div>
        `).join('');
    }
    document.getElementById('albumModal').style.display = 'flex';
}

function closeAlbum() {
    document.getElementById('albumModal').style.display = 'none';
}

function openPhotoViewer(src, date) {
    document.getElementById('photoViewerImg').src  = src;
    document.getElementById('photoViewerDate').innerText = date;
    document.getElementById('photoViewer').style.display = 'flex';
}

function closePhotoViewer() {
    document.getElementById('photoViewer').style.display = 'none';
}
