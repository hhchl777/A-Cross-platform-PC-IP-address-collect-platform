// server.js
const https = require('https');
const express = require('express');
const sessions = require('express-session');
const redis = require('redis');
const { spawn } = require('child_process');

const path = require('path');
const fs = require('fs');
const mysqlx = require('@mysql/xdevapi');

const app = express();
const PORT = process.env.PORT || 443;

// 设置HTML文件路径
const loginpage = path.join(__dirname, 'login.html');
const regpage = path.join(__dirname, 'reg.html');
const adminpage = path.join(__dirname, 'info.html');
const userpage = path.join(__dirname, 'user.html');

// 中间件：记录请求日志
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 创建Redis客户端
const client = redis.createClient({
    url: 'redis://localhost:6379'
});

// 连接Redis
client.connect().catch(console.error);
client.flushAll();

// 1. 先使用session中间件（在路由之前！）
app.use(sessions({
    name: 'app_session',
    secret: 'sdfs465f41$#@2f56dg@!FDRQE#fds41564fr44we86', // 改为你自己的长随机字符串
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 20 * 60 * 1000 // 10 minutes
    }
}));

// 处理根路径请求，返回HTML文件
app.get('/', (req, res) => {
    res.sendFile(loginpage);
});

app.get('/register', (req, res) => {
    res.sendFile(regpage);
});

app.get('/admin', (req, res) => {
    //if (!req.session.user) {
      //return res.redirect(loginpage)
    //}
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/')
    }
    res.sendFile(adminpage)
});

app.get('/user', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') {
        return res.redirect('/')
    }

    res.sendFile(userpage);
})

app.get('/download/70124/winclient', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', 'winclient.zip');
  // 使用Express内置方法 - 最简洁
  res.download(filePath, 'winclient.zip', (err) => {
  });
});

app.get('/download/79958/unixclient', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', 'unixclient.zip');
  // 使用Express内置方法 - 最简洁
  res.download(filePath, 'unixclient.zip', (err) => {
  });
});

// 中间件配置
app.use(express.json()); // 解析 JSON
app.use(express.urlencoded({ extended: true })); // 解析表单数据

// 生成验证码
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 保存验证码到Redis（5分钟有效期）
async function saveVerificationCode(email, code) {
    try {
        const key = `verification:${email}`;
        await client.setEx(key, 300, code); // 300秒 = 5分钟
        console.log(`验证码已保存: ${email} -> ${code}`);
        return true;
    } catch (error) {
        console.error('保存验证码失败:', error);
        return false;
    }
}

function sendMail({ to, subject, text }) {
  return new Promise((resolve, reject) => {
    const sendmail = spawn('/usr/sbin/sendmail', ['-t', '-i']);

    let error = '';
    sendmail.stderr.on('data', d => error += d.toString());

    sendmail.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(error || `sendmail exit ${code}`));
    });

    const msg =
`To: ${to}
From: postmaster@example.com
Subject: ${subject}
Content-Type: text/plain; charset=utf-8

${text}
`;

    sendmail.stdin.write(msg);
    sendmail.stdin.end();
  });
}

// POST 路由
app.post('/api/send_code', express.json(), async (req, res) => {
    const ip = req.headers['cf-connecting-ip'];
    const key = `send:${ip}`;
    const issend = await client.get(key);

    if (issend === 'true') {
        return res.status(403).json({
            code: 335,
            success: false
        });
    }
    const { email } = req.body;

    // 2. 查询用户（示例，自己替换）
    try {
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });

        const schema = session.getSchema('mydb');
        const table = schema.getTable('users');

        const result = await table
            .select(['id', 'email', 'password'])
            .where('email = '+ '"' + email + '"')
            .execute();

        const rows = result.fetchAll();

        if (rows.length > 0){
            return res.status(200).json({
                code: 210,
                success: false
            })
        }
    } catch (err) {
        console.error(err);
    } finally {
        if (session) {
            await session.close();
        }
    }

    if (!email) {
        return res.status(400).json({ error: '邮箱不能为空' });
    }

    const code = generateVerificationCode();
    const saved = await saveVerificationCode(email, code);
    await client.setEx(key, 90, 'true')

    if (saved) {
        // 这里应该调用邮件服务发送验证码
        // 用法
        sendMail({
            to: email,
            subject: 'pudding验证码',
            text: `您注册的验证码为: ${code}`
        });
        res.json({
            success: true,
            message: '验证码已发送',
        });
    } else {
        res.status(500).json({ error: '发送验证码失败' });
    }

});

