// public/admin.js  (require を削除！)

document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ 管理者ページ読み込み完了");

  try {
    // 管理者ページで問題一覧を取得
    const res = await fetch("/admin/quizzes");
    if (!res.ok) throw new Error("サーバーエラー: " + res.status);

    const quizzes = await res.json();
    console.log("📘 問題一覧:", quizzes);

    const list = document.getElementById("quizList");
    if (!list) return;

    for (const category in quizzes) {
      const cat = document.createElement("div");
      cat.innerHTML = `<h2>${category}</h2>`;
      for (const qid in quizzes[category]) {
        const q = quizzes[category][qid];
        const p = document.createElement("p");
        p.textContent = `${qid}: ${q.title} (${q.point}点)`;
        cat.appendChild(p);
      }
      list.appendChild(cat);
    }
  } catch (err) {
    console.error("管理画面読み込みエラー:", err);
  }
});
