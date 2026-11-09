// NCE 2027 exam/practice engine. All exam values come from config.json.
function nceShuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function ncePracticeSlice(items, chunkSize, key) {
  const byId = new Map(items.map(q => [q.id, q]));
  if (byId.size !== items.length) throw new Error('Duplicate question IDs in the practice pool.');
  const ids = [...byId.keys()];
  const signature = ids.slice().sort().join('|');
  let state;
  try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { state = null; }
  if (!state || state.signature !== signature || !Array.isArray(state.order) ||
      !Number.isInteger(state.offset) || state.offset < 0 || state.offset >= ids.length) {
    state = {signature, order:nceShuffle(ids), offset:0};
  }
  const start = state.offset;
  const limit = Math.max(1, Number(chunkSize) || 30);
  const next = Math.min(start + limit, ids.length);
  const result = state.order.slice(start, next).map(id => byId.get(id));
  if (result.some(x => !x)) throw new Error('Invalid practice deck; reload the page to regenerate it.');
  state.offset = next;
  localStorage.setItem(key, JSON.stringify(state));
  return {questions:result, start, end:next, total:ids.length};
}
function nceNormalizeQuestion(raw) {
  const choices = raw.choices || {};
  return {
    id:String(raw.id || '').trim(),
    prompt:String(raw.prompt || '').trim(),
    choices,
    correct:String(raw.correct || '').trim().toUpperCase(),
    explanation:String(raw.explanation || '').trim(),
    domain:String(raw.domain || '').trim(),
    subdomain:String(raw.subdomain || '').trim(),
    scenarioBased:raw.scenarioBased === true || raw.isScenarioBased === true,
    scenarioContext:String(raw.scenarioContext || '').trim(),
    unscored:raw.unscored === true
  };
}
function nceValidateSet(questions, section, cfg, file) {
  const expected = Number(section.questionCount);
  const scored = Number(section.scoredQuestionCount);
  const unscored = Number(section.unscoredQuestionCount);
  const keys = [...cfg.choiceKeys].sort().join(',');
  if (questions.length !== expected) throw new Error(`${file}: expected ${expected} questions; found ${questions.length}.`);
  if (questions.filter(q => !q.unscored).length !== scored ||
      questions.filter(q => q.unscored).length !== unscored) {
    throw new Error(`${file}: expected ${scored} scored + ${unscored} unscored questions.`);
  }
  const allowedDomains = new Set(cfg.sections.filter(s => s.domain).map(s => s.domain));
  const ids = new Set();
  for (const q of questions) {
    if (!q.id || ids.has(q.id)) throw new Error(`${file}: missing or repeated question ID ${q.id}.`);
    ids.add(q.id);
    if (!q.prompt || !q.explanation || !allowedDomains.has(q.domain))
      throw new Error(`${file}: invalid prompt, explanation or domain for ${q.id}.`);
    if (Object.keys(q.choices).sort().join(',') !== keys || !cfg.choiceKeys.includes(q.correct))
      throw new Error(`${file}: ${q.id} must have exactly A, B, C and a valid correct answer.`);
    if (q.scenarioBased && !q.scenarioContext)
      throw new Error(`${file}: scenario text is missing for ${q.id}.`);
  }
}
async function nceLoadSets(cfg) {
  const files = cfg.examFiles || [];
  const result = [];
  for (const file of files) {
    if (!/^nce_exam_\d\d\.json$/.test(file)) throw new Error(`Unexpected exam filename: ${file}`);
    const response = await fetch(`../packs/nce/data/${file}`, {cache:'no-store'});
    if (!response.ok) throw new Error(`Unable to load ${file}: HTTP ${response.status}.`);
    const raw = await response.json();
    const list = Array.isArray(raw) ? raw : raw.questions;
    if (!Array.isArray(list)) throw new Error(`${file}: expected a questions array.`);
    result.push({file, questions:list.map(nceNormalizeQuestion)});
  }
  return result;
}
function nceTime(seconds) {
  seconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`;
}

(async () => {
  const $ = id => document.getElementById(id);
  try {
    if (!isAccessGranted('nce')) { goToWelcome('nce'); return; }
    const cfg = await loadConfig('nce');
    applyTheme(cfg.theme);
    $('brand').textContent = cfg.brandName;
    $('logo').src = cfg.logoPath;
    const params = new URLSearchParams(window.location.search);
    const section = cfg.sections.find(s => s.id === params.get('section'));
    const mode = params.get('mode');
    if (!section || !section.modes.includes(mode)) throw new Error('Invalid practice section or mode.');
    $('title').textContent = `${section.label} — ${mode === 'practice' ? 'Practice Mode' : 'Exam Mode'}`;
    const sets = await nceLoadSets(cfg);
    if (!sets.length) {
      $('desc').textContent = 'The NCE 2027 simulator framework is ready. Original practice questions have not yet been uploaded.';
      ['prevBtn','nextBtn','finishBtn'].forEach(id => $(id).classList.add('hidden'));
      return;
    }
    const full = cfg.sections.find(s => s.id === 'full');
    // Validate every uploaded set before opening sessions (including domain practice).
    sets.forEach(set => nceValidateSet(set.questions, full, cfg, set.file));
    const idPool = new Set();
    for (const set of sets) for (const q of set.questions) {
      if (idPool.has(q.id)) throw new Error(`Question ID duplicated across exams: ${q.id}`);
      idPool.add(q.id);
    }
    let questions, metadata;
    if (mode === 'exam') {
      const key = `nceExamRotation_${section.id}`;
      let index = Number(localStorage.getItem(key) || 0);
      if (!Number.isInteger(index) || index < 0 || index >= sets.length) index = 0;
      const set = sets[index];
      questions = nceShuffle(set.questions);
      localStorage.setItem(key, String((index + 1) % sets.length));
      metadata = `${set.file} — ${questions.length} questions`;
    } else {
      const pool = sets.flatMap(set => set.questions).filter(q => !section.domain || q.domain === section.domain);
      if (!pool.length) throw new Error(`No practice questions for ${section.label}.`);
      const deck = ncePracticeSlice(pool, cfg.practiceChunkSize, `ncePracticeDeck_${section.id}`);
      questions = deck.questions;
      metadata = `Practice questions ${deck.start + 1}–${deck.end} of ${deck.total}`;
    }
    $('desc').textContent = mode === 'practice'
      ? 'Untimed questions from the available pool. No repeats within the same session.'
      : `Timed practice exam: ${questions.length} questions in ${section.timeMin} minutes.`;
    $('metaLine').textContent = metadata;
    let current = 0;
    const answers = new Map();
    let phase = 'questions';
    const breakConfig = mode === 'exam' ? section.breakConfig : null;
    const split = breakConfig?.enabled ? Number(breakConfig.afterQuestion) : null;
    let halfLocked = false;
    let breakOffered = false;
    let breakDeadline = 0;
    let remainingMs = Number(section.timeMin) * 60 * 1000;
    let activeMs = 0;
    let lastTick = Date.now();
    let clock = null;
    const timer = $('timer');
    if (mode === 'exam') {
      timer.classList.remove('hidden');
      timer.textContent = nceTime(remainingMs / 1000);
    }

    function render() {
      if (phase !== 'questions') return;
      const q = questions[current];
      $('progress').textContent = `Question ${current + 1} of ${questions.length}`;
      $('scenario').classList.toggle('hidden', !q.scenarioBased);
      $('scenarioText').textContent = q.scenarioBased ? q.scenarioContext : '';
      $('prompt').textContent = q.prompt;
      $('choices').replaceChildren();
      for (const key of cfg.choiceKeys) {
        const label = document.createElement('label'); label.className = 'choice';
        const input = document.createElement('input');
        input.type = 'radio'; input.name = `answer_${q.id}`; input.value = key;
        input.checked = answers.get(q.id) === key;
        input.addEventListener('change', () => answers.set(q.id, key));
        const span = document.createElement('span'); span.className = 'choiceText';
        span.textContent = `${key}. ${q.choices[key]}`;
        label.append(input, span); $('choices').append(label);
      }
      $('prevBtn').disabled = current === 0 || (halfLocked && current <= split);
      $('nextBtn').disabled = current === questions.length - 1;
    }
    function resume() {
      phase = 'questions';
      breakDeadline = 0;
      $('breakPanel').classList.add('hidden');
      $('runnerPanel').classList.remove('hidden');
      current = split;
      lastTick = Date.now();
      render();
    }
    function gate() {
      breakOffered = true;
      if (breakConfig?.lockFirstHalf) halfLocked = true;
      phase = 'gate';
      $('runnerPanel').classList.add('hidden');
      $('breakPanel').classList.remove('hidden');
      $('takeBreakBtn').textContent = `Start ${breakConfig.durationMinutes}-minute break`;
      $('breakMessage').textContent = 'The first half has been submitted. You cannot return to its questions.';
      $('takeBreakBtn').classList.remove('hidden');
      $('skipBreakBtn').classList.remove('hidden');
      $('resumeBtn').classList.add('hidden');
    }
    $('prevBtn').addEventListener('click', () => {
      if (phase === 'questions' && current > 0 && !(halfLocked && current <= split)) { current--; render(); }
    });
    $('nextBtn').addEventListener('click', () => {
      if (phase !== 'questions') return;
      if (split && !breakOffered && current === split - 1) gate();
      else if (current < questions.length - 1) {current++; render();}
    });
    $('skipBreakBtn').addEventListener('click', resume);
    $('takeBreakBtn').addEventListener('click', () => {
      if (phase !== 'gate') return;
      phase = 'break';
      breakDeadline = Date.now() + Number(breakConfig.durationMinutes) * 60 * 1000;
      $('takeBreakBtn').classList.add('hidden');
      $('skipBreakBtn').classList.add('hidden');
      $('resumeBtn').classList.remove('hidden');
    });
    $('resumeBtn').addEventListener('click', resume);

    function finish() {
      if (clock) clearInterval(clock);
      phase = 'results';
      $('runnerPanel').classList.add('hidden');
      $('breakPanel').classList.add('hidden');
      $('resultsPanel').classList.remove('hidden');
      timer.classList.add('hidden');
      const scored = questions.filter(q => !q.unscored);
      const correct = scored.filter(q => answers.get(q.id) === q.correct).length;
      const pct = scored.length ? Math.round(correct / scored.length * 100) : 0;
      $('scoreLine').textContent = `${correct} / ${scored.length} scored questions correct (${pct}%).`;
      $('timeLine').textContent = `Active time used: ${nceTime(activeMs / 1000)}.`;
      const review = $('review'); review.replaceChildren();
      questions.forEach((q, i) => {
        const box = document.createElement('div'); box.className = 'reviewBlock';
        const num = document.createElement('div'); num.className = 'qnum'; num.textContent = `Q${i + 1}`;
        const text = document.createElement('div');
        const prompt = document.createElement('div'); prompt.className = 'reviewPrompt';
        prompt.textContent = q.scenarioBased ? `${q.scenarioContext}\n\n${q.prompt}` : q.prompt;
        const result = document.createElement('div'); result.className = 'reviewAns';
        result.textContent = `Your answer: ${answers.get(q.id) || '(no answer)'} | Correct: ${q.correct}`;
        const explanation = document.createElement('div'); explanation.className = 'reviewExp';
        explanation.textContent = q.explanation;
        text.append(prompt, result, explanation); box.append(num, text); review.append(box);
      });
    }
    $('finishBtn').addEventListener('click', finish);
    if (mode === 'exam') {
      clock = setInterval(() => {
        const now = Date.now();
        if (phase === 'questions') {
          const delta = now - lastTick;
          remainingMs -= delta; activeMs += delta;
          timer.textContent = nceTime(remainingMs / 1000);
          if (remainingMs <= 0) {lastTick = now; finish(); return;}
        } else if (phase === 'break') {
          const secondsLeft = Math.max(0, (breakDeadline - now) / 1000);
          $('breakMessage').textContent = `Optional break: ${nceTime(secondsLeft)} remaining. You may resume at any time.`;
          if (secondsLeft <= 0) resume();
        }
        lastTick = now;
      }, 250);
    }
    render();
  } catch (error) {
    document.getElementById('title').textContent = 'Unable to start session';
    document.getElementById('desc').textContent = error.message;
    ['prevBtn','nextBtn','finishBtn'].forEach(id => document.getElementById(id).classList.add('hidden'));
    console.error(error);
  }
})();
