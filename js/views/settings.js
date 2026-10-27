import { html, raw, toast, todayKey, daysBetween } from '../util.js';
import { store } from '../store.js';
import { data } from '../data.js';
import { englishVoices, speak, support, requestMic, Recognizer, sttDiagnosis } from '../speech.js';
import { header, promptInstall } from '../app.js';
import { CONFIG, githubUrl, isEditor, setEditor, contentBranch } from '../config.js';

export async function render(root) {
  const s = store.settings;
  const voices = englishVoices();
  const draw = () => {
    root.innerHTML = html`
      ${raw(header('설정'))}
      <div class="section-title">목표</div>
      <div class="card stack">
        <div class="field"><label>이름 (선택)</label><input type="text" id="name" value="${s.name || ''}" placeholder="홈 화면 인사에 사용"></div>
        <div class="field"><label>목표 등급</label><div class="seg" id="target">${raw(['IM3', 'IH', 'AL'].map(l => `<button data-v="${l}" class="${s.target === l ? 'active' : ''}">${l}</button>`).join(''))}</div>
          <div class="xs muted">IM3 = 일관된 문장 + 연결어 + 과거시제 · IH = 디테일·비교 · AL = 풍부한 어휘와 긴 발화</div></div>
        <div class="field"><label>시험일</label><input type="date" id="exam" value="${s.examDate || ''}"><div class="xs muted" id="examhint">${examHint(s)}</div></div>
        <div class="xs muted">비워 두면 홈에서 <b>가장 빠른 응시 가능일</b>(일요일·공휴일 제외)로 D-day를 셉니다. 등록한 시험일이 지나도 자동으로 다음 날짜로 넘어갑니다.</div>
      </div>

      <div class="section-title">음성</div>
      <div class="card stack">
        <div class="field"><label>TTS 음성 (${voices.length}개 감지)</label><select id="voice"><option value="">자동 선택</option>${raw(voices.map(v => `<option value="${v.name}" ${s.ttsVoice === v.name ? 'selected' : ''}>${v.name} (${v.lang})</option>`).join(''))}</select>
          <div class="xs muted">영어 음성이 없으면 폰 설정 → 언어 및 입력 → TTS에서 영어(미국) 음성을 설치하세요.</div></div>
        <div class="field"><label>재생 속도 <span id="rateval">${s.ttsRate}</span>x</label><input type="range" id="rate" min="0.6" max="1.3" step="0.05" value="${s.ttsRate}"></div>
        <div class="field"><label>답변 오디오 녹음</label><div class="seg" id="recaudio">${raw([[1, '켬'], [0, '끔']].map(([v, t]) => `<button data-v="${v}" class="${(s.recordAudio !== false) === !!v ? 'active' : ''}">${t}</button>`).join(''))}</div>
          <div class="xs muted">켜면 답변을 다시 들어볼 수 있습니다. 안드로이드에서 <b>음성 인식이 계속 실패</b>하면 녹음이 마이크를 잡고 있는 경우가 있으니 꺼 보세요.</div></div>
        <div class="field"><label>화면이 꺼져도 계속 재생</label><div class="seg" id="bgplay">${raw([[1, '켬'], [0, '끔']].map(([v, t]) => `<button data-v="${v}" class="${(s.bgPlay !== false) === !!v ? 'active' : ''}">${t}</button>`).join(''))}</div>
          <div class="xs muted">자동 재생 · 전체 듣기 중에 화면을 꺼도(전원 버튼) 계속 들려요. 잠금 화면에서 ⏸ 로 멈출 수 있어요. iPhone Safari 는 화면이 꺼지면 음성이 멈출 수 있어요.</div></div>
        <div class="field"><label>이어폰을 빼면 멈춤</label><div class="seg" id="unplug">${raw([[1, '켬'], [0, '끔']].map(([v, t]) => `<button data-v="${v}" class="${(s.stopOnUnplug !== false) === !!v ? 'active' : ''}">${t}</button>`).join(''))}</div>
          <div class="xs muted">유선 이어폰을 뽑거나 블루투스 이어폰 연결이 끊기면 재생을 멈춰 스피커로 소리가 나지 않게 해요.</div></div>
        <div class="btn-row"><button class="btn" id="test">🔊 테스트</button><button class="btn" id="mic">🎙️ 마이크 권한</button></div>
        <button class="btn block" id="sttcheck">🩺 음성 인식 점검 (5초)</button>
        <div class="xs mt8" id="sttresult"></div>
        <div class="xs muted">지원: TTS ${support.tts ? '✅' : '❌'} · 음성 인식 ${support.stt ? '✅' : '❌ (Android Chrome / iOS Safari 권장)'} · 녹음 ${support.recorder ? '✅' : '❌'} · 인터넷 ${navigator.onLine ? '✅' : '❌ (음성 인식은 온라인 필요)'}</div>
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

      ${raw(isEditor() ? editorCard() : '')}
      <div class="xs muted center mt12" id="about" role="button" tabindex="0">${CONFIG.appName} v${CONFIG.version}</div>`;

    root.querySelector('#name').addEventListener('change', e => store.setSetting('name', e.target.value.trim()));
    root.querySelectorAll('#target button').forEach(b => b.addEventListener('click', () => { store.setSetting('target', b.dataset.v); draw(); }));
    root.querySelector('#exam').addEventListener('change', e => { store.setSetting('examDate', e.target.value); root.querySelector('#examhint').textContent = examHint(store.settings); });
    root.querySelector('#voice').addEventListener('change', e => store.setSetting('ttsVoice', e.target.value));
    root.querySelector('#rate').addEventListener('input', e => { store.setSetting('ttsRate', Number(e.target.value)); root.querySelector('#rateval').textContent = e.target.value; });
    root.querySelector('#test').addEventListener('click', () => speak("Hi, I'm your OPIc coach. Let's start the interview now. Tell me a little about yourself."));
    root.querySelector('#mic').addEventListener('click', async () => toast(await requestMic() ? '마이크 사용 가능 ✅' : '마이크 권한이 거부됐어요. 브라우저 설정에서 허용하세요.'));
    root.querySelectorAll('#recaudio button').forEach(b => b.addEventListener('click', () => { store.setSetting('recordAudio', b.dataset.v === '1'); draw(); }));
    const seg = (id, key) => root.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
      store.setSetting(key, b.dataset.v === '1');
      root.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('active', x === b));
    }));
    seg('bgplay', 'bgPlay');
    seg('unplug', 'stopOnUnplug');
    root.querySelector('#sttcheck').addEventListener('click', e => runSttCheck(e.currentTarget, root.querySelector('#sttresult')));
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
    bindAbout(root, draw);
  };
  draw();
}

