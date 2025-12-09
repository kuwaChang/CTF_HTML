export let quizData = {};
let solvedList = [];
let currentCategory = null;
let currentQid = null;
let currentPoint = 0;

// Sad Server用のグローバル変数
let currentSadInstanceId = null;
let currentSadSocket = null;

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
      
      // XSS対策: innerHTMLの代わりに安全なDOM操作を使用
      const titleDiv = document.createElement("div");
      titleDiv.textContent = q.title;
      div.appendChild(titleDiv);
      
      const pointsDiv = document.createElement("div");
      pointsDiv.className = "points";
      pointsDiv.textContent = `${q.point}点`;
      div.appendChild(pointsDiv);

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
  
  // descとurlの表示（XSS対策: innerHTMLの代わりに安全なDOM操作を使用）
  const descElement = document.getElementById("modal-desc");
<<<<<<< HEAD
  // 既存の内容をクリア
  descElement.textContent = "";
  
  // 説明文を安全に追加
  if (q.desc) {
    descElement.textContent = q.desc;
=======
  // 改行文字を<br>タグに変換
  const descWithBreaks = (q.desc || "").replace(/\n/g, "<br>");
  if (q.url) {
    // urlがある場合、descの後にリンクを追加
    descElement.innerHTML = `${descWithBreaks}<br><a href="${q.url}" target="_blank" style="color: #0078ff; text-decoration: underline; font-weight: 600;">${q.url}</a>`;
  } else {
    // urlがない場合、改行を反映して表示
    descElement.innerHTML = descWithBreaks;
>>>>>>> d1d3d8acaa5a2a9f0ef1036f6d9506725aa5a1f7
  }
  
  // URLがある場合、安全にリンクを追加
  if (q.url) {
    const br = document.createElement("br");
    descElement.appendChild(br);
    
    const link = document.createElement("a");
    // URLの検証（javascript:やdata:などの危険なスキームを防ぐ）
    try {
      const urlObj = new URL(q.url, window.location.href);
      // javascript:やdata:などの危険なスキームをブロック
      if (urlObj.protocol === 'javascript:' || urlObj.protocol === 'data:' || urlObj.protocol === 'vbscript:') {
        console.warn("危険なURLスキームが検出されました:", q.url);
        // リンクとして機能させず、テキストのみ表示
        link.textContent = q.url;
      } else {
        // 安全なURLの場合のみリンクとして設定
        link.href = urlObj.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer"; // セキュリティ向上
        link.textContent = q.url; // リンクテキストも安全に設定
      }
    } catch (e) {
      // 無効なURLの場合はリンクとして機能させない
      console.warn("無効なURL:", q.url);
      link.textContent = q.url;
    }
    
    link.style.color = "#0078ff";
    link.style.textDecoration = "underline";
    link.style.fontWeight = "600";
    
    descElement.appendChild(link);
  }
  
  document.getElementById("modal-point").textContent = q.point;
  
  // ヒントの初期化
  const hintsContainer = document.getElementById("modal-hints");
  hintsContainer.innerHTML = "";
  hintsContainer.currentHintIndex = 0;
  const hintsArray = Array.isArray(q.hint) ? q.hint : [q.hint];
  hintsContainer.allHints = hintsArray;
  
  // ヒントがある場合は「最初のヒントを見る」ボタンを表示
  if (hintsArray.length > 0) {
    const firstHintBtn = document.createElement("button");
    firstHintBtn.textContent = "最初のヒントを見る";
    firstHintBtn.className = "next-hint-btn";
    firstHintBtn.style.marginTop = "10px";
    firstHintBtn.style.padding = "8px 16px";
    firstHintBtn.style.backgroundColor = "#0078ff";
    firstHintBtn.style.border = "none";
    firstHintBtn.style.borderRadius = "5px";
    firstHintBtn.style.color = "white";
    firstHintBtn.style.cursor = "pointer";
    firstHintBtn.onclick = () => showNextHint(hintsContainer);
    hintsContainer.appendChild(firstHintBtn);
  }

  // 🔽 ファイルボタン生成（XSS対策: innerHTMLの代わりに安全なDOM操作を使用）
  
  const filesDiv = document.getElementById("modal-files");
  filesDiv.textContent = ""; // 一旦クリア（textContentで安全にクリア）
  if (q.files && q.files.length > 0) {
<<<<<<< HEAD
    const downloadSection = document.createElement("div");
    downloadSection.className = "download-section";
    
    // 各ファイルリンクを安全に作成
    q.files.forEach((f, index) => {
      if (index > 0) {
        // 2つ目以降のファイルの前に改行を追加
        downloadSection.appendChild(document.createElement("br"));
      }
      
      const link = document.createElement("a");
      // パストラバーサル対策: ファイル名とカテゴリ名をサニタイズ
      const sanitizedCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
      const sanitizedFile = f.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.\./g, '');
      
      // セキュリティ: サーバー側のエンドポイント経由でファイルをダウンロード
      // サーバー側でパストラバーサル対策が実装されている
      link.href = `/files/${sanitizedCategory}/${sanitizedFile}`;
      link.download = sanitizedFile; // ダウンロード時のファイル名もサニタイズ済み
      link.className = "download-btn";
      link.textContent = `📄 ${f}`; // 表示用のファイル名（元のファイル名を表示）
      
      downloadSection.appendChild(link);
    });
    
    filesDiv.appendChild(downloadSection);
=======
    // ファイルダウンロード用エンドポイントを使用
    const fileLinks = q.files.map(f => 
      `<a href="/quiz/file/${encodeURIComponent(category)}/${encodeURIComponent(f)}" download class="download-btn">📄 ${f}</a>`
    ).join("<br>");
    document.getElementById("modal-files").innerHTML += `<div class="download-section">${fileLinks}</div>`;
>>>>>>> d1d3d8acaa5a2a9f0ef1036f6d9506725aa5a1f7
  } else {
    filesDiv.textContent = ""; // ファイルがない場合は非表示
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

  // Reversing用のコンテナの表示/非表示
  const reversingContainer = document.getElementById("reversing-container");
  if (category === "Reversing") {
    reversingContainer.style.display = "block";
    // reversing環境の状態をリセット
    resetReversingUI();
  } else {
    reversingContainer.style.display = "none";
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
  
  const modal = document.getElementById("modal");
  const modalContent = document.querySelector("#modal .modal-content");
  
  if (modalContent) {
    modalContent.classList.remove("visible");
  }
  
  // フェードアウトアニメーションを開始
  modal.classList.add("fade-out");
  
  // アニメーション完了後にモーダルを非表示にする
  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("fade-out");
    if (modalContent) {
      modalContent.style.top = "";
    }
  }, 400); // アニメーション時間（0.4s）に合わせる
  
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
  
  // コンテナが起動している場合は停止
  if (currentSadInstanceId) {
    console.log(`🛑 コンテナ停止: ${currentSadInstanceId}`);
    
    // Socket.io接続を切断
    if (currentSadSocket) {
      currentSadSocket.disconnect();
      currentSadSocket = null;
    }
    
    // サーバーにコンテナ停止をリクエスト
    fetch("/sad/stop-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: currentSadInstanceId }),
    }).then(res => {
      if (res.ok) {
        console.log(`✅ コンテナ停止成功: ${currentSadInstanceId}`);
      } else {
        console.error(`❌ コンテナ停止失敗: ${currentSadInstanceId}`);
      }
    }).catch(err => {
      console.error("❌ コンテナ停止エラー:", err);
    });
    
    currentSadInstanceId = null;
  }
  
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
    resultEl.innerText = "";
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

