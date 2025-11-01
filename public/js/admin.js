// グローバル関数として定義（HTMLから呼び出せるように）
window.addHintField = function() {
  const container = document.getElementById("hintsContainer");
  const div = document.createElement("div");
  div.className = "hint-item";
  div.innerHTML = `
    <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
    <button type="button" class="remove-hint-btn" onclick="removeHintField(this)">-</button>
  `;
  container.appendChild(div);
};

// ヒントフィールドを削除
window.removeHintField = function(btn) {
  const container = document.getElementById("hintsContainer");
  if (container.children.length > 1) {
    btn.parentElement.remove();
  } else {
    alert("最低1つのヒントフィールドが必要です（空欄でも可）");
  }
};

// 答えの形式が変更された時の処理
document.addEventListener("DOMContentLoaded", () => {
  loadQuizzes();

  const answerTypeSelect = document.getElementById("answerType");
  const coordinateToleranceGroup = document.getElementById("coordinateToleranceGroup");

  if (answerTypeSelect && coordinateToleranceGroup) {
    answerTypeSelect.addEventListener("change", (e) => {
      if (e.target.value === "coordinates") {
        coordinateToleranceGroup.style.display = "block";
      } else {
        coordinateToleranceGroup.style.display = "none";
      }
    });
  }

  // 追加フォーム
  document.getElementById("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const quizData = {};
    
    // 必須項目を取得
    const category = formData.get("category")?.trim();
    const qid = formData.get("qid")?.trim();
    const title = formData.get("title")?.trim();
    const desc = formData.get("desc")?.trim();
    const answer = formData.get("answer")?.trim();
    const point = parseInt(formData.get("point")) || 0;

    // 必須項目のバリデーション
    if (!category || !qid || !title || !desc || !answer) {
      alert("必須項目（カテゴリ、問題ID、タイトル、説明文、答えフラグ）をすべて入力してください。");
      return;
    }

    // 必須項目を設定
    quizData.category = category;
    quizData.qid = qid;
    quizData.title = title;
    quizData.desc = desc;
    quizData.answer = answer;
    quizData.point = point;

    // 答えの形式
    const answerType = formData.get("answerType");
    if (answerType && answerType !== "flag") {
      quizData.answerType = answerType;
      if (answerType === "coordinates") {
        const tolerance = parseFloat(formData.get("coordinateTolerance"));
        if (!isNaN(tolerance) && tolerance > 0) {
          quizData.coordinateTolerance = tolerance;
        }
      }
    }

    // 任意項目：ヒント
    const hints = formData.getAll("hint[]").map(h => h.trim()).filter(h => h.length > 0);
    if (hints.length > 0) {
      quizData.hint = hints;
    }

    // 任意項目：解説URL
    const explanation = formData.get("explanation")?.trim();
    if (explanation) {
      quizData.explanation = explanation;
    }

    // ファイルアップロードの処理
    const files = formData.getAll("files");
    const fileNames = [];
    const formDataToSend = new FormData();
    
    // ファイルがある場合は別途送信
    for (let file of files) {
      if (file instanceof File && file.size > 0) {
        fileNames.push(file.name);
        formDataToSend.append("files", file);
      }
    }

    // JSONデータを追加
    formDataToSend.append("quizData", JSON.stringify(quizData));

    try {
      const res = await fetch("/admin/addQuiz", {
        method: "POST",
        body: formDataToSend,
        credentials: "include"
      });

      const result = await res.json();
      if (res.ok) {
        alert(result.message || "問題を追加しました");
        e.target.reset();
        // ヒントフィールドを1つに戻す
        const hintsContainer = document.getElementById("hintsContainer");
        hintsContainer.innerHTML = `
          <div class="hint-item">
            <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
            <button type="button" class="add-hint-btn" onclick="addHintField()">+</button>
          </div>
        `;
        coordinateToleranceGroup.style.display = "none";
        loadQuizzes();
      } else {
        alert(result.message || "エラーが発生しました");
      }
    } catch (err) {
      console.error("追加エラー:", err);
      alert("サーバーエラーが発生しました。");
    }
  });

  // 削除フォーム
  document.getElementById("deleteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const formData = Object.fromEntries(new FormData(e.target));
    const category = formData.category?.trim();
    const qid = formData.qid?.trim();

    if (!category || !qid) {
      alert("カテゴリと問題IDを入力してください。");
      return;
    }

    if (!confirm(`問題 "${category}/${qid}" を削除しますか？`)) {
      return;
    }

    try {
      const res = await fetch("/admin/deleteQuiz", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, qid }),
        credentials: "include"
      });
      
      const result = await res.json();
      alert(result.message);
      
      if (res.ok) {
        e.target.reset();
        loadQuizzes();
      }
    } catch (err) {
      console.error("削除エラー:", err);
      alert("サーバーエラーが発生しました。");
    }
  });

  // リセットボタン
  document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("addForm").reset();
    const hintsContainer = document.getElementById("hintsContainer");
    hintsContainer.innerHTML = `
      <div class="hint-item">
        <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
        <button type="button" class="add-hint-btn" onclick="addHintField()">+</button>
      </div>
    `;
    coordinateToleranceGroup.style.display = "none";
    document.getElementById("answerType").value = "flag";
  });

  // 問題一覧から編集ボタンの処理
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("edit-btn")) {
      const category = e.target.dataset.category;
      const qid = e.target.dataset.qid;
      editQuiz(category, qid);
    } else if (e.target.classList.contains("delete-btn")) {
      const category = e.target.dataset.category;
      const qid = e.target.dataset.qid;
      if (confirm(`問題 "${category}/${qid}" を削除しますか？`)) {
        deleteQuiz(category, qid);
      }
    }
  });
});

