const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 初始化数据库
async function bootstrap() {
  try {
    await pool.query('SELECT 1');
    console.log("✅ 数据库连接成功");

    const createTableSql = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `;
    await pool.query(createTableSql);
    console.log("✅ messages表创建/校验完成");

    app.listen(PORT, () => {
      console.log(`🚀 服务启动，端口：${PORT}`);
    });

  } catch (err) {
    console.error("❌ 启动失败：", err);
    process.exit(1);
  }
}

// ========== 新增Render健康检查接口 ==========
app.get('/health', (req, res) => {
  res.send('ok');
});

// 首页返回留言板html页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

bootstrap();
