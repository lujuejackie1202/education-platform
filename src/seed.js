import { db, hashPassword, nowIso } from './db.js';

const P50 = { A: 50, B: 40, C: 30, D: 20, E: 0 };
const P100 = { A: 100, B: 85, C: 70, D: 60, E: 0 };
const P30 = { A: 30, B: 24, C: 18, D: 10, E: 0 };
const SHAOXING_WEIGHTS = {
  yu: 0.15, shu: 0.15, wai: 0.35,
  wu: 0.05, hua: 0.05, sheng: 0.05, zheng: 0.05, shi: 0.05, di: 0.05, ji: 0.05,
};

function school(name, region, tier, formula, majors) {
  return { name, region, tier, formula, majors };
}
function selected6(points, label) {
  return { mode: 'selected6', points, label };
}

const DATA_YEAR = 2026;
const NOTE = '折算规则按 2026 年资料整理成可计算配置。入围分是示例值，用来分组，不是院校公布原值。教师核对后可覆盖。';

export const CATALOG = [
  school('金华职业技术大学', '金华', '公办', selected6(P50, '语数外 + 3 门自选。A=50，B=40，C=30，D=20，E=0'), [
    major('软件技术', '电子信息', 40, 'ge:D', '不限', 230, '机测', 'published', '阅读理解、数量关系、逻辑推理、专业认知、时事'),
    major('大数据与会计', '财经商贸', 35, 'ge:D', '不限', 245, '机测', 'published', '经济常识、运算、资料分析、职业素养'),
    major('空中乘务', '交通运输', 30, 'ge:D', '不限', 210, '面试', 'unpublished', '职业形象、服务意识、临场表达', { maleMin: 174, femaleMin: 163, note: '无色盲' }),
  ]),
  school('浙江机电职业技术大学', '杭州', '公办', selected6(P50, '语数外 + 3 门自选。A=50，B=40，C=30，D=20，E=0'), [
    major('电气自动化技术', '装备制造', 45, 'ge:D', '物理或技术', 248, '笔试', 'published', '科学素养、技术应用、逻辑推理'),
    major('工业机器人技术', '装备制造', 40, 'ge:D', '物理或技术', 236, '笔试', 'published', '科学素养、专业认知、空间想象'),
    major('新能源汽车技术', '装备制造', 30, 'minCount:C:2', '物理', 220, '笔试', 'unpublished', '专业基础、安全规范、时事'),
  ]),
  school('杭州职业技术大学', '杭州', '公办', selected6(P50, '语数外 + 3 门自选。A=50，B=40，C=30，D=20，E=0'), [
    major('工业互联网应用', '电子信息', 36, 'ge:D', '不限', 242, '面试+笔试', 'published', '职业素养、数字技术常识、专业认知'),
    major('电子商务', '财经商贸', 40, 'ge:D', '不限', 228, '面试', 'published', '商业常识、表达、时事'),
    major('服装设计与工艺', '文化艺术', 28, 'ge:D', '不限', 200, '面试', 'unpublished', '审美基础、专业认知、作品阐述'),
  ]),
  school('浙江金融职业学院', '杭州', '公办', selected6({ A: 60, B: 50, C: 40, D: 30, E: 0 }, '语数英 + 3 门自选。A=60，B=50，C=40，D=30，E=0'), [
    major('金融服务与管理', '财经商贸', 50, 'ge:D;wai:C', '不限', 280, '面试', 'published', '金融常识、职业素养、表达'),
    major('大数据与财务管理', '财经商贸', 40, 'ge:D;wai:C', '不限', 292, '机测', 'published', '计算、资料分析、财经法规常识'),
    major('国际经济与贸易', '财经商贸', 32, 'ge:D;wai:C', '不限', 270, '面试', 'unpublished', '外贸常识、英语应用、时事'),
  ]),
  school('宁波职业技术大学', '宁波', '公办', selected6(P50, '语数外 + 3 门自选。A=50，B=40，C=30，D=20，E=0'), [
    major('应用化工技术', '装备制造', 30, 'ge:D', '化学', 226, '笔试', 'published', '化学基础、安全、实验习惯'),
    major('软件技术', '电子信息', 42, 'ge:D', '不限', 238, '机测', 'published', '程序常识、逻辑、专业认知'),
    major('酒店管理与数字化运营', '旅游', 34, 'ge:D', '不限', 205, '面试', 'unpublished', '服务礼仪、沟通、专业认知'),
  ]),
  school('温州职业技术大学', '温州', '公办', selected6(P50, '语数外 + 3 门自选。A=50，B=40，C=30，D=20，E=0'), [
    major('鞋类设计与工艺', '装备制造', 30, 'ge:D', '不限', 198, '笔试', 'published', '人文素养、科学素养、专业认知'),
    major('机电一体化技术', '装备制造', 40, 'ge:D', '物理或技术', 232, '笔试', 'published', '机械常识、电路基础、安全'),
    major('市场营销', '财经商贸', 36, 'ge:D', '不限', 214, '面试', 'unpublished', '沟通、案例判断、商业常识'),
  ]),
  school('义乌工商职业技术学院', '金华', '公办', selected6(P100, '语数外 + 3 门自选。A=100，B=90，C=80，D=60，E=0'), [
    major('国际商务', '财经商贸', 40, 'ge:D', '不限', 500, '面试', 'published', '市场常识、表达、跨境电商认知'),
    major('建筑工程技术', '土木建筑', 35, 'ge:D', '物理或地理', 470, '笔试', 'published', '空间识图、工程常识、计算'),
    major('社会工作', '教育', 30, 'ge:D', '不限', 450, '面试', 'unpublished', '沟通、政策常识、职业动机'),
  ]),
  school('绍兴职业技术学院', '绍兴', '民办', {
    mode: 'weighted10',
    points: { A: 100, B: 80, C: 70, D: 60, E: 0 },
    weights: SHAOXING_WEIGHTS,
    label: '10 门加权。语文 15%，数学 15%，英语 35%，其余 7 门各 5%。A=100，B=80，C=70，D=60，E=0',
  }, [
    major('软件技术', '电子信息', 45, 'ge:D', '不限', 78, '机测', 'published', '逻辑推理、专业认知、时事'),
    major('早期教育', '教育', 40, 'ge:D', '不限', 82, '面试', 'published', '职业素养、儿童观察、表达'),
    major('护理', '医药卫生', 50, 'ge:D;wai:C', '化学或生物', 86, '面试', 'unpublished', '职业素养、基础护理常识、沟通'),
  ]),
  school('浙江纺织服装职业技术学院', '宁波', '公办', {
    mode: 'all10',
    points: P100,
    label: '10 门合计。A=100，B=85，C=70，D=60，E=0',
  }, [
    major('服装设计与工艺', '文化艺术', 36, 'ge:D', '不限', 760, '面试', 'published', '审美、工艺常识、专业阐述'),
    major('跨境电子商务', '财经商贸', 40, 'ge:D', '不限', 790, '机测', 'published', '平台规则、时事、逻辑'),
    major('人物形象设计', '文化艺术', 28, 'minCount:C:2', '不限', 730, '面试', 'unpublished', '形象观察、色彩、表达'),
  ]),
  school('湖州职业技术学院', '湖州', '公办', {
    mode: 'all10',
    points: { A: 30, B: 27, C: 24, D: 21, E: 0 },
    label: '10 门合计。A=30，B=27，C=24，D=21，E=0',
  }, [
    major('工业机器人技术', '装备制造', 32, 'ge:D', '物理或技术', 250, '面试', 'published', '职业适应性、技术常识'),
    major('跨境电子商务', '财经商贸', 34, 'ge:D', '不限', 255, '面试', 'unpublished', '商业常识、表达'),
    major('旅游管理', '旅游', 30, 'ge:D', '不限', 240, '面试', 'published', '服务意识、地域文化、表达'),
  ]),
  school('丽水职业技术学院', '丽水', '公办', selected6(P30, '语数外 + 3 门自选。A=30，B=24，C=18，D=10，E=0'), [
    major('林业技术', '农林', 40, 'ge:D', '不限', 120, '笔试', 'published', '基础素质、职业素养、农林常识'),
    major('园艺技术', '农林', 36, 'ge:D', '生物或技术', 112, '笔试', 'unpublished', '生物基础、生产常识'),
    major('计算机网络技术', '电子信息', 38, 'ge:D', '不限', 128, '笔试', 'published', '网络常识、逻辑、安全意识'),
  ]),
  school('浙江商业职业技术学院', '杭州', '公办', selected6(P50, '语数外 + 3 门自选。A=50，B=40，C=30，D=20，E=0'), [
    major('烹饪工艺与营养', '旅游', 30, 'ge:D', '不限', 218, '面试', 'published', '职业卫生、专业认知、表达'),
    major('大数据与会计', '财经商贸', 48, 'minCount:C:4', '不限', 250, '机测', 'published', '计算、凭证常识、法规'),
    major('连锁经营与管理', '财经商贸', 34, 'ge:D', '不限', 208, '面试', 'unpublished', '门店场景、沟通、服务'),
  ]),
];

