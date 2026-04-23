const SAVE_KEY = "ctfRpgSaveV1";
const GAME_DATA_URL = "/data/game-data.json";
const GAME_SAVE_API_URL = "/api/game-save";

let stageTable = [];
let shopItems = [];

function createDefaultState() {
  const firstStageId = stageTable[0]?.id ?? 1;
  const firstEnemy = stageTable[0]?.enemies?.[0] ?? {};
  const firstEnemyHp = firstEnemy.maxHp ?? 100;
  const stageClears = {};
  stageTable.forEach((stage) => {
    stageClears[stage.id] = [];
  });
  if (!stageClears[firstStageId]) {
    stageClears[firstStageId] = [];
  }
  return {
    gp: 0,
    syncedScore: 0,
    gpAwardedProblems: [],
    player: {
      level: 1,
      maxHp: 120,
      hp: 120,
      atk: 20,
      def: 12,
      spd: 10,
      guard: false
    },
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [],
    selectedStage: firstStageId,
    currentEnemyIndex: 0,
    stageClears,
    enemyHp: firstEnemyHp,
    enemyActionCount: getEnemyActionInterval(firstEnemy),
    log: ["RPGモードへようこそ。CTF得点を同期して育成を始めよう。"]
  };
}

let state = null;

const ui = {
  playerSummary: document.getElementById("playerSummary"),
  enemyArea: document.getElementById("enemyArea"),
  battleLog: document.getElementById("battleLog"),
  shopList: document.getElementById("shopList"),
  syncMessage: document.getElementById("syncMessage"),
  syncScoreBtn: document.getElementById("syncScoreBtn"),
  stageSelection: document.getElementById("stageSelection"),
  currentStageInfo: document.getElementById("currentStageInfo"),
  attackBtn: document.getElementById("attackBtn"),
  guardBtn: document.getElementById("guardBtn"),
  nextEnemyBtn: document.getElementById("nextEnemyBtn"),
  playerHpFill: document.getElementById("playerHpFill"),
  playerHpText: document.getElementById("playerHpText")
};

init();

async function init() {
  try {
    await loadGameData();
  } catch (err) {
    console.error(err);
    if (ui.syncMessage) {
      ui.syncMessage.textContent = "ゲームデータの読み込みに失敗しました。";
    }
    return;
  }
  state = await loadState();
  bindEvents();
  render();
}

async function loadGameData() {
  const res = await fetch(GAME_DATA_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("ゲームデータの取得に失敗しました。");
  }
  const data = await res.json();
  if (!Array.isArray(data?.stages) || data.stages.length === 0) {
    throw new Error("ゲームデータ形式が不正です。");
  }
  stageTable = data.stages;
  shopItems = Array.isArray(data?.shopItems) ? data.shopItems : [];
}

function bindEvents() {
  if (ui.syncScoreBtn) {
    ui.syncScoreBtn.addEventListener("click", syncScoreFromServer);
  }
  if (ui.attackBtn) {
    ui.attackBtn.addEventListener("click", onAttack);
  }
  if (ui.guardBtn) {
    ui.guardBtn.addEventListener("click", onGuard);
  }
  if (ui.nextEnemyBtn) {
    ui.nextEnemyBtn.addEventListener("click", onNextEnemy);
  }
  document.querySelectorAll("[data-upgrade]").forEach((btn) => {
    btn.addEventListener("click", () => upgradeStat(btn.dataset.upgrade));
  });
  if (ui.stageSelection) {
    ui.stageSelection.addEventListener("click", onStageSelectionClick);
  }
}

async function syncScoreFromServer() {
  if (ui.syncMessage) ui.syncMessage.textContent = "同期中...";
  try {
    const res = await fetch("/getScore", { credentials: "include" });
    if (!res.ok) {
      throw new Error("ログイン状態を確認してください");
    }
    const data = await res.json();
    const incoming = Number(data.score || 0);
    if (!Number.isFinite(incoming)) {
      throw new Error("得点データが不正です");
    }

    const reward = await syncGpFromSolvedProblems();
    state.syncedScore = incoming;
    if (reward > 0) {
      pushLog(`CTF解答を同期: +${reward} GP`);
    } else {
      pushLog("CTF解答を同期: 新しいGP獲得はありません。");
    }
    if (ui.syncMessage) ui.syncMessage.textContent = `同期完了: score ${incoming} / GP ${state.gp}`;
    saveState();
    render();
  } catch (err) {
    if (ui.syncMessage) ui.syncMessage.textContent = "同期失敗: ログイン後に再実行してください。";
    pushLog(`同期エラー: ${err.message}`);
    render();
  }
}

