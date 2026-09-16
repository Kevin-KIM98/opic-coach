// data/*.json 로더. 네트워크 우선, 실패 시 서비스워커 캐시가 응답합니다.
const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path, { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }).catch(err => { cache.delete(path); throw err; });
  cache.set(path, p);
  return p;
}

export const data = {
  index: () => getJSON('data/index.json'),
  patterns: () => getJSON('data/patterns.json'),
  pronunciation: () => getJSON('data/pronunciation.json'),
  plans: () => getJSON('data/plans.json'),
  mockSets: () => getJSON('data/mock-sets.json'),
  examSchedule: () => getJSON('data/exam-schedule.json'),

  async topic(id) {
    const idx = await this.index();
    const entry = idx.topics.find(t => t.id === id);
    if (!entry) throw new Error(`unknown topic: ${id}`);
    const topic = await getJSON('data/' + entry.file);
    topic.file = 'data/' + entry.file;
    return topic;
  },

  async topics() {
    const idx = await this.index();
    const results = await Promise.allSettled(idx.topics.map(t => this.topic(t.id)));
    return results.filter(r => r.status === 'fulfilled').map(r => r.value)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  },

  // 모든 표현 (주제 + 패턴) 을 id 와 함께 평탄화
  async allExpressions() {
    const [topics, patterns] = await Promise.all([this.topics(), this.patterns()]);
    const out = [];
    topics.forEach(t => (t.expressions || []).forEach((e, i) => out.push({ ...e, id: `${t.id}#e${i}`, source: t.title, topicId: t.id })));
    patterns.groups.forEach(g => g.items.forEach((e, i) => out.push({ ...e, id: `pat:${g.id}#${i}`, source: `패턴 · ${g.title}`, groupId: g.id })));
    return out;
  },

  async question(qid) {
    const topics = await this.topics();
    for (const t of topics) {
      const q = (t.questions || []).find(q => q.id === qid);
      if (q) return { q, topic: t };
    }
    return null;
  },
};

export const TYPE_LABEL = {
  describe: '묘사', routine: '습관·루틴', experience: '경험', comparison: '비교·변화', opinion: '의견',
  'roleplay-ask': '롤플레이 · 질문하기', 'roleplay-solve': '롤플레이 · 문제 해결', 'roleplay-experience': '롤플레이 · 경험',
  'tos-qa': 'TOS 파트3 · Q&A', 'tos-opinion': 'TOS 파트5 · 의견', 'read-aloud': 'TOS 파트1 · 읽기',
};
