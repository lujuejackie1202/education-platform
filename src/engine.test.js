import test from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, matchMajors, passesXuekao, scoreProfile } from './engine.js';

const grades = {
  yu: 'B', shu: 'B', wai: 'B', wu: 'B', hua: 'C', sheng: 'C',
  zheng: 'B', shi: 'C', di: 'C', ji: 'B',
};
const profile = {
  grades,
  electives: ['wu', 'hua', 'ji'],
  regions: ['杭州'],
  categories: ['电子信息'],
  gender: '女',
  heightCm: 160,
};

test('语数外加三门自选按所选科目计分', () => {
  const scored = scoreProfile({
    mode: 'selected6',
    points: { A: 50, B: 40, C: 30, D: 20, E: 0 },
  }, profile);
  assert.equal(scored.score, 40 + 40 + 40 + 40 + 30 + 40);
  assert.equal(scored.max, 300);
});

test('英语未达要求会被硬门槛拦住', () => {
  const failures = passesXuekao('ge:D;wai:C', { ...grades, wai: 'D' });
  assert.equal(failures.length, 1);
});

test('分组按差距占满分的比例', () => {
  assert.equal(bandFor(30, 300, true).band, 'high');
  assert.equal(bandFor(20, 300, true).band, 'mid');
  assert.equal(bandFor(0, 300, true).band, 'mid');
  assert.equal(bandFor(-1, 300, true).band, 'low');
  assert.equal(bandFor(null, 300, false).band, 'unknown');
});

test('结果最多 20 条，且不含未过硬门槛的专业', () => {
  const rows = [];
  for (let i = 0; i < 30; i += 1) {
    rows.push({
      id: i + 1,
      school_name: `学校${i}`,
      region: i % 2 ? '杭州' : '丽水',
      tier: '公办',
      name: `专业${i}`,
      category: i % 3 ? '财经商贸' : '电子信息',
      plan_num: 30,
      xuekao_req: i === 0 ? 'wai:A' : 'ge:D',
      subject_req: '不限',
      body_req_json: null,
      test_form: '笔试',
      outline_status: 'published',
      cutoff_score: 200 + (i % 5) * 15,
      cutoff_year: 2025,
      composite_rule: '',
      formula_json: JSON.stringify({
        mode: 'selected6',
        points: { A: 50, B: 40, C: 30, D: 20, E: 0 },
        label: '测试规则',
      }),
      source_note: '测试',
    });
  }
  const matched = matchMajors(rows, profile);
  assert.equal(matched.results.length, 20);
  assert.equal(matched.excludedCount, 1);
  assert.equal(matched.results.some((item) => item.major === '专业0'), false);
});

test('不接受民办时民办专业不进入结果', () => {
  const row = {
    id: 1, school_name: '民办学院', region: '杭州', tier: '民办', name: '软件技术', category: '电子信息',
    plan_num: 20, xuekao_req: 'ge:D', subject_req: '不限', body_req_json: null, test_form: '笔试',
    outline_status: 'published', cutoff_score: 200, cutoff_year: 2025, composite_rule: '', cooperation: 0,
    audience: '不限', color_req: '', formula_json: JSON.stringify({ mode: 'selected6', points: { A: 50, B: 40, C: 30, D: 20, E: 0 }, label: '测试' }), source_note: '',
  };
  const matched = matchMajors([row], { ...profile, acceptPrivate: false, acceptCoop: true, studentType: '普高', colorVision: 'normal', avoidRegions: [], strategy: 'balance' });
  assert.equal(matched.results.length, 0);
  assert.equal(matched.excludedCount, 1);
});