function major(name, category, plan, req, subject, cutoff, form, outline, outlineText, body = null) {
  return {
    name, category, plan, req, subject, cutoff, form, outline, outlineText, body,
    composite: '综合分由学考折算与校测成绩按当年简章合成，本页只比较学考折算与入围参考分',
  };
}

const TEMPLATES = [
  ['职业素养', '下列做法更符合校测里对职业素养的要求？', ['先确认安全和服务对象，再完成任务', '为了赶时间跳过核验', '只完成自己熟悉的部分', '遇到规则不清时按个人习惯处理'], 'A', '校测通常先看规则意识、安全意识和服务对象是否明确。'],
  ['专业认知', '关于这个专业的日常工作，更准确的说法是？', ['需要把课堂知识用到具体岗位任务里', '入学后不再接触基础文化课', '专业课只考查记忆，不考查判断', '岗位工作与沟通无关'], 'A', '综合素质测试看的是能否把基础知识连到岗位，而不是背一句口号。'],
  ['逻辑推理', '一项任务有先后依赖。合理的处理顺序是？', ['先找出不能颠倒的步骤，再安排并行的部分', '从最后一步倒着做', '哪项容易先做哪项', '全部同时开始'], 'A', '逻辑题看依赖关系，不看个人觉得哪项容易。'],
  ['时事政治', '做时政题时，更稳妥的判断依据是？', ['以权威发布的政策和事实为准', '以社交平台热帖为准', '以个人印象为准', '选项越绝对越可能正确'], 'A', '时政题核对的是公开事实和政策表述，绝对化选项通常要警惕。'],
  ['沟通表达', '面试里介绍自己想学这个专业，更好的结构是？', ['经历、对专业的了解、入学后准备做什么', '只强调成绩排名', '背诵一段与专业无关的范文', '评价其他考生的选择'], 'A', '表达要有个人依据和专业对应关系，篇幅短也要完整。'],
  ['科学素养', '看到一个实验或生产安全题，优先检查的是？', ['风险、防护和个人是否有资格操作', '结果好不好看', '能不能省略记录', '是否可以用经验代替步骤'], 'A', '科学素养题经常把安全和步骤放在结果前面。'],
  ['人文素养', '阅读一段材料后，题目最常要求的是？', ['根据材料本身做判断，不额外编造', '选择措辞最强烈的一项', '忽略材料里的限制条件', '用个人经历代替材料'], 'A', '人文题先回到材料里的条件，再判断选项。'],
  ['服务场景', '面对用户的投诉，更合适的第一步是？', ['听清问题并确认对方的具体要求', '立即解释不是自己的责任', '承诺一个无法核实的结果', '转移话题介绍学校优势'], 'A', '服务类面试先澄清事实和诉求，再给处理办法。'],
];