// 問題を編集フォームに読み込む
async function editQuiz(category, qid) {
  try {
    const res = await fetch("/admin/quizzes");
    const data = await res.json();
    
    if (!data[category] || !data[category][qid]) {
      alert("問題が見つかりません");
      return;
    }

    const quiz = data[category][qid];
    
    // フォームに値を設定
    document.getElementById("category").value = category;
    document.getElementById("qid").value = qid;
    document.getElementById("title").value = quiz.title || "";
    document.getElementById("desc").value = quiz.desc || "";
    document.getElementById("answer").value = quiz.answer || "";
    document.getElementById("point").value = quiz.point || 10;
    document.getElementById("answerType").value = quiz.answerType || "flag";
    document.getElementById("explanation").value = quiz.explanation || "";
    
    // 座標許容範囲
    if (quiz.answerType === "coordinates") {
      document.getElementById("coordinateToleranceGroup").style.display = "block";
      document.getElementById("coordinateTolerance").value = quiz.coordinateTolerance || 0.001;
    } else {
      document.getElementById("coordinateToleranceGroup").style.display = "none";
    }

    // ヒント
    const hintsContainer = document.getElementById("hintsContainer");
    hintsContainer.innerHTML = "";
    
    if (quiz.hint && Array.isArray(quiz.hint) && quiz.hint.length > 0) {
      quiz.hint.forEach((hint, index) => {
        const div = document.createElement("div");
        div.className = "hint-item";
        const isFirst = index === 0;
        div.innerHTML = `
          <input type="text" name="hint[]" value="${hint.replace(/"/g, '&quot;')}" placeholder="ヒントを入力（任意）">
          ${isFirst ? 
            '<button type="button" class="add-hint-btn" onclick="addHintField()">+</button>' :
            '<button type="button" class="remove-hint-btn" onclick="removeHintField(this)">-</button>'
          }
        `;
        hintsContainer.appendChild(div);
      });
    } else {
      hintsContainer.innerHTML = `
        <div class="hint-item">
          <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
          <button type="button" class="add-hint-btn" onclick="addHintField()">+</button>
        </div>
      `;
    }

    // フォームまでスクロール
    document.getElementById("addForm").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("編集エラー:", err);
    alert("問題の読み込みに失敗しました");
  }
}

// 問題を削除
async function deleteQuiz(category, qid) {
  try {
    const res = await fetch("/admin/deleteQuiz", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, qid }),
      credentials: "include"
    });
    
    const result = await res.json();
    alert(result.message);
    
    if (res.ok) {
      loadQuizzes();
    }
  } catch (err) {
    console.error("削除エラー:", err);
    alert("サーバーエラーが発生しました。");
  }
}

// 問題一覧を表示（グローバル関数として定義）
window.loadQuizzes = async function() {
  try {
    const res = await fetch("/admin/quizzes", { credentials: "include" });
    if (!res.ok) {
      alert("読み込み失敗");
      return;
    }
    const data = await res.json();
    
    const container = document.getElementById("quizList");
    container.innerHTML = "";

    for (const [category, questions] of Object.entries(data)) {
      const categoryDiv = document.createElement("div");
      categoryDiv.className = "category-section";
      
      const categoryTitle = document.createElement("div");
      categoryTitle.className = "category-title";
      categoryTitle.textContent = category;
      categoryDiv.appendChild(categoryTitle);

      for (const [qid, quiz] of Object.entries(questions)) {
        const quizDiv = document.createElement("div");
        quizDiv.className = "quiz-item";
        
        quizDiv.innerHTML = `
          <div class="quiz-header">
            <h3>${quiz.title || qid} (${quiz.point || 0}点)</h3>
            <div>
              <button class="edit-btn" data-category="${category}" data-qid="${qid}">編集</button>
              <button class="delete-btn delete" data-category="${category}" data-qid="${qid}">削除</button>
            </div>
          </div>
          <p><strong>ID:</strong> ${qid}</p>
          <p><strong>説明:</strong> ${(quiz.desc || "").substring(0, 100)}${(quiz.desc || "").length > 100 ? "..." : ""}</p>
          <p><strong>答え:</strong> ${quiz.answer || ""}</p>
          ${quiz.answerType ? `<p><strong>答えの形式:</strong> ${quiz.answerType}</p>` : ""}
          ${quiz.hint && quiz.hint.length > 0 ? `<p><strong>ヒント数:</strong> ${quiz.hint.length}個</p>` : ""}
          ${quiz.files && quiz.files.length > 0 ? `<p><strong>ファイル:</strong> ${quiz.files.join(", ")}</p>` : ""}
          ${quiz.explanation ? `<p><strong>解説:</strong> <a href="${quiz.explanation}" target="_blank">${quiz.explanation}</a></p>` : ""}
        `;
        
        categoryDiv.appendChild(quizDiv);
      }
      
      container.appendChild(categoryDiv);
    }
  } catch (err) {
    console.error("読み込みエラー:", err);
    alert("問題の読み込みに失敗しました");
  }
};