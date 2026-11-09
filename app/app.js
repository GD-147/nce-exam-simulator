// NCE homepage, section selector and printable list.
(async () => {
  const examId = getExamFromUrl();
  if (!isAccessGranted(examId)) { goToWelcome(examId); return; }
  const $ = id => document.getElementById(id);
  try {
    const cfg = await loadConfig(examId);
    applyTheme(cfg.theme);
    $('brand').textContent = cfg.brandName;
    $('logo').src = cfg.logoPath;
    $('version').textContent = cfg.examVersion;
    $('disclaimer').textContent = cfg.disclaimer;

    const pages = {home:$('page-home'), sim:$('page-sim'), pdf:$('page-pdf')};
    function show(page) {
      Object.entries(pages).forEach(([id, el]) => el.classList.toggle('hidden', id !== page));
    }
    document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      show(el.dataset.page);
    }));
    $('logoutLink').addEventListener('click', e => {
      e.preventDefault(); revokeAccess(examId); goToWelcome(examId);
    });

    const sectionSelect = $('sectionSelect');
    cfg.sections.forEach(s => {
      const option = document.createElement('option');
      option.value = s.id; option.textContent = s.label;
      sectionSelect.append(option);
    });
    const modePanel = $('modePanel');
    sectionSelect.addEventListener('change', () => modePanel.classList.add('hidden'));
    $('startSim').addEventListener('click', () => {
      const section = cfg.sections.find(s => s.id === sectionSelect.value);
      if (!section) return;
      modePanel.classList.remove('hidden');
      $('examModeBtn').classList.toggle('hidden', !section.modes.includes('exam'));
      $('practiceModeBtn').classList.toggle('hidden', !section.modes.includes('practice'));
    });
    function launch(mode) {
      const section = cfg.sections.find(s => s.id === sectionSelect.value);
      if (!section || !section.modes.includes(mode)) return;
      window.location.href = `runner.html?exam=nce&section=${encodeURIComponent(section.id)}&mode=${mode}`;
    }
    $('examModeBtn').addEventListener('click', () => launch('exam'));
    $('practiceModeBtn').addEventListener('click', () => launch('practice'));

    const pdfs = cfg.printables || [];
    if (!pdfs.length) $('pdfList').textContent = 'Printable practice exams are being prepared.';
    pdfs.forEach(pdf => {
      const link = document.createElement('a');
      link.className = 'pdfBtn';
      link.href = `../packs/${examId}/pdf/${encodeURIComponent(pdf.file)}`;
      link.textContent = pdf.label;
      link.target = '_blank'; link.rel = 'noopener';
      $('pdfList').append(link);
    });
  } catch (error) {
    $('error').textContent = `Unable to load the NCE portal: ${error.message}`;
    console.error(error);
  }
})();