async function syncGpFromSolvedProblems() {
  const [solvedRes, quizRes] = await Promise.all([
    fetch("/quiz/solvedList", { credentials: "include" }),
    fetch("/api/quizData", { credentials: "include" })
  ]);
  if (!solvedRes.ok || !quizRes.ok) {
    throw new Error("問題同期に失敗しました");
  }

  const solvedList = await solvedRes.json();
  const quizData = await quizRes.json();
  const rewardedSet = new Set(Array.isArray(state.gpAwardedProblems) ? state.gpAwardedProblems : []);

  let gained = 0;
  for (const solved of solvedList) {
    const key = `${solved.category}:${solved.qid}`;
    if (rewardedSet.has(key)) continue;

    const problem = quizData?.[solved.category]?.[solved.qid];
    const basePoint = Number(problem?.point || 0);
    const gpReward = calcProblemGp(basePoint);
    gained += gpReward;
    rewardedSet.add(key);
  }

  if (gained > 0) {
    state.gp += gained;
  }
  state.gpAwardedProblems = Array.from(rewardedSet);
  return gained;
}

function onAttack() {
  if (state.player.hp <= 0) {
    pushLog("あなたは戦闘不能です。次の敵へ進んで再挑戦してください。");
    render();
    return;
  }
  if (state.enemyHp <= 0) {
    pushLog("敵はすでに倒れています。次の敵へ進みましょう。");
    render();
    return;
  }
  runBattleTurn("attack");
}

function onGuard() {
  if (state.player.hp <= 0 || state.enemyHp <= 0) {
    pushLog("今は防御できません。");
    render();
    return;
  }
  state.player.guard = true;
  runBattleTurn("guard");
}

function onNextEnemy() {
  if (state.enemyHp > 0 && state.player.hp > 0) {
    pushLog("敵を倒してから次へ進んでください。");
    render();
    return;
  }
  const stage = getCurrentStage();
  const nextIdx = getNextUnclearedEnemyIndex(stage.id);
  if (nextIdx === -1) {
    pushLog("このステージは全クリア済みです。トップで次ステージへ進んでください。");
    saveState();
    render();
    return;
  }
  state.currentEnemyIndex = nextIdx;
  const enemy = getCurrentEnemy();
  state.enemyHp = enemy.maxHp;
  state.enemyActionCount = getEnemyActionInterval(enemy);
  state.player.hp = state.player.maxHp;
  state.player.guard = false;
  pushLog(`次の敵「${enemy.name}」が現れた。HPが全回復した。`);
  saveState();
  render();
}

function runBattleTurn(action) {
  const enemy = getCurrentEnemy();
  const playerStats = effectivePlayerStats();
  playerAction(action, enemy, playerStats);
  if (state.enemyHp > 0 && state.player.hp > 0) {
    tickEnemyAction(enemy, playerStats);
  }

  if (state.enemyHp <= 0) {
    state.enemyHp = 0;
    state.gp += enemy.reward;
    markEnemyCleared(getCurrentStage().id, enemy.key);
    pushLog(`${enemy.name}を撃破。${enemy.reward} GPを獲得。`);
    if (isStageCleared(getCurrentStage().id)) {
      pushLog(`${getCurrentStage().name} を全クリア。次のステージが解放されます。`);
    }
  }
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    pushLog("敗北した。次の敵へ進むとHPが回復します。");
  }

  state.player.guard = false;
  saveState();
  render();
}

function playerAction(action, enemy, stats) {
  if (action === "guard") {
    pushLog("防御体勢に入った。受けるダメージを軽減する。");
    return;
  }
  const dmg = calcDamage(stats.atk, enemy.def);
  state.enemyHp -= dmg;
  pushLog(`あなたの攻撃: ${enemy.name}に ${dmg} ダメージ。`);
}

function enemyAction(enemy, stats) {
  const raw = calcDamage(enemy.atk, stats.def);
  const dmg = state.player.guard ? Math.max(1, Math.floor(raw * 0.45)) : raw;
  state.player.hp -= dmg;
  pushLog(`${enemy.name}の攻撃: あなたに ${dmg} ダメージ。`);
}

function tickEnemyAction(enemy, stats) {
  state.enemyActionCount -= 1;
  if (state.enemyActionCount <= 0) {
    enemyAction(enemy, stats);
    state.enemyActionCount = getEnemyActionInterval(enemy);
    return;
  }
  pushLog(`${enemy.name}は様子を見ている…（攻撃まで ${state.enemyActionCount}）`);
}

