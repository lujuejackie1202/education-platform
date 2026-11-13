import { CATEGORIES, ELECTIVES, GRADES, REGIONS, SUBJECTS } from './engine.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

export const PAGE_SIZE = 36;

function slicePage(rows, requested) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const page = Math.min(pages, Math.max(1, Number(requested) || 1));
  const start = (page - 1) * PAGE_SIZE;
  return { page, pages, total, rows: rows.slice(start, start + PAGE_SIZE) };
}

function pager(path, page, pages, total) {
  const href = (n) => {
    const url = new URL(path, 'http://local');
    if (n > 1) url.searchParams.set('page', String(n));
    else url.searchParams.delete('page');
    return `${url.pathname}${url.search}`;
  };
  const links = [`<span>共 ${total} 条 · 每页 ${PAGE_SIZE} 条 · 第 ${page} / ${pages} 页</span>`];
  if (pages > 1) {
    if (page > 1) links.push(`<a href="${href(page - 1)}">上一页</a>`);
    const end = Math.min(pages, Math.max(page + 2, 5));
    const start = Math.max(1, end - 4);
    for (let n = start; n <= Math.min(pages, start + 4); n += 1) {
      links.push(n === page ? `<b>${n}</b>` : `<a href="${href(n)}">${n}</a>`);
    }
    if (page < pages) links.push(`<a href="${href(page + 1)}">下一页</a>`);
  }
  return `<nav class="pager">${links.join('')}</nav>`;
}

export function layout({ title, user, body }) {
  const links = !user
    ? ''
    : user.role === 'teacher'
      ? `<a href="/teacher">总览</a><a href="/teacher/schools">学校专业</a><a href="/teacher/import">导入</a><a href="/teacher/brochure">简章</a><a href="/teacher/questions">题库</a><a href="/teacher/students">学生</a><a href="/teacher/settings">模型</a>`
      : `<a href="/student">填写学考</a><a href="/student/practice">题库练习</a><a href="/student/records">做题记录</a><a href="/student/wrong">错题</a><a href="/student/history">我的结果</a><a href="/student/account">开通</a>`;
  const session = user
    ? `<span>${esc(user.name)}</span><form method="post" action="/logout"><button class="text-btn" type="submit">退出</button></form>`
    : `<a href="/login">登录</a>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/styles.css?v=papers">
</head>
<body>
  <div class="wrap">
    <header class="top no-print">
      <a class="brand" href="/"><b>优易升学</b><span>高职提前招生</span></a>
      <nav>${links}${session}</nav>
    </header>
    <main class="page">${body}</main>
    <footer class="campus">
      <p>优易升学 · 高职提前招生</p>
      <svg viewBox="0 0 1200 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <line x1="40" y1="18" x2="1160" y2="18" stroke="#c4a15a" stroke-width="1"/>
        <g fill="none" stroke="#163044" stroke-width="1.25" stroke-linejoin="round">
          <path d="M70 100 V62 h54 V100"/>
          <path d="M82 100 V78 h12 V100 M106 100 V78 h12 V100"/>
          <path d="M160 100 V48 h150 V100"/>
          <path d="M160 48 L235 18 L310 48"/>
          <path d="M188 100 V58 h10 V100 M214 100 V58 h10 V100 M240 100 V58 h10 V100 M266 100 V58 h10 V100"/>
          <path d="M360 100 V22 h36 V100"/>
          <path d="M360 22 L378 4 L396 22"/>
          <circle cx="378" cy="40" r="7"/>
          <path d="M450 100 V58 h120 V100"/>
          <path d="M492 100 V72 a18 18 0 0 1 36 0 V100"/>
          <path d="M620 100 V40 h190 V100"/>
          <path d="M620 40 L715 14 L810 40"/>
          <path d="M652 70 h22 V100 M700 70 h22 V100 M748 70 h22 V100"/>
          <path d="M748 100 V78 h22 V100"/>
          <path d="M860 100 V20 h34 V100"/>
          <path d="M860 20 L877 4 L894 20"/>
          <path d="M940 100 V66 h70 V100 M954 82 h14 M982 82 h14"/>
          <circle cx="1088" cy="78" r="16"/>
          <path d="M1088 94 V100"/>
        </g>
      </svg>
    </footer>
  </div>
</body>
</html>`;
}

export function loginPage({ error = '', next = '/' }) {
  return layout({
    title: '登录',
    user: null,
    body: `<section class="hero">
      <div>
        <h1>优易升学</h1>
        <p class="lede">高职提前招生 · 报考小助手</p>
      </div>
      <form class="stack" method="post" action="/login">
        <input type="hidden" name="next" value="${esc(next)}">
        ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
        <label>手机号<input name="phone" required inputmode="numeric"></label>
        <label>密码<input name="password" type="password" required></label>
        <button class="btn" type="submit">登录</button>
        <p>还没有账号？<a href="/register">学生注册</a></p>
      </form>
      <div class="demo">
        <div>试做学生：13900000001 / student123</div>
        <div>全量学生：13900000002 / student123，已开通到 2027-06-30</div>
        <div>本机演示教师：13800000001 / teacher123</div>
        <form method="post" action="/demo" style="margin-top:8px"><button class="btn secondary" name="role" value="student" type="submit">以试做学生进入</button></form>
        <form method="post" action="/demo"><button class="btn secondary" name="role" value="full" type="submit">以全量学生进入</button></form>
        <form method="post" action="/demo"><button class="btn secondary" name="role" value="teacher" type="submit">以演示教师进入</button></form>
      </div>
    </section>`,
  });
}

export function registerPage({ error = '' }) {
  return layout({
    title: '学生注册',
    user: null,
    body: `<section class="card" style="padding:28px; max-width:520px">
      <h1>学生注册</h1>
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form class="stack" method="post" action="/register">
        <label>姓名<input name="name" required></label>
        <label>手机号<input name="phone" required></label>
        <label>密码<input name="password" type="password" required minlength="6"></label>
        <button class="btn" type="submit">注册并进入</button>
      </form>
    </section>`,
  });
}

function checks(name, options, selected) {
  return `<div class="checks">${options.map((option) => `
    <label><input type="checkbox" name="${name}" value="${esc(option)}" ${selected.includes(option) ? 'checked' : ''}><span>${esc(option)}</span></label>
  `).join('')}</div>`;
}

