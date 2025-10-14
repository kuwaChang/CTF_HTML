const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(session({
  secret: "secret_key",
  resave: false,
  saveUninitialized: true
}));

// 分割したルートを読み込み
const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quiz");
const rankingRoutes = require("./routes/ranking");

app.use("/auth", authRoutes);
app.use("/quiz", quizRoutes);
app.use("/ranking", rankingRoutes);

// サーバー起動
app.listen(3000, () => console.log("Server started on http://localhost:3000"));