// ✅ ミリ秒を読みやすい形式に変換
function formatStudyTime(ms) {
  if (!ms || ms <= 0) return "0分";
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;
  
  let timeStr = "";
  if (hours > 0) {
    timeStr += hours + "時間";
  }
  if (remainingMinutes > 0) {
    timeStr += remainingMinutes + "分";
  }
  if (hours === 0 && remainingSeconds > 0) {
    timeStr += remainingSeconds + "秒";
  }
  
  return timeStr || "0分";
}

// ✅ スコア表示
export async function loadScore() {
  const res = await fetch("/getScore", { credentials: "include" });
  const result = await res.json();
  document.getElementById("scoreDisplay").innerText =
    "現在の得点: " + (result.score || 0);
  
  // 学習時間を表示
  const studyTimeMs = result.studyTime || 0;
  const studyTimeDisplay = document.getElementById("studyTimeDisplay");
  if (studyTimeDisplay) {
    studyTimeDisplay.innerText = "学習時間: " + formatStudyTime(studyTimeMs);
  }

  // カテゴリー別解答状況を取得して円グラフを表示
  await loadCategoryChart();
}

// カテゴリー別解答状況の円グラフを表示
async function loadCategoryChart() {
  // 解いた問題リストを取得
  const solvedRes = await fetch("/quiz/solvedList", { credentials: "include" });
  if (!solvedRes.ok) return;
  
  const solvedList = await solvedRes.json();
  
  // 問題データを取得
  const quizRes = await fetch("/api/quizData");
  if (!quizRes.ok) return;
  
  const quizData = await quizRes.json();
  
  // categoryId別に解いた問題数を集計
  const categoryCounts = {};
  const categoryTotals = {};
  
  // カテゴリー名のマッピング（表示用）
  const categoryNameMap = {
    'crypto': 'Crypto',
    'osint': 'OSINT',
    'forensics': 'Forensics',
    'web': 'WEB',
    'reversing': 'Reversing'
  };
  
  // 全問題数をcategoryId別に集計
  for (const [topCategory, questions] of Object.entries(quizData)) {
    for (const [qid, question] of Object.entries(questions)) {
      // categoryIdが存在しない場合はスキップ
      if (!question.categoryId) continue;
      
      const categoryId = question.categoryId;
      const displayName = categoryNameMap[categoryId] || categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
      
      if (!categoryTotals[displayName]) {
        categoryTotals[displayName] = 0;
        categoryCounts[displayName] = 0;
      }
      categoryTotals[displayName]++;
    }
  }
  
  // 解いた問題数をcategoryId別に集計
  for (const solved of solvedList) {
    const question = quizData[solved.category]?.[solved.qid];
    if (question && question.categoryId) {
      // categoryIdが存在する場合のみ集計
      const categoryId = question.categoryId;
      const displayName = categoryNameMap[categoryId] || categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
      
      if (categoryCounts.hasOwnProperty(displayName)) {
        categoryCounts[displayName]++;
      }
    }
  }
  
  // 円グラフ用のデータを準備（解いた問題数が0より大きいカテゴリーのみ）
  const labels = [];
  const data = [];
  const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', 
    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
  ];
  
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > 0) {
      labels.push(`${category} (${count}/${categoryTotals[category]})`);
      data.push(count);
    }
  }
  
  // 円グラフを描画
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;
  
  // 既存のチャートがあれば破棄
  if (window.categoryChartInstance) {
    window.categoryChartInstance.destroy();
  }
  
  window.categoryChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return `${label}: ${value}問`;
            }
          }
        }
      }
    }
  });
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

    // instanceIdを保存
    currentSadInstanceId = instanceId;

    // ターミナルをクリア
    terminalDiv.innerHTML = "";
    
    // xterm.jsでターミナル作成（スクロール設定を有効化）
    const term = new Terminal({
      scrollback: 10000, // スクロールバック行数（10000行まで）
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff'
      }
    });
    term.open(terminalDiv);
    term.write(`\r\n✅ シナリオ ${scenarioId} が起動されました\r\n`);
    term.write(`WebSocket: ${wsPath}\r\n`);
    term.write(`―`.repeat(50) + `\r\n\r\n`);

    // Socket.ioで接続（現在のホスト名を使用）
    const currentHost = window.location.hostname;
    const socketUrl = `http://${currentHost}:3333${wsPath}`;
    const socket = io(socketUrl, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    // socketを保存
    currentSadSocket = socket;

    // 入力出力をバインド
    term.onData((input) => socket.emit("input", input));
    socket.on("output", (data) => {
      term.write(data);
      // 出力後に自動スクロール（次のフレームで実行）
      setTimeout(() => {
        term.scrollToBottom();
      }, 0);
    });

    socket.on("connect", () => {
      console.log("🟢 WebSocket接続成功");
      term.write("\r\n🟢 接続完了\r\n\r\n");
    });

    socket.on("disconnect", () => {
      console.log("🔴 WebSocket切断");
      term.write("\r\n\r\n[🔴 セッション終了]\r\n");
      startBtn.disabled = false;
      startBtn.textContent = "シナリオを開始";
      // 切断時にクリーンアップ
      currentSadInstanceId = null;
      currentSadSocket = null;
    });

    socket.on("connect_error", (err) => {
      console.error("❌ WebSocket接続エラー:", err);
      term.write(`\r\n❌ 接続エラー: ${err.message}\r\n`);
      startBtn.disabled = false;
      startBtn.textContent = "シナリオを開始";
    });

  } catch (error) {
    console.error("❌ シナリオ起動エラー:", error);
    // XSS対策: innerHTMLの代わりに安全なDOM操作を使用
    terminalDiv.textContent = "";
    const errorP = document.createElement("p");
    errorP.style.color = "red";
    errorP.textContent = `エラー: ${error.message}`;
    terminalDiv.appendChild(errorP);
    startBtn.disabled = false;
    startBtn.textContent = "シナリオを開始";
    // エラー時もクリーンアップ
    currentSadInstanceId = null;
    currentSadSocket = null;
  }
}