function pills(name, options, current, required = false) {
  return `<div class="pills">${options.map(([value, label]) => `
    <label><input type="radio" name="${name}" value="${esc(value)}" ${String(current) === String(value) ? 'checked' : ''} ${required ? 'required' : ''}><span>${esc(label)}</span></label>
  `).join('')}</div>`;
}

function meter(item) {
  if (!item.maxScore) return '';
  const score = Math.max(0, Math.min(100, item.converted / item.maxScore * 100));
  const cut = item.cutoff == null ? null : Math.max(0, Math.min(100, item.cutoff / item.maxScore * 100));
  return `<div class="meter"><span class="meter-score" style="width:${score}%"></span>${cut == null ? '' : `<span class="meter-cut" style="left:${cut}%"></span>`}</div>`;
}

export function studentForm({ user, error = '', profile = null }) {
  const grades = profile?.grades || {};
  const electives = new Set((profile?.electives || []).map((key) => ELECTIVES.find(([id]) => id === key)?.[1]).filter(Boolean));
  const strategy = profile?.strategy || 'balance';
  return layout({
    title: '填写学考',
    user,
    body: `<section class="page-head">
        <h1>填写信息</h1>
      </section>
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form method="post" action="/student/analyze" id="profile-form">
        <section class="stage">
          <header><span>01</span><div><h2>学考等级</h2></div></header>
          <div class="grade-list">
            ${SUBJECTS.map(([key, label]) => `<div class="grade-row"><b>${label}</b>${pills(`grade_${key}`, GRADES.map((grade) => [grade, grade]), grades[key] || '', true)}</div>`).join('')}
          </div>
        </section>
        <section class="stage">
          <header><span>02</span><div><h2>自选 3 门</h2></div></header>
          ${checks('electives', ELECTIVES.map(([, name]) => name), [...electives])}
        </section>
        <section class="stage">
          <header><span>03</span><div><h2>报考条件</h2></div></header>
          <div class="choice-grid">
            <div><h3>考生类型</h3>${pills('student_type', [['普高', '普高'], ['中职', '中职']], profile?.studentType || '普高')}</div>
            <div><h3>色觉</h3>${pills('color_vision', [['normal', '没有色盲色弱'], ['weak', '有色盲或色弱'], ['unknown', '还不确定']], profile?.colorVision || 'normal')}</div>
            <div><h3>性别</h3>${pills('gender', [['', '暂不填'], ['男', '男'], ['女', '女']], profile?.gender || '')}</div>
            <label class="height-field">身高（厘米）<input name="height" inputmode="numeric" value="${esc(profile?.heightCm || '')}" placeholder="空乘等专业会用到"></label>
          </div>
          <div class="checks accept">
            <label><input type="checkbox" name="accept_private" value="1" ${profile?.acceptPrivate === false ? '' : 'checked'}><span>接受民办</span></label>
            <label><input type="checkbox" name="accept_coop" value="1" ${profile?.acceptCoop === false ? '' : 'checked'}><span>接受中外合作</span></label>
          </div>
        </section>
        <section class="stage">
          <header><span>04</span><div><h2>填报倾向</h2></div></header>
          <div class="strategy">
            ${[
              ['rush', '想冲'],
              ['balance', '均衡'],
              ['safe', '求稳'],
            ].map(([value, title]) => `<label class="strategy-card"><input type="radio" name="strategy" value="${value}" ${strategy === value ? 'checked' : ''}><strong>${title}</strong></label>`).join('')}
          </div>
        </section>
        <section class="stage">
          <header><span>05</span><div><h2>地区和专业</h2></div></header>
          <div class="grid-2">
            <div><h3>想去的地区</h3>${checks('regions', REGIONS, profile?.regions || [])}</div>
            <div><h3>不去的地区</h3>${checks('avoid_regions', REGIONS, profile?.avoidRegions || [])}</div>
          </div>
          <h3>意向专业大类</h3>
          ${checks('categories', CATEGORIES, profile?.categories || [])}
        </section>
        <div class="submit-bar">
          <button class="btn" type="submit">查看结果</button>
        </div>
      </form>
      <script>
        const boxes = [...document.querySelectorAll('#profile-form input[name=electives]')];
        boxes.forEach((box) => box.addEventListener('change', () => {
          const picked = boxes.filter((item) => item.checked);
          if (picked.length > 3) (picked.find((item) => item !== box) || picked[0]).checked = false;
        }));
      </script>`,
  });
}

export function historyPage({ user, rows, page = 1 }) {
  const window = slicePage(rows, page);
  return layout({
    title: '我的结果',
    user,
    body: `<h1>我的结果</h1>
      ${pager('/student/history', window.page, window.pages, window.total)}
      ${window.total ? `<div class="table-wrap"><table><tr><th>时间</th><th>条数</th><th></th></tr>
        ${window.rows.map((row) => `<tr><td>${esc(row.created_at.slice(0, 16).replace('T', ' '))}</td><td>${row.total}</td>
          <td class="row-actions">
            <a class="btn small secondary" href="/student/report/${row.id}">打开</a>
            <form method="post" action="/student/history/${row.id}/delete" onsubmit="return confirm('删除这条结果？')">
              <input type="hidden" name="page" value="${window.page}">
              <button class="btn small danger" type="submit">删除</button>
            </form>
          </td></tr>`).join('')}
      </table></div>${pager('/student/history', window.page, window.pages, window.total)}` : '<p>还没有结果。</p>'}`,
  });
}

