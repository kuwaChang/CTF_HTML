const fs = require("fs");
const path = require("path");

const PENDING_PATH = path.join(__dirname, "../db/tutor_qa_pending.jsonl");
const DOCS_DIR = path.join(__dirname, "../docs");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * チューターへの質問・回答を追記（rebuild 時に docs へまとめて書き出す）
 */
function append(entry) {
  try {
    ensureDir(path.dirname(PENDING_PATH));
    const line =
      JSON.stringify({
        ...entry,
        recordedAt: new Date().toISOString()
      }) + "\n";
    fs.appendFileSync(PENDING_PATH, line, "utf8");
  } catch (e) {
    console.error("❌ tutor Q&A ログ追記エラー:", e.message);
  }
}

/**
 * 未書き出しの Q&A を docs に1ファイル出力し、pending を空にする。
 * @returns {{ filename: string, count: number } | null}
 */
function flushPendingToDocs() {
  try {
    ensureDir(DOCS_DIR);
    if (!fs.existsSync(PENDING_PATH) || fs.statSync(PENDING_PATH).size === 0) {
      return null;
    }
    const raw = fs.readFileSync(PENDING_PATH, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const entries = lines.map((l) => JSON.parse(l));

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `tutor-qa-${stamp}.json`;
    const outPath = path.join(DOCS_DIR, filename);

    const payload = {
      exportedAt: new Date().toISOString(),
      entryCount: entries.length,
      entries
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    fs.unlinkSync(PENDING_PATH);
    console.log(`📝 チューターQ&Aを書き出しました: ${outPath} (${entries.length}件)`);
    return { filename, count: entries.length };
  } catch (e) {
    console.error("❌ tutor Q&A フラッシュエラー:", e.message);
    throw e;
  }
}

module.exports = { append, flushPendingToDocs };