// Reversing用のグローバル変数
let currentReversingInstanceId = null;
let currentReversingSocket = null;
let currentReversingTerm = null;
let currentReversingWebUIPort = null;

// Reversing UIをリセット
function resetReversingUI() {
  const startBtn = document.getElementById("reversing-start-btn");
  const rizinBtn = document.getElementById("reversing-rizin-btn");
  const stopBtn = document.getElementById("reversing-stop-btn");
  const infoDiv = document.getElementById("reversing-info");
  const statusP = document.getElementById("reversing-status");
  const webUIUrlP = document.getElementById("reversing-webui-url");
  const terminalDiv = document.getElementById("reversing-terminal");

  if (startBtn) {
    startBtn.style.display = "inline-block";
    startBtn.disabled = false;
  }
  if (rizinBtn) rizinBtn.style.display = "none";
  if (stopBtn) stopBtn.style.display = "none";
  if (infoDiv) infoDiv.style.display = "none";
  if (statusP) statusP.textContent = "";
  if (webUIUrlP) {
    webUIUrlP.style.display = "none";
    webUIUrlP.innerHTML = "";
  }
  if (terminalDiv) {
    terminalDiv.style.display = "none";
    terminalDiv.innerHTML = "";
  }

  // 既存の接続をクリーンアップ
  if (currentReversingSocket) {
    currentReversingSocket.disconnect();
    currentReversingSocket = null;
  }
  currentReversingInstanceId = null;
  currentReversingTerm = null;
  currentReversingWebUIPort = null;
}

