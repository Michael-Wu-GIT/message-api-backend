const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// ========== 你的数据库连接池（保持你原来的配置不变，这里用环境变量） ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ========== 新增：启动自动建表逻辑 ==========
const initTable = async () => {
  const sql = `
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `;
  try {
    await pool.query(sql);
    console.log("✅ messages 表初始化完成");
  } catch (err) {
    console.error("❌ 建表失败：", err);
  }
};
initTable();

// ========== 留言接口 ==========
// 获取全部留言
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM messages ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增留言
app.post('/api/messages', async (req, res) => {
  const { name, content } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO messages(name, content) VALUES($1, $2) RETURNING *',
      [name, content]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('留言API服务正常运行');
});

app.listen(PORT, () => {
  console.log(`服务启动，端口：${PORT}`);
});
