const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;

// ミドルウェア設定
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// テンプレートエンジン設定
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// サンプル商品データ
const products = [
  {
    id: 1,
    name: 'ノートパソコン Pro',
    price: 99800,
    description: '高性能なノートパソコンです。',
    image: '💻'
  },
  {
    id: 2,
    name: 'ワイヤレスマウス',
    price: 2980,
    description: '快適な操作感のワイヤレスマウス。',
    image: '🖱️'
  },
  {
    id: 3,
    name: 'USBメモリ 64GB',
    price: 1280,
    description: '大容量のUSBメモリです。',
    image: '💾'
  },
  {
    id: 4,
    name: 'キーボード メカニカル',
    price: 12800,
    description: '打ち心地の良いメカニカルキーボード。',
    image: '⌨️'
  },
  {
    id: 5,
    name: 'モニター 27インチ',
    price: 29800,
    description: '高解像度の27インチモニター。',
    image: '🖥️'
  }
];

// レビューデータ（メモリ上に保存）
let reviews = [
  {
    id: 1,
    productId: 1,
    author: '山田太郎',
    rating: 5,
    comment: 'とても良い商品です！',
    date: new Date().toISOString()
  }
];

// ホームページ（商品一覧）
app.get('/', (req, res) => {
  res.render('index', { products, searchQuery: null });
});

// 商品検索（XSS脆弱性あり - 検索クエリがそのまま表示される）
app.get('/search', (req, res) => {
  const searchQuery = req.query.q || '';
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // XSS脆弱性: 検索クエリをサニタイズせずにそのまま渡す
  res.render('index', { 
    products: filteredProducts, 
    searchQuery: searchQuery  // サニタイズされていない！
  });
});

// 商品詳細ページ
app.get('/product/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  const product = products.find(p => p.id === productId);
  const productReviews = reviews.filter(r => r.productId === productId);
  
  if (!product) {
    return res.status(404).send('商品が見つかりません');
  }
  
  res.render('product', { product, reviews: productReviews });
});

// レビュー投稿（XSS脆弱性あり - レビュー内容がサニタイズされずに保存・表示される）
app.post('/product/:id/review', (req, res) => {
  const productId = parseInt(req.params.id);
  const { author, rating, comment } = req.body;
  
  // XSS脆弱性: ユーザー入力をサニタイズせずにそのまま保存
  const newReview = {
    id: reviews.length + 1,
    productId: productId,
    author: author || '匿名',  // サニタイズされていない！
    rating: parseInt(rating) || 5,
    comment: comment || '',  // サニタイズされていない！
    date: new Date().toISOString()
  };
  
  reviews.push(newReview);
  res.redirect(`/product/${productId}`);
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
  console.log(`🚨 脆弱性のあるショッピングサイトが起動しました！`);
  
  if (localIPs.length > 0) {
    // 最初のIPアドレス（主要なもの）を表示
    const mainIP = localIPs[0];
    console.log(`📍 http://${mainIP}:${PORT}`);
    
    // 複数のIPアドレスがある場合は、それも表示
    if (localIPs.length > 1) {
      console.log(`   （その他のIPアドレス: ${localIPs.slice(1).map(ip => `http://${ip}:${PORT}`).join(', ')}）`);
    }
  } 
  
  console.log(`⚠️  このサイトはXSS攻撃の練習用です。本番環境では使用しないでください。`);
});
