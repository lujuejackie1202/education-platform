import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { db, getSetting, hashPassword, nowIso, setSetting, verifyPassword } from './db.js';
import { CATEGORIES, ELECTIVES, GRADES, REGIONS, SUBJECTS, matchMajors } from './engine.js';
import { complete, draftQuestions, explainMatch, extractBrochure, llmConfig, llmReady } from './llm.js';
import { seedIfEmpty } from './seed.js';
import { ensureBank } from './bank.js';
import {
  accountPage, brochurePage, closedOutlinePage, downloadDocument, historyPage, importPage,
  loginPage, paperLockedPage, practiceHubPage, practiceOutlinePage, practicePage, questionDetailPage, questionsPage, recordPage, registerPage, reportPage, schoolsPage, settingsPage, wrongPage,
  studentForm, studentsPage, teacherHome, PAGE_SIZE,
} from './views.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = join(root, 'public', 'styles.css');
const PORT = Number(process.env.PORT || 3780);
const SEASON_END = '2027-06-30';
const electiveName = Object.fromEntries(ELECTIVES.map(([key, name]) => [name, key]));

seedIfEmpty();
ensureBank();

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error('内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const data = {};
      for (const [key, value] of new URLSearchParams(raw)) {
        if (data[key] === undefined) data[key] = value;
        else if (Array.isArray(data[key])) data[key].push(value);
        else data[key] = [data[key], value];
      }
      resolve(data);
    });
    req.on('error', reject);
  });
}

function many(data, key) {
  if (data[key] === undefined || data[key] === '') return [];
  return Array.isArray(data[key]) ? data[key] : [data[key]];
}

function cookieId(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'sid') return decodeURIComponent(rest.join('='));
  }
  return '';
}

