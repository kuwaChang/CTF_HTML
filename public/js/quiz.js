export let quizData = {};
let solvedList = [];
let currentCategory = null;
let currentQid = null;
let currentPoint = 0;

// JSONから問題一覧を読み込み
export async function loadQuizData() {
  console.log("📡 loadQuizData開始");
  const res = await fetch("/api/quizData");
  if (!res.ok) {
    console.error("サーバーエラー:", res.status);
    return;
  }
  quizData = await res.json();
  console.log("📦 取得したデータ:", quizData);
  const container = document.getElementById("quizContainer");
  container.innerHTML = "";

  // ✅ 解いた問題リストを先に取得
  const solvedRes = await fetch("/quiz/solvedList", { credentials: "include" });
  
  console.log("📡 /api/quizData応答:", res.status);
  solvedList = await solvedRes.json();
  const solvedSet = new Set(solvedList.map(s => `${s.category}:${s.qid}`));

  for (const [category, questions] of Object.entries(quizData)) {
    const h1 = document.createElement("h1");
    h1.textContent = category;
    container.appendChild(h1);

    const grid = document.createElement("div");
    grid.className = "grid";

    for (const [qid, q] of Object.entries(questions)) {
      const div = document.createElement("div");
      div.className = "challenge";
      div.innerHTML = `
        <div>${q.title}</div>
        <div class="points">${q.point}点</div>
      `;

      // ✅ ここで解いた問題を色分け
      const key = `${category}:${qid}`;
      if (solvedSet.has(key)) {
        div.style.backgroundColor = "#6cd463ff";  // 既に解いた
        //div.style.pointerEvents = "none";          // クリック無効
        div.style.opacity = "0.7";
      } else {
        div.style.backgroundColor = "#969696ff";   // 未解答
      }

      div.onclick = () => openModal(category, qid);
      grid.appendChild(div);
    }
    container.appendChild(grid);
  }
}

// ヒントを1つずつ表示する関数
function showNextHint(container) {
  if (container.currentHintIndex < container.allHints.length) {
    const hintDiv = document.createElement("div");
    hintDiv.textContent = `・${container.allHints[container.currentHintIndex]}`;
    hintDiv.style.marginBottom = "10px";
    hintDiv.style.padding = "5px";
    hintDiv.style.backgroundColor = "#4a4a4a";
    hintDiv.style.borderRadius = "5px";
    container.appendChild(hintDiv);
    container.currentHintIndex++;
    
    // 既存のボタンを削除
    const existingBtn = container.querySelector(".next-hint-btn");
    if (existingBtn) existingBtn.remove();
    
    // 残りのヒントがある場合は「次へ」ボタンを表示
    if (container.currentHintIndex < container.allHints.length) {
      // 新しいボタンを追加
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "次のヒントを見る";
      nextBtn.className = "next-hint-btn";
      nextBtn.style.marginTop = "10px";
      nextBtn.style.padding = "8px 16px";
      nextBtn.style.backgroundColor = "#0078ff";
      nextBtn.style.border = "none";
      nextBtn.style.borderRadius = "5px";
      nextBtn.style.color = "white";
      nextBtn.style.cursor = "pointer";
      nextBtn.onclick = () => showNextHint(container);
      container.appendChild(nextBtn);
    }
  }
}

