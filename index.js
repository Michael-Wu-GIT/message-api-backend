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
  ssl: process.env.PGSSL === 'false' ? false : {
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

    // 健壮迁移：兼容历史遗留表。先确认 name 列是否存在再回填，
    // 否则纯 company_name 结构的新表会因引用不存在的列而启动失败。
    const { rows: legacyNameRows } = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'messages'
        AND column_name = 'name'
    `);
    const hasLegacyNameColumn = legacyNameRows.length > 0;
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS company_name VARCHAR(100)');
    if (hasLegacyNameColumn) {
      await pool.query('UPDATE messages SET company_name = name WHERE company_name IS NULL AND name IS NOT NULL');
    }
    await pool.query("UPDATE messages SET company_name = '未知' WHERE company_name IS NULL");
    await pool.query('ALTER TABLE messages ALTER COLUMN company_name SET NOT NULL');

    const currentColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'messages'
        AND column_name IN ('name', 'company_name')
    `);
    const currentColumnNames = new Set(currentColumns.rows.map(row => row.column_name));
    legacyNameColumn = currentColumnNames.has('name');

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
    // 动态 INSERT：按当前实际表结构构建，兼容任意历史改造过的表。
    const { rows: columns } = await pool.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'messages'
      ORDER BY ordinal_position
    `);

    const insertColumns = [];
    const insertValues = [];
    for (const column of columns) {
      if (column.column_name === 'id') continue;
      if (column.column_name === 'company_name' || column.column_name === 'name') {
        insertColumns.push(column.column_name);
        insertValues.push(companyName);
        continue;
      }
      if (column.column_name === 'content') {
        insertColumns.push(column.column_name);
        insertValues.push(content);
        continue;
      }
      // 未识别的列：仅当必填且无默认值时干预，否则交给数据库默认值填
      if (column.is_nullable === 'NO' && !column.column_default) {
        throw new Error(`messages 表存在未知必填字段：${column.column_name}，请人工处理`);
      }
    }

    const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO messages (${insertColumns.join(', ')})
       VALUES (${placeholders})
       RETURNING id, company_name, content, created_at`,
      insertValues
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('保存留言失败：', err);
    res.status(500).json({ error: '留言保存失败' });
  }
});

bootstrap();