export function reportPage({ user, analysis, paid }) {
  const profile = JSON.parse(analysis.profile_json);
  const payload = JSON.parse(analysis.results_json);
  const groups = [
    ['high', '明显高于近年入围线'],
    ['mid', '贴近近年入围线'],
    ['low', '刚过硬门槛'],
    ['unknown', '缺少入围分'],
  ];
  const gradeText = SUBJECTS.map(([key, name]) => `${name}${profile.grades[key]}`).join(' ');
  const strategyText = { rush: '想冲', balance: '均衡', safe: '求稳' }[profile.strategy] || '均衡';
  return layout({
    title: '匹配结果',
    user,
    body: `<section class="card" style="padding:22px">
      <div class="no-print" style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap">
        <h1 style="margin:0">匹配结果</h1>
        <div class="actions">
          <a class="btn secondary small" href="/student/report/${analysis.id}/download">下载</a>
          <button class="btn secondary small" onclick="window.print()">打印</button>
        </div>
      </div>
      <p>${esc(gradeText)}</p>
      <p class="meta-line">${esc(profile.studentType || '普高')} · ${strategyText} · ${profile.acceptPrivate === false ? '不接受民办' : '接受民办'} · ${profile.acceptCoop === false ? '不接受中外合作' : '接受中外合作'}</p>
      <p class="banner">数据年份 ${payload.year}。入围分供对照，以当年简章为准。</p>
      <p>共 ${payload.results.length} 条。未符合报考条件 ${payload.excludedCount} 条。</p>
      ${payload.overview ? `<p>${esc(payload.overview)}</p>` : ''}
      <p>${paid ? '题库已开通。' : '题库可试做。'} <a href="/student/account">开通状态</a></p>
    </section>
    ${groups.map(([band, label]) => {
      const items = payload.results.filter((item) => item.band === band);
      if (!items.length) return '';
      return `<section class="group"><h2><span class="tag ${band}">${items.length}</span> ${label}</h2>
        ${items.map((item) => itemCard(item, analysis.id)).join('')}
      </section>`;
    }).join('')}
    ${payload.excluded?.length ? `<section class="group"><h2>未列入</h2><ul>${payload.excluded.map((item) => `<li>${esc(item.school)} · ${esc(item.major)}：${esc(item.reasons.join('；'))}</li>`).join('')}</ul></section>` : ''}
    <p class="note">${esc(payload.results[0]?.sourceNote || '')}</p>`,
  });
}

function itemCard(item) {
  const current = item.outlineStatus === 'published'
    ? `<a class="btn secondary small" href="/student/practice/${item.majorId}/current">今年考纲练习</a>`
    : `<span class="tag">今年考纲未发布</span>`;
  return `<article class="item">
    <header>
      <div><strong>${esc(item.school)}</strong> · ${esc(item.major)}<div>${esc(item.region)} · ${esc(item.tier || '')} · ${esc(item.category)} · ${esc(item.testForm || '')}</div></div>
      <span class="tag ${item.band}">${esc(item.bandLabel)}</span>
    </header>
    <p class="metrics"><span>折算 ${item.converted}/${item.maxScore}</span><span>入围参考 ${item.cutoff ?? '—'}（${item.cutoffYear || '—'}）</span><span>相差 ${item.gap ?? '—'}</span><span>占满分 ${item.ratio ?? '—'}%</span><span>计划 ${item.planNum ?? '—'}</span></p>
    ${meter(item)}
    <ul class="reasons">${item.reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>
    <div class="actions no-print">
      <a class="btn small" href="/student/practice/${item.majorId}/history">历年题型练习</a>
      ${current}
      <a class="btn secondary small" href="/student/practice?q=${encodeURIComponent(item.major)}">题库里查看</a>
    </div>
  </article>`;
}

export function downloadDocument(analysis) {
  const html = reportPage({ user: null, analysis, paid: false }).replace('查看开通状态', '');
  return html;
}

export function practiceHubPage({ user, rows, page = 1, q = '', paid, today, summary }) {
  const window = slicePage(rows, page);
  const path = `/student/practice?q=${encodeURIComponent(q)}`;
  const rate = today.done ? `${Math.round(today.right / today.done * 100)}%` : '—';
  const mastery = summary.total ? `${Math.round(summary.done / summary.total * 100)}%` : '—';
  const accuracy = summary.done ? `${Math.round(summary.right / summary.done * 100)}%` : '—';
  const entry = (row, kind) => {
    const stat = row[kind];
    const label = kind === 'history' ? '历年题型' : '今年考纲';
    if (kind === 'current' && row.outline_status !== 'published') return `<div class="entry"><b>${label}</b><span>考纲未发布</span></div>`;
    if (!stat.library) return `<div class="entry"><b>${label}</b><span>还没有已审核题</span></div>`;
    const scope = stat.limited ? `试做 ${stat.total} / 题库 ${stat.library}` : `全量 ${stat.library}`;
    const accuracyText = stat.done ? `正确率 ${Math.round(stat.right / stat.done * 100)}%` : '还没做过';
    const resume = stat.done && stat.next < stat.total
      ? `<a class="btn small" href="/student/practice/${row.id}/${kind}?n=${stat.next}">继续</a>`
      : '';
    const wrong = stat.wrong
      ? `<a class="btn small secondary" href="/student/practice/${row.id}/${kind}?mode=wrong">错题 ${stat.wrong}</a>`
      : '';
    return `<div class="entry"><b>${label}</b><span>${scope} · 已做 ${stat.done}/${stat.total} · ${accuracyText}</span>
      <div class="row-actions">
        <a class="btn small" href="/student/practice/${row.id}/${kind}?view=chapters">章节</a>
        ${resume}
        <a class="btn small secondary" href="/student/practice/${row.id}/${kind}?mode=random">随机</a>
        ${wrong}
      </div></div>`;
  };
  return layout({
    title: '题库练习',
    user,
    body: `<section class="page-head">
        <p class="eyebrow">按学校和专业</p>
        <h1>题库练习</h1>
      </section>
      <div class="card mastery">
        <div><b>掌握度 ${mastery}</b><span>正确率 ${accuracy}</span></div>
        <div class="bar"><span style="width:${summary.total ? Math.round(summary.done / summary.total * 100) : 0}%"></span></div>
        <p>当前可做 ${summary.total} 题，已做 ${summary.done}，做错 ${summary.wrong}。</p>
      </div>
      <div class="grid-3">
        <div class="card stat"><b>${today.done}</b>今日答题</div>
        <div class="card stat"><b>${today.right}</b>今日答对</div>
        <div class="card stat"><b>${rate}</b>今日正确率</div>
      </div>
      <nav class="tile-grid">
        <a class="card tile" href="/student/records"><b>做题记录</b><span>每一次提交</span></a>
        <a class="card tile" href="/student/wrong"><b>我的错题</b><span>最近一次做错的题</span></a>
        <a class="card tile" href="/student/account"><b>${paid ? '已开通' : '试做'}</b><span>${paid ? `至 ${esc(user.paid_until)}` : '每入口 8 题'}</span></a>
      </nav>
      <p class="note">先选学校和专业，打开章节后再做题。未开通时每个入口固定试做最先发布的 8 题；开通后同一入口变成该校该专业的全部已审核题。练习套每套 10 题，是把已有题目分组，不是真题卷。</p>
      <form class="filters" method="get" action="/student/practice">
        <label>学校、专业或地区<input name="q" value="${esc(q)}" placeholder="例如 软件技术"></label>
        <button class="btn" type="submit">查找</button>
      </form>
      ${pager(path, window.page, window.pages, window.total)}
      ${window.total ? `<div class="table-wrap"><table class="bank">
        <tr><th>学校</th><th>专业</th><th>练习</th></tr>
        ${window.rows.map((row) => `<tr>
          <td>${esc(row.school_name)}<div class="meta">${esc(row.region)} · ${row.year}</div></td>
          <td>${esc(row.name)}</td>
          <td class="entries">${entry(row, 'history')}${entry(row, 'current')}</td>
        </tr>`).join('')}
      </table></div>${pager(path, window.page, window.pages, window.total)}` : '<p>没有符合的学校或专业。</p>'}`,
  });
}

