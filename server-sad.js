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
  // reversingシナリオの場合は set -e を使わない（エラーが発生しても続行）
  const isReversing = scenarioId === "reversing";
  if (!isReversing) {
    lines.push("set -e");
  } else {
    // reversingシナリオの場合はエラーが発生しても続行
    lines.push("set +e");
  }
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

  // reversingシナリオの場合はポートを公開
  const isReversing = scenarioId === "reversing";
  const portOffset = parseInt(instanceId.slice(-2), 16) % 100;
  const webPort = 8080 + portOffset;

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
  ];

  // reversingシナリオの場合はポートを公開
  if (isReversing) {
    dockerArgs.push("-p", `${webPort}:9090`); // Rizin Web UIはデフォルトで9090を使用
  }

  dockerArgs.push("ubuntu", "sleep", "infinity");

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

    // reversingシナリオの場合は、セットアップをバックグラウンドで実行し、すぐにレスポンスを返す
    if (isReversing) {
      console.log(`🚀 Reversingシナリオ: コンテナ起動完了、セットアップをバックグラウンドで実行中...`);
      
      // セットアップをバックグラウンドで実行（nohupを使用）
      const setupScript = buildSetupScript(scenario, scenarioId);
      const setupCmd = `nohup bash -c '${setupScript.replace(/'/g, "'\"'\"'")}' > /tmp/setup.log 2>&1 &`;
      
      const setup = spawn("docker", [
        "exec",
        "-d",
        instanceId,
        "bash",
        "-c",
        setupCmd
      ]);

      setup.on("error", (err) => {
        console.error("[setup error]", err);
      });

      setup.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Reversingシナリオ: セットアップスクリプトをバックグラウンドで起動しました`);
        } else {
          console.warn(`⚠️ Reversingシナリオ: セットアップスクリプトの起動に問題がありました (code: ${code})`);
        }
      });

      // 30分後に自動停止
      setTimeout(() => {
        console.log(`🕒 自動停止: ${instanceId}`);
        spawn("docker", ["stop", instanceId]);
      }, 30 * 60 * 1000);

      // すぐにレスポンスを返す
      // クライアントのホスト名を取得（リクエストヘッダーから）
      const clientHost = req.get('host')?.split(':')[0] || req.hostname || 'localhost';
      const response = {
        instanceId,
        wsPath: `/ws/${instanceId}`,
        scenarioId,
        webUIPort: webPort,
        webUIHost: clientHost,
        webUIUrl: `http://${clientHost}:${webPort}`,
        webUIInfo: `ターミナルから 'rizin -H 9090 /challenge/sample_binary' を実行すると、http://${clientHost}:${webPort} でWeb UIにアクセスできます`,
        setupInProgress: true,
        message: "セットアップをバックグラウンドで実行中です。数分かかる場合があります。"
      };

      return res.json(response);
    }

    // その他のシナリオは従来通り同期的にセットアップ
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
  const instanceId = req.body && req.body.instanceId;
  
  if (!instanceId) {
    return res.status(400).json({ error: "instanceIdが必要です" });
  }

  // instanceIdの検証（sad_で始まる16進数のみ許可）
  if (!/^sad_[a-f0-9]{8}$/.test(instanceId)) {
    return res.status(400).json({ error: "無効なinstanceId形式" });
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

// Rizin Web UIを起動するAPI
router.post("/start-rizin-webui", async (req, res) => {
  try {
    const instanceId = req.body && req.body.instanceId;
    const filePath = req.body && req.body.filePath || "/challenge/sample_binary";
    
    if (!instanceId) {
      return res.status(400).json({ error: "instanceIdが必要です" });
    }

    // instanceIdの検証
    if (!/^sad_[a-f0-9]{8}$/.test(instanceId)) {
      return res.status(400).json({ error: "無効なinstanceId形式" });
    }

    console.log(`🔧 Rizin Web UI起動: ${instanceId}`);

    // ポートオフセットを計算（コンテナ起動時と同じロジック）
    const portOffset = parseInt(instanceId.slice(-2), 16) % 100;
    const webPort = 8080 + portOffset;
    const clientHost = req.get('host')?.split(':')[0] || req.hostname || 'localhost';

    // まず、Rizinがインストールされているか確認
    const checkRizin = spawn("docker", [
      "exec",
      instanceId,
      "bash",
      "-c",
      "which rizin || which r2 || echo 'NOT_FOUND'"
    ]);

    let rizinCommand = null;
    const rizinStdout = [];
    checkRizin.stdout.on("data", (data) => {
      rizinStdout.push(data);
      const output = data.toString().trim();
      if (output && output !== "NOT_FOUND" && !output.includes("which:")) {
        rizinCommand = output.includes("rizin") ? "rizin" : "r2";
        console.log(`✅ Rizinが見つかりました: ${rizinCommand}`);
      }
    });

    const rizinStderr = [];
    checkRizin.stderr.on("data", (data) => {
      rizinStderr.push(data);
      console.error(`[checkRizin stderr] ${data}`);
    });

    checkRizin.on("error", (err) => {
      console.error("[checkRizin error]", err);
      return res.status(500).json({
        error: "Rizin確認エラー",
        detail: String(err),
        suggestion: "コンテナが起動しているか確認してください"
      });
    });

    checkRizin.on("close", (checkCode) => {
    if (!rizinCommand) {
      console.warn("⚠️ Rizinが見つかりません。radare2を使用します。");
      rizinCommand = "r2";
    }

    // ファイルが作成されるまで待機する関数
    const waitForFile = (waitCount = 0, maxWait = 60) => {
      const checkAgain = spawn("docker", [
        "exec",
        instanceId,
        "bash",
        "-c",
        `test -f ${filePath} && echo "EXISTS" || echo "NOT_EXISTS"`
      ]);

      let found = false;
      checkAgain.stdout.on("data", (data) => {
        if (data.toString().trim() === "EXISTS") {
          found = true;
        }
      });

      checkAgain.on("close", () => {
        if (found) {
          console.log(`✅ ファイル ${filePath} が見つかりました`);
          startRizinWebUI();
        } else if (waitCount < maxWait) {
          console.log(`⏳ ファイル待機中... (${waitCount}/${maxWait})`);
          setTimeout(() => waitForFile(waitCount + 1, maxWait), 2000);
        } else {
          console.error(`❌ ファイル ${filePath} が ${maxWait * 2} 秒以内に作成されませんでした`);
          return res.status(500).json({
            error: "ファイルが見つかりません",
            detail: `セットアップが完了していない可能性があります。ターミナルで 'ls -la /challenge' を実行して確認してください。`,
            suggestion: "セットアップが完了するまで数分待ってから再度試してください。または、ターミナルから手動で 'rizin -H 9090 /challenge/sample_binary' を実行してください。"
          });
        }
      });
    };

    // Rizin Web UIを起動する関数を定義（先に定義）
    const startRizinWebUI = () => {
      // Rizin Web UIを起動
      // rizin -H はWeb UIを起動するコマンド（ポート9090で起動）
      const rizinCmd = rizinCommand === "rizin" 
        ? `rizin -H 9090 ${filePath}`
        : `r2 -H 9090 ${filePath}`;
      
      const rizinProcess = spawn("docker", [
        "exec",
        "-d",
        instanceId,
        "bash",
        "-c",
        `cd /challenge && nohup ${rizinCmd} > /tmp/rizin.log 2>&1 & echo $! > /tmp/rizin.pid`
      ]);

      const stderrChunks = [];
      rizinProcess.stderr.on("data", (data) => {
        stderrChunks.push(Buffer.from(data));
        console.error(`[rizin stderr] ${data}`);
      });

      rizinProcess.on("error", (err) => {
        console.error("[rizin webui error]", err);
        return res.status(500).json({ 
          error: "Rizin Web UI起動失敗", 
          detail: String(err),
          suggestion: "ターミナルから手動で 'rizin -H 9090 /challenge/sample_binary' を実行してください"
        });
      });

      rizinProcess.on("close", (code) => {
        console.log(`[rizin process] close code: ${code}`);
        
        // 少し待ってからプロセスが起動しているか確認
        setTimeout(() => {
          const checkProcess = spawn("docker", [
            "exec",
            instanceId,
            "bash",
            "-c",
            "ps aux | grep -E '(rizin|r2)' | grep -v grep || echo 'NOT_RUNNING'"
          ]);

          let isRunning = false;
          checkProcess.stdout.on("data", (data) => {
            const output = data.toString();
            if (output && !output.includes("NOT_RUNNING")) {
              isRunning = true;
              console.log(`✅ Rizinプロセスが実行中です`);
            }
          });

          checkProcess.on("close", () => {
            // ログの最後の数行を取得
            const getLog = spawn("docker", [
              "exec",
              instanceId,
              "bash",
              "-c",
              "tail -20 /tmp/rizin.log 2>/dev/null || echo 'ログファイルが見つかりません'"
            ]);

            let logOutput = "";
            getLog.stdout.on("data", (data) => {
              logOutput += data.toString();
            });

            getLog.on("close", () => {
              res.json({
                success: isRunning,
                message: isRunning ? "Rizin Web UIを起動しました" : "Rizin Web UIの起動を試みました",
                instanceId,
                webUIPort: webPort,
                webUIHost: clientHost,
                webUIUrl: `http://${clientHost}:${webPort}`,
                info: `Rizin Web UIは http://${clientHost}:${webPort} でアクセスできます`,
                isRunning: isRunning,
                log: logOutput,
                suggestion: !isRunning ? "ターミナルから手動で 'rizin -H 9090 /challenge/sample_binary' または 'r2 -H 9090 /challenge/sample_binary' を実行してください" : null
              });
            });
          });
        }, 3000); // 3秒待ってから確認
      });
    };

    // ファイルが存在するか確認
    const checkFile = spawn("docker", [
      "exec",
      instanceId,
      "bash",
      "-c",
      `test -f ${filePath} && echo "EXISTS" || echo "NOT_EXISTS"`
    ]);

    let fileExists = false;
    checkFile.stdout.on("data", (data) => {
      if (data.toString().trim() === "EXISTS") {
        fileExists = true;
      }
    });

    checkFile.on("close", (fileCode) => {
      if (!fileExists) {
        console.warn(`⚠️ ファイル ${filePath} が見つかりません。セットアップが完了するまで待機します...`);
        // ファイルが作成されるまで待機（最大60回、2秒間隔 = 120秒）
        setTimeout(() => waitForFile(0, 60), 2000);
        return;
      }
      
      // ファイルが存在する場合はすぐに起動
      startRizinWebUI();
    });
  });
  } catch (error) {
    console.error("[start-rizin-webui error]", error);
    return res.status(500).json({
      error: "Rizin Web UI起動エラー",
      detail: String(error),
      suggestion: "サーバーログを確認してください"
    });
  }
});

module.exports = { router, setSocketIO };