app.post('/api/verify_code', express.json(), async (req, res) => {
    const ip = req.headers['cf-connecting-ip'];
    console.log(ip);
    const key = `block:${ip}`;
    const attemptsKey = `attempts:${ip}`;
    const attempts = await client.get(attemptsKey);
    if (attempts >= 5) {
        // 封锁 time seconds
        await client.setEx(key, 300, 'blocked');
        await client.del(attemptsKey);
    }
    const blocked = await client.get(key);
    if (blocked) {
        return res.json({
            code: 2,
            success: false
        })
    }

    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ error: '参数不完整' });
    }
    let rescode;
    try {
        const key = `verification:${email}`;
        const storedCode = await client.get(key);

        if (storedCode === code) {
            req.session.user = {
                reg: 'true'
            }
            // 验证成功后删除验证码，防止重复使用
            await client.del(key);
            rescode = 0;
        } else {
            await client.incr(attemptsKey);
            rescode = 1;
        }
    } catch (error) {
        console.error('验证失败:', error);
    }

    res.json({
        code: rescode
    });
});

function getMySQLDatetime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

app.post('/api/register', async (req, res) => {
    if (!req.session.user.reg) {
        return res.json({
            message: '非法访问'
        })
    }
    const { email, password, code } = req.body
    // 1. 基本校验
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: '参数不完整'
        })
    }
    try{
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });
        const schema = session.getSchema('mydb');
        const table = schema.getTable('users');
        const date = getMySQLDatetime();

        const result1 = await table
            .insert(['email', 'password', 'login_time'])
            .values([email, password, date])
            .execute();

        res.json({
            success: true
        })
    } catch (err) {
        console.error(err);
    } finally {
        if (session) {
            await session.close();
        }
    }
});

app.post('/api/login', async (req, res) => {
    const ip = req.headers['cf-connecting-ip'];
    console.log(ip);
    const { email, password } = req.body
    const key = `block:${ip}`;
    const attemptsKey = `attempts:${ip}`;
    const attempts = await client.get(attemptsKey);
    if (attempts >= 5) {
        // 封锁 time seconds
        await client.setEx(key, 300, 'blocked');
        await client.del(attemptsKey);
    }
    const blocked = await client.get(key);
    if (blocked) {
        return res.json({
            code: 2,
            success: false
        })
    }

    // 1. 基本校验
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '参数不完整'
      })
    }
  
    // 2. 查询用户（示例，自己替换）
    try {
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });

        const schema = session.getSchema('mydb');
        const table = schema.getTable('users');
        const date = getMySQLDatetime();

        const result = await table
            .select(['id', 'email', 'password'])
            .where('email = '+ '"' + email + '"')
            .execute();

        const rows = result.fetchAll();

        if (rows.length === 0){
            await client.incr(attemptsKey);
            return res.json({
                code: 1,
                success: false
            })
        } else if (password !== rows[0][2]) {
            await client.incr(attemptsKey);
            return res.json({
                code: 1,
                success: false,
            })
        } else if (email === 'admin@admin.com') {
            req.session.user = {
                id: rows[0][0],
                role: 'admin'
            }
            res.json({
                node: 1,
                success: true
            })
        } else {
            req.session.user = {
                id: rows[0][0],
                role: 'user'
            }
            res.json({
                node: 2,
                success: true
            })
        }
        await table.update()
            .where('id=' + rows[0][0])
            .set('login_time', date)
            .execute();


    } catch (err) {
        console.error(err);
        res.status(500).json({
            code: 1,
            message: '数据库查询失败'
        });
    } finally {
        if (session) {
            await session.close();
        }
    }
});

// 登出路由
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: '登出失败' });
        }
        res.clearCookie('app_session'); // 默认的 session cookie 名称
        res.json({ message: '登出成功' });
    });
});

app.post('/api/chpass', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/')
    }

    const { oldPwd, newPwd } = req.body
    if (!oldPwd || !newPwd ) {
        return res.status(400).json({
            success: false,
        })
    }
    const id = req.session.user.id;
    try {
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });

        const schema = session.getSchema('mydb');
        const table = schema.getTable('users');

        const result0 = await table
            .select(['id', 'password'])
            .where('id = '+ '"' + id + '"')
            .execute();

        const rows0 = result0.fetchAll();
        if (oldPwd !== rows0[0][1]) {
            return res.json({
                code: 1,
                success: false,
            })
        } else {
            await table.update()
                .where('id=' + id)
                .set('password', newPwd)
                .execute();
            res.json({
                code: 0,
                success: true
            })
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({
            code: 1,
            message: '数据库查询失败'
        });
    } finally {
        if (session) {
            await session.close();
        }
    }
})

// 查询用户接口
app.get('/api/users', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/')
    }

    try {
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });

        const schema = session.getSchema('mydb');
        const table = schema.getTable('users');

        const result = await table
            .select(['id', 'email', 'login_time'])
            .execute();

        const rows = result.fetchAll();

        const jsonr = rows.map(row => ({
            id: row[0],
            email: row[1],
            update_time: row[2]
        }));

        // ⭐ 关键：返回给浏览器
        res.json(jsonr);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            code: 1,
            message: '数据库查询失败'
        });
    } finally {
        if (session) {
            await session.close();
        }
    }
});

