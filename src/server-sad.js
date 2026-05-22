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

function buildSetupScript(scenario, scenarioId) {
  const lines = [];
  lines.push("set -e");
  lines.push("set +H"); // 履歴展開を無効化（!が問題を起こすのを防ぐ）
  lines.push("mkdir -p /challenge");
  if (scenario.packages && scenario.packages.length > 0) {
    lines.push("apt-get update || true");
    lines.push("DEBIAN_FRONTEND=noninteractive apt-get install -y " + scenario.packages.join(" ") + " || true");
  }
  for (const f of scenario.files) {
    // セーフに printf するため、EOF で書き込み
    // 中間に && を挟むとヒアドキュメントが壊れるため、必ず改行で連結する
    lines.push(`cat > ${f.path} <<'EOF'`);
    lines.push(f.content);
    lines.push("EOF");
    if (f.mode) {
      lines.push(`chmod ${f.mode} ${f.path} || true`);
    }
  }
  if (scenario.postScript && scenario.postScript.length) {
    // postScriptの各行にエラーハンドリングを追加
    scenario.postScript.forEach(cmd => {
      // 既に || が含まれている場合はそのまま、そうでなければ || true を追加
      if (cmd.includes("||") || cmd.includes("&&")) {
        lines.push(cmd);
      } else {
        lines.push(cmd + " || true");
      }
    });
  }
  // ヒアドキュメントを正しく機能させるため、改行で結合したスクリプトを返す
  return lines.join("\n");
}

// コンテナ起動API
router.post("/start-sad", async (req, res) => {
  if (!ioInstance) {
    return res.status(500).json({ error: "Socket.io未設定" });
  }

  const scenarioId = (req.body && req.body.scenarioId) || "easy1";
  const scenarios = getScenarios();
  const scenario = scenarios[scenarioId];
  if (!scenario) {
    return res.status(400).json({ error: "未知のシナリオID", scenarioId });
  }

  const instanceId = "sad_" + randomBytes(4).toString("hex");

  console.log(`🚀 起動: ${instanceId}`);
  const dockerArgs = [
    "run",
    "--rm",
    "-d",
    "--name",
    instanceId,
    "--cpus",
    scenario.cpus || "0.5",
    "--memory",
    scenario.memory || "256m",
    "ubuntu",
    "sleep",
    "infinity"
  ];

  const run = spawn("docker", dockerArgs);

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

    // セットアップを実行
    const setupScript = buildSetupScript(scenario, scenarioId);

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
        return res.status(500).json({ error: "課題セットアップ失敗", detail, setupCode });
      }

      // 30分後に自動停止
      setTimeout(() => {
        console.log(`🕒 自動停止: ${instanceId}`);
        spawn("docker", ["stop", instanceId]);
      }, 30 * 60 * 1000);

      const response = {
        instanceId,
        wsPath: `/ws/${instanceId}`,
        scenarioId,
      };

      res.json(response);
    });
  });
});

// コンテナ停止API
router.post("/stop-sad", async (req, res) => {
  // リクエストボディをログに出力（デバッグ用）
  console.log("[stop-sad] リクエストボディ:", JSON.stringify(req.body));
  
  const instanceId = req.body && req.body.instanceId;
  
  if (!instanceId) {
    console.error("[stop-sad] instanceIdが提供されていません");
    return res.status(400).json({ error: "instanceIdが必要です" });
  }

  // instanceIdの検証（sad_で始まる16進数のみ許可）
  if (!/^sad_[a-f0-9]{8}$/.test(instanceId)) {
    console.error(`[stop-sad] 無効なinstanceId形式: ${instanceId}`);
    return res.status(400).json({ error: "無効なinstanceId形式", received: instanceId });
  }

  console.log(`🛑 停止: ${instanceId}`);

  const stop = spawn("docker", ["stop", instanceId]);
  
  const stderrChunks = [];
  stop.stderr.on("data", (data) => {
    stderrChunks.push(Buffer.from(data));
    console.error(`[docker stop stderr] ${data}`);
  });

  stop.on("error", (err) => {
    console.error("[docker stop error]", err);
    return res.status(500).json({ error: "コンテナ停止失敗 (spawn error)", detail: String(err) });
  });

  stop.on("close", (code) => {
    if (code !== 0) {
      const detail = Buffer.concat(stderrChunks).toString();
      // コンテナが既に存在しない場合も成功として扱う
      if (detail.includes("No such container")) {
        console.log(`⚠️ コンテナ ${instanceId} は既に存在しません`);
        return res.json({ message: "コンテナは既に停止されています", instanceId });
      }
      return res.status(500).json({ error: "コンテナ停止失敗", detail });
    }

    console.log(`✅ 停止成功: ${instanceId}`);
    res.json({ message: "コンテナを停止しました", instanceId });
  });
});


module.exports = { router, setSocketIO };