function getEnemyActionInterval(enemy) {
  const interval = Number(enemy?.actionInterval);
  if (Number.isFinite(interval) && interval >= 1) {
    return Math.floor(interval);
  }
  return 2;
}

function calcDamage(attackerAtk, defenderDef) {
  const base = attackerAtk - Math.floor(defenderDef * 0.45);
  const spread = Math.floor(Math.random() * 6);
  return Math.max(1, base + spread);
}

function upgradeStat(kind) {
  const costMap = { maxHp: 50, atk: 60, def: 60, spd: 70 };
  const cost = costMap[kind];
  if (state.gp < cost) {
    pushLog(`GP不足: ${kind} 強化には ${cost} GP 必要。`);
    render();
    return;
  }
  state.gp -= cost;
  if (kind === "maxHp") {
    state.player.maxHp += 12;
    state.player.hp += 12;
  } else {
    state.player[kind] += 2;
  }
  state.player.level += 1;
  pushLog(`${kind} を強化。Lv ${state.player.level} になった。`);
  saveState();
  render();
}

function renderShop() {
  if (!ui.shopList) return;
  ui.shopList.innerHTML = "";
  shopItems.forEach((item) => {
    const card = document.createElement("div");
    card.className = "shop-item";
    const owned = state.inventory.includes(item.id);
    const equipped = state.equipment[item.slot] === item.id;
    card.innerHTML = `
      <strong>${item.name}</strong><br>
      費用: ${item.cost} GP<br>
      補正: ATK ${signed(item.atk)} / DEF ${signed(item.def)} / SPD ${signed(item.spd)}<br>
      <button data-buy="${item.id}" ${owned ? "disabled" : ""}>${owned ? "購入済み" : "購入"}</button>
      <button data-equip="${item.id}" ${owned ? "" : "disabled"}>${equipped ? "装備中" : "装備"}</button>
    `;
    ui.shopList.appendChild(card);
  });

  ui.shopList.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", () => buyItem(btn.dataset.buy));
  });
  ui.shopList.querySelectorAll("[data-equip]").forEach((btn) => {
    btn.addEventListener("click", () => equipItem(btn.dataset.equip));
  });
}

function buyItem(itemId) {
  const item = shopItems.find((i) => i.id === itemId);
  if (!item) return;
  if (state.inventory.includes(item.id)) return;
  if (state.gp < item.cost) {
    pushLog(`GP不足: ${item.name} は ${item.cost} GP 必要。`);
    render();
    return;
  }
  state.gp -= item.cost;
  state.inventory.push(item.id);
  pushLog(`${item.name} を購入した。`);
  saveState();
  render();
}

function equipItem(itemId) {
  if (!state.inventory.includes(itemId)) return;
  const item = shopItems.find((i) => i.id === itemId);
  if (!item) return;
  state.equipment[item.slot] = item.id;
  pushLog(`${item.name} を装備した。`);
  saveState();
  render();
}

function effectivePlayerStats() {
  const stats = {
    maxHp: state.player.maxHp,
    atk: state.player.atk,
    def: state.player.def,
    spd: state.player.spd
  };
  Object.values(state.equipment).forEach((itemId) => {
    if (!itemId) return;
    const item = shopItems.find((i) => i.id === itemId);
    if (!item) return;
    stats.atk += item.atk;
    stats.def += item.def;
    stats.spd += item.spd;
  });
  return stats;
}