export function practiceOutlinePage({ user, major, kind, paid, limited, library, chapters, papers }) {
  const title = kind === 'history' ? '历年题型' : '今年考纲';
  const chapterHtml = chapters.map((chapter) => {
    const rate = chapter.done ? `${Math.round(chapter.right / chapter.done * 100)}%` : '—';
    const width = chapter.total ? Math.round(chapter.done / chapter.total * 100) : 0;
    return `<article class="chapter">
      <div>
        <b>${esc(chapter.name)}</b>
        <div class="bar"><span style="width:${width}%"></span></div>
        <span>${chapter.done}/${chapter.total} · 正确率 ${rate}</span>
      </div>
      <a class="btn small" href="/student/practice/${major.id}/${kind}?module=${encodeURIComponent(chapter.name)}&n=0">${chapter.done ? '继续' : '进入'}</a>
    </article>`;
  }).join('');
  const paperHtml = papers.map((paper) => {
    const href = paid ? `/student/practice/${major.id}/${kind}?paper=${paper.id}&n=0` : '/student/account';
    const progress = paid ? `${paper.done}/${paper.total} 题` : '开通后可做整套';
    return `<a class="card paper" href="${href}"><b>${esc(paper.title)}</b><span>${paper.year || ''} · ${paper.minutes || 40} 分钟 · ${progress}</span></a>`;
  }).join('');
  return layout({
    title,
    user,
    body: `<section class="quiz">
      <p class="tag">${limited && !paid ? '试做' : '全量'}</p>
      <h1>${esc(major.school_name)} · ${esc(major.name)}</h1>
      <p class="no-print links">
        <a href="/student/practice?q=${encodeURIComponent(major.name)}">题库</a>
        <a href="/student/practice/${major.id}/${kind}?mode=random">随机一题</a>
        <a href="/student/practice/${major.id}/${kind}?mode=wrong">只练错题</a>
      </p>
      <p>${limited && !paid ? `现在可做 ${chapters.reduce((sum, chapter) => sum + chapter.total, 0)} 题，题库共 ${library} 题。` : `全量 ${library} 题。`}</p>
      <h2>章节</h2>
      ${chapterHtml || '<p>还没有已审核题目。</p>'}
      <h2>套卷</h2>
      <p class="note">一套卷按题型顺序做完。这些是仿真组卷，不是院校公布的原卷。</p>
      <div class="paper-grid">${paperHtml || '<p>这一入口还没有套卷。</p>'}</div>
    </section>`,
  });
}

export function recordPage({ user, rows, page = 1 }) {
  const window = slicePage(rows, page);
  return layout({
    title: '做题记录',
    user,
    body: `<h1>做题记录</h1>
      ${pager('/student/records', window.page, window.pages, window.total)}
      ${window.total ? `<div class="table-wrap"><table class="bank"><tr><th>时间</th><th>学校专业</th><th>题目</th><th>结果</th></tr>
        ${window.rows.map((row) => `<tr>
          <td>${esc(row.created_at.slice(0, 16).replace('T', ' '))}</td>
          <td>${esc(row.school_name)} · ${esc(row.major_name)}<div class="meta">${row.kind === 'history' ? '历年题型' : '今年考纲'}</div></td>
          <td>${esc(row.stem.slice(0, 42))}</td>
          <td>${row.correct ? '正确' : '错误'}</td>
        </tr>`).join('')}
      </table></div>${pager('/student/records', window.page, window.pages, window.total)}` : '<p>还没有提交过题目。</p>'}`,
  });
}

export function wrongPage({ user, rows, page = 1 }) {
  const window = slicePage(rows, page);
  return layout({
    title: '我的错题',
    user,
    body: `<h1>我的错题</h1>
      <p class="note">这里是每个题最近一次提交仍做错的题目。再做对后会从这份列表消失。</p>
      ${pager('/student/wrong', window.page, window.pages, window.total)}
      ${window.total ? `<div class="table-wrap"><table class="bank"><tr><th>学校专业</th><th>题目</th><th></th></tr>
        ${window.rows.map((row) => `<tr>
          <td>${esc(row.school_name)} · ${esc(row.major_name)}<div class="meta">${row.kind === 'history' ? '历年题型' : '今年考纲'}${row.module ? ` · ${esc(row.module)}` : ''}</div></td>
          <td>${esc(row.stem.slice(0, 48))}</td>
          <td><a class="btn small" href="/student/practice/${row.major_id}/${row.kind}?mode=wrong">去练</a></td>
        </tr>`).join('')}
      </table></div>${pager('/student/wrong', window.page, window.pages, window.total)}` : '<p>最近一次作答里没有错题。</p>'}`,
  });
}

const TYPE_NAME = { single: '单选', multi: '多选', judge: '判断', short: '简答' };

function answerFields(question) {
  const type = question.qtype || 'single';
  if (type === 'short') return '<label class="stack">回答<textarea name="choice" required></textarea></label>';
  const options = JSON.parse(question.options_json || '[]');
  const input = type === 'multi' ? 'checkbox' : 'radio';
  return options.map((option, optionIndex) => `<label class="option"><input type="${input}" name="choice" value="${'ABCD'[optionIndex]}" ${type === 'multi' ? '' : 'required'}><span><b>${'ABCD'[optionIndex]}</b>${esc(option)}</span></label>`).join('');
}

