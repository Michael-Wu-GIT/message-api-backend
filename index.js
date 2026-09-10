const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;

// ========== 1. 先初始化数据库连接池（放到最前面！）==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ========== 2. 注册中间件 ==========
app.use(cors());
app.use(express.json());

// ========== 3. 健康检查接口 ==========
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      ok: true,
      time: result.rows[0].now,
      msg: "数据库连接成功"
    });
  } catch (err) {
    res.status(500).json({ok:false, error: err.message})
  }
});

// ========== 4. 业务路由 ==========
// 获取所有留言
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, content, created_at FROM messages ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增留言
app.post('/api/messages', async (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({msg:"姓名和内容不能为空"});
  try {
    const result = await pool.query(
      'INSERT INTO messages(name,content) VALUES($1,$2) RETURNING *',
      [name, content]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 5. 最后监听端口 ==========
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