function setSession(res, userId) {
  const id = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expires);
  res.setHeader('Set-Cookie', `sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

function currentUser(req) {
  const id = cookieId(req);
  if (!id) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(id, nowIso());
  return row || null;
}

function paid(user) {
  return Boolean(user?.paid_until && user.paid_until >= new Date().toISOString().slice(0, 10));
}

function like(text) {
  return `%${String(text).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function majorRows(q = '') {
  const pattern = like(q);
  return db.prepare(`
    SELECT m.*, s.name AS school_name, s.region, s.tier, s.year, s.formula_json, s.source_note
    FROM majors m JOIN schools s ON s.id = m.school_id
    WHERE m.status = 'published' AND s.status = 'published'
      AND (? = '' OR s.name LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR s.region LIKE ? ESCAPE '\\' OR m.category LIKE ? ESCAPE '\\')
    ORDER BY s.region, s.name, m.name
  `).all(q, pattern, pattern, pattern, pattern);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((item) => item.some((value) => value.trim()));
}

const HEADER_ALIAS = {
  年份: 'year', 学校: 'school', 地区: 'region', 办学: 'tier', 折算方式: 'formula_mode', 分值: 'points', 折算说明: 'formula_label',
  专业: 'major', 专业大类: 'category', 计划数: 'plan_num', 学考要求: 'xuekao_req', 选科: 'subject_req', 入围分: 'cutoff_score',
  入围年份: 'cutoff_year', 校测形式: 'test_form', 考纲: 'outline_status', 综合分: 'composite_rule',
  入口: 'kind', 模块: 'module', 题干: 'stem', 选项A: 'A', 选项B: 'B', 选项C: 'C', 选项D: 'D',
  答案: 'answer', 解析: 'explanation', 难度: 'difficulty', 状态: 'status',
};

function csvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((item) => HEADER_ALIAS[item.trim()] || item.trim());
  return rows.slice(1).filter((row) => row.some((cell) => String(cell || '').trim())).map((row) => Object.fromEntries(header.map((key, index) => [key, (row[index] || '').trim()])));
}

function xuekaoFrom(data) {
  const parts = [];
  if (GRADES.includes(data.floor)) parts.push(`ge:${data.floor}`);
  const count = Number(data.count_n);
  if (GRADES.includes(data.count_grade) && count > 0) parts.push(`minCount:${data.count_grade}:${count}`);
  for (const key of ['yu', 'shu', 'wai']) {
    if (GRADES.includes(data[`subj_${key}`])) parts.push(`${key}:${data[`subj_${key}`]}`);
  }
  if (data.xuekao_extra) parts.push(...String(data.xuekao_extra).split(';').map((part) => part.trim()).filter(Boolean));
  return parts.join(';');
}

function questionLists(schoolId = 0, majorId = 0, q = '') {
  const schools = db.prepare('SELECT id, name, year FROM schools ORDER BY name, year').all();
  const majors = db.prepare(`
    SELECT m.id, m.name, m.school_id, s.name AS school_name, s.year
    FROM majors m JOIN schools s ON s.id = m.school_id
    ORDER BY s.name, s.year, m.name
  `).all();
  const chosen = majors.find((major) => major.id === majorId);
  if (chosen && schoolId && chosen.school_id !== schoolId) majorId = 0;
  const pattern = like(q);
  const rows = db.prepare(`
    SELECT q.*, m.name AS major_name, m.id AS major_id, s.id AS school_id, s.name AS school_name
    FROM questions q JOIN majors m ON m.id = q.major_id JOIN schools s ON s.id = m.school_id
    WHERE (? = 0 OR s.id = ?)
      AND (? = 0 OR m.id = ?)
      AND (? = '' OR q.stem LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR IFNULL(q.module, '') LIKE ? ESCAPE '\\')
    ORDER BY s.name, m.name, q.kind, q.id
  `).all(schoolId, schoolId, majorId, majorId, q, pattern, pattern, pattern, pattern);
  return { schools, majors, rows, schoolId, majorId, q };
}

function questionBack(data) {
  const search = new URLSearchParams();
  if (data.return_school) search.set('school', data.return_school);
  if (data.return_major) search.set('major', data.return_major);
  if (data.return_q) search.set('q', data.return_q);
  if (Number(data.return_page) > 1) search.set('page', String(Number(data.return_page)));
  const text = search.toString();
  return text ? `/teacher/questions?${text}` : '/teacher/questions';
}

function deleteQuestion(id) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM attempts WHERE question_id = ?').run(id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function deleteMajor(id) {
  const major = db.prepare('SELECT id, school_id FROM majors WHERE id = ?').get(id);
  if (!major) return false;
  const questionIds = db.prepare('SELECT id FROM questions WHERE major_id = ?').all(id).map((row) => row.id);
  db.exec('BEGIN');
  try {
    if (questionIds.length) {
      db.prepare(`DELETE FROM attempts WHERE question_id IN (${questionIds.map(() => '?').join(',')})`).run(...questionIds);
    }
    db.prepare('DELETE FROM trial_sets WHERE major_id = ?').run(id);
    db.prepare('DELETE FROM questions WHERE major_id = ?').run(id);
    db.prepare('DELETE FROM majors WHERE id = ?').run(id);
    const left = db.prepare('SELECT COUNT(*) AS n FROM majors WHERE school_id = ?').get(major.school_id).n;
    if (!left) {
      db.prepare('UPDATE documents SET school_id = NULL WHERE school_id = ?').run(major.school_id);
      db.prepare('DELETE FROM schools WHERE id = ?').run(major.school_id);
    }
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function pointsFrom(text) {
  const points = {};
  for (const part of String(text).split('|')) {
    const match = part.trim().match(/^([A-E])\s*(\d+(?:\.\d+)?)$/);
    if (match) points[match[1]] = Number(match[2]);
  }
  for (const grade of GRADES) if (points[grade] === undefined) points[grade] = 0;
  return points;
}

function profileFrom(data) {
  const grades = {};
  for (const [key] of SUBJECTS) {
    const grade = data[`grade_${key}`];
    if (!GRADES.includes(grade)) return { error: '10 门学考都要选择等级' };
    grades[key] = grade;
  }
  const electives = many(data, 'electives').map((name) => electiveName[name]).filter(Boolean);
  if (electives.length !== 3) return { error: '自选需要正好 3 门' };
  const regions = many(data, 'regions').filter((item) => REGIONS.includes(item));
  const avoidRegions = many(data, 'avoid_regions').filter((item) => REGIONS.includes(item));
  const overlap = regions.filter((item) => avoidRegions.includes(item));
  if (overlap.length) return { error: `这些地区同时选了想去和不去：${overlap.join('、')}` };
  const categories = many(data, 'categories').filter((item) => CATEGORIES.includes(item));
  const height = data.height ? Number(data.height) : null;
  if (data.height && !Number.isFinite(height)) return { error: '身高请填数字' };
  return {
    profile: {
      grades, electives, regions, avoidRegions, categories,
      gender: data.gender === '男' || data.gender === '女' ? data.gender : '',
      heightCm: height,
      studentType: data.student_type === '中职' ? '中职' : '普高',
      colorVision: ['weak', 'unknown'].includes(data.color_vision) ? data.color_vision : 'normal',
      acceptPrivate: data.accept_private === '1',
      acceptCoop: data.accept_coop === '1',
      strategy: ['rush', 'safe'].includes(data.strategy) ? data.strategy : 'balance',
    },
  };
}

function publishedQuestions(majorId, kind) {
  return db.prepare(`
    SELECT * FROM questions WHERE major_id = ? AND kind = ? AND status = 'published' ORDER BY id
  `).all(majorId, kind);
}

function latestAttempts(userId) {
  const rows = db.prepare(`
    SELECT a.question_id, a.correct, q.major_id, q.kind
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ? AND q.status = 'published'
    ORDER BY a.id DESC
  `).all(userId);
  const seen = new Map();
  for (const row of rows) if (!seen.has(row.question_id)) seen.set(row.question_id, row);
  return seen;
}

function visibleQuestions(user, majorId, kind, { createTrial = false } = {}) {
  const published = publishedQuestions(majorId, kind);
  if (paid(user)) return { questions: published, limited: false, library: published.length };
  let trial = db.prepare('SELECT * FROM trial_sets WHERE user_id = ? AND major_id = ? AND kind = ?').get(user.id, majorId, kind);
  if (!trial && createTrial && published.length) {
    const ids = published.slice(0, 8).map((question) => question.id);
    db.prepare(`
      INSERT INTO trial_sets (user_id, major_id, kind, question_ids_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, majorId, kind, JSON.stringify(ids), nowIso());
    trial = { question_ids_json: JSON.stringify(ids) };
  }
  const ids = trial ? JSON.parse(trial.question_ids_json) : published.slice(0, 8).map((question) => question.id);
  return {
    questions: ids.map((id) => published.find((question) => question.id === id)).filter(Boolean),
    limited: true,
    library: published.length,
  };
}

function practiceStat(user, majorId, kind, attempts) {
  const set = visibleQuestions(user, majorId, kind);
  let done = 0;
  let right = 0;
  let wrong = 0;
  let next = set.questions.length;
  set.questions.forEach((question, index) => {
    const attempt = attempts.get(question.id);
    if (!attempt) {
      if (next === set.questions.length) next = index;
      return;
    }
    done += 1;
    if (attempt.correct) right += 1;
    else wrong += 1;
  });
  return { ...set, done, right, wrong, next, total: set.questions.length };
}

function practiceRows(user, q) {
  const pattern = like(q);
  const majors = db.prepare(`
    SELECT m.id, m.name, m.outline_status, s.name AS school_name, s.region, s.year
    FROM majors m JOIN schools s ON s.id = m.school_id
    WHERE m.status = 'published' AND s.status = 'published'
      AND (? = '' OR s.name LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR s.region LIKE ? ESCAPE '\\')
      AND EXISTS (SELECT 1 FROM questions q WHERE q.major_id = m.id AND q.status = 'published')
    ORDER BY s.name, m.name
  `).all(q, pattern, pattern, pattern);
  const attempts = latestAttempts(user.id);
  return majors.map((major) => ({
    ...major,
    history: practiceStat(user, major.id, 'history', attempts),
    current: practiceStat(user, major.id, 'current', attempts),
  }));
}

function gradeAnswer(question, choice) {
  const type = question.qtype || 'single';
  const expected = String(question.answer || '').trim();
  if (type === 'multi') {
    const fold = (value) => [...String(value).toUpperCase().replace(/[^A-D]/g, '')].sort().join('');
    return fold(choice).length > 0 && fold(choice) === fold(expected);
  }
  if (type === 'short') {
    const fold = (value) => String(value).replace(/\s/g, '').toLowerCase();
    const got = fold(choice);
    return expected.split('|').some((part) => {
      const key = fold(part);
      if (!key) return false;
      return key.length <= 2 ? got === key : got === key || got.includes(key);
    });
  }
  return String(choice).trim().toUpperCase() === expected.toUpperCase();
}

function choiceFrom(question, data) {
  const type = question.qtype || 'single';
  if (type === 'multi') return many(data, 'choice').join('');
  return String(data.choice || '').trim();
}

function storedPapers(majorId, kind, attempts) {
  return db.prepare(`
    SELECT * FROM papers WHERE major_id = ? AND kind = ? ORDER BY year, id
  `).all(majorId, kind).map((paper) => {
    const ids = JSON.parse(paper.question_ids_json);
    return { ...paper, total: ids.length, done: ids.filter((id) => attempts.has(id)).length };
  });
}

function todayAttempts(userId) {
  const start = `${new Date().toISOString().slice(0, 10)}T00:00:00`;
  const rows = db.prepare('SELECT correct FROM attempts WHERE user_id = ? AND created_at >= ?').all(userId, start);
  return { done: rows.length, right: rows.filter((row) => row.correct).length };
}

function practiceSummary(rows) {
  return rows.reduce((sum, row) => {
    for (const kind of ['history', 'current']) {
      sum.total += row[kind].total;
      sum.done += row[kind].done;
      sum.right += row[kind].right;
      sum.wrong += row[kind].wrong;
    }
    return sum;
  }, { total: 0, done: 0, right: 0, wrong: 0 });
}

function chapterStats(questions, attempts) {
  const groups = new Map();
  questions.forEach((question, index) => {
    const name = question.module || '未分模块';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ question, index });
  });
  return [...groups.entries()].map(([name, items]) => {
    let done = 0;
    let right = 0;
    items.forEach((item) => {
      const attempt = attempts.get(item.question.id);
      if (!attempt) return;
      done += 1;
      if (attempt.correct) right += 1;
    });
    const open = items.find((item) => !attempts.get(item.question.id)) || items[0];
    return { name, total: items.length, done, right, start: open.index };
  });
}

function paperStats(questions, attempts) {
  const papers = [];
  for (let start = 0; start < questions.length; start += 10) {
    const slice = questions.slice(start, start + 10);
    papers.push({
      n: papers.length + 1,
      total: slice.length,
      done: slice.filter((question) => attempts.get(question.id)).length,
    });
  }
  return papers;
}

function recordRows(userId) {
  return db.prepare(`
    SELECT a.id, a.correct, a.created_at, q.stem, q.kind, m.id AS major_id, m.name AS major_name, s.name AS school_name
    FROM attempts a
    JOIN questions q ON q.id = a.question_id
    JOIN majors m ON m.id = q.major_id
    JOIN schools s ON s.id = m.school_id
    WHERE a.user_id = ?
    ORDER BY a.id DESC
  `).all(userId);
}

function wrongRows(userId) {
  const ids = [...latestAttempts(userId).values()].filter((row) => !row.correct).map((row) => row.question_id);
  if (!ids.length) return [];
  const questions = db.prepare(`
    SELECT q.id, q.stem, q.kind, q.module, m.id AS major_id, m.name AS major_name, s.name AS school_name
    FROM questions q JOIN majors m ON m.id = q.major_id JOIN schools s ON s.id = m.school_id
    WHERE q.id IN (${ids.map(() => '?').join(',')})
  `).all(...ids);
  const order = new Map(ids.map((id, index) => [id, index]));
  return questions.sort((a, b) => order.get(a.id) - order.get(b.id));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const user = currentUser(req);
    if (url.pathname === '/styles.css') return send(res, 200, readFileSync(cssPath, 'utf8'), 'text/css; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/') return redirect(res, user?.role === 'teacher' ? '/teacher' : user ? '/student' : '/login');
    if (req.method === 'GET' && url.pathname === '/login') return send(res, 200, loginPage({ next: url.searchParams.get('next') || '/' }));
    if (req.method === 'GET' && url.pathname === '/register') return send(res, 200, registerPage({}));

    if (req.method === 'POST' && url.pathname === '/login') {
      const data = await readBody(req);
      const found = db.prepare('SELECT * FROM users WHERE phone = ?').get(String(data.phone || '').trim());
      if (!found || !verifyPassword(data.password || '', found.password_hash)) return send(res, 401, loginPage({ error: '手机号或密码不对' }));
      setSession(res, found.id);
      return redirect(res, found.role === 'teacher' ? '/teacher' : '/student');
    }
    if (req.method === 'POST' && url.pathname === '/demo') {
      const data = await readBody(req);
      const phone = data.role === 'teacher' ? '13800000001' : data.role === 'full' ? '13900000002' : '13900000001';
      const found = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (!found) return send(res, 400, loginPage({ error: '演示账号还没有生成' }));
      setSession(res, found.id);
      return redirect(res, found.role === 'teacher' ? '/teacher' : '/student');
    }
    if (req.method === 'POST' && url.pathname === '/register') {
      const data = await readBody(req);
      const phone = String(data.phone || '').trim();
      const name = String(data.name || '').trim();
      if (!/^1\d{10}$/.test(phone) || name.length < 1 || String(data.password || '').length < 6) {
        return send(res, 400, registerPage({ error: '请填写姓名、11 位手机号，密码至少 6 位' }));
      }
      try {
        const result = db.prepare(`
          INSERT INTO users (phone, name, password_hash, role, paid_until, created_at)
          VALUES (?, ?, ?, 'student', NULL, ?)
        `).run(phone, name, hashPassword(data.password), nowIso());
        setSession(res, Number(result.lastInsertRowid));
        return redirect(res, '/student');
      } catch {
        return send(res, 400, registerPage({ error: '这个手机号已经注册' }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      const id = cookieId(req);
      if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return redirect(res, '/login');
    }
    if (!user) return redirect(res, '/login');

    if (user.role === 'student') {
      if (req.method === 'GET' && url.pathname === '/student') return send(res, 200, studentForm({ user }));
      if (req.method === 'GET' && url.pathname === '/student/history') {
        const rows = db.prepare('SELECT id, created_at, results_json FROM analyses WHERE user_id = ? ORDER BY id DESC').all(user.id)
          .map((row) => ({ ...row, total: JSON.parse(row.results_json).results.length }));
        return send(res, 200, historyPage({ user, rows, page: url.searchParams.get('page') }));
      }
      const historyDelete = url.pathname.match(/^\/student\/history\/(\d+)\/delete$/);
      if (req.method === 'POST' && historyDelete) {
        const data = await readBody(req);
        db.prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?').run(Number(historyDelete[1]), user.id);
        const back = new URLSearchParams();
        if (Number(data.page) > 1) back.set('page', String(Number(data.page)));
        return redirect(res, `/student/history?${back}`);
      }
      if (req.method === 'GET' && url.pathname === '/student/account') return send(res, 200, accountPage({ user }));
      if (req.method === 'POST' && url.pathname === '/student/demo-pay') {
        db.prepare('UPDATE users SET paid_until = ? WHERE id = ?').run(SEASON_END, user.id);
        return redirect(res, '/student/account');
      }
      if (req.method === 'POST' && url.pathname === '/student/analyze') {
        const data = await readBody(req);
        const parsed = profileFrom(data);
        if (parsed.error) return send(res, 400, studentForm({ user, error: parsed.error }));
        const matched = matchMajors(majorRows(), parsed.profile);
        const counts = matched.results.reduce((sum, item) => {
          sum[item.band] += 1;
          if (item.cutoff === null) sum.missing += 1;
          if (item.outlineStatus !== 'published') sum.closed += 1;
          return sum;
        }, { high: 0, mid: 0, low: 0, unknown: 0, missing: 0, closed: 0 });
        let overview = '';
        try {
          overview = await explainMatch({
            year: 2026, total: matched.results.length, high: counts.high, mid: counts.mid,
            low: counts.low, unknown: counts.unknown, missingCutoff: counts.missing, excluded: matched.excludedCount, outlineClosed: counts.closed,
          });
        } catch { overview = ''; }
        const payload = { year: 2026, ...matched, overview };
        const result = db.prepare(`
          INSERT INTO analyses (user_id, profile_json, results_json, llm_overview, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(user.id, JSON.stringify(parsed.profile), JSON.stringify(payload), overview, nowIso());
        return redirect(res, `/student/report/${Number(result.lastInsertRowid)}`);
      }
      const reportMatch = url.pathname.match(/^\/student\/report\/(\d+)(\/download)?$/);
      if (req.method === 'GET' && reportMatch) {
        const analysis = db.prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?').get(Number(reportMatch[1]), user.id);
        if (!analysis) return send(res, 404, '没有这份结果');
        if (reportMatch[2]) {
          const file = downloadDocument(analysis).replace(/<link rel="stylesheet" href="\/styles\.css[^"]*">/, `<style>${readFileSync(cssPath, 'utf8')}</style>`);
          return send(res, 200, file, 'text/html; charset=utf-8', {
            'Content-Disposition': `attachment; filename="tizhao-report-${analysis.id}.html"`,
          });
        }
        return send(res, 200, reportPage({ user, analysis, paid: paid(user) }));
      }
      if (req.method === 'GET' && url.pathname === '/student/practice') {
        const q = url.searchParams.get('q') || '';
        const rows = practiceRows(user, q.trim());
        return send(res, 200, practiceHubPage({
          user, rows, page: url.searchParams.get('page'), q, paid: paid(user), today: todayAttempts(user.id), summary: practiceSummary(rows),
        }));
      }
      if (req.method === 'GET' && url.pathname === '/student/records') {
        return send(res, 200, recordPage({ user, rows: recordRows(user.id), page: url.searchParams.get('page') }));
      }
      if (req.method === 'GET' && url.pathname === '/student/wrong') {
        return send(res, 200, wrongPage({ user, rows: wrongRows(user.id), page: url.searchParams.get('page') }));
      }
      const practiceMatch = url.pathname.match(/^\/student\/practice\/(\d+)\/(history|current)$/);
      if (practiceMatch) {
        const major = db.prepare(`
          SELECT m.*, s.name AS school_name FROM majors m JOIN schools s ON s.id = m.school_id WHERE m.id = ?
        `).get(Number(practiceMatch[1]));
        if (!major) return send(res, 404, '没有这个专业');
        const kind = practiceMatch[2];
        if (kind === 'current' && major.outline_status !== 'published') return send(res, 200, closedOutlinePage({ user, major }));
        const posted = req.method === 'POST' ? await readBody(req) : null;
        const requestedMode = posted?.mode || url.searchParams.get('mode') || '';
        const mode = requestedMode === 'wrong' ? 'wrong' : 'all';
        const moduleName = String(posted?.module || url.searchParams.get('module') || '');
        const setNo = Number(posted?.set || url.searchParams.get('set') || 0);
        const paperId = Number(posted?.paper || url.searchParams.get('paper') || 0);
        const paper = paperId
          ? db.prepare('SELECT * FROM papers WHERE id = ? AND major_id = ? AND kind = ?').get(paperId, major.id, kind)
          : null;
        if (paperId && !paper) return send(res, 404, '没有这套卷');
        if (paper && !paid(user)) return send(res, 200, paperLockedPage({ user, major, paper }));
        const base = visibleQuestions(user, major.id, kind, { createTrial: mode !== 'wrong' && !paper });
        const attempts = latestAttempts(user.id);
        if (req.method === 'GET' && requestedMode === 'random') {
          const pool = paid(user) ? publishedQuestions(major.id, kind) : base.questions;
          if (!pool.length) return send(res, 200, practicePage({
            user, major, kind, questions: [], index: 0, paid: paid(user), limited: base.limited, library: base.library, mode: 'all', feedback: null,
          }));
          const pick = Math.floor(Math.random() * pool.length);
          return redirect(res, `${url.pathname}?n=${pick}`);
        }
        const outline = () => practiceOutlinePage({
          user, major, kind, paid: paid(user), limited: base.limited, library: base.library,
          chapters: chapterStats(base.questions, attempts),
          papers: storedPapers(major.id, kind, attempts),
        });
        if (req.method === 'GET' && url.searchParams.get('view') === 'chapters') return send(res, 200, outline());
        let questions = base.questions;
        if (paper) {
          const ids = JSON.parse(paper.question_ids_json);
          const found = db.prepare(`SELECT * FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
          const byId = new Map(found.map((question) => [question.id, question]));
          questions = ids.map((id) => byId.get(id)).filter(Boolean);
        } else if (mode === 'wrong') questions = questions.filter((question) => {
          const attempt = attempts.get(question.id);
          return attempt && !attempt.correct;
        });
        else if (moduleName) questions = questions.filter((question) => (question.module || '未分模块') === moduleName);
        else if (setNo > 0) questions = questions.slice((setNo - 1) * 10, setNo * 10);
        const locate = (n) => {
          const params = new URLSearchParams({ n: String(n) });
          if (mode === 'wrong') params.set('mode', 'wrong');
          if (moduleName) params.set('module', moduleName);
          if (setNo > 0) params.set('set', String(setNo));
          if (paper) params.set('paper', String(paper.id));
          return `${url.pathname}?${params}`;
        };
        const pageArgs = { user, major, kind, paid: paid(user), limited: paper ? false : base.limited, library: base.library, mode, moduleName, setNo, paper };
        if (posted) {
          const currentIndex = Number(posted.n || 0);
          const question = questions[currentIndex];
          const choice = question ? choiceFrom(question, posted) : '';
          if (!question || !choice) return redirect(res, locate(currentIndex));
          const correct = gradeAnswer(question, choice);
          db.prepare(`
            INSERT INTO attempts (user_id, question_id, choice, correct, created_at) VALUES (?, ?, ?, ?, ?)
          `).run(user.id, question.id, choice, correct ? 1 : 0, nowIso());
          return send(res, 200, practicePage({
            ...pageArgs, questions, index: currentIndex,
            feedback: { correct, answer: question.answer, explanation: question.explanation },
          }));
        }
        if (!url.searchParams.has('n') && mode === 'all' && !moduleName && !setNo && !paper) return send(res, 200, outline());
        return send(res, 200, practicePage({
          ...pageArgs, questions, index: Number(url.searchParams.get('n') || 0), feedback: null,
        }));
      }
    }

    if (user.role !== 'teacher') return send(res, 403, '学生账号不能打开教师页');
    if (req.method === 'GET' && url.pathname === '/teacher') {
      const stats = {
        schools: db.prepare('SELECT COUNT(*) AS n FROM schools').get().n,
        majors: db.prepare('SELECT COUNT(*) AS n FROM majors').get().n,
        published: db.prepare("SELECT COUNT(*) AS n FROM questions WHERE status = 'published'").get().n,
        drafts: db.prepare("SELECT COUNT(*) AS n FROM questions WHERE status = 'draft'").get().n,
        llm: llmReady(),
      };
      return send(res, 200, teacherHome({ user, stats }));
    }
    if (req.method === 'GET' && url.pathname === '/teacher/schools') {
      const q = url.searchParams.get('q') || '';
      return send(res, 200, schoolsPage({ user, rows: majorRows(q), q, page: url.searchParams.get('page'), savedId: Number(url.searchParams.get('saved') || 0), error: url.searchParams.get('error') || '' }));
    }
    const majorDelete = url.pathname.match(/^\/teacher\/majors\/(\d+)\/delete$/);
    if (req.method === 'POST' && majorDelete) {
      const data = await readBody(req);
      deleteMajor(Number(majorDelete[1]));
      const back = new URLSearchParams();
      if (data.q) back.set('q', data.q);
      if (Number(data.page) > 1) back.set('page', String(Number(data.page)));
      return redirect(res, `/teacher/schools?${back}`);
    }
    const majorSave = url.pathname.match(/^\/teacher\/majors\/(\d+)$/);
    if (req.method === 'POST' && majorSave) {
      const data = await readBody(req);
      const id = Number(majorSave[1]);
      const cutoff = data.cutoff_score === '' ? null : Number(data.cutoff_score);
      const year = data.cutoff_year === '' ? null : Number(data.cutoff_year);
      const back = new URLSearchParams();
      if (data.q) back.set('q', data.q);
      if (Number(data.page) > 1) back.set('page', String(Number(data.page)));
      if ((data.cutoff_score !== '' && !Number.isFinite(cutoff)) || (data.cutoff_year !== '' && !Number.isFinite(year))) {
        back.set('error', '入围分和年份要填数字，留空表示没有这项');
        return redirect(res, `/teacher/schools?${back}`);
      }
      db.prepare(`
        UPDATE majors SET cutoff_score = ?, cutoff_year = ?, xuekao_req = ?, outline_status = ? WHERE id = ?
      `).run(cutoff, year, xuekaoFrom(data), data.outline_status === 'unpublished' ? 'unpublished' : 'published', id);
      back.set('saved', String(id));
      return redirect(res, `/teacher/schools?${back}`);
    }
    if (req.method === 'GET' && url.pathname === '/teacher/import') return send(res, 200, importPage({ user }));
    if (req.method === 'GET' && url.pathname === '/teacher/import/template/majors') {
      return send(res, 200, '\uFEFF年份,学校,地区,办学,折算方式,分值,折算说明,专业,专业大类,计划数,学考要求,选科,入围分,入围年份,校测形式,考纲,综合分\n2027,示例学院,杭州,公办,selected6,A50|B40|C30|D20|E0,语数外加3门自选,软件技术,电子信息,40,,不限,230,2026,机测,published,\n', 'text/csv; charset=utf-8', {
        'Content-Disposition': 'attachment; filename="majors.csv"',
      });
    }
    if (req.method === 'GET' && url.pathname === '/teacher/import/template/questions') {
      return send(res, 200, '\uFEFF年份,学校,专业,入口,模块,题干,选项A,选项B,选项C,选项D,答案,解析,难度,状态\n2027,金华职业技术大学,软件技术,history,职业素养,示例题干,选项一,选项二,选项三,选项四,A,示例解析,3,draft\n', 'text/csv; charset=utf-8', {
        'Content-Disposition': 'attachment; filename="questions.csv"',
      });
    }
    if (req.method === 'POST' && url.pathname === '/teacher/import/majors') {
      const data = await readBody(req);
      const objects = csvObjects(data.csv);
      if (!objects.length) return send(res, 400, importPage({ user, error: '没有读到数据行。第一行需要是表头。' }));
      let count = 0;
      const upsertSchool = db.prepare(`
        INSERT INTO schools (name, region, tier, year, formula_json, source_note, status)
        VALUES (?, ?, ?, ?, ?, ?, 'published')
        ON CONFLICT(name, year) DO UPDATE SET region = excluded.region, tier = excluded.tier, formula_json = excluded.formula_json
      `);
      for (const item of objects) {
        if (!item.school || !item.major) continue;
        const year = Number(item.year || 2026);
        const formula = {
          mode: ['selected6', 'all10', 'weighted10'].includes(item.formula_mode) ? item.formula_mode : 'selected6',
          points: pointsFrom(item.points || 'A50|B40|C30|D20|E0'),
          label: item.formula_label || '教师导入的折算规则',
        };
        upsertSchool.run(item.school, item.region || '未填', item.tier || '', year, JSON.stringify(formula), '教师导入');
        const school = db.prepare('SELECT id FROM schools WHERE name = ? AND year = ?').get(item.school, year);
        const existing = db.prepare('SELECT id FROM majors WHERE school_id = ? AND name = ?').get(school.id, item.major);
        const values = [
          item.category || '未分类', Number(item.plan_num || 0), item.xuekao_req || 'ge:D', item.subject_req || '不限',
          item.test_form || '', item.outline_status === 'published' ? 'published' : 'unpublished',
          item.cutoff_score === '' ? null : Number(item.cutoff_score), item.cutoff_year === '' ? null : Number(item.cutoff_year),
          item.composite_rule || '',
        ];
        if (existing) {
          db.prepare(`
            UPDATE majors SET category=?, plan_num=?, xuekao_req=?, subject_req=?, test_form=?, outline_status=?, cutoff_score=?, cutoff_year=?, composite_rule=?
            WHERE id=?
          `).run(...values, existing.id);
        } else {
          db.prepare(`
            INSERT INTO majors (school_id, name, category, plan_num, xuekao_req, subject_req, test_form, outline_status, cutoff_score, cutoff_year, composite_rule, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
          `).run(school.id, item.major, ...values);
        }
        count += 1;
      }
      return send(res, 200, importPage({ user, message: `已处理 ${count} 行专业。` }));
    }
    if (req.method === 'POST' && url.pathname === '/teacher/import/questions') {
      const data = await readBody(req);
      const objects = csvObjects(data.csv);
      if (!objects.length) return send(res, 400, importPage({ user, error: '没有读到数据行。第一行需要是表头。' }));
      let count = 0;
      const missing = [];
      for (const item of objects) {
        const major = db.prepare(`
          SELECT m.id FROM majors m JOIN schools s ON s.id = m.school_id
          WHERE s.name = ? AND m.name = ?
        `).get(item.school, item.major);
        if (!major) { missing.push(`${item.school} ${item.major}`); continue; }
        db.prepare(`
          INSERT INTO questions (major_id, year, kind, module, stem, options_json, answer, explanation, difficulty, status, origin, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)
        `).run(
          major.id, Number(item.year || 2026), item.kind === 'current' ? 'current' : 'history', item.module || '',
          item.stem, JSON.stringify([item.A, item.B, item.C, item.D]), (item.answer || 'A').slice(0, 1).toUpperCase(),
          item.explanation || '', Number(item.difficulty || 3), item.status === 'published' ? 'published' : 'draft', nowIso(),
        );
        count += 1;
      }
      return send(res, 200, importPage({ user, message: `导入 ${count} 题。${missing.length ? `找不到专业：${missing.slice(0, 5).join('、')}` : ''}` }));
    }
    if (req.method === 'GET' && url.pathname === '/teacher/brochure') {
      const schools = db.prepare('SELECT id, name, year FROM schools ORDER BY year DESC, name').all();
      return send(res, 200, brochurePage({ user, schools }));
    }
    if (req.method === 'POST' && url.pathname === '/teacher/brochure/extract') {
      const data = await readBody(req);
      const schools = db.prepare('SELECT id, name, year FROM schools ORDER BY year DESC, name').all();
      try {
        const raw = await extractBrochure(data.body || '');
        const points = raw.points || {};
        const result = {
          documentId: Number(db.prepare(`
            INSERT INTO documents (year, doc_type, title, body, extract_json, status, created_at)
            VALUES (?, 'brochure', ?, ?, ?, 'draft', ?)
          `).run(Number(data.year || 2027), raw.school || '未命名简章', data.body, JSON.stringify(raw), nowIso()).lastInsertRowid),
          formula_label: raw.formula_label || '',
          formula_mode: raw.formula_mode || 'selected6',
          pointsText: GRADES.map((grade) => `${grade}${points[grade] ?? ''}`).join('|'),
          xuekao_req: raw.xuekao_req || '',
          test_form: raw.test_form || '',
          raw,
        };
        return send(res, 200, brochurePage({ user, schools, result }));
      } catch (error) {
        return send(res, 400, brochurePage({ user, schools, error: error.message }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/teacher/brochure/save') {
      const data = await readBody(req);
      const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(Number(data.school_id));
      if (!school) return redirect(res, '/teacher/brochure');
      const current = JSON.parse(school.formula_json);
      const parsedPoints = pointsFrom(data.points || '');
      const next = {
        ...current,
        mode: ['selected6', 'all10', 'weighted10'].includes(data.formula_mode) ? data.formula_mode : current.mode,
        points: GRADES.some((grade) => parsedPoints[grade] > 0) ? parsedPoints : current.points,
        label: data.formula_label || current.label,
      };
      db.prepare(`
        UPDATE schools SET formula_json = ?, source_note = ? WHERE id = ?
      `).run(JSON.stringify(next), '简章抽取后由教师确认', school.id);
      if (data.xuekao_req) {
        db.prepare(`UPDATE majors SET xuekao_req = ?, test_form = CASE WHEN ? != '' THEN ? ELSE test_form END WHERE school_id = ?`)
          .run(data.xuekao_req, data.test_form || '', data.test_form || '', school.id);
      }
      db.prepare("UPDATE documents SET status = 'published', school_id = ? WHERE id = ?").run(school.id, Number(data.document_id));
      return redirect(res, '/teacher/schools');
    }
    if (req.method === 'GET' && url.pathname === '/teacher/questions') {
      const filters = questionLists(Number(url.searchParams.get('school') || 0), Number(url.searchParams.get('major') || 0), url.searchParams.get('q') || '');
      return send(res, 200, questionsPage({ user, ...filters, page: url.searchParams.get('page'), message: url.searchParams.get('message') || '' }));
    }
    const questionDelete = url.pathname.match(/^\/teacher\/questions\/(\d+)\/delete$/);
    if (req.method === 'POST' && questionDelete) {
      const data = await readBody(req);
      deleteQuestion(Number(questionDelete[1]));
      return redirect(res, questionBack(data));
    }
    const questionView = url.pathname.match(/^\/teacher\/questions\/(\d+)$/);
    if (req.method === 'GET' && questionView) {
      const question = db.prepare(`
        SELECT q.*, m.name AS major_name, s.name AS school_name
        FROM questions q JOIN majors m ON m.id = q.major_id JOIN schools s ON s.id = m.school_id
        WHERE q.id = ?
      `).get(Number(questionView[1]));
      if (!question) return send(res, 404, '没有这道题');
      return send(res, 200, questionDetailPage({
        user,
        question,
        back: { school: url.searchParams.get('school') || '', major: url.searchParams.get('major') || '', q: url.searchParams.get('q') || '', page: url.searchParams.get('page') || '' },
      }));
    }
    if (req.method === 'POST' && questionView) {
      const data = await readBody(req);
      const existing = db.prepare('SELECT qtype FROM questions WHERE id = ?').get(Number(questionView[1]));
      const qtype = existing?.qtype || 'single';
      let options = [data.option_a, data.option_b, data.option_c, data.option_d].map((item) => String(item || '').trim());
      let answer = String(data.answer || '').trim();
      if (qtype === 'short') {
        options = [];
      } else if (qtype === 'multi') {
        answer = answer.toUpperCase().replace(/[^A-D]/g, '');
      } else {
        answer = answer.slice(0, 1).toUpperCase();
      }
      const invalid = !String(data.stem || '').trim() || !answer
        || (qtype !== 'short' && options.filter(Boolean).length < 2)
        || ((qtype === 'single' || qtype === 'judge') && !'ABCD'.includes(answer));
      if (invalid) {
        const question = db.prepare(`
          SELECT q.*, m.name AS major_name, s.name AS school_name
          FROM questions q JOIN majors m ON m.id = q.major_id JOIN schools s ON s.id = m.school_id
          WHERE q.id = ?
        `).get(Number(questionView[1]));
        return send(res, 400, questionDetailPage({
          user,
          question: question ? { ...question, ...data, options_json: JSON.stringify(options), stem: data.stem || '' } : { id: questionView[1], stem: '', options_json: '[]', school_name: '', major_name: '' },
          back: { school: data.return_school || '', major: data.return_major || '', q: data.return_q || '', page: data.return_page || '' },
          error: '题干、四个选项和答案都要填。',
        }));
      }
      db.prepare(`
        UPDATE questions
        SET stem = ?, options_json = ?, answer = ?, explanation = ?, module = ?, kind = ?, status = ?
        WHERE id = ?
      `).run(
        data.stem.trim(),
        JSON.stringify(options),
        answer,
        data.explanation || '',
        data.module || '',
        data.kind === 'current' ? 'current' : 'history',
        data.status === 'draft' ? 'draft' : 'published',
        Number(questionView[1]),
      );
      const back = new URL(questionBack(data), 'http://local');
      back.searchParams.set('message', '题目已保存');
      return redirect(res, `${back.pathname}${back.search}`);
    }
    if (req.method === 'POST' && url.pathname === '/teacher/questions/draft') {
      const data = await readBody(req);
      const major = db.prepare(`
        SELECT m.*, s.id AS school_id, s.name AS school_name FROM majors m JOIN schools s ON s.id = m.school_id WHERE m.id = ?
      `).get(Number(data.major_id));
      const filters = questionLists(Number(data.return_school || major?.school_id || 0), Number(data.major_id || 0), data.return_q || '');
      if (!major) return send(res, 400, questionsPage({ user, ...filters, error: '没有这个专业' }));
      try {
        const items = await draftQuestions(major);
        for (const item of items) {
          const options = Array.isArray(item.options) ? item.options.slice(0, 4) : [];
          while (options.length < 4) options.push('（空）');
          db.prepare(`
            INSERT INTO questions (major_id, year, kind, module, stem, options_json, answer, explanation, difficulty, status, origin, created_at)
            VALUES (?, 2026, 'current', ?, ?, ?, ?, ?, ?, 'draft', 'llm', ?)
          `).run(major.id, item.module || '', item.stem || '未命题干', JSON.stringify(options), String(item.answer || 'A').slice(0, 1).toUpperCase(), item.explanation || '', Number(item.difficulty || 3), nowIso());
        }
        const listed = questionLists(major.school_id, major.id, '');
        const lastPage = Math.max(1, Math.ceil(listed.rows.length / PAGE_SIZE));
        const back = new URL(`/teacher/questions?school=${major.school_id}&major=${major.id}`, 'http://local');
        if (lastPage > 1) back.searchParams.set('page', String(lastPage));
        back.searchParams.set('message', `已为${major.school_name}${major.name}起草 ${items.length} 道待审题`);
        return redirect(res, `${back.pathname}${back.search}`);
      } catch (error) {
        return send(res, 400, questionsPage({ user, ...filters, error: error.message }));
      }
    }
    if (req.method === 'GET' && url.pathname === '/teacher/students') {
      const q = url.searchParams.get('q') || '';
      const pattern = like(q);
      const rows = db.prepare(`
        SELECT * FROM users
        WHERE role = 'student' AND (? = '' OR name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
        ORDER BY id DESC
      `).all(q, pattern, pattern);
      return send(res, 200, studentsPage({ user, rows, q, page: url.searchParams.get('page') }));
    }
    const grant = url.pathname.match(/^\/teacher\/students\/(\d+)\/grant$/);
    if (req.method === 'POST' && grant) {
      const data = await readBody(req);
      db.prepare('UPDATE users SET paid_until = ? WHERE id = ? AND role = \'student\'').run(SEASON_END, Number(grant[1]));
      const back = new URLSearchParams();
      if (data.q) back.set('q', data.q);
      if (Number(data.page) > 1) back.set('page', String(Number(data.page)));
      return redirect(res, `/teacher/students?${back}`);
    }
    if (req.method === 'GET' && url.pathname === '/teacher/settings') return send(res, 200, settingsPage({ user, config: llmConfig() }));
    if (req.method === 'POST' && url.pathname === '/teacher/settings') {
      const data = await readBody(req);
      setSetting('LLM_BASE_URL', data.LLM_BASE_URL || '');
      setSetting('LLM_MODEL', data.LLM_MODEL || '');
      if (data.LLM_API_KEY) setSetting('LLM_API_KEY', data.LLM_API_KEY);
      return send(res, 200, settingsPage({ user, config: llmConfig(), message: '已保存' }));
    }
    if (req.method === 'POST' && url.pathname === '/teacher/settings/test') {
      try {
        const text = await complete('只回复 ok', 'ping');
        return send(res, 200, settingsPage({ user, config: llmConfig(), message: `连接成功：${text.slice(0, 80)}` }));
      } catch (error) {
        return send(res, 400, settingsPage({ user, config: llmConfig(), error: error.message }));
      }
    }
    send(res, 404, '没有这个页面');
  } catch (error) {
    send(res, 500, `页面出错：${error.message}`);
  }
});

const HOST = process.env.HOST || '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`ready http://${HOST}:${PORT}`);
});