// ✅ モーダル表示
function openModal(category, qid) {
  const q = quizData[category][qid];
  currentCategory = category;
  currentQid = qid;
  currentPoint = q.point;

  const modal = document.getElementById("modal");
  const modalContent = modal.querySelector(".modal-content");

  document.getElementById("modal-title").textContent = q.title;
  document.getElementById("modal-desc").textContent = q.desc;
  document.getElementById("modal-point").textContent = q.point;
  
  // ヒントの初期化
  const hintsContainer = document.getElementById("modal-hints");
  hintsContainer.innerHTML = "";
  hintsContainer.currentHintIndex = 0;
  const hintsArray = Array.isArray(q.hint) ? q.hint : [q.hint];
  hintsContainer.allHints = hintsArray;
  
  // 最初のヒントを表示
  if (hintsArray.length > 0) {
    showNextHint(hintsContainer);
  }

  // 🔽 ファイルボタン生成
  
  const filesDiv = document.getElementById("modal-files");
  filesDiv.innerHTML = ""; // 一旦クリア
  if (q.files && q.files.length > 0) {
    const fileLinks = q.files.map(f => 
      `<a href="files/${f}" download class="download-btn">📄 ${f}</a>`
    ).join("<br>");
    document.getElementById("modal-files").innerHTML += `<div class="download-section">${fileLinks}</div>`;
  } else {
    filesDiv.innerHTML = ""; // ファイルがない場合は非表示
  }

  // Sad Server用のターミナルコンテナの表示/非表示
  const sadContainer = document.getElementById("sad-terminal-container");
  const scenarioSelect = document.getElementById("sad-scenario-select");
  if (category === "sad server" && q.scenarioId) {
    sadContainer.style.display = "block";
    // scenarioIdに合わせてセレクトの値を設定（非表示にするが念のため値を保持）
    if (scenarioSelect) {
      scenarioSelect.value = q.scenarioId;
      scenarioSelect.style.display = "none"; // セレクトボックスを非表示
    }
    // ラベルも非表示にする
    const label = sadContainer.querySelector("label");
    if (label) label.style.display = "none";
  } else {
    sadContainer.style.display = "none";
    if (scenarioSelect) scenarioSelect.style.display = "block";
    const label = sadContainer.querySelector("label");
    if (label) label.style.display = "block";
  }

  modalContent.style.backgroundColor = "#5b5b5bff";
  modalContent.style.color = "white";

  // 解説リンクの初期化
  const explanationLink = document.getElementById("explanation-link");
  explanationLink.style.display = "none";

  // ✅ すでに解いたか確認
  const solved = solvedList.some(s => s.category === category && s.qid === qid);
  if (solved) {
    modalContent.style.backgroundColor = "#6cd463ff";
    // 解説がある場合はリンクを表示
    if (q.explanation) {
      const explanationAnchor = document.getElementById("explanation-link-anchor");
      explanationAnchor.href = q.explanation;
      explanationLink.style.display = "block";
    }
  }

  modal.style.display = "flex";

  console.log(`📝 openModal: ${category} - ${qid}`);
}

export function closeModal() {
  document.getElementById("modal").style.display = "none";
  loadQuizData(); // モーダル閉じたら問題一覧を再読み込み
  
  // Sad Server用のターミナルをクリーンアップ
  const sadTerminal = document.getElementById("sad-terminal");
  if (sadTerminal) {
    sadTerminal.innerHTML = "";
  }
  const sadStartBtn = document.getElementById("sad-start-btn");
  if (sadStartBtn) {
    sadStartBtn.disabled = false;
    sadStartBtn.textContent = "シナリオを開始";
  }
  
  // ラベルとセレクトボックスを再表示
  const sadContainer = document.getElementById("sad-terminal-container");
  const scenarioSelect = document.getElementById("sad-scenario-select");
  const label = sadContainer?.querySelector("label");
  if (scenarioSelect) scenarioSelect.style.display = "block";
  if (label) label.style.display = "block";
  
  console.log("closeModal");
}

window.onclick = (e) => {
  if (e.target === document.getElementById("modal")) closeModal();
};

// ✅ 答え送信
document.getElementById("submitBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const answer = document.getElementById("answer").value;

  const res = await fetch("/quiz/checkAnswer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: currentCategory,
      qid: currentQid,
      answer: answer,
      point: currentPoint
    }),
    credentials: "include"
  });
