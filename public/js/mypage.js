// マイページのデータを読み込む
async function loadMyPageData() {
  const loadingMessage = document.getElementById("loadingMessage");
  const errorMessage = document.getElementById("errorMessage");
  const userInfo = document.getElementById("userInfo");

  try {
    // セッションチェック
    const sessionRes = await fetch("/session-check", { credentials: "include" });
    const sessionData = await sessionRes.json();

    if (!sessionData.loggedIn) {
      loadingMessage.style.display = "none";
      errorMessage.style.display = "block";
      errorMessage.textContent = "ログインが必要です。";
      return;
    }

    // スコアと学習時間を取得
    const scoreRes = await fetch("/getScore", { credentials: "include" });
    const scoreData = await scoreRes.json();

    if (!scoreData.success) {
      loadingMessage.style.display = "none";
      errorMessage.style.display = "block";
      errorMessage.textContent = "データの取得に失敗しました。";
      return;
    }

    // ユーザー情報を表示
    document.getElementById("userid").textContent = sessionData.username || "-";
    document.getElementById("score").textContent = (scoreData.score || 0) + " 点";

    // 学習時間をフォーマット（ミリ秒を時間:分:秒に変換）
    const studyTimeMs = scoreData.studyTime || 0;
    const hours = Math.floor(studyTimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((studyTimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((studyTimeMs % (1000 * 60)) / 1000);
    
    let studyTimeText = "";
    if (hours > 0) {
      studyTimeText = `${hours}時間 ${minutes}分 ${seconds}秒`;
    } else if (minutes > 0) {
      studyTimeText = `${minutes}分 ${seconds}秒`;
    } else {
      studyTimeText = `${seconds}秒`;
    }
    document.getElementById("studyTime").textContent = studyTimeText || "0秒";

    // アイコンを表示
    const userIcon = document.getElementById("userIcon");
    if (sessionData.iconPath) {
      userIcon.src = sessionData.iconPath;
      userIcon.onerror = () => {
        // アイコン読み込み失敗時はデフォルトアイコンを表示
        userIcon.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Ccircle cx='60' cy='60' r='60' fill='%23667eea'/%3E%3Ctext x='60' y='75' font-size='60' text-anchor='middle' fill='white'%3E👤%3C/text%3E%3C/svg%3E";
      };
    } else {
      // デフォルトアイコンを表示
      userIcon.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Ccircle cx='60' cy='60' r='60' fill='%23667eea'/%3E%3Ctext x='60' y='75' font-size='60' text-anchor='middle' fill='white'%3E👤%3C/text%3E%3C/svg%3E";
    }

    // 表示を切り替え
    loadingMessage.style.display = "none";
    userInfo.style.display = "block";

  } catch (error) {
    console.error("マイページデータ読み込みエラー:", error);
    loadingMessage.style.display = "none";
    errorMessage.style.display = "block";
    errorMessage.textContent = "エラーが発生しました: " + error.message;
  }
}

// アイコンアップロード処理
async function uploadIcon(file) {
  const formData = new FormData();
  formData.append('icon', file);

  const statusElement = document.getElementById("iconUploadStatus");
  statusElement.textContent = "アップロード中...";
  statusElement.style.color = "#667eea";

  try {
    const res = await fetch("/api/upload-icon", {
      method: "POST",
      body: formData,
      credentials: "include"
    });

    const result = await res.json();

    if (result.success) {
      // アイコンを更新
      const userIcon = document.getElementById("userIcon");
      userIcon.src = result.iconPath + "?t=" + Date.now(); // キャッシュ回避
      statusElement.textContent = "アイコンを更新しました！";
      statusElement.style.color = "#28a745";
      setTimeout(() => {
        statusElement.textContent = "";
      }, 3000);
    } else {
      statusElement.textContent = result.message || "アップロードに失敗しました";
      statusElement.style.color = "#dc3545";
    }
  } catch (error) {
    console.error("アイコンアップロードエラー:", error);
    statusElement.textContent = "エラーが発生しました: " + error.message;
    statusElement.style.color = "#dc3545";
  }
}

// ページ読み込み時にデータをロード
window.addEventListener("DOMContentLoaded", () => {
  loadMyPageData();

  // アイコンアップロードのイベントリスナーを設定
  const iconInput = document.getElementById("iconInput");
  if (iconInput) {
    iconInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        // ファイルサイズチェック（5MB以下）
        if (file.size > 5 * 1024 * 1024) {
          alert("ファイルサイズが大きすぎます。5MB以下の画像を選択してください。");
          return;
        }
        // 画像ファイルかチェック
        if (!file.type.startsWith('image/')) {
          alert("画像ファイルを選択してください。");
          return;
        }
        uploadIcon(file);
      }
    });
  }
});