function render() {
  const stage = getCurrentStage();
  const enemy = getCurrentEnemy();
  const stats = effectivePlayerStats();
  if (ui.playerSummary) {
    ui.playerSummary.innerHTML = `
      <div class="stat-card">GP: ${state.gp}</div>
      <div class="stat-card">Lv: ${state.player.level}</div>
      <div class="stat-card">HP: ${state.player.hp} / ${stats.maxHp}</div>
      <div class="stat-card">ATK: ${stats.atk}</div>
      <div class="stat-card">DEF: ${stats.def}</div>
      <div class="stat-card">SPD: ${stats.spd}</div>
      <div class="stat-card">武器: ${equipName("weapon")}</div>
      <div class="stat-card">防具: ${equipName("armor")}</div>
      <div class="stat-card">装飾: ${equipName("accessory")}</div>
    `;
  }

  if (ui.enemyArea) {
    const enemyHp = Math.max(0, state.enemyHp);
    const hpPercent = Math.max(0, Math.min(100, Math.round((enemyHp / enemy.maxHp) * 100)));
    const enemyActionCount = Math.max(0, Number(state.enemyActionCount ?? getEnemyActionInterval(enemy)));
    const enemyVisual = enemy.image
      ? `<img class="enemy-image" src="${enemy.image}" alt="${enemy.name}">`
      : `<div class="enemy-image-placeholder">${enemy.name}</div>`;

    ui.enemyArea.innerHTML = `
      <div class="enemy-box">
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-visual-wrap">
          <div class="enemy-action-count">行動 ${enemyActionCount}</div>
          ${enemyVisual}
        </div>
        <div class="enemy-hp-wrap">
          <div class="enemy-hp-bar">
            <div class="enemy-hp-fill" style="width: ${hpPercent}%;"></div>
          </div>
          <div class="enemy-hp-text">HP: ${enemyHp} / ${enemy.maxHp}</div>
        </div>
        <div class="enemy-meta">ATK: ${enemy.atk} / DEF: ${enemy.def} / SPD: ${enemy.spd}</div>
        撃破報酬: ${enemy.reward} GP
      </div>
    `;
  }

  if (ui.currentStageInfo) {
    const cleared = getClearedCount(stage.id);
    const total = stage.enemies.length;
    ui.currentStageInfo.textContent = `${stage.name} (${cleared}/${total} クリア)`;
  }

  if (ui.battleLog) {
    ui.battleLog.textContent = state.log.slice(-3).join("\n");
  }
  if (ui.playerHpFill && ui.playerHpText) {
    const hp = Math.max(0, state.player.hp);
    const hpPercent = Math.max(0, Math.min(100, Math.round((hp / stats.maxHp) * 100)));
    ui.playerHpFill.style.width = `${hpPercent}%`;
    ui.playerHpText.textContent = `${hp} / ${stats.maxHp}`;
  }
  renderShop();
  renderStageSelection();
}

function equipName(slot) {
  const itemId = state.equipment[slot];
  if (!itemId) return "なし";
  const item = shopItems.find((i) => i.id === itemId);
  return item ? item.name : "なし";
}

function getCurrentStage() {
  const found = stageTable.find((s) => s.id === state.selectedStage);
  return found || stageTable[0];
}

function getCurrentEnemy() {
  const stage = getCurrentStage();
  const index = Math.max(0, Math.min(stage.enemies.length - 1, state.currentEnemyIndex));
  return stage.enemies[index];
}

function pushLog(text) {
  state.log.push(text);
}

async function loadState() {
  const defaultState = createDefaultState();
  try {
    const remoteState = await loadRemoteState();
    if (remoteState) {
      const mergedRemote = mergeStateWithDefaults(remoteState, defaultState);
      localStorage.setItem(SAVE_KEY, JSON.stringify(mergedRemote));
      return mergedRemote;
    }

    const localState = loadStateFromLocalStorage();
    if (localState) {
      const mergedLocal = mergeStateWithDefaults(localState, defaultState);
      saveRemoteState(mergedLocal);
      return mergedLocal;
    }

    return structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  saveRemoteState(state);
}

function loadStateFromLocalStorage() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function loadRemoteState() {
  try {
    const res = await fetch(GAME_SAVE_API_URL, { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) {
      throw new Error("server save load failed");
    }
    const data = await res.json();
    if (!data?.success) return null;
    if (!data.state || typeof data.state !== "object") return null;
    return data.state;
  } catch (err) {
    console.warn("remote save load failed", err);
    return null;
  }
}

async function saveRemoteState(nextState) {
  try {
    await fetch(GAME_SAVE_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ state: nextState })
    });
  } catch (err) {
    console.warn("remote save failed", err);
  }
}

function mergeStateWithDefaults(parsed, defaultState) {
  const merged = {
    ...structuredClone(defaultState),
    ...parsed,
    player: { ...structuredClone(defaultState).player, ...(parsed.player || {}) },
    equipment: { ...structuredClone(defaultState).equipment, ...(parsed.equipment || {}) },
    inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
    stageClears: normalizeStageClears(parsed.stageClears),
    log: Array.isArray(parsed.log) && parsed.log.length > 0 ? parsed.log : structuredClone(defaultState).log
  };
  if (!isStageUnlocked(merged.selectedStage, merged.stageClears)) {
    merged.selectedStage = 1;
  }
  const stage = stageTable.find((s) => s.id === merged.selectedStage) || stageTable[0];
  const firstUncleared = getNextUnclearedEnemyIndex(stage.id, merged.stageClears);
  merged.currentEnemyIndex = firstUncleared === -1 ? 0 : firstUncleared;
  const curEnemy = stage.enemies[merged.currentEnemyIndex];
  if (!Number.isFinite(merged.enemyHp) || merged.enemyHp <= 0 || merged.enemyHp > curEnemy.maxHp) {
    merged.enemyHp = curEnemy.maxHp;
  }
  if (!Number.isFinite(merged.enemyActionCount) || merged.enemyActionCount < 0) {
    merged.enemyActionCount = getEnemyActionInterval(curEnemy);
  }
  return merged;
}