console.log("📡 /checkAnswer応答:", res.status);

  const data = await res.json();
  const resultEl = document.getElementById("result");
  const modal = document.getElementById("modal");
  const modalContent = modal.querySelector(".modal-content");

  if (data.alreadySolved) {
    resultEl.innerText = "この問題はすでに解いています！";
    resultEl.style.color = "orange";
  } else if (data.correct) {
    resultEl.innerText = "正解！ +" + (data.point || 0) + "点";
    resultEl.style.color = "limegreen";
    solvedList.push({ category: currentCategory, qid: currentQid });
    modalContent.style.backgroundColor = "#6cd463ff";
    
    // 解説がある場合はリンクを表示
    const q = quizData[currentCategory][currentQid];
    if (q && q.explanation) {
      const explanationLink = document.getElementById("explanation-link");
      const explanationAnchor = document.getElementById("explanation-link-anchor");
      explanationAnchor.href = q.explanation;
      explanationLink.style.display = "block";
    }
  } else {
    resultEl.innerText = "不正解...";
    resultEl.style.color = "red";
  }
});

// ✅ スコア表示
export async function loadScore() {
  const res = await fetch("/getScore", { credentials: "include" });
  const result = await res.json();
  document.getElementById("scoreDisplay").innerText =
    "現在の得点: " + result.score;
}



// モーダルを閉じるボタン
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.querySelector(".close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }
});


// ✅ 「最新スコア取得」ボタン
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scoreRefresh");
  if (btn) btn.addEventListener("click", loadScore);

  // Sad Server用のターミナル起動処理
  const sadStartBtn = document.getElementById("sad-start-btn");
  if (sadStartBtn) {
    sadStartBtn.addEventListener("click", startSadScenario);
  }
});

// Sad Server用のシナリオ起動
async function startSadScenario() {
  const scenarioSelect = document.getElementById("sad-scenario-select");
  const terminalDiv = document.getElementById("sad-terminal");
  const startBtn = document.getElementById("sad-start-btn");
  
  if (!scenarioSelect || !terminalDiv || !startBtn) {
    console.error("Sad Server用の要素が見つかりません");
    return;
  }

  const scenarioId = scenarioSelect.value;
  console.log(`🚀 Sad Serverシナリオ起動: ${scenarioId}`);

  // ボタンを無効化
  startBtn.disabled = true;
  startBtn.textContent = "起動中...";

  try {
    // サーバーにシナリオ起動をリクエスト
    const res = await fetch("/sad/start-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId }),
    });

    if (!res.ok) {
      throw new Error(`サーバーエラー: ${res.status}`);
    }

    const { wsPath, instanceId } = await res.json();
    console.log(`✅ シナリオ起動成功: ${instanceId}, wsPath: ${wsPath}`);

    // ターミナルをクリア
    terminalDiv.innerHTML = "";
    
    // xterm.jsでターミナル作成
    const term = new Terminal();
    term.open(terminalDiv);
    term.write(`\r\n✅ シナリオ ${scenarioId} が起動されました\r\n`);
    term.write(`WebSocket: ${wsPath}\r\n`);
    term.write(`―`.repeat(50) + `\r\n\r\n`);

    // Socket.ioで接続
    const socket = io("http://localhost:3333" + wsPath, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    // 入力出力をバインド
    term.onData((input) => socket.emit("input", input));
    socket.on("output", (data) => term.write(data));

    socket.on("connect", () => {
      console.log("🟢 WebSocket接続成功");
      term.write("\r\n🟢 接続完了\r\n\r\n");
    });

    socket.on("disconnect", () => {
      console.log("🔴 WebSocket切断");
      term.write("\r\n\r\n[🔴 セッション終了]\r\n");
      startBtn.disabled = false;
      startBtn.textContent = "シナリオを開始";
    });

    socket.on("connect_error", (err) => {
      console.error("❌ WebSocket接続エラー:", err);
      term.write(`\r\n❌ 接続エラー: ${err.message}\r\n`);
      startBtn.disabled = false;
      startBtn.textContent = "シナリオを開始";
    });

  } catch (error) {
    console.error("❌ シナリオ起動エラー:", error);
    terminalDiv.innerHTML = `<p style="color: red;">エラー: ${error.message}</p>`;
    startBtn.disabled = false;
    startBtn.textContent = "シナリオを開始";
  }
}
