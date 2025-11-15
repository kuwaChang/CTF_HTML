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
    return Promise.resolve();
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
        div.classList.add("solved");  // 既に解いた
      } else {
        div.classList.add("unsolved");   // 未解答
      }

      div.onclick = (evt) => openModal(category, qid, evt);
      grid.appendChild(div);
    }
    container.appendChild(grid);
  }
  
  // Promiseを返す（DOMの再構築が完了したことを示す）
  return Promise.resolve();
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

// 地図関連の変数
let map = null;
let marker = null;

// 地図を初期化
function initMapForCoordinates() {
  const mapContainer = document.getElementById("map-container");
  const mapDiv = document.getElementById("map");
  
  // Leafletを使用（Google Maps APIキー不要）
  if (typeof L !== 'undefined') {
    // 日本中心の地図を表示
    map = L.map(mapDiv).setView([35.6812, 139.7671], 10);
    
    // OpenStreetMapタイルを追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    // マーカーを追加
    marker = L.marker([35.6812, 139.7671], { draggable: true }).addTo(map);
    
    // マーカーの位置が変更された時の処理
    marker.on('dragend', function(e) {
      const position = marker.getLatLng();
      updateCoordinatesInput(position.lat, position.lng);
    });
    
    // 地図をクリックした時の処理
    map.on('click', function(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      marker.setLatLng([lat, lng]);
      updateCoordinatesInput(lat, lng);
    });
  } else {
    // Leafletが読み込まれていない場合のフォールバック
    mapDiv.innerHTML = '<p style="padding: 20px; text-align: center;">地図ライブラリを読み込んでいます...</p>';
    loadLeafletLibrary().then(() => {
      initMapForCoordinates();
    });
  }
}

// Leafletライブラリを動的に読み込む
function loadLeafletLibrary() {
  return new Promise((resolve) => {
    if (typeof L !== 'undefined') {
      resolve();
      return;
    }
    
    // Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    
    // Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// 座標入力欄を更新
function updateCoordinatesInput(lat, lng) {
  const answerInput = document.getElementById("answer");
  const selectedCoords = document.getElementById("selected-coords");
  const coordsStr = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  answerInput.value = coordsStr;
  selectedCoords.textContent = `選択した座標: ${coordsStr}`;
}

// 入力欄から座標を読み取ってマーカーを更新
function updateMarkerFromInput() {
  if (!map || !marker) return;
  
  const answerInput = document.getElementById("answer");
  const value = answerInput.value.trim();
  
  // 座標形式（緯度,経度）をパース
  const coordsMatch = value.match(/^([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)$/);
  if (coordsMatch) {
    const lat = parseFloat(coordsMatch[1]);
    const lng = parseFloat(coordsMatch[2]);
    
    // 有効な緯度経度の範囲内かチェック
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], Math.max(10, map.getZoom()));
      
      const selectedCoords = document.getElementById("selected-coords");
      selectedCoords.textContent = `選択した座標: ${lat.toFixed(6)},${lng.toFixed(6)}`;
    }
  }
}

// ✅ モーダル表示
function openModal(category, qid, evt = null) {
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

  // 座標入力用の地図の表示/非表示
  const mapContainer = document.getElementById("map-container");
  const answerInput = document.getElementById("answer");
  const selectedCoords = document.getElementById("selected-coords");
  
  if (q.answerType === "coordinates") {
    // 座標形式の問題の場合、地図を表示
    mapContainer.style.display = "block";
    answerInput.placeholder = "例: 35.6812,139.7671";
    answerInput.value = ""; // 入力欄をクリア
    selectedCoords.textContent = "";
    
    // 少し遅延させてから地図を初期化（DOM要素が確実に存在するように）
    setTimeout(() => {
      const mapDiv = document.getElementById("map");
      if (!mapDiv) return;
      
      // 既存の地図がある場合は削除
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.log("地図の削除エラー（無視）:", e);
        }
        map = null;
        marker = null;
      }
      
      // 地図コンテナをクリア
      mapDiv.innerHTML = "";
      
      // 新しい地図を初期化
      loadLeafletLibrary().then(() => {
        initMapForCoordinates();
        
        // 入力欄の変更時にマーカーを更新
        answerInput.addEventListener('input', updateMarkerFromInput);
        answerInput.addEventListener('blur', updateMarkerFromInput);
      });
    }, 100);
  } else {
    // 通常のFLAG形式の問題の場合、地図を非表示
    mapContainer.style.display = "none";
    answerInput.placeholder = "FLAG{...}";
    selectedCoords.textContent = "";
    
    // 地図を破棄（メモリリーク防止）
    if (map) {
      map.remove();
      map = null;
      marker = null;
    }
  }

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
  modalContent.classList.remove("visible");
  modal.style.display = "block";

  const positionModal = () => {
    const activeTab = document.querySelector(".tab-content.active");
    let desiredTop = 20;

    if (activeTab) {
      const modalHeight = modalContent.offsetHeight;

      if (evt) {
        const tabRect = activeTab.getBoundingClientRect();
        const clickYWithinTab = evt.clientY - tabRect.top;
        desiredTop = clickYWithinTab - modalHeight / 2;
      } else {
        desiredTop = (activeTab.clientHeight - modalHeight) / 2;
      }

      const minTop = 20;
      const maxTop = Math.max(minTop, activeTab.clientHeight - modalHeight - 20);
      desiredTop = Math.min(Math.max(desiredTop, minTop), maxTop);
    }

    modalContent.style.top = desiredTop + "px";

    requestAnimationFrame(() => {
      modalContent.classList.add("visible");
    });
  };

  requestAnimationFrame(positionModal);

  console.log(`📝 openModal: ${category} - ${qid}`);
}

export function closeModal() {
  // スクロール位置を保存
  const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
  
  // モーダルを閉じる前にフォーカスを維持（スクロールを防ぐため）
  const activeElement = document.activeElement;
  
  document.getElementById("modal").style.display = "none";
  const modalContent = document.querySelector("#modal .modal-content");
  if (modalContent) {
    modalContent.style.top = "";
    modalContent.classList.remove("visible");
  }
  
  // 地図を破棄（メモリリーク防止）
  const mapContainer = document.getElementById("map-container");
  if (map && mapContainer) {
    mapContainer.style.display = "none";
    // 地図は再利用するため、完全には破棄しない
    // map.remove();
    // map = null;
    // marker = null;
  }
  
  // モーダルを閉じた後、スクロール位置を維持するため非同期で処理
  loadQuizData().then(() => {
    // DOMが再構築された後、保存したスクロール位置に戻す
    // requestAnimationFrameを2回使って、レンダリングの完了を待つ
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // スクロール位置を復元
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant' // アニメーションなしで即座にスクロール
        });
        
        // 念のため、少し遅延して再度スクロール位置を設定（DOMの再レンダリングに対応）
        setTimeout(() => {
          window.scrollTo({
            top: scrollPosition,
            behavior: 'instant'
          });
        }, 10);
      });
    });
  });
  
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
