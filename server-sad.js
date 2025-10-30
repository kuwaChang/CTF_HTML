// server-sad.js
const express = require("express");
const router = express.Router();
const { spawn } = require("child_process");
const { randomBytes } = require("crypto");
const fs = require("fs");
const path = require("path");

let ioInstance = null; // socket.ioをserver.jsから注入する

// 外部からioを渡すための関数
function setSocketIO(io) {
  ioInstance = io;

  // /ws/:id 用のnamespaceを定義
  io.of(/^\/ws\/.+$/).on("connection", (socket) => {
    const namespace = socket.nsp;
    const instanceId = namespace.name.split("/").pop();
    console.log(`✅ ${instanceId} に接続`);

    // docker exec で bash を起動（Windows の TTY 問題回避のため script で擬似TTY）
    const execArgs = [
      "exec",
      "-i",
      instanceId,
      "script",
      "-q",
      "-c",
      "bash",
      "/dev/null",
    ];
    const shell = spawn("docker", execArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color" },
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

// 外部 JSON からシナリオ定義を読み込み
const scenariosPath = path.join(__dirname, "data", "scenarios.json");
function getScenarios() {
  try {
    const raw = fs.readFileSync(scenariosPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    console.error("シナリオ定義読み込み失敗", e);
    return {};
  }
}

function buildSetupScript(scenario) {
  const lines = [];
  lines.push("set -e");
  lines.push("mkdir -p /challenge");
  if (scenario.packages && scenario.packages.length > 0) {
    lines.push("apt-get update");
    lines.push("DEBIAN_FRONTEND=noninteractive apt-get install -y " + scenario.packages.join(" "));
  }
  for (const f of scenario.files) {
    // セーフに printf するため、EOF で書き込み
    // 中間に && を挟むとヒアドキュメントが壊れるため、必ず改行で連結する
    lines.push(`cat > ${f.path} <<'EOF'`);
    lines.push(f.content);
    lines.push("EOF");
    if (f.mode) {
      lines.push(`chmod ${f.mode} ${f.path}`);
    }
  }
  if (scenario.postScript && scenario.postScript.length) {
    lines.push(...scenario.postScript);
  }
  // ヒアドキュメントを正しく機能させるため、改行で結合したスクリプトを返す
  return lines.join("\n");
}

// コンテナ起動API
router.post("/start-sad", async (req, res) => {
  if (!ioInstance) {
    return res.status(500).json({ error: "Socket.io未設定" });
  }

  const scenarioId = (req.body && req.body.scenarioId) || "easy";
  const scenarios = getScenarios();
  const scenario = scenarios[scenarioId];
  if (!scenario) {
    return res.status(400).json({ error: "未知のシナリオID", scenarioId });
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
    scenario.cpus || "0.5",
    "--memory",
    scenario.memory || "256m",
    "ubuntu", // ← 任意の軽量イメージ
    "sleep",
    "infinity",
  ]);

  // 標準エラーを収集して返却できるようにする
  const stderrChunks = [];
  run.stderr.on("data", (data) => {
    stderrChunks.push(Buffer.from(data));
    console.error(`[docker run stderr] ${data}`);
  });

  // spawn 自体のエラー（コマンド未検出など）
  run.on("error", (err) => {
    console.error("[docker run error]", err);
    return res.status(500).json({ error: "コンテナ起動失敗 (spawn error)", detail: String(err) });
  });

  run.on("close", (code) => {
    if (code !== 0) {
      const detail = Buffer.concat(stderrChunks).toString();
      return res.status(500).json({ error: "コンテナ起動失敗", detail });
    }

    // 起動直後にシナリオ課題を設置
    const setupScript = buildSetupScript(scenario);

    const setupStderr = [];
    const setup = spawn("docker", [
      "exec",
      "-i",
      instanceId,
      "bash",
      "-lc",
      setupScript,
    ]);

    setup.stderr.on("data", (d) => setupStderr.push(Buffer.from(d)));
    setup.on("error", (err) => {
      console.error("[setup error]", err);
      return res.status(500).json({ error: "課題セットアップ失敗 (spawn)", detail: String(err) });
    });
    setup.on("close", (setupCode) => {
      if (setupCode !== 0) {
        const detail = Buffer.concat(setupStderr).toString();
        return res.status(500).json({ error: "課題セットアップ失敗", detail });
      }

      // 30分後に自動停止
      setTimeout(() => {
        console.log(`🕒 自動停止: ${instanceId}`);
        spawn("docker", ["stop", instanceId]);
      }, 30 * 60 * 1000);

      res.json({
        instanceId,
        wsPath: `/ws/${instanceId}`,
        scenarioId,
      });
    });
  });
});

module.exports = { router, setSocketIO };
