// The maker's screenshot scenes. The game ships with a deterministic staging
// mode: open index.html?shot=<name>&seed=<n> and it renders one frozen,
// reproducible scene instead of starting a live run — the same mechanism the
// kit's starter uses, so the screenshots in screenshots/ are real renders of
// this code, captured by its maker in a browser and never edited.
//
//   menu — the title screen over an idle court
//   play — a wave-6 fight in mid-action
//   boss — the King and his court, beams warming up
//   over — the checkmate (game over) screen with a finished run's stats
export const SHOT_SCENES = ['menu', 'play', 'boss', 'over'];

export function shotFromUrl(url = new URL(location.href)) {
  const shot = url.searchParams.get('shot');
  if (!shot || !SHOT_SCENES.includes(shot)) return null;
  const seed = Number(url.searchParams.get('seed') || 1) >>> 0;
  return { shot, seed };
}
