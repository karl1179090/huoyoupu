import {readFile, stat} from 'node:fs/promises';
import {createDatabase} from '@huoyoupu/database';
import {initializeAdministrator} from './service.js';
import {AppError} from '../../lib/errors.js';
const url = process.env.DATABASE_URL;
const loginName = process.env.HYP_ADMIN_LOGIN;
const passwordFile = process.env.HYP_ADMIN_PASSWORD_FILE;
if (!url || !loginName || !passwordFile) throw new Error('需要 DATABASE_URL、HYP_ADMIN_LOGIN 和 HYP_ADMIN_PASSWORD_FILE');
const info = await stat(passwordFile);
if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new Error('密码文件必须仅由当前用户读写（0600）');
const password = (await readFile(passwordFile, 'utf8')).replace(/\r?\n$/, '');
const {pool} = createDatabase(url);
try {
  const user = await initializeAdministrator(pool, {loginName, password});
  console.log(`管理员已初始化：${user.id}`);
} catch (error) {
  console.error(error instanceof AppError ? error.message : '初始化失败，请检查数据库和运行配置');
  process.exitCode = 1;
} finally {await pool.end();}