// Reversing環境を起動
async function startReversingEnvironment() {
  const startBtn = document.getElementById("reversing-start-btn");
  const infoDiv = document.getElementById("reversing-info");
  const statusP = document.getElementById("reversing-status");
  const terminalDiv = document.getElementById("reversing-terminal");

  if (!startBtn || !infoDiv || !statusP || !terminalDiv) {
    console.error("Reversing用の要素が見つかりません");
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = "起動中...";
  infoDiv.style.display = "block";
  statusP.textContent = "環境を起動しています...";
  terminalDiv.style.display = "block";

  try {
    // reversingシナリオを起動
    const res = await fetch("/sad/start-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "reversing" }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "不明なエラー" }));
      console.error("サーバーエラー詳細:", errorData);
      throw new Error(`サーバーエラー: ${res.status} - ${errorData.error || errorData.detail || "不明なエラー"}`);
    }

    const data = await res.json();
    const { wsPath, instanceId, webUIPort, setupInProgress, message } = data;
    console.log(`✅ Reversing環境起動成功: ${instanceId}`);

    currentReversingInstanceId = instanceId;
    currentReversingWebUIPort = webUIPort;

    // ターミナルを初期化
    terminalDiv.innerHTML = "";
    const term = new Terminal({
      scrollback: 10000,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff'
      }
    });
    term.open(terminalDiv);
    currentReversingTerm = term;

    term.write(`\r\n✅ Reversing環境が起動されました\r\n`);
    term.write(`Instance ID: ${instanceId}\r\n`);
    if (webUIPort) {
      const currentHost = window.location.hostname;
      const webUIUrl = `http://${currentHost}:${webUIPort}`;
      term.write(`Web UI Port: ${webUIPort}\r\n`);
      term.write(`Web UI URL: ${webUIUrl}\r\n`);
    }
    if (setupInProgress) {
      term.write(`\r\n⚠️ ${message}\r\n`);
      term.write(`セットアップの進捗を確認するには: tail -f /tmp/setup.log\r\n`);
      statusP.textContent = message;
    }
    term.write(`―`.repeat(50) + `\r\n\r\n`);

    // Socket.ioで接続（現在のホスト名を使用）
    const currentHost = window.location.hostname;
    const socketUrl = `http://${currentHost}:3333${wsPath}`;
    const socket = io(socketUrl, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    currentReversingSocket = socket;

    // 入出力をバインド
    term.onData((input) => socket.emit("input", input));
    socket.on("output", (data) => {
      term.write(data);
      setTimeout(() => term.scrollToBottom(), 0);
    });

    socket.on("connect", () => {
      console.log("🟢 Reversing環境接続成功");
      term.write("\r\n🟢 接続完了\r\n\r\n");
      statusP.textContent = `✅ 環境が起動しました (Instance: ${instanceId})`;
      
      // ボタンの状態を更新
      startBtn.style.display = "none";
      document.getElementById("reversing-rizin-btn").style.display = "inline-block";
      document.getElementById("reversing-stop-btn").style.display = "inline-block";
    });

    socket.on("disconnect", () => {
      console.log("🔴 Reversing環境切断");
      term.write("\r\n\r\n[🔴 セッション終了]\r\n");
      resetReversingUI();
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Reversing環境接続エラー:", err);
      term.write(`\r\n❌ 接続エラー: ${err.message}\r\n`);
      statusP.textContent = `❌ 接続エラー: ${err.message}`;
      resetReversingUI();
    });

  } catch (error) {
    console.error("❌ Reversing環境起動エラー:", error);
    statusP.textContent = `❌ エラー: ${error.message}`;
    // XSS対策: innerHTMLの代わりに安全なDOM操作を使用
    terminalDiv.textContent = "";
    const errorP = document.createElement("p");
    errorP.style.color = "red";
    errorP.textContent = `エラー: ${error.message}`;
    terminalDiv.appendChild(errorP);
    resetReversingUI();
  }
}

// Rizin Web UIを起動
async function startRizinWebUI() {
  if (!currentReversingInstanceId) {
    alert("先に環境を起動してください");
    return;
  }

  const rizinBtn = document.getElementById("reversing-rizin-btn");
  const statusP = document.getElementById("reversing-status");
  const webUIUrlP = document.getElementById("reversing-webui-url");

  rizinBtn.disabled = true;
  rizinBtn.textContent = "起動中...";
  statusP.textContent = "Rizin Web UIを起動しています...";

  try {
    const res = await fetch("/sad/start-rizin-webui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        instanceId: currentReversingInstanceId,
        filePath: "/challenge/sample_binary"
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "不明なエラー" }));
      console.error("サーバーエラー詳細:", errorData);
      throw new Error(`サーバーエラー: ${res.status} - ${errorData.error || errorData.detail || "不明なエラー"}`);
    }

    const data = await res.json();
    console.log("Rizin Web UI起動結果:", data);

    // 現在のホスト名を使用してURLを生成
    const currentHost = window.location.hostname;
    let webUIUrl = data.webUIUrl;
    
    // サーバーから返されたURLがlocalhostの場合は、現在のホスト名に置き換え
    if (webUIUrl && webUIUrl.includes('localhost')) {
      const port = data.webUIPort || currentReversingWebUIPort;
      if (port) {
        webUIUrl = `http://${currentHost}:${port}`;
      }
    } else if (!webUIUrl && currentReversingWebUIPort) {
      // webUIPortが既に取得されている場合は、それを使用
      webUIUrl = `http://${currentHost}:${currentReversingWebUIPort}`;
    }

    if (data.isRunning && webUIUrl) {
      statusP.textContent = `✅ Rizin Web UIが起動しました`;
      webUIUrlP.style.display = "block";
      // XSS対策: innerHTMLの代わりに安全なDOM操作を使用
      webUIUrlP.textContent = "";
      const link = document.createElement("a");
      try {
        const urlObj = new URL(webUIUrl, window.location.href);
        if (urlObj.protocol === 'javascript:' || urlObj.protocol === 'data:' || urlObj.protocol === 'vbscript:') {
          link.textContent = `${webUIUrl} を開く`;
        } else {
          link.href = urlObj.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = `${webUIUrl} を開く`;
        }
      } catch (e) {
        link.textContent = `${webUIUrl} を開く`;
      }
      link.style.color = "#0078ff";
      link.style.textDecoration = "underline";
      link.style.fontWeight = "bold";
      webUIUrlP.appendChild(link);
    } else if (webUIUrl) {
      statusP.textContent = `⚠️ Rizin Web UIの起動を試みましたが、確認できませんでした`;
      webUIUrlP.style.display = "block";
      // XSS対策: innerHTMLの代わりに安全なDOM操作を使用
      webUIUrlP.textContent = "";
      
      const containerDiv = document.createElement("div");
      containerDiv.style.marginBottom = "10px";
      
      const link = document.createElement("a");
      try {
        const urlObj = new URL(webUIUrl, window.location.href);
        if (urlObj.protocol === 'javascript:' || urlObj.protocol === 'data:' || urlObj.protocol === 'vbscript:') {
          link.textContent = `${webUIUrl} を開く`;
        } else {
          link.href = urlObj.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = `${webUIUrl} を開く`;
        }
      } catch (e) {
        link.textContent = `${webUIUrl} を開く`;
      }
      link.style.color = "#0078ff";
      link.style.textDecoration = "underline";
      link.style.fontWeight = "bold";
      containerDiv.appendChild(link);
      webUIUrlP.appendChild(containerDiv);
      
      if (data.suggestion) {
        const suggestionDiv = document.createElement("div");
        suggestionDiv.style.color = "#ffa500";
        suggestionDiv.style.marginTop = "10px";
        suggestionDiv.textContent = `💡 ${data.suggestion}`;
        webUIUrlP.appendChild(suggestionDiv);
      }
      
      if (data.log) {
        const details = document.createElement("details");
        details.style.marginTop = "10px";
        
        const summary = document.createElement("summary");
        summary.style.cursor = "pointer";
        summary.style.color = "#0078ff";
        summary.textContent = "ログを表示";
        details.appendChild(summary);
        
        const pre = document.createElement("pre");
        pre.style.background = "#2d3035";
        pre.style.padding = "10px";
        pre.style.borderRadius = "5px";
        pre.style.overflowX = "auto";
        pre.style.fontSize = "12px";
        pre.style.color = "#fff";
        pre.textContent = data.log;
        details.appendChild(pre);
        
        webUIUrlP.appendChild(details);
      }
    } else {
      statusP.textContent = data.info || "Rizin Web UIを起動しました";
      if (data.suggestion) {
        webUIUrlP.style.display = "block";
        // XSS対策: innerHTMLの代わりに安全なDOM操作を使用
        webUIUrlP.textContent = "";
        const suggestionDiv = document.createElement("div");
        suggestionDiv.style.color = "#ffa500";
        suggestionDiv.textContent = `💡 ${data.suggestion}`;
        webUIUrlP.appendChild(suggestionDiv);
      }
    }

    rizinBtn.disabled = false;
    rizinBtn.textContent = "Rizin Web UIを起動";

  } catch (error) {
    console.error("❌ Rizin Web UI起動エラー:", error);
    statusP.textContent = `❌ エラー: ${error.message}`;
    rizinBtn.disabled = false;
    rizinBtn.textContent = "Rizin Web UIを起動";
  }
}

// Reversing環境を停止
async function stopReversingEnvironment() {
  if (!currentReversingInstanceId) {
    return;
  }

  if (currentReversingSocket) {
    currentReversingSocket.disconnect();
    currentReversingSocket = null;
  }

  try {
    const res = await fetch("/sad/stop-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: currentReversingInstanceId }),
    });

    if (res.ok) {
      console.log("✅ Reversing環境停止成功");
    }
  } catch (error) {
    console.error("❌ Reversing環境停止エラー:", error);
  }

  resetReversingUI();
}

// Reversing用のイベントリスナーを設定
document.addEventListener("DOMContentLoaded", () => {
  const reversingStartBtn = document.getElementById("reversing-start-btn");
  const reversingRizinBtn = document.getElementById("reversing-rizin-btn");
  const reversingStopBtn = document.getElementById("reversing-stop-btn");

  if (reversingStartBtn) {
    reversingStartBtn.addEventListener("click", startReversingEnvironment);
  }
  if (reversingRizinBtn) {
    reversingRizinBtn.addEventListener("click", startRizinWebUI);
  }
  if (reversingStopBtn) {
    reversingStopBtn.addEventListener("click", stopReversingEnvironment);
  }
});
