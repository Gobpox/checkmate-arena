// CHECKMATE ARENA — input: keyboard + mouse on desktop, twin virtual sticks on
// touch screens. The game reads a plain state object each frame; listeners only
// keep it current. Screen coordinates are converted to world coordinates by the
// camera in game.js, so here the aim is stored as the mouse's screen position.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseX: innerWidth / 2, mouseY: innerHeight / 2, firing: false,
    moveX: 0, moveY: 0,          // touch stick: movement vector -1..1
    aimX: 0, aimY: 0, touchAim: false, // touch stick: aim vector, firing while held
    dashPressed: false,          // touch DASH button (edge-triggered by game)
    usingTouch: false,
  };

  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    input.keys.add(e.key.toLowerCase());
  });
  addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { input.keys.clear(); input.firing = false; });

  canvas.addEventListener('mousemove', e => { input.mouseX = e.clientX; input.mouseY = e.clientY; });
  canvas.addEventListener('mousedown', e => { if (e.button === 0) input.firing = true; });
  addEventListener('mouseup', e => { if (e.button === 0) input.firing = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // --- touch: two sticks + a dash button -----------------------------------
  const stickL = document.getElementById('stickL');
  const stickR = document.getElementById('stickR');
  const dashBtn = document.getElementById('dashbtn');
  const touchLayer = document.getElementById('touch');
  const sticks = new Map(); // pointerId -> {el, kind, cx, cy}

  function armStick(el, kind) {
    el.addEventListener('pointerdown', e => {
      input.usingTouch = true; touchLayer.classList.add('on');
      const r = el.getBoundingClientRect();
      sticks.set(e.pointerId, { el, kind, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      const s = sticks.get(e.pointerId); if (!s) return;
      const dx = (e.clientX - s.cx) / 46, dy = (e.clientY - s.cy) / 46;
      const len = Math.hypot(dx, dy) || 1, cl = Math.min(1, len);
      const nx = dx / len * cl, ny = dy / len * cl;
      s.el.firstElementChild.style.transform = `translate(calc(-50% + ${nx * 30}px), calc(-50% + ${ny * 30}px))`;
      if (kind === 'move') { input.moveX = nx; input.moveY = ny; }
      else { input.aimX = nx; input.aimY = ny; input.touchAim = len > 0.35; }
    });
    const end = e => {
      if (!sticks.delete(e.pointerId)) return;
      el.firstElementChild.style.transform = 'translate(-50%,-50%)';
      if (kind === 'move') { input.moveX = 0; input.moveY = 0; }
      else { input.touchAim = false; input.aimX = 0; input.aimY = 0; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  if (stickL && stickR) { armStick(stickL, 'move'); armStick(stickR, 'aim'); }
  if (dashBtn) dashBtn.addEventListener('pointerdown', e => { e.preventDefault(); input.dashPressed = true; input.usingTouch = true; touchLayer.classList.add('on'); });
  addEventListener('touchstart', () => { input.usingTouch = true; touchLayer.classList.add('on'); }, { passive: true, once: true });

  input.held = (...names) => names.some(n => input.keys.has(n));
  return input;
}
