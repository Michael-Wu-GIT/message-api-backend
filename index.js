const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_CONTENT_LENGTH = 5000;
let legacyNameColumn = false;

app.use(cors());
app.use(express.json());

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 未配置，服务拒绝启动');
}

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

    await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      company_name VARCHAR(100),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);

    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'messages'
        AND column_name IN ('name', 'company_name')
    `);
    const columnNames = new Set(columns.rows.map(row => row.column_name));

    // 兼容旧版使用 name 字段创建的 messages 表，避免历史留言丢失。
    if (columnNames.has('name') && !columnNames.has('company_name')) {
      await pool.query('ALTER TABLE messages ADD COLUMN company_name VARCHAR(100)');
      await pool.query('UPDATE messages SET company_name = name WHERE company_name IS NULL');
    }

    const currentColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'messages'
        AND column_name IN ('name', 'company_name')
    `);
    const currentColumnNames = new Set(currentColumns.rows.map(row => row.column_name));
    legacyNameColumn = currentColumnNames.has('name');

    if (currentColumnNames.has('company_name')) {
      await pool.query('ALTER TABLE messages ALTER COLUMN company_name SET NOT NULL');
    }

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
    const result = await pool.query(`
      SELECT id, company_name, content, created_at
      FROM messages
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('获取留言失败：', err);
    res.status(500).json({ error: '获取留言失败' });
  }
});

// 新增留言
app.post('/api/messages', async (req, res) => {
  const companyName = String(
    req.body.companyName || req.body.company || req.body.name || ''
  ).trim();
  const content = String(req.body.content || '').trim();

  if (!companyName || !content) {
    res.status(400).json({ error: '公司名和留言内容不能为空' });
    return;
  }
  if (companyName.length > 100 || content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: '公司名或留言内容超过长度限制' });
    return;
  }

  try {
    const result = legacyNameColumn
      ? await pool.query(
          `INSERT INTO messages(name, company_name, content)
           VALUES($1, $1, $2)
           RETURNING id, company_name, content, created_at`,
          [companyName, content]
        )
      : await pool.query(
          `INSERT INTO messages(company_name, content)
           VALUES($1, $2)
           RETURNING id, company_name, content, created_at`,
          [companyName, content]
        );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('保存留言失败：', err);
    res.status(500).json({ error: '留言保存失败' });
  }
});

bootstrap();
