// ✅ ランキング表示
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