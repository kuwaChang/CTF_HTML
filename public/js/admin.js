document.addEventListener("DOMContentLoaded", () => {
  loadQuizzes();

  // 追加フォーム
  document.getElementById("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));
    formData.hint = formData.hint.split(",").map(s => s.trim());

     try {
    const res = await fetch("/admin/addQuiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });

    const result = await res.json();
    alert(result.message);

    // フォームをリセットして再読み込み
    e.target.reset();
    loadQuizzes();
  } catch (err) {
    console.error("追加エラー:", err);
    alert("サーバーエラーが発生しました。");
  }
  });

  // 削除フォーム
  document.getElementById("deleteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));
    const res = await fetch("/admin/deleteQuiz", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });
    alert((await res.json()).message);
    loadQuizzes();
  });
});

async function loadQuizzes() {
  const res = await fetch("/admin/quizzes");
  if (!res.ok) return alert("読み込み失敗");
  const data = await res.json();
  document.getElementById("quizList").textContent = JSON.stringify(data, null, 2);
}
