import { html, raw, toast, todayKey, daysBetween } from '../util.js';
import { store } from '../store.js';
import { data } from '../data.js';
import { englishVoices, speak, support, requestMic } from '../speech.js';
import { header, promptInstall } from '../app.js';
import { CONFIG, githubUrl } from '../config.js';

export async function render(root) {
  const plans = await data.plans();
  const s = store.settings;
  const voices = englishVoices();
  const draw = () => {
    root.innerHTML = html`
      ${raw(header('설정'))}
      <div class="section-title">목표</div>
      <div class="card stack">
        <div class="field"><label>이름 (선택)</label><input type="text" id="name" value="${s.name || ''}" placeholder="홈 화면 인사에 사용"></div>
        <div class="field"><label>목표 등급</label><div class="seg" id="target">${raw(['IM3', 'IH', 'AL'].map(l => `<button data-v="${l}" class="${s.target === l ? 'active' : ''}">${l}</button>`).join(''))}</div>
          <div class="xs muted">IM3 ≈ 토익스피킹 6레벨(130~150) · IH ≈ 7레벨 · AL ≈ 8레벨</div></div>
        <div class="field"><label>시험일</label><input type="date" id="exam" value="${s.examDate || ''}"><div class="xs muted" id="examhint">${examHint(s)}</div></div>
      </div>

      <div class="section-title">학습 과정</div>
      <div class="card stack">
        <div class="seg" id="plan">${raw(plans.plans.map(p => `<button data-v="${p.id}" class="${s.plan === p.id ? 'active' : ''}">${p.title.replace(' 과정', '')}</button>`).join(''))}</div>
        <div class="xs ink2" id="plandesc">${plans.plans.find(p => p.id === s.plan)?.desc || ''}</div>
        <div class="field"><label>과정 시작일</label><input type="date" id="planStart" value="${s.planStart || todayKey()}"><div class="xs muted">시험일을 입력하면 남은 기간에 맞는 과정을 추천합니다.</div></div>
        <button class="btn sm" id="autoPlan">시험일에 맞춰 자동 설정</button>
      </div>

      <div class="section-title">음성</div>
      <div class="card stack">
        <div class="field"><label>TTS 음성 (${voices.length}개 감지)</label><select id="voice"><option value="">자동 선택</option>${raw(voices.map(v => `<option value="${v.name}" ${s.ttsVoice === v.name ? 'selected' : ''}>${v.name} (${v.lang})</option>`).join(''))}</select>
          <div class="xs muted">영어 음성이 없으면 폰 설정 → 언어 및 입력 → TTS에서 영어(미국) 음성을 설치하세요.</div></div>
        <div class="field"><label>재생 속도 <span id="rateval">${s.ttsRate}</span>x</label><input type="range" id="rate" min="0.6" max="1.3" step="0.05" value="${s.ttsRate}"></div>
        <div class="btn-row"><button class="btn" id="test">🔊 테스트</button><button class="btn" id="mic">🎙️ 마이크 권한</button></div>
        <div class="xs muted">지원: TTS ${support.tts ? '✅' : '❌'} · 음성 인식 ${support.stt ? '✅' : '❌ (Android Chrome / iOS Safari 권장)'} · 녹음 ${support.recorder ? '✅' : '❌'}</div>
      </div>

      <div class="section-title">화면</div>
      <div class="card"><div class="seg" id="theme">${raw([['', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([v, t]) => `<button data-v="${v}" class="${(s.theme || '') === v ? 'active' : ''}">${t}</button>`).join(''))}</div>
        <button class="btn block mt12" id="install">📲 홈 화면에 설치</button>
        <p class="install-hint mt8 xs">iPhone: Safari 공유 버튼 → "홈 화면에 추가". Android: Chrome 메뉴 → "앱 설치" 또는 위 버튼.</p></div>

      <div class="section-title">데이터</div>
      <div class="card stack">
        <div class="btn-row"><button class="btn" id="export">⬇️ 백업 내보내기</button><label class="btn" for="importFile">⬆️ 가져오기</label><input type="file" id="importFile" accept="application/json" class="hidden"></div>
        <button class="btn ghost" id="reset" style="color:var(--bad)">모든 기록 초기화</button>
        <div class="xs muted">기록은 이 기기 브라우저에만 저장됩니다. 기기를 바꾸면 백업 파일로 옮기세요.</div>
      </div>

      <div class="section-title">콘텐츠 · 저장소</div>
      <div class="card stack small ink2">
        <div>모든 학습 자료는 <code>data/</code> 폴더의 JSON 파일입니다. GitHub 앱이나 웹에서 파일을 수정하면 몇 분 안에 앱에 반영됩니다.</div>
        <a class="btn" href="${githubUrl('tree/' + CONFIG.repo.branch + '/data')}" target="_blank" rel="noopener">📂 GitHub에서 콘텐츠 열기</a>
        <a class="btn ghost" href="${githubUrl('blob/' + CONFIG.repo.branch + '/CONTENT_GUIDE.md')}" target="_blank" rel="noopener">📝 콘텐츠 수정 가이드</a>
        <div class="xs muted">${CONFIG.appName} v${CONFIG.version} · ${CONFIG.repo.owner}/${CONFIG.repo.name}</div>
      </div>`;

    root.querySelector('#name').addEventListener('change', e => store.setSetting('name', e.target.value.trim()));
    root.querySelectorAll('#target button').forEach(b => b.addEventListener('click', () => { store.setSetting('target', b.dataset.v); draw(); }));
    root.querySelector('#exam').addEventListener('change', e => { store.setSetting('examDate', e.target.value); root.querySelector('#examhint').textContent = examHint(store.settings); });
    root.querySelectorAll('#plan button').forEach(b => b.addEventListener('click', () => { store.setSetting('plan', b.dataset.v); draw(); }));
    root.querySelector('#planStart').addEventListener('change', e => store.setSetting('planStart', e.target.value));
    root.querySelector('#autoPlan').addEventListener('click', () => {
      const ex = store.settings.examDate; if (!ex) return toast('먼저 시험일을 입력하세요');
      const left = daysBetween(todayKey(), ex);
      const plan = left <= 35 ? '4w' : left <= 63 ? '8w' : '12w';
      const weeks = { '4w': 28, '8w': 56, '12w': 84 }[plan];
      const start = new Date(); const startKey = todayKey(start);
      // 시험 직전에 과정이 끝나도록 시작일 조정 (오늘 이전이면 오늘)
      const idealStart = new Date(ex); idealStart.setDate(idealStart.getDate() - weeks);
      store.setSetting('plan', plan); store.setSetting('planStart', idealStart > start ? todayKey(idealStart) : startKey);
      toast(`${plan === '4w' ? '4주' : plan === '8w' ? '8주' : '12주'} 과정으로 설정했어요 (D-${left})`); draw();
    });
    root.querySelector('#voice').addEventListener('change', e => store.setSetting('ttsVoice', e.target.value));
    root.querySelector('#rate').addEventListener('input', e => { store.setSetting('ttsRate', Number(e.target.value)); root.querySelector('#rateval').textContent = e.target.value; });
    root.querySelector('#test').addEventListener('click', () => speak("Hi, I'm your OPIc coach. Let's start the interview now. Tell me a little about yourself."));
    root.querySelector('#mic').addEventListener('click', async () => toast(await requestMic() ? '마이크 사용 가능 ✅' : '마이크 권한이 거부됐어요. 브라우저 설정에서 허용하세요.'));
    root.querySelectorAll('#theme button').forEach(b => b.addEventListener('click', () => { store.setSetting('theme', b.dataset.v); if (b.dataset.v) document.documentElement.dataset.theme = b.dataset.v; else delete document.documentElement.dataset.theme; draw(); }));
    root.querySelector('#install').addEventListener('click', promptInstall);
    root.querySelector('#export').addEventListener('click', () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `opic-coach-backup-${todayKey()}.json`; a.click();
    });
    root.querySelector('#importFile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { store.importJSON(await f.text()); toast('가져오기 완료'); draw(); } catch (err) { toast('가져오기 실패: ' + err.message); }
    });
    root.querySelector('#reset').addEventListener('click', () => { if (confirm('모든 학습 기록과 설정을 지울까요?')) { store.reset(); toast('초기화했어요'); draw(); } });
  };
  draw();
}

function examHint(s) {
  if (!s.examDate) return '시험일을 등록하면 홈에 D-day가 표시됩니다.';
  const d = daysBetween(todayKey(), s.examDate);
  return d < 0 ? '시험일이 지났습니다. 새 일정을 등록하세요.' : `D-${d} · 추천 과정: ${d <= 35 ? '4주 집중' : d <= 63 ? '8주 표준' : '12주 여유'}`;
}
