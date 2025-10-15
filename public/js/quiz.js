export let quizData = {};
let currentCategory = null;
let currentQid = null;
let currentPoint = 0;

// JSONから問題一覧を読み込み
export async function loadQuizData() {
  const res = await fetch("/api/quizData");
  quizData = await res.json();
  const container = document.getElementById("quizContainer");
  container.innerHTML = "";

    // ✅ 解いた問題リストを先に取得
  const solvedRes = await fetch("/solvedList");
  const solvedList = await solvedRes.json();
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
        div.style.pointerEvents = "none";       // クリック無効化したい場合
        div.style.opacity = "0.7";
      } else {
        div.style.backgroundColor = "#969696ff";  //未解答
      }
      div.onclick = () => openModal(category, qid);
      grid.appendChild(div);
    }
    container.appendChild(grid);
  }
}

function openModal(category, qid) {
  const q = quizData[category][qid];
  currentCategory = category;
  currentQid = qid;
  currentPoint = q.point;

  document.getElementById("modal-title").textContent = q.title;
  document.getElementById("modal-desc").textContent = q.desc;
  document.getElementById("modal-point").textContent = q.point;
  document.getElementById("modal-hints").innerHTML =
    q.hint.map(h => `<div>・${h}</div>`).join("");
  document.getElementById("modal").style.display = "flex";

    // デフォルト色
  modalContent.style.backgroundColor = "#ffffff";

  // ✅ すでに解いたか確認
  const solved = solvedList.some(q => q.category === category && q.qid === qid);
  if (solved) {
    modalContent.style.backgroundColor = "#6cd463ff"; // 正解済み（淡い緑）
  }

  modal.style.display = "block";
}

export function closeModal() {
  document.getElementById("modal").style.display = "none";
}

window.onclick = (e) => {
  if (e.target === document.getElementById("modal")) closeModal();
};

// 答え送信
document.getElementById("submitBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const answer = document.getElementById("answer").value;

  const res = await fetch("/checkAnswer", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      category: currentCategory,
      qid: currentQid,
      answer: answer,
      point: currentPoint
    })
  });
  const data = await res.json();
  const resultEl = document.getElementById("result");

  if (data.alreadySolved) {
    resultEl.innerText = "この問題はすでに解いています！";
    resultEl.style.color = "orange";
  } else if (data.correct) {
    resultEl.innerText = "正解！ +" + (data.point || 0) + "点";
    resultEl.style.color = "limegreen";
    solvedList.push({ category, qid }); // ←これで即時反映
    modalContent.style.backgroundColor = "6cd463ff";
  } else {
    resultEl.innerText = "不正解...";
    resultEl.style.color = "red";
  }
});

export async function loadScore() {
  const res = await fetch("/getScore");
  const result = await res.json();
  document.getElementById("scoreDisplay").innerText = "現在の得点: " + result.score;
}

export async function loadRanking() {
  const res = await fetch("/ranking");
  const data = await res.json();
  const tbody = document.querySelector("#ranking tbody");
  tbody.innerHTML = "";
  data.forEach((user, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${user.userid || user.username}</td>
      <td>${user.score}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 「最新スコア取得」ボタンのイベント設定
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scoreRefresh");
  if (btn) btn.addEventListener("click", loadScore);
});
