/**
 * ユーザー情報を直接データベースから変更するスクリプト
 * 
 * 使用方法:
 * node scripts/update_user.js <userid> [--username <username>] [--password <password>]
 * 
 * 例:
 * node scripts/update_user.js testuser --username "新しいユーザー名"
 * node scripts/update_user.js testuser --password "newpassword123"
 * node scripts/update_user.js testuser --username "新しいユーザー名" --password "newpassword123"
 */

const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");

// データベースパス
const dbPath = path.join(__dirname, "../db/users.db");

// コマンドライン引数の解析
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error("使用方法: node scripts/update_user.js <userid> [--username <username>] [--password <password>]");
  process.exit(1);
}

const userid = args[0];
let username = null;
let password = null;

// オプションの解析
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--username" && i + 1 < args.length) {
    username = args[i + 1];
    i++;
  } else if (args[i] === "--password" && i + 1 < args.length) {
    password = args[i + 1];
    i++;
  }
}

if (!username && !password) {
  console.error("エラー: --username または --password のいずれかを指定してください");
  process.exit(1);
}

// データベース接続
if (!fs.existsSync(dbPath)) {
  console.error(`エラー: データベースファイルが見つかりません: ${dbPath}`);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error("データベース接続エラー:", err.message);
    process.exit(1);
  }
});

// ユーザーが存在するか確認
db.get("SELECT * FROM users WHERE userid = ?", [userid], async (err, user) => {
  if (err) {
    console.error("データベースエラー:", err.message);
    db.close();
    process.exit(1);
  }

  if (!user) {
    console.error(`エラー: ユーザー '${userid}' が見つかりません`);
    db.close();
    process.exit(1);
  }

  console.log(`ユーザー '${userid}' が見つかりました`);
  console.log(`現在のユーザー名: ${user.username}`);

  // パスワードのハッシュ化
  let hashedPw = null;
  if (password) {
    try {
      hashedPw = await bcrypt.hash(password, 10);
      console.log("パスワードをハッシュ化しました");
    } catch (err) {
      console.error("パスワードハッシュ化エラー:", err.message);
      db.close();
      process.exit(1);
    }
  }

  // 更新処理
  if (username && password) {
    // ユーザー名とパスワードの両方を更新
    db.run(
      "UPDATE users SET username = ?, password = ? WHERE userid = ?",
      [username, hashedPw, userid],
      function(err) {
        if (err) {
          console.error("更新エラー:", err.message);
          db.close();
          process.exit(1);
        }
        console.log(`✅ ユーザー名とパスワードを更新しました`);
        console.log(`   新しいユーザー名: ${username}`);
        db.close();
      }
    );
  } else if (username) {
    // ユーザー名のみ更新
    db.run(
      "UPDATE users SET username = ? WHERE userid = ?",
      [username, userid],
      function(err) {
        if (err) {
          console.error("更新エラー:", err.message);
          db.close();
          process.exit(1);
        }
        console.log(`✅ ユーザー名を更新しました`);
        console.log(`   新しいユーザー名: ${username}`);
        db.close();
      }
    );
  } else if (password) {
    // パスワードのみ更新
    db.run(
      "UPDATE users SET password = ? WHERE userid = ?",
      [hashedPw, userid],
      function(err) {
        if (err) {
          console.error("更新エラー:", err.message);
          db.close();
          process.exit(1);
        }
        console.log(`✅ パスワードを更新しました`);
        db.close();
      }
    );
  }
});

