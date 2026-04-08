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
  //console.log("📦 取得したデータ:", quizData);
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
// skipRecord: trueの場合、サーバーへの記録送信をスキップ（既に開いた状態で自動表示する場合など）
function showNextHint(container, skipRecord = false) {
  if (container.currentHintIndex < container.allHints.length) {
    const hintDiv = document.createElement("div");
    hintDiv.textContent = `・${container.allHints[container.currentHintIndex]}`;
    hintDiv.style.marginBottom = "10px";
    hintDiv.style.padding = "5px";
    hintDiv.style.backgroundColor = "#4a4a4a";
    hintDiv.style.borderRadius = "5px";
    container.appendChild(hintDiv);
    container.currentHintIndex++;
    
    // 最初のヒントを開いた時にサーバーに記録を送信（skipRecordがfalseの場合のみ）
    if (!skipRecord && container.currentHintIndex === 1 && currentCategory && currentQid) {
      fetch("/quiz/hintOpened", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: currentCategory,
          qid: currentQid
        }),
        credentials: "include"
      }).catch(err => {
        console.error("ヒント記録送信エラー:", err);
      });
    }
    
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
    }).catch((err) => {
      console.error(err);
      mapDiv.innerHTML = '<p style="padding: 20px; text-align: center; color: #c00;">地図を読み込めませんでした。ページを再読み込みしてください。</p>';
    });
  }
}

// Leafletライブラリを動的に読み込む
// Monaco Editor の loader.js が AMD の define を置くため、Leaflet の UMD が
// define() を呼び「Can only have one anonymous define call per script file」になる。
// 読み込み中だけ define.amd を無効化し、グローバル window.L として登録させる。
function loadLeafletLibrary() {
  return new Promise((resolve, reject) => {
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
    
    const globalDefine = window.define;
    let savedAmd = null;
    if (typeof globalDefine === 'function' && globalDefine.amd) {
      savedAmd = globalDefine.amd;
      globalDefine.amd = false;
    }

    const restoreAmd = () => {
      if (savedAmd !== null && typeof globalDefine === 'function') {
        globalDefine.amd = savedAmd;
      }
    };

    // Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => {
      restoreAmd();
      resolve();
    };
    script.onerror = () => {
      restoreAmd();
      reject(new Error('Leaflet の読み込みに失敗しました'));
    };
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
  // 既存の内容をクリア
  descElement.textContent = "";
  
  // 説明文を安全に追加（改行文字を<br>タグに変換）
  if (q.desc) {
    // 改行文字で分割して、各行を安全に追加
    const lines = q.desc.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) {
        // 2行目以降の前に<br>タグを追加
        descElement.appendChild(document.createElement("br"));
      }
      // テキストを安全に追加
      const textNode = document.createTextNode(line);
      descElement.appendChild(textNode);
    });
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
  
  // ヒントがある場合は、既にヒントを開いたかどうかを確認
  if (hintsArray.length > 0) {
    // 既にヒントを開いたかどうかをサーバーから取得
    fetch(`/quiz/hintOpened/${encodeURIComponent(category)}/${encodeURIComponent(qid)}`, {
      credentials: "include"
    })
    .then(res => res.json())
    .then(data => {
      if (data.opened) {
        // 既にヒントを開いていた場合は、すべてのヒントを自動表示（記録送信はスキップ）
        hintsContainer.currentHintIndex = 0;
        hintsArray.forEach(() => {
          showNextHint(hintsContainer, true);
        });
      } else {
        // まだヒントを開いていない場合は「最初のヒントを見る」ボタンを表示
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
    })
    .catch(err => {
      console.error("ヒント記録取得エラー:", err);
      // エラー時は通常通り「最初のヒントを見る」ボタンを表示
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
    });
  }

  // 🔽 ファイルボタン生成（XSS対策: innerHTMLの代わりに安全なDOM操作を使用）
  
  const filesDiv = document.getElementById("modal-files");
  filesDiv.textContent = ""; // 一旦クリア（textContentで安全にクリア）
  if (q.files && q.files.length > 0) {
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
      }).catch((err) => {
        console.error(err);
        if (mapDiv) {
          mapDiv.innerHTML = '<p style="padding: 20px; text-align: center; color: #c00;">地図を読み込めませんでした。ページを再読み込みしてください。</p>';
        }
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

  //console.log(`📝 openModal: ${category} - ${qid}`);
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
  if (currentSadInstanceId && typeof currentSadInstanceId === 'string' && currentSadInstanceId.trim() !== '') {
    const instanceIdToStop = currentSadInstanceId;
    console.log(`🛑 コンテナ停止: ${instanceIdToStop}`);
    
    // Socket.io接続を切断
    if (currentSadSocket) {
      currentSadSocket.disconnect();
      currentSadSocket = null;
    }
    
    // instanceIdをクリア（リクエスト完了前にクリアして重複送信を防ぐ）
    currentSadInstanceId = null;
    
    // サーバーにコンテナ停止をリクエスト
    fetch("/sad/stop-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: instanceIdToStop }),
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        console.log(`✅ コンテナ停止成功: ${instanceIdToStop}`, data);
      } else {
        // エラーレスポンスの内容を取得
        let errorMessage = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // JSONパースに失敗した場合はステータステキストを使用
          errorMessage = res.statusText || errorMessage;
        }
        console.error(`❌ コンテナ停止失敗: ${instanceIdToStop}`, errorMessage);
      }
    }).catch(err => {
      console.error("❌ コンテナ停止エラー:", err);
    });
  } else if (currentSadInstanceId) {
    // instanceIdが無効な形式の場合
    console.warn(`⚠️ 無効なinstanceId: ${currentSadInstanceId}`);
    currentSadInstanceId = null;
    if (currentSadSocket) {
      currentSadSocket.disconnect();
      currentSadSocket = null;
    }
  }
  
  //console.log("closeModal");
}