export function patchMajorFlags() {
  const rows = db.prepare('SELECT id, name, body_req_json, cooperation, color_req FROM majors').all();
  const update = db.prepare('UPDATE majors SET cooperation = ?, color_req = ? WHERE id = ?');
  for (const row of rows) {
    const cooperation = /中外|合办/.test(row.name) ? 1 : Number(row.cooperation || 0);
    const color = row.color_req || (String(row.body_req_json || '').includes('色盲') ? 'no_colorblind' : '');
    if (cooperation !== Number(row.cooperation || 0) || color !== (row.color_req || '')) update.run(cooperation, color, row.id);
  }
}

export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM schools').get().n;
    patchMajorFlags();
  if (count > 0) return;
  const insertSchool = db.prepare(`
    INSERT INTO schools (name, region, tier, year, formula_json, source_note, status)
    VALUES (?, ?, ?, ?, ?, ?, 'published')
  `);
  const insertMajor = db.prepare(`
    INSERT INTO majors (
      school_id, name, category, plan_num, xuekao_req, subject_req, body_req_json,
      test_form, outline_status, outline_text, cutoff_score, cutoff_year, composite_rule, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
  `);
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      major_id, year, kind, module, stem, options_json, answer, explanation,
      difficulty, status, origin, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)
  `);
  const created = nowIso();
  db.exec('BEGIN');
  try {
    for (const item of CATALOG) {
      const schoolId = Number(insertSchool.run(
        item.name, item.region, item.tier, DATA_YEAR, JSON.stringify(item.formula), NOTE,
      ).lastInsertRowid);
      item.majors.forEach((entry, index) => {
        const majorId = Number(insertMajor.run(
          schoolId, entry.name, entry.category, entry.plan, entry.req, entry.subject,
          entry.body ? JSON.stringify(entry.body) : null,
          entry.form, entry.outline, entry.outlineText, entry.cutoff, 2025, entry.composite,
        ).lastInsertRowid);
        writeQuestions(insertQuestion, majorId, item.name, entry, index === 0 && item.name === '金华职业技术大学', created);
      });
    }
    db.prepare(`
      INSERT INTO users (phone, name, password_hash, role, paid_until, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('13800000001', '演示教师', hashPassword('teacher123'), 'teacher', null, created);
    db.prepare(`
      INSERT INTO users (phone, name, password_hash, role, paid_until, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('13900000001', '演示学生', hashPassword('student123'), 'student', null, created);
    db.exec('COMMIT');
    patchMajorFlags();
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function writeQuestions(insertQuestion, majorId, schoolName, entry, withDraft, created) {
  TEMPLATES.forEach((template, index) => {
    const [module, stem, options, answer, explanation] = template;
    insertQuestion.run(
      majorId, 2025, 'history', module,
      `${schoolName}「${entry.name}」历年题型：${stem}`,
      JSON.stringify(options), answer,
      `${explanation} 本题按该专业考纲模块编写，是仿真练习，不是真题。`,
      (index % 3) + 2, 'published', created,
    );
  });
  if (entry.outline === 'published') {
    TEMPLATES.forEach((template, index) => {
      const [module, stem, options, answer, explanation] = template;
      insertQuestion.run(
        majorId, DATA_YEAR, 'current', module,
        `${schoolName}「${entry.name}」今年考纲练习：${stem}`,
        JSON.stringify(options), answer,
        `${explanation} 本题对齐已收录的今年考纲模块，不是对原题的预测。`,
        (index % 3) + 2, 'published', created,
      );
    });
  }
  if (withDraft) {
    insertQuestion.run(
      majorId, DATA_YEAR, 'current', '专业认知',
      `${schoolName}「${entry.name}」待审草稿：入学后第一学期更值得先弄清的是？`,
      JSON.stringify(['岗位任务和课程的对应关系', '只收集往年录取分数', '先背诵全部时政原文', '等待老师指定唯一答案']),
      'A', '草稿题，教师发布后学生才看得到。', 2, 'draft', created,
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedIfEmpty();
  console.log('seed complete');
}