function signed(n) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function calcProblemGp(point) {
  if (!Number.isFinite(point) || point <= 0) return 20;
  return Math.max(20, Math.floor(point * 0.8));
}

function normalizeStageClears(input) {
  const base = {};
  stageTable.forEach((stage) => {
    base[stage.id] = [];
  });
  if (!input || typeof input !== "object") return base;
  stageTable.forEach((stage) => {
    const list = input[stage.id];
    base[stage.id] = Array.isArray(list) ? list : [];
  });
  return base;
}

function onStageSelectionClick(event) {
  const selectBtn = event.target.closest("[data-select-stage]");
  const battleBtn = event.target.closest("[data-battle-stage]");
  if (!selectBtn && !battleBtn) return;
  const stageId = Number((selectBtn || battleBtn).dataset[selectBtn ? "selectStage" : "battleStage"]);
  if (!isStageUnlocked(stageId)) {
    pushLog(`Stage ${stageId} はロック中です。前ステージを全クリアしてください。`);
    render();
    return;
  }
  selectStage(stageId);
  if (battleBtn) {
    window.location.href = "/html/game-battle.html";
  }
}

function selectStage(stageId) {
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return;
  state.selectedStage = stageId;
  const nextIdx = getNextUnclearedEnemyIndex(stageId);
  state.currentEnemyIndex = nextIdx === -1 ? 0 : nextIdx;
  state.enemyHp = stage.enemies[state.currentEnemyIndex].maxHp;
  state.enemyActionCount = getEnemyActionInterval(stage.enemies[state.currentEnemyIndex]);
  state.player.hp = state.player.maxHp;
  state.player.guard = false;
  pushLog(`${stage.name} を選択。`);
  saveState();
  render();
}

function renderStageSelection() {
  if (!ui.stageSelection) return;
  ui.stageSelection.innerHTML = stageTable.map((stage) => {
    const unlocked = isStageUnlocked(stage.id);
    const cleared = getClearedCount(stage.id);
    const total = stage.enemies.length;
    const percent = Math.round((cleared / total) * 100);
    const clearedAll = cleared === total;
    const selected = stage.id === state.selectedStage;
    return `
      <article class="stage-card stage-theme-${stage.id} ${unlocked ? "" : "locked"} ${selected ? "selected" : ""} ${clearedAll ? "cleared" : ""}">
        <div class="stage-card-head">
          <h3>${stage.name}</h3>
          <span class="stage-status">${clearedAll ? "CLEAR" : (unlocked ? "OPEN" : "LOCK")}</span>
        </div>
        <p class="stage-desc">${stage.description}</p>
        <div class="stage-progress">
          <div class="stage-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <p class="stage-count">${cleared}/${total} 体撃破</p>
        <div class="stage-card-actions">
          <button data-select-stage="${stage.id}" ${unlocked ? "" : "disabled"}>選択</button>
          <button data-battle-stage="${stage.id}" ${unlocked ? "" : "disabled"}>このステージに挑戦</button>
        </div>
        ${clearedAll ? `<div class="stage-clear-aura" aria-hidden="true"></div>` : ""}
      </article>
    `;
  }).join("");
}

function getClearedCount(stageId) {
  return (state.stageClears[stageId] || []).length;
}

function markEnemyCleared(stageId, enemyKey) {
  const list = state.stageClears[stageId] || [];
  if (!list.includes(enemyKey)) {
    list.push(enemyKey);
    state.stageClears[stageId] = list;
  }
}

function isStageUnlocked(stageId, clearState = state.stageClears) {
  if (stageId === 1) return true;
  for (let i = 1; i < stageId; i++) {
    const stage = stageTable.find((s) => s.id === i);
    if (!stage) return false;
    const list = clearState[i] || [];
    if (list.length < stage.enemies.length) return false;
  }
  return true;
}

function isStageCleared(stageId) {
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return false;
  return getClearedCount(stageId) >= stage.enemies.length;
}

function getNextUnclearedEnemyIndex(stageId, clearState = state.stageClears) {
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return -1;
  const clearedList = clearState[stageId] || [];
  const idx = stage.enemies.findIndex((enemy) => !clearedList.includes(enemy.key));
  return idx;
}