window.onclick = (e) => {
  if (e.target === document.getElementById("modal")) closeModal();
};


// ✅ 答え送信
document.getElementById("submitBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const answer = document.getElementById("answer").value;
  const q = quizData[currentCategory][currentQid];
  const answerType = q?.answerType || "flag";

  // 答えをそのまま送信（HTTP環境対応のためハッシュ化を削除）
  const answerToSend = answer.trim();

  const res = await fetch("/quiz/checkAnswer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: currentCategory,
      qid: currentQid,
      answer: answerToSend,
      answerType: answerType,
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
    
    // 実績チェック（少し遅延させてサーバー側の処理を待つ）
    setTimeout(async () => {
      try {
        const achievementsRes = await fetch("/achievements/list", { credentials: "include" });
        if (achievementsRes.ok) {
          const achievements = await achievementsRes.json();
          // 新しく解除された実績を検出
          for (const [id, achievement] of Object.entries(achievements)) {
            if (achievement.unlocked && achievement.unlockedAt) {
              const unlockDate = new Date(achievement.unlockedAt);
              const now = new Date();
              // 5秒以内に解除された実績のみ通知（重複通知を防ぐ）
              if (now - unlockDate < 5000) {
                const { showAchievementUnlocked } = await import("./achievements.js");
                showAchievementUnlocked(achievement);
              }
            }
          }
        }
      } catch (err) {
        console.error("実績チェックエラー:", err);
      }
    }, 500);
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
  
  // スコア実績チェック（バックグラウンドで実行）
  setTimeout(async () => {
    try {
      await fetch("/achievements/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "score",
          eventData: { score: result.score || 0 }
        }),
        credentials: "include"
      });
    } catch (err) {
      console.error("スコア実績チェックエラー:", err);
    }
  }, 100);
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
    "sad server": "Sad Server"
  };
  
  // 全問題数をcategoryId別に集計
  for (const [topCategory, questions] of Object.entries(quizData)) {
    for (const [qid, question] of Object.entries(questions)) {
      let displayName;
      
      // categoryIdを使用（question.categoryIdがない場合はtopCategoryをcategoryIdとして使用）
      const categoryId = question.categoryId || topCategory;
      // categoryNameMapに存在する場合のみ集計対象にする
      if (!categoryNameMap[categoryId]) {
        continue; // 存在しないカテゴリーIDはスキップ
      }
      displayName = categoryNameMap[categoryId];
      
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
    if (!question) continue;
    
    // categoryIdを使用（question.categoryIdがない場合はsolved.categoryをcategoryIdとして使用）
    const categoryId = question.categoryId || solved.category;
    // categoryNameMapに存在する場合のみ集計対象にする
    if (!categoryNameMap[categoryId]) {
      continue; // 存在しないカテゴリーIDはスキップ
    }
    const displayName = categoryNameMap[categoryId];
    
    if (categoryCounts.hasOwnProperty(displayName)) {
      categoryCounts[displayName]++;
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
  
  // データが空の場合は何も表示しない
  if (labels.length === 0 || data.length === 0) {
    return;
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