export function paperLockedPage({ user, major, paper }) {
  const count = JSON.parse(paper.question_ids_json || '[]').length;
  return layout({
    title: paper.title,
    user,
    body: `<h1>${esc(major.school_name)} · ${esc(major.name)}</h1>
      <p class="banner">「${esc(paper.title)}」共 ${count} 题，约 ${paper.minutes || 40} 分钟。试做账号不能打开整套，开通后按卷做。</p>
      <a class="btn" href="/student/account">去开通</a>`,
  });
}

export function practicePage({ user, major, kind, questions, index, feedback, paid, limited, mode = 'all', library = 0, moduleName = '', setNo = 0, paper = null }) {
  const title = kind === 'history' ? '历年题型练习' : '今年考纲练习';
  const other = kind === 'history' ? 'current' : 'history';
  const otherLabel = kind === 'history' ? '今年考纲练习' : '历年题型练习';
  const question = questions[index];
  const done = index >= questions.length;
  const href = (n) => {
    const params = new URLSearchParams({ n: String(n) });
    if (mode === 'wrong') params.set('mode', 'wrong');
    if (moduleName) params.set('module', moduleName);
    if (setNo) params.set('set', String(setNo));
    if (paper) params.set('paper', String(paper.id));
    return `?${params}`;
  };
  let main = '';
  if (!questions.length) {
    main = mode === 'wrong'
      ? '<p>这一入口还没有做错的题。</p>'
      : '<p>这所学校的这个专业还没有已审核题目。教师发布后这里才会出现。</p>';
  } else if (done) {
    main = `<p>这一套做完了，共 ${questions.length} 题。</p>
      ${limited && !paid ? `<p>免费试做到此为止。题库里还有 ${Math.max(library - questions.length, 0)} 题，开通本季后同一入口会放出全部已审核题目。</p><p><a href="/student/account">去开通</a></p>` : `<a class="btn" href="${href(0)}">再看一遍</a>`}`;
  } else {
    const typeName = TYPE_NAME[question.qtype || 'single'] || '单选';
    main = `<nav class="qnav">${questions.map((_, itemIndex) => `<a class="${itemIndex === index ? 'is-on' : ''}" href="${href(itemIndex)}">${itemIndex + 1}</a>`).join('')}</nav>
      <p class="quiz-progress">第 ${index + 1} / ${questions.length} 题 · ${typeName}${question.difficulty >= 4 ? ' · 较难' : ''}${question.module ? ` · ${esc(question.module)}` : ''}</p>
      <h2>${esc(question.stem)}</h2>
      <form class="quiz-form" method="post">
        <input type="hidden" name="n" value="${index}">
        <input type="hidden" name="mode" value="${mode}">
        <input type="hidden" name="module" value="${esc(moduleName)}">
        <input type="hidden" name="set" value="${setNo || ''}">
        <input type="hidden" name="paper" value="${paper ? paper.id : ''}">
        ${answerFields(question)}
        <button class="btn" type="submit">提交</button>
      </form>
      ${feedback ? `<div class="feedback"><p>${feedback.correct ? '正确。' : `答案 ${esc(feedback.answer)}。`}</p><p>${esc(feedback.explanation)}</p><a class="btn" href="${href(index + 1)}">下一题</a></div>` : ''}`;
  }
  return layout({
    title,
    user,
    body: `<section class="quiz">
      <p class="tag">${paper ? '套卷' : mode === 'wrong' ? '错题' : limited && !paid ? '试做' : '全量'}</p>
      <h1>${esc(paper?.title || `${major.school_name} · ${major.name}`)}</h1>
      ${paper ? `<p>${esc(major.school_name)} · ${esc(major.name)} · 约 ${paper.minutes || 40} 分钟</p>` : ''}
      <p class="no-print links">
        <a href="/student/practice?q=${encodeURIComponent(major.name)}">题库</a>
        <a href="/student/practice/${major.id}/${kind}?view=chapters">章节</a>
        <a href="/student/practice/${major.id}/${kind}?mode=wrong">只练错题</a>
        <a href="/student/practice/${major.id}/${other}">${otherLabel}</a>
      </p>
      ${main}
    </section>`,
  });
}

export function closedOutlinePage({ user, major }) {
  return layout({
    title: '今年考纲未发布',
    user,
    body: `<h1>${esc(major.school_name)} · ${esc(major.name)}</h1>
      <p class="banner">今年考纲还没在系统里发布，这个入口先不放题。可以先做历年题型练习。</p>
      <a class="btn" href="/student/practice/${major.id}/history">去做历年题型</a>`,
  });
}

export function accountPage({ user }) {
  const paid = user.paid_until && user.paid_until >= new Date().toISOString().slice(0, 10);
  return layout({
    title: '开通状态',
    user,
    body: `<h1>题库开通</h1>
      <p>${paid ? `已开通至 ${esc(user.paid_until)}。已审核题目不限次数，从<a href="/student/practice">题库练习</a>按学校和专业进入。` : '尚未开通。每所学校的每个专业、每种入口可以免费试做 8 题。<a href="/student/practice">去题库练习</a>'}</p>
      <form method="post" action="/student/demo-pay">
        <button class="btn secondary" type="submit">本机演示：开通到 2027-06-30</button>
      </form>
      <p class="note">这个按钮只改本机数据库，不是微信支付。</p>`,
  });
}

export function teacherHome({ user, stats }) {
  return layout({
    title: '教师端',
    user,
    body: `<h1>教师端</h1>
      <div class="grid-3">
        <div class="card stat"><b>${stats.schools}</b>所学校</div>
        <div class="card stat"><b>${stats.majors}</b>个专业</div>
        <div class="card stat"><b>${stats.published}</b>道已发布题目 / ${stats.drafts} 道待审</div>
      </div>
      <p>接口：${stats.llm ? '已配置' : '未配置'}</p>`,
  });
}

function gradeOptions(value, emptyLabel) {
  const empty = emptyLabel ? `<option value="" ${value ? '' : 'selected'}>${emptyLabel}</option>` : '';
  return empty + ['A', 'B', 'C', 'D', 'E'].map((grade) => `<option value="${grade}" ${value === grade ? 'selected' : ''}>${grade}</option>`).join('');
}

