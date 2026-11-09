// NCE Exam Simulator shared helpers — standalone static GitHub Pages portal.
function getExamFromUrl() {
  return 'nce'; // this repository serves one exam only
}
function getConfigPath(examId) {
  return `../packs/${examId}/config.json?v=${Date.now()}`;
}
async function loadConfig(examId) {
  const result = await fetch(getConfigPath(examId), {cache: 'no-store'});
  if (!result.ok) throw new Error(`Could not load ${examId} config (${result.status}).`);
  return result.json();
}
function accessKey(examId) { return `accessGranted_${examId}`; }
function isAccessGranted(examId) { return localStorage.getItem(accessKey(examId)) === 'yes'; }
function grantAccess(examId) { localStorage.setItem(accessKey(examId), 'yes'); }
function revokeAccess(examId) { localStorage.removeItem(accessKey(examId)); }
function goToApp(examId) { window.location.href = `app.html?exam=${encodeURIComponent(examId)}`; }
function goToWelcome(examId) { window.location.href = `index.html?exam=${encodeURIComponent(examId)}`; }
function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
}
