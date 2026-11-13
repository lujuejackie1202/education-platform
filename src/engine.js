export const SUBJECTS = [
  ['yu', '语文'],
  ['shu', '数学'],
  ['wai', '英语'],
  ['wu', '物理'],
  ['hua', '化学'],
  ['sheng', '生物'],
  ['zheng', '政治'],
  ['shi', '历史'],
  ['di', '地理'],
  ['ji', '技术'],
];

export const ELECTIVES = SUBJECTS.slice(3);
export const GRADES = ['A', 'B', 'C', 'D', 'E'];
export const REGIONS = ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'];
export const CATEGORIES = ['装备制造', '电子信息', '财经商贸', '医药卫生', '土木建筑', '交通运输', '旅游', '文化艺术', '教育', '农林'];
const RANK = { A: 5, B: 4, C: 3, D: 2, E: 1 };

export function scoreProfile(formula, profile) {
  const points = formula.points;
  const gradeOf = (key) => {
    const grade = profile.grades[key];
    if (!GRADES.includes(grade)) return 'E';
    return grade;
  };
  if (formula.mode === 'selected6') {
    const keys = ['yu', 'shu', 'wai', ...profile.electives];
    const score = keys.reduce((sum, key) => sum + points[gradeOf(key)], 0);
    return { score, max: points.A * 6, keys };
  }
  if (formula.mode === 'all10') {
    const keys = SUBJECTS.map(([key]) => key);
    const score = keys.reduce((sum, key) => sum + points[gradeOf(key)], 0);
    return { score, max: points.A * 10, keys };
  }
  if (formula.mode === 'weighted10') {
    const weights = formula.weights;
    let score = 0;
    let weightSum = 0;
    for (const [key] of SUBJECTS) {
      const weight = Number(weights[key] || 0);
      weightSum += weight;
      score += points[gradeOf(key)] * weight;
    }
    return { score: round1(score), max: round1(points.A * weightSum), keys: SUBJECTS.map(([key]) => key) };
  }
  throw new Error(`未知折算方式：${formula.mode}`);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function passesXuekao(req, grades) {
  const rules = String(req || 'ge:D').split(';').map((part) => part.trim()).filter(Boolean);
  const failures = [];
  for (const rule of rules) {
    const ge = rule.match(/^ge:([A-E])$/);
    if (ge) {
      const need = ge[1];
      const bad = SUBJECTS.filter(([key]) => RANK[grades[key]] < RANK[need]).map(([, name]) => name);
      if (bad.length) failures.push(`学考需全部不低于 ${need}，未达到：${bad.join('、')}`);
      continue;
    }
    const count = rule.match(/^minCount:([A-E]):(\d+)$/);
    if (count) {
      const need = count[1];
      const n = Number(count[2]);
      const got = SUBJECTS.filter(([key]) => RANK[grades[key]] >= RANK[need]).length;
      if (got < n) failures.push(`学考至少 ${n} 门不低于 ${need}，当前 ${got} 门`);
      continue;
    }
    const subject = rule.match(/^(wai|yu|shu):([A-E])$/);
    if (subject) {
      const key = subject[1];
      const need = subject[2];
      const label = SUBJECTS.find(([id]) => id === key)[1];
      if (RANK[grades[key]] < RANK[need]) failures.push(`${label}需不低于 ${need}，当前 ${grades[key]}`);
    }
  }
  return failures;
}

export function passesSubject(subjectReq, electives) {
  const text = String(subjectReq || '不限').trim();
  if (!text || text === '不限') return [];
  const options = text.split(/或|、|\//).map((item) => item.trim()).filter(Boolean);
  const names = Object.fromEntries(ELECTIVES);
  const selected = electives.map((key) => names[key]);
  const ok = options.some((name) => selected.includes(name));
  if (ok) return [];
  return [`选科要求 ${text}，当前自选为 ${selected.join('、')}`];
}

export function passesBody(body, profile) {
  if (!body) return { failures: [], notes: [] };
  const notes = [];
  if (body.note) notes.push(body.note);
  if (!body.maleMin && !body.femaleMin) return { failures: [], notes };
  if (!profile.gender || !profile.heightCm) {
    notes.push('简章含身高要求，档案未填性别或身高，本条未做身高核验');
    return { failures: [], notes };
  }
  const min = profile.gender === '男' ? body.maleMin : body.femaleMin;
  if (min && profile.heightCm < min) {
    return { failures: [`身高要求${profile.gender}生不低于 ${min}cm，当前 ${profile.heightCm}cm`], notes };
  }
  return { failures: [], notes };
}

export function bandFor(gap, maxScore, hasCutoff) {
  if (!hasCutoff || !maxScore) return { band: 'unknown', label: '缺少入围分' };
  const ratio = gap / maxScore;
  if (ratio >= 0.08) return { band: 'high', label: '明显高于近年入围线' };
  if (ratio >= 0) return { band: 'mid', label: '贴近近年入围线' };
  return { band: 'low', label: '刚过硬门槛' };
}

const QUOTAS = {
  rush: { high: 12, mid: 5, low: 2, unknown: 1 },
  balance: { high: 8, mid: 6, low: 4, unknown: 2 },
  safe: { high: 4, mid: 8, low: 6, unknown: 2 },
};

export function matchMajors(rows, profile) {
  const eligible = [];
  const excluded = [];
  for (const row of rows) {
    const formula = JSON.parse(row.formula_json);
    const body = row.body_req_json ? JSON.parse(row.body_req_json) : null;
    const failures = [
      ...passesXuekao(row.xuekao_req, profile.grades),
      ...passesSubject(row.subject_req, profile.electives),
      ...passesBody(body, profile).failures,
      ...passesProfile(row, profile),
    ];
    if (failures.length) {
      excluded.push({ school: row.school_name, major: row.name, reasons: failures });
      continue;
    }
    const scored = scoreProfile(formula, profile);
    const hasCutoff = row.cutoff_score !== null && row.cutoff_score !== undefined;
    const gap = hasCutoff ? round1(scored.score - row.cutoff_score) : null;
    const band = bandFor(gap, scored.max, hasCutoff);
    const ratio = hasCutoff && scored.max ? round1(gap / scored.max * 100) : null;
    const bodyNotes = passesBody(body, profile).notes;
    const reasons = [
      `折算规则：${formula.label}`,
      `折算分 ${scored.score}，满分 ${scored.max}`,
      hasCutoff
        ? `${row.cutoff_year} 年入围参考分 ${row.cutoff_score}，相差 ${gap} 分，约占满分的 ${ratio}%`
        : '该专业未录入入围分，只确认硬门槛已通过',
      `学考要求已通过（${row.xuekao_req}），选科要求：${row.subject_req || '不限'}`,
      ...bodyNotes,
    ];
    if (profile.colorVision === 'unknown' && row.color_req === 'no_colorblind') reasons.push('该专业要求无色盲色弱，色觉尚未确认');
    if (row.composite_rule) reasons.push(`综合分：${row.composite_rule}`);
    eligible.push({
      majorId: row.id,
      school: row.school_name,
      region: row.region,
      tier: row.tier,
      major: row.name,
      category: row.category,
      planNum: row.plan_num,
      testForm: row.test_form,
      outlineStatus: row.outline_status,
      converted: scored.score,
      maxScore: scored.max,
      cutoff: hasCutoff ? row.cutoff_score : null,
      cutoffYear: row.cutoff_year,
      gap,
      ratio,
      band: band.band,
      bandLabel: band.label,
      reasons,
      preference: preference(row, profile, ratio),
      sourceNote: row.source_note,
    });
  }
  return { results: pickTwenty(eligible, profile.strategy), excludedCount: excluded.length, excluded: excluded.slice(0, 8) };
}

function passesProfile(row, profile) {
  const failures = [];
  const audience = row.audience || '不限';
  if (profile.studentType && audience !== '不限' && audience !== profile.studentType) {
    failures.push(`招生对象是${audience}，当前是${profile.studentType}`);
  }
  if (profile.avoidRegions?.includes(row.region)) failures.push(`已选择不去${row.region}`);
  if (profile.acceptPrivate === false && String(row.tier || '').includes('民办')) failures.push('不接受民办院校');
  if (profile.acceptCoop === false && (Number(row.cooperation) === 1 || /中外|合办/.test(row.name))) failures.push('不接受中外合作办学');
  if (profile.colorVision === 'weak' && row.color_req === 'no_colorblind') failures.push('该专业要求无色盲色弱');
  return failures;
}

function preference(row, profile, ratio) {
  let score = 0;
  if (profile.regions?.includes(row.region)) score += 2;
  if (profile.categories?.includes(row.category)) score += 2;
  score += (ratio ?? -50) / 100;
  return score;
}

export function pickTwenty(eligible, strategy = 'balance') {
  const quotas = QUOTAS[strategy] || QUOTAS.balance;
  const byBand = { high: [], mid: [], low: [], unknown: [] };
  for (const item of eligible) (byBand[item.band] || byBand.unknown).push(item);
  for (const band of Object.values(byBand)) band.sort((a, b) => b.preference - a.preference);
  const picked = [];
  const used = new Set();
  const schoolCount = {};
  const take = (item) => {
    if ((schoolCount[item.school] || 0) >= 2) return false;
    schoolCount[item.school] = (schoolCount[item.school] || 0) + 1;
    picked.push(item);
    used.add(item.majorId);
    return true;
  };
  for (const band of ['high', 'mid', 'low', 'unknown']) {
    let got = 0;
    for (const item of byBand[band]) {
      if (got >= quotas[band]) break;
      if (take(item)) got += 1;
    }
  }
  if (picked.length < 20) {
    const rest = eligible.filter((item) => !used.has(item.majorId)).sort((a, b) => b.preference - a.preference);
    for (const item of rest) {
      if (picked.length >= 20) break;
      take(item);
    }
  }
  return picked.slice(0, 20);
}