function parseXuekao(req) {
  const parsed = { floor: '', countN: '', countGrade: '', yu: '', shu: '', wai: '', extra: [] };
  for (const rule of String(req || '').split(';').map((part) => part.trim()).filter(Boolean)) {
    const floor = rule.match(/^ge:([A-E])$/);
    if (floor) { parsed.floor = floor[1]; continue; }
    const count = rule.match(/^minCount:([A-E]):(\d+)$/);
    if (count) { parsed.countGrade = count[1]; parsed.countN = count[2]; continue; }
    const subject = rule.match(/^(yu|shu|wai):([A-E])$/);
    if (subject) { parsed[subject[1]] = subject[2]; continue; }
    parsed.extra.push(rule);
  }
  return parsed;
}

function describeXuekao(req) {
  const parsed = parseXuekao(req);
  const parts = [];
  if (parsed.floor) parts.push(`全部不低于 ${parsed.floor}`);
  if (parsed.countN && parsed.countGrade) parts.push(`至少 ${parsed.countN} 门不低于 ${parsed.countGrade}`);
  if (parsed.yu) parts.push(`语文不低于 ${parsed.yu}`);
  if (parsed.shu) parts.push(`数学不低于 ${parsed.shu}`);
  if (parsed.wai) parts.push(`英语不低于 ${parsed.wai}`);
  if (parsed.extra.length) parts.push(parsed.extra.join('；'));
  return parts.length ? `学考 ${parts.join('，')}` : '学考未设，匹配时仍按全部不低于 D';
}