// 5초 동안 실제로 인식을 돌려 보고 되는지/안 되면 왜 안 되는지 알려 준다
async function runSttCheck(btn, $out) {
  if (!support.stt) { $out.innerHTML = help(sttDiagnosis(null)); return; }
  btn.disabled = true; btn.textContent = '듣는 중… 영어로 아무 말이나 해보세요';
  const rec = new Recognizer({ onUpdate: t => { $out.textContent = t; } });
  rec.start();
  await new Promise(r => setTimeout(r, 5000));
  const { transcript, error } = rec.stop();
  btn.disabled = false; btn.textContent = '🩺 음성 인식 점검 (5초)';
  if (transcript) $out.innerHTML = `<div class="fb good"><span class="k">✅</span><span>정상 작동: "<b>${transcript}</b>"</span></div>`;
  else $out.innerHTML = help(sttDiagnosis(error));
}
function help(d) {
  return `<div class="fb bad"><span class="k">❌</span><span><b>${d.title}</b><ul class="xs" style="padding-left:16px;margin:6px 0 0">${d.steps.map(x => `<li>${x}</li>`).join('')}</ul></span></div>`;
}

function examHint(s) {
  if (!s.examDate) return '미등록 — 가장 빠른 응시 가능일을 자동으로 사용합니다.';
  const d = daysBetween(todayKey(), s.examDate);
  return d < 0 ? '시험일이 지나 자동으로 다음 응시 가능일을 사용 중입니다.' : `D-${d} · 추천 과정: ${d <= 35 ? '4주 집중' : d <= 63 ? '8주 표준' : '12주 여유'}`;
}

// 편집자(저장소 소유자) 전용 카드 — 편집자 모드가 켜져 있을 때만 그린다.
function editorCard() {
  const dataUrl = githubUrl('tree/' + contentBranch() + '/data');
  const guideUrl = githubUrl('blob/' + contentBranch() + '/CONTENT_GUIDE.md');
  const links = dataUrl
    ? `<a class="btn" href="${dataUrl}" target="_blank" rel="noopener">📂 GitHub에서 콘텐츠 열기</a>
       <a class="btn ghost" href="${guideUrl}" target="_blank" rel="noopener">📝 콘텐츠 수정 가이드</a>`
    : '<div class="xs muted">이 주소에서는 저장소를 찾을 수 없어 편집 링크를 만들지 못했습니다.</div>';
  return `<div class="section-title">편집자 모드</div>
    <div class="card stack small ink2">
      <div>학습 자료는 <code>data/</code> 폴더의 JSON 파일입니다. 수정하면 몇 분 안에 앱에 반영됩니다.</div>
      ${links}
      <button class="btn ghost" id="editorOff">🔒 편집자 모드 끄기</button>
      <div class="xs muted">이 모드는 이 기기 브라우저에만 저장됩니다. 다른 사람의 화면에는 저장소 정보가 보이지 않습니다.</div>
    </div>`;
}

// 버전 표시를 7번 누르면 편집자 모드가 켜진다 (평소에는 아무 표시도 없음).
function bindAbout(root, draw) {
  const off = root.querySelector('#editorOff');
  if (off) off.addEventListener('click', () => { setEditor(false); toast('편집자 모드를 껐어요'); draw(); });

  const about = root.querySelector('#about');
  if (!about || isEditor()) return;
  let taps = 0, timer = null;
  const tap = () => {
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1500);
    if (taps < 7) return;
    taps = 0;
    setEditor(true);
    toast('편집자 모드를 켰어요');
    draw();
  };
  about.addEventListener('click', tap);
  about.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
}