// 查询用户接口
app.get('/api/devices', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/')
    }

    try {
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });

        const schema = session.getSchema('mydb');
        const table = schema.getTable('devices');

        if (req.session.user.role === 'admin'){
            const result = await table
                .select(['id', 'name', 'ip', 'owner_id', 'update_time'])
                .execute();

            const rows = result.fetchAll();

            const jsonr = rows.map(row => ({
                id: row[0],
                name: row[1],
                ip: row[2],
                owner_id: row[3],
                update_time: row[4]
            }));
            // ⭐ 关键：返回给浏览器
            res.json(jsonr);
        } else {
            const result = await table
                .select(['id', 'name', 'ip', 'update_time'])
                .where('owner_id=' + req.session.user.id)
                .execute();

            const rows = result.fetchAll();

            const jsonr = rows.map(row => ({
                id: row[0],
                name: row[1],
                ip: row[2],
                update_time: row[3]
            }));
            // ⭐ 关键：返回给浏览器
            res.json(jsonr);
        }
    } catch (err) {
        console.error(err);
    } finally {
        if (session) {
            await session.close();
        }
    }
});

app.post('/api/updatedevice', async (req, res) => {
    const { email, password, devicename } = req.body
    const ip = req.headers['cf-connecting-ip'];
    if (ip.length > 18) {
        return res.json({
            code: 474,
            success: false
        })
    }
    const key = `block:${ip}`;
    const attemptsKey = `attempts:${ip}`;
    const attempts = await client.get(attemptsKey);
    if (attempts >= 5) {
        // 封锁 time seconds
        await client.setEx(key, 300, 'blocked');
        await client.del(attemptsKey);
    }
    const blocked = await client.get(key);
    if (blocked) {
        return res.json({
            code: 2,
            success: false
        })
    }

    // 1. 基本校验
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: '参数不完整'
        })
    }

    // 2. 查询用户（示例，自己替换）
    try {
        session = await mysqlx.getSession({
            host: 'localhost',
            port: 33060,
            user: 'pudding',
            password: 'Csal6661!'
        });

        const schema = session.getSchema('mydb');
        const table = schema.getTable('users');

        const result = await table
            .select(['id', 'email', 'password'])
            .where('email = '+ '"' + email + '"')
            .execute();

        const rows = result.fetchAll();

        if (rows.length === 0){
            await client.incr(attemptsKey);
            return res.json({
                code: 1,
                success: false,
            })
        } else if (password !== rows[0][2]) {
            await client.incr(attemptsKey);
            return res.json({
                code: 1,
                success: false,
            })
        } else {
            const date = getMySQLDatetime();
            await table.update()
                .where('id=' + rows[0][0])
                .set('login_time', date)
                .execute();

            const table1 = schema.getTable('devices');
            const result1 = await table1
                .select(['id'])
                .where('name= '+ '"' + devicename + '"' + ' and owner_id=' + '"' + rows[0][0] + '"')
                .execute();
            const rows1 = result1.fetchAll();
            if (rows1.length === 0) {
                await table1
                    .insert(['name', 'ip', 'owner_id', 'update_time'])
                    .values([devicename, ip, rows[0][0], date])
                    .execute();
            } else {
                await table1.update()
                    .where('id=' + rows1[0][0])
                    .set('ip', ip)
                    .set('update_time', date)
                    .execute();
            }
            res.json({
                code: 0,
                success: true
            })
        }
    } catch (err) {
        console.error(err);
    } finally {
        if (session) {
            await session.close();
        }
    }
});

// 可选：处理其他静态文件（CSS、JS、图片等）
app.use(express.static(path.join(__dirname, 'public')));

// 处理404错误
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>页面未找到</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #ff4444; }
                a { color: #0066cc; text-decoration: none; }
            </style>
        </head>
        <body>
            <h1>404 - 页面未找到</h1>
            <p>请求的页面不存在</p>
            <p><a href="/">返回首页</a></p>
        </body>
        </html>
    `);
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err.stack);
    res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>服务器错误</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #ff4444; }
            </style>
        </head>
        <body>
            <h1>500 - 服务器内部错误</h1>
            <p>抱歉，服务器出现了问题</p>
        </body>
        </html>
    `);
});

// 读取证书文件
const options = {
    key: fs.readFileSync('./server.key'),
    cert: fs.readFileSync('./server.crt'),
};

// 创建HTTPS服务器
https.createServer(options, app).listen(443, () => {
    console.log('HTTPS服务器运行在 https://localhost:443');
    console.log(`📁 服务目录: ${__dirname}`);
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
    console.log(`📄 首页文件: ${loginpage}`);
    console.log(`🔄 按 Ctrl+C 停止服务器`);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务器...');
    process.exit(0);
});