export function schoolsPage({ user, rows, q = '', page = 1, savedId = 0, error = '' }) {
  const saved = rows.find((row) => row.id === Number(savedId));
  const window = slicePage(rows, page);
  const message = saved
    ? `已保存 ${saved.school_name} · ${saved.name}。入围分 ${saved.cutoff_score ?? '空'}，年份 ${saved.cutoff_year ?? '空'}。${describeXuekao(saved.xuekao_req)}。考纲${saved.outline_status === 'published' ? '已发布' : '未发布'}。`
    : '';
  const listPath = q ? `/teacher/schools?q=${encodeURIComponent(q)}` : '/teacher/schools';
  return layout({
    title: '学校专业',
    user,
    body: `<h1>学校和专业</h1>
      <p>每一行改完，要点这一行的保存。页面上方出现「已保存」以及这一行的数字，才是写进数据库的结果。不保存就还是原来的。已经生成的学生结果不会改。删除专业时，这个专业下的题目一起删除。</p>
      ${message ? `<p class="banner">${esc(message)}</p>` : ''}
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form class="filters" method="get" action="/teacher/schools">
        <label>查找<input name="q" value="${esc(q)}" placeholder="学校、专业、地区"></label>
        <button class="btn small" type="submit">查找</button>
      </form>
      ${pager(listPath, window.page, window.pages, window.total)}
      <div class="table-wrap"><table>
        <tr><th>学校</th><th>专业</th><th>入围分</th><th>学考要求</th><th>考纲</th><th></th></tr>
        ${window.rows.map((row) => {
          const req = parseXuekao(row.xuekao_req);
          const form = `m${row.id}`;
          return `<tr id="major-${row.id}" class="${Number(savedId) === row.id ? 'is-saved' : ''}">
          <td>${esc(row.school_name)}<br>${esc(row.region)} · ${row.year}</td>
          <td>${esc(row.name)}<br>${esc(row.category)}</td>
          <td class="compact">
            <label>分数<input form="${form}" name="cutoff_score" value="${row.cutoff_score ?? ''}" inputmode="decimal"></label>
            <label>年份<input form="${form}" name="cutoff_year" value="${row.cutoff_year ?? ''}" inputmode="numeric"></label>
          </td>
          <td class="compact">
            <label>全部不低于<select form="${form}" name="floor">${gradeOptions(req.floor, '不设')}</select></label>
            <label>至少<select form="${form}" name="count_n">${['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((n) => `<option value="${n}" ${String(req.countN) === n ? 'selected' : ''}>${n || '不设'}</option>`).join('')}</select>门不低于<select form="${form}" name="count_grade">${gradeOptions(req.countGrade, '—')}</select></label>
            <label>语文<select form="${form}" name="subj_yu">${gradeOptions(req.yu, '不设')}</select></label>
            <label>数学<select form="${form}" name="subj_shu">${gradeOptions(req.shu, '不设')}</select></label>
            <label>英语<select form="${form}" name="subj_wai">${gradeOptions(req.wai, '不设')}</select></label>
            ${req.extra.length ? `<input form="${form}" type="hidden" name="xuekao_extra" value="${esc(req.extra.join(';'))}">` : ''}
          </td>
          <td><select form="${form}" name="outline_status"><option value="published" ${row.outline_status === 'published' ? 'selected' : ''}>已发布</option><option value="unpublished" ${row.outline_status === 'unpublished' ? 'selected' : ''}>未发布</option></select></td>
          <td class="row-actions">
            <form id="${form}" method="post" action="/teacher/majors/${row.id}"><input type="hidden" name="q" value="${esc(q)}"><input type="hidden" name="page" value="${window.page}"><button class="btn small" type="submit">保存</button></form>
            <form method="post" action="/teacher/majors/${row.id}/delete" onsubmit="return confirm('删除「${esc(row.school_name)} · ${esc(row.name)}」？这个专业下的题目会一起删除。')">
              <input type="hidden" name="q" value="${esc(q)}">
              <input type="hidden" name="page" value="${window.page}">
              <button class="btn small danger" type="submit">删除</button>
            </form>
          </td>
        </tr>`;
        }).join('') || '<tr><td colspan="6">没有符合条件的学校或专业。</td></tr>'}
      </table></div>
      ${pager(listPath, window.page, window.pages, window.total)}
      <p class="note">下拉里的等级是学考要达到的档。这一行都不设时，学生匹配仍按全部不低于 D。</p>
      ${saved ? `<script>document.getElementById('major-${saved.id}')?.scrollIntoView({block:'center'})</script>` : ''}`,
  });
}

export function importPage({ user, message = '', error = '' }) {
  return layout({
    title: '导入',
    user,
    body: `<h1>导入</h1>
      <p>先下载表格，用 Excel 填写，另存为 CSV，再选择文件。第一行表头要留着。题目里的学校名、专业名要和系统里已有的一致。同一道题再导一次会多出一条，不会盖掉原来的。</p>
      ${message ? `<p class="banner">${esc(message)}</p>` : ''}
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <section class="grid-2">
        <form class="card stack" style="padding:18px" method="post" action="/teacher/import/majors">
          <h2>学校、专业、入围分</h2>
          <p><a href="/teacher/import/template/majors">下载专业表示例</a></p>
          <p>折算方式填 selected6、all10 或 weighted10。分值写成 A50|B40|C30|D20|E0。</p>
          <input type="file" accept=".csv,text/csv">
          <textarea name="csv" placeholder="也可以把表格内容贴在这里"></textarea>
          <button class="btn" type="submit">导入专业表</button>
        </form>
        <form class="card stack" style="padding:18px" method="post" action="/teacher/import/questions">
          <h2>题库</h2>
          <p><a href="/teacher/import/template/questions">下载题目示例</a></p>
          <p>入口填 history 或 current。状态填 published 或 draft。学生只能做 published。</p>
          <input type="file" accept=".csv,text/csv">
          <textarea name="csv" placeholder="也可以把表格内容贴在这里"></textarea>
          <button class="btn" type="submit">导入题目</button>
        </form>
      </section>
      <script>
        document.querySelectorAll('input[type=file]').forEach((input) => {
          input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            input.form.querySelector('textarea').value = await file.text();
          });
        });
      </script>`,
  });
}

export function brochurePage({ user, schools, result = null, error = '' }) {
  return layout({
    title: '简章',
    user,
    body: `<h1>招生简章</h1>
      <p>粘贴当年简章。模型只抽字段，确认后才写入这所学校。</p>
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form class="stack" method="post" action="/teacher/brochure/extract">
        <label>年份<input name="year" value="2027"></label>
        <label>简章全文<textarea name="body" required></textarea></label>
        <button class="btn" type="submit">抽取草稿</button>
      </form>
      ${result ? `<form class="card stack section" style="padding:18px" method="post" action="/teacher/brochure/save">
        <h2>核对后写入</h2>
        <input type="hidden" name="document_id" value="${result.documentId}">
        <label>学校<select name="school_id">${schools.map((school) => `<option value="${school.id}">${esc(school.name)} · ${school.year}</option>`).join('')}</select></label>
        <label>折算说明<input name="formula_label" value="${esc(result.formula_label || '')}"></label>
        <label>折算方式<input name="formula_mode" value="${esc(result.formula_mode || 'selected6')}"></label>
        <label>分值 A|B|C|D|E<input name="points" value="${esc(result.pointsText || '')}"></label>
        <label>学考要求<input name="xuekao_req" value="${esc(result.xuekao_req || '')}"></label>
        <label>校测形式<input name="test_form" value="${esc(result.test_form || '')}"></label>
        <button class="btn" type="submit">确认写入该校</button>
        <pre>${esc(JSON.stringify(result.raw, null, 2))}</pre>
      </form>` : ''}`,
  });
}

const STATUS_LABEL = { published: '已发布', draft: '待审' };
const ORIGIN_LABEL = { seed: '示例', import: '导入', llm: '起草' };

function listQuery({ school = 0, major = 0, q = '', page = 0 } = {}) {
  const search = new URLSearchParams();
  if (school) search.set('school', school);
  if (major) search.set('major', major);
  if (q) search.set('q', q);
  if (Number(page) > 1) search.set('page', String(Number(page)));
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function questionsPage({ user, rows, majors, schools, schoolId = 0, majorId = 0, q = '', page = 1, message = '', error = '' }) {
  const visibleMajors = majors.filter((major) => !schoolId || major.school_id === Number(schoolId));
  const window = slicePage(rows, page);
  const back = { school: schoolId, major: majorId, q, page: window.page };
  const href = listQuery(back);
  const listPath = `/teacher/questions${listQuery({ school: schoolId, major: majorId, q })}`;
  return layout({
    title: '题库',
    user,
    body: `<h1>题库</h1>
      <p>选择学校或专业后，下面只显示对应题目。点「修改」可以改题干、选项和答案。</p>
      ${message ? `<p class="banner">${esc(message)}</p>` : ''}
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form class="filters" method="get" action="/teacher/questions">
        <label>学校
          <select name="school" onchange="this.form.major.value=''; this.form.submit()">
            <option value="">全部</option>
            ${schools.map((school) => `<option value="${school.id}" ${Number(schoolId) === school.id ? 'selected' : ''}>${esc(school.name)} · ${school.year}</option>`).join('')}
          </select>
        </label>
        <label>专业
          <select name="major" onchange="this.form.submit()">
            <option value="">全部</option>
            ${visibleMajors.map((major) => `<option value="${major.id}" ${Number(majorId) === major.id ? 'selected' : ''}>${schoolId ? '' : `${esc(major.school_name)} · `}${esc(major.name)}</option>`).join('')}
          </select>
        </label>
        <label>查找<input name="q" value="${esc(q)}" placeholder="题干、模块"></label>
        <button class="btn small" type="submit">查找</button>
      </form>
      <form class="filters" method="post" action="/teacher/questions/draft">
        <input type="hidden" name="return_school" value="${schoolId || ''}">
        <input type="hidden" name="return_q" value="${esc(q)}">
        <input type="hidden" name="return_page" value="${window.page}">
        <label>按考纲起草待审题
          <select name="major_id" ${visibleMajors.length ? '' : 'disabled'}>
            ${visibleMajors.map((major) => `<option value="${major.id}" ${Number(majorId) === major.id ? 'selected' : ''}>${schoolId ? esc(major.name) : `${esc(major.school_name)} · ${esc(major.name)}`}</option>`).join('') || '<option value="">没有专业</option>'}
          </select>
        </label>
        <button class="btn secondary" type="submit" ${visibleMajors.length ? '' : 'disabled'}>起草</button>
      </form>
      ${pager(listPath, window.page, window.pages, window.total)}
      <div class="table-wrap"><table class="section">
        <tr><th>状态</th><th>学校专业</th><th>入口</th><th>题干</th><th></th></tr>
        ${window.rows.map((row) => `<tr>
          <td>${esc(STATUS_LABEL[row.status] || row.status)} · ${esc(ORIGIN_LABEL[row.origin] || row.origin)}</td>
          <td>${esc(row.school_name)}<br>${esc(row.major_name)}</td>
          <td>${row.kind === 'history' ? '历年题型' : '今年考纲'}</td>
          <td class="stem"><a href="/teacher/questions/${row.id}${href}">${esc(row.stem)}</a></td>
          <td class="row-actions">
            <a class="btn small secondary" href="/teacher/questions/${row.id}${href}">修改</a>
            <form method="post" action="/teacher/questions/${row.id}/delete" onsubmit="return confirm('删除这道题？')">
              <input type="hidden" name="return_school" value="${schoolId || ''}">
              <input type="hidden" name="return_major" value="${majorId || ''}">
              <input type="hidden" name="return_q" value="${esc(q)}">
              <input type="hidden" name="return_page" value="${window.page}">
              <button class="btn small danger" type="submit">删除</button>
            </form>
          </td>
        </tr>`).join('') || '<tr><td colspan="5">没有符合条件的题目。</td></tr>'}
      </table></div>
      ${pager(listPath, window.page, window.pages, window.total)}`,
  });
}

export function questionDetailPage({ user, question, back = {}, error = '' }) {
  const options = JSON.parse(question.options_json || '[]');
  const href = listQuery(back);
  return layout({
    title: '题目',
    user,
    body: `<p><a href="/teacher/questions${href}">返回题库</a></p>
      <h1>${esc(question.school_name)} · ${esc(question.major_name)}</h1>
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form class="card stack edit-form" method="post" action="/teacher/questions/${question.id}">
        <input type="hidden" name="return_school" value="${esc(back.school || '')}">
        <input type="hidden" name="return_major" value="${esc(back.major || '')}">
        <input type="hidden" name="return_q" value="${esc(back.q || '')}">
        <input type="hidden" name="return_page" value="${esc(back.page || '')}">
        <label>模块<input name="module" value="${esc(question.module || '')}"></label>
        <label>入口
          <select name="kind">
            <option value="history" ${question.kind === 'history' ? 'selected' : ''}>历年题型</option>
            <option value="current" ${question.kind === 'current' ? 'selected' : ''}>今年考纲</option>
          </select>
        </label>
        <label>状态
          <select name="status">
            <option value="draft" ${question.status === 'draft' ? 'selected' : ''}>待审</option>
            <option value="published" ${question.status !== 'draft' ? 'selected' : ''}>已发布</option>
          </select>
        </label>
        <label>题干<textarea name="stem" required>${esc(question.stem || '')}</textarea></label>
        ${(question.qtype || 'single') === 'short' ? '' : ['A', 'B', 'C', 'D'].map((letter, index) => `<label>选项${letter}<input name="option_${letter.toLowerCase()}" value="${esc(options[index] || '')}" ${(question.qtype || 'single') === 'single' ? 'required' : ''}></label>`).join('')}
        <label>答案${(question.qtype || 'single') === 'single' || (question.qtype || 'single') === 'judge'
          ? `<select name="answer">${['A', 'B', 'C', 'D'].map((letter) => `<option value="${letter}" ${question.answer === letter ? 'selected' : ''}>${letter}</option>`).join('')}</select>`
          : `<input name="answer" value="${esc(question.answer || '')}">`}
          <span class="meta">题型 ${esc(question.qtype || 'single')}</span>
        </label>
        <label>解析<textarea name="explanation">${esc(question.explanation || '')}</textarea></label>
        <button class="btn" type="submit">保存修改</button>
      </form>
      <form method="post" action="/teacher/questions/${question.id}/delete" onsubmit="return confirm('删除这道题？')">
        <input type="hidden" name="return_school" value="${esc(back.school || '')}">
        <input type="hidden" name="return_major" value="${esc(back.major || '')}">
        <input type="hidden" name="return_q" value="${esc(back.q || '')}">
        <input type="hidden" name="return_page" value="${esc(back.page || '')}">
        <button class="btn danger" type="submit">删除这题</button>
      </form>`,
  });
}

export function studentsPage({ user, rows, q = '', page = 1 }) {
  const window = slicePage(rows, page);
  const listPath = q ? `/teacher/students?q=${encodeURIComponent(q)}` : '/teacher/students';
  return layout({
    title: '学生',
    user,
    body: `<h1>学生开通</h1>
      <form class="filters" method="get" action="/teacher/students">
        <label>查找<input name="q" value="${esc(q)}" placeholder="姓名或手机"></label>
        <button class="btn small" type="submit">查找</button>
      </form>
      ${pager(listPath, window.page, window.pages, window.total)}
      <div class="table-wrap"><table><tr><th>姓名</th><th>手机</th><th>开通至</th><th></th></tr>
      ${window.rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.phone)}</td><td>${esc(row.paid_until || '未开通')}</td>
        <td><form method="post" action="/teacher/students/${row.id}/grant">
          <input type="hidden" name="q" value="${esc(q)}">
          <input type="hidden" name="page" value="${window.page}">
          <button class="btn small">开通到 2027-06-30</button>
        </form></td></tr>`).join('') || '<tr><td colspan="4">没有符合条件的学生。</td></tr>'}
      </table></div>
      ${pager(listPath, window.page, window.pages, window.total)}`,
  });
}

export function settingsPage({ user, config, message = '', error = '' }) {
  return layout({
    title: '模型',
    user,
    body: `        <h1>接口设置</h1>
      ${message ? `<p class="banner">${esc(message)}</p>` : ''}
      ${error ? `<p class="notice error">${esc(error)}</p>` : ''}
      <form class="stack" method="post" action="/teacher/settings" style="max-width:640px">
        <label>接口地址<input name="LLM_BASE_URL" value="${esc(config.baseUrl)}"></label>
        <label>模型名<input name="LLM_MODEL" value="${esc(config.model)}"></label>
        <label>密钥<input name="LLM_API_KEY" value="${esc(config.apiKey)}" type="password" autocomplete="off"></label>
        <button class="btn" type="submit">保存</button>
      </form>
      <form method="post" action="/teacher/settings/test"><button class="btn secondary" type="submit">测试连接</button></form>`,
  });
}
