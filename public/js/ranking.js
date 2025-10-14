//スコア取得API
app.get("/getScore", requireLogin, (req, res) => {
  db.get("SELECT score FROM users WHERE userid = ?", [req.session.userid], (err, row) => {
    if (err || !row) {
      res.json({ success: false, score: 0 });
    } else {
      res.json({ success: true, score: row.score });
    }
  });
});