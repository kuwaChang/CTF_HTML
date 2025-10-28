// server-sad.js
const express = require("express");
const router = express.Router();
const { spawn } = require("child_process");
const { randomBytes } = require("crypto");

let ioInstance = null; // socket.ioをserver.jsから注入する

// 外部からioを渡すための関数
function setSocketIO(io) {
  ioInstance = io;

  // /ws/:id 用のnamespaceを定義
  io.of(/^\/ws\/.+$/).on("connection", (socket) => {
    const namespace = socket.nsp;
    const instanceId = namespace.name.split("/").pop();
    console.log(`✅ ${instanceId} に接続`);

    // docker execでbashを起動
    const shell = spawn("docker", ["exec", "-it", instanceId, "/bin/bash"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 出力をクライアントに転送
    shell.stdout.on("data", (data) => socket.emit("output", data.toString()));
    shell.stderr.on("data", (data) => socket.emit("output", data.toString()));

    // クライアント入力をbashに転送
    socket.on("input", (data) => shell.stdin.write(data));

    // 切断時にクリーンアップ
    socket.on("disconnect", () => {
      console.log(`❌ ${instanceId} 切断`);
      shell.kill();
    });
  });
}

// コンテナ起動API
router.post("/start-sad", async (req, res) => {
  if (!ioInstance) {
    return res.status(500).json({ error: "Socket.io未設定" });
  }

  const instanceId = "sad_" + randomBytes(4).toString("hex");

  console.log(`🚀 起動: ${instanceId}`);
  const run = spawn("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    instanceId,
    "--cpus",
    "0.5",
    "--memory",
    "256m",
    "ubuntu", // ← 任意の軽量イメージ
    "sleep",
    "infinity",
  ]);

  run.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: "コンテナ起動失敗" });
    }

    // 30分後に自動停止
    setTimeout(() => {
      console.log(`🕒 自動停止: ${instanceId}`);
      spawn("docker", ["stop", instanceId]);
    }, 30 * 60 * 1000);

    res.json({
      instanceId,
      wsPath: `/ws/${instanceId}`,
    });
  });
});

module.exports = { router, setSocketIO };
