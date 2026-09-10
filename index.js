const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

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
    // 测试数据库连通
    await pool.query('SELECT 1');
    console.log("✅ 数据库连接成功");

    // 创建messages表
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

    // 全部就绪，才启动服务
    app.listen(PORT, () => {
      console.log(`🚀 服务启动，端口：${PORT}`);
    });

  } catch (err) {
    console.error("❌ 启动失败：", err);
    process.exit(1);
  }
}

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

bootstrap();
