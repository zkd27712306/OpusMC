// ===== main.js =====
'use strict';
// ---------------------------------------------------------------------------
// Touch controls: UA auto-detect + manual 3-state preference
// ---------------------------------------------------------------------------
const Touch = {
  enabled: false, joyId: null, lookId: null, lx: 0, ly: 0,
  pref: 'auto',           // 'auto' | 'on' | 'off'

  detectMobile() {
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 0;
    let coarse = false, noHover = false;
    try {
      coarse  = matchMedia('(pointer: coarse)').matches;
      noHover = matchMedia('(hover: none)').matches;
    } catch (e) {}
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|BlackBerry|PlayBook|webOS|HarmonyOS|MicroMessenger/i.test(ua);
    return (touch && (coarse || noHover)) || uaMobile;
  },

  init(g) {
    this.game = g;
    let pref = 'auto';
    try { pref = localStorage.getItem('mcjs.touchPref') || 'auto'; } catch (e) {}
    if (pref !== 'auto' && pref !== 'on' && pref !== 'off') pref = 'auto';
    const force = /[?&]touch=1/.test(location.search) ? 'on'
                : /[?&]touch=0/.test(location.search) ? 'off' : null;
    this.pref = pref;
    this.applyPref(force || pref);
    this.bindCanvas(g);
  },

  applyPref(pref) {
    this.pref = pref;
    try { localStorage.setItem('mcjs.touchPref', pref); } catch (e) {}
    const on = pref === 'on' ? true : (pref === 'off' ? false : this.detectMobile());
    this.setEnabled(on);
    this.syncButton();
  },

  cyclePref() {
    const next = this.pref === 'auto' ? 'on' : (this.pref === 'on' ? 'off' : 'auto');
    this.applyPref(next);
    const g = this.game;
    if (g && g.ui && g.ui.message) {
      const tag = next === 'auto' ? ('自动（' + (this.enabled ? '开' : '关') + '）')
               : (next === 'on' ? '强制开启' : '强制关闭');
      g.ui.message('触屏控制：' + tag, '#FFFF55');
    }
  },

  syncButton() {
    const b = document.getElementById('setTouch');
    const v = document.getElementById('valTouch');
    if (b) b.textContent = this.pref === 'auto' ? '自动' : (this.pref === 'on' ? '开' : '关');
    if (v) v.textContent = this.enabled ? '已开启' : '已关闭';
    const hb = document.getElementById('mobileHotbarHit');
    if (hb) hb.style.bottom = document.body.classList.contains('touch') ? '76px' : '8px';
  },
  
    setEnabled(on) {
    const g = this.game; if (!g) return;
    on = !!on;
    this.enabled = on;
    g.touchMode = on;
    document.body.classList.toggle('touch', on);
    const el = document.getElementById('mobileUI');
    if (el) {
      const show = on && g.state === 'play';
      el.classList.toggle('hidden', !show);
      el.style.display = show ? 'block' : 'none';
    }
    if (on) {
      this.bindButtons(g);
      g.suppressPause = true;
      const dpr = window.devicePixelRatio || 1;
      g.settings.resScale = dpr >= 3 ? 0.5 : (dpr >= 2 ? 0.66 : 0.8);
      if (!g.settings._origRenderDist) g.settings._origRenderDist = g.settings.renderDist;
      g.settings.renderDist = Math.min(g.settings._origRenderDist, 4);
      if (g.settings._origSens === undefined) g.settings._origSens = g.settings.sens;
      g.settings.sens = Math.min(g.settings._origSens, 0.5);
      g.applySettings();
      g.resize();
    } else {
      g.settings.resScale = 1;
      if (g.settings._origRenderDist) {
        g.settings.renderDist = g.settings._origRenderDist;
        g.settings._origRenderDist = 0;
      }
      if (g.settings._origSens !== undefined) {
        g.settings.sens = g.settings._origSens;
        g.settings._origSens = undefined;
      }
      g.applySettings();
      g.resize();
    }
    this.syncButton();
  },

  bindCanvas(g) {
    const cv = g.canvas;

    // ---- 快捷栏命中 + 视角拖动 ----
    cv.addEventListener('touchstart', (e) => {
      if (!this.enabled || g.ui.screen || g.state !== 'play') return;

      // 快捷栏命中检测（和 UI 绘制用同一套坐标）
      // scale: 屏幕 CSS 像素 → UI 逻辑像素
      const scale = g.ui.dpr / g.ui.scale;
      const r0 = cv.getBoundingClientRect();
      for (const t of e.changedTouches) {
        const gx = (t.clientX - r0.left) * scale;
        const gy = (t.clientY - r0.top) * scale;
        const hx = Math.floor(g.ui.w / 2 - 91);
        const hy = g.ui.h - 22;
        // 快捷栏外框 182 宽、22 高；每格 20 宽（18 格 + 2 间距）
        if (gx >= hx - 1 && gx < hx + 183 && gy >= hy - 2 && gy < hy + 22) {
          const i = Math.floor((gx - hx) / 20);
          if (i >= 0 && i < 9) {
            const now = performance.now();
            if (this._slotTapI === i && now - this._slotTapT < 500) this._slotTaps++;
            else this._slotTaps = 1;
            this._slotTapI = i; this._slotTapT = now;
            const inv = g.player.inv;
            inv.sel = i; inv.dirty = true;
            if (this._slotTaps >= 3) {
              this._slotTaps = 0;
              const s = inv.slots[i];
              if (s && s.count > 0) {
                g.dropFromPlayer({ id: s.id, count: 1, dmg: s.dmg || 0 });
                s.count -= 1;
                if (s.count <= 0) inv.slots[i] = null;
                inv.dirty = true;
              }
            }
            e.preventDefault();
            return;
          }
        }
      }

      // 开始视角拖动
      for (const t of e.changedTouches) {
        if (this.lookId !== null) continue;
        this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });

    cv.addEventListener('touchmove', (e) => {
      if (!this.enabled || g.ui.screen || g.state !== 'play') return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookId) {
          const s = g.settings.sens * 0.03 + 0.003;
          g.player.yaw   -= (t.clientX - this.lx) * s;
          g.player.pitch  = clamp(g.player.pitch - (t.clientY - this.ly) * s, -Math.PI/2+0.001, Math.PI/2-0.001);
          this.lx = t.clientX; this.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.lookId) this.lookId = null; };
    cv.addEventListener('touchend', end);
    cv.addEventListener('touchcancel', end);

    // ---- 触屏驱动 UI（背包/箱子/熔炉）----
    const uic = g.ui.canvas;
    let lpTimer = null;
    let gesture = null; // { startX, startY, startSlot, moved, longFired, lastTapT, lastTapSlot }

    const hitSlot = (gx, gy) => {
      if (!g.ui.screen || !g.ui.screen.slotAt) return null;
      return g.ui.screen.slotAt(gx, gy);
    };

    uic.addEventListener('touchstart', (e) => {
      if (!this.enabled || !g.ui.screen) return;
      const t = e.changedTouches[0];
      const r = uic.getBoundingClientRect();
      const scale = g.ui.canvas.width / g.ui.w;
      const gx = (t.clientX - r.left) * scale;
      const gy = (t.clientY - r.top) * scale;

      g.ui.mouse.x = gx;
      g.ui.mouse.y = gy;
      g.ui.mouse.down = true;
      g.ui.mouse.button = 0;

      gesture = {
        startX: gx, startY: gy,
        startSlot: hitSlot(gx, gy),
        moved: false,
        longFired: false,
        dragMode: false,
      };

      // 双击检测：两次短按同一格且间隔 < 300ms → 快速移动
      const now = performance.now();
      const s = gesture.startSlot;
      if (s && this._lastTapSlot === s && now - this._lastTapT < 300) {
        this._lastTapSlot = null;
        this._lastTapT = 0;
        // 快速移动（等价 Shift+左键）
        if (g.ui.screen.mouseDown) g.ui.screen.mouseDown(g.ui, gx, gy, 0, true);
        if (g.ui.screen.mouseUp) g.ui.screen.mouseUp(g.ui, gx, gy, 0);
        g.ui.mouse.down = false;
        gesture = null;
        e.preventDefault();
        return;
      }
      this._lastTapSlot = s;
      this._lastTapT = now;

      // 立即触发左键按下（拿起/放下整叠），供拖动时使用
      if (g.ui.screen.mouseDown) g.ui.screen.mouseDown(g.ui, gx, gy, 0, false);

      // 长按 → 右键（拿一半/放一半）
      if (lpTimer) clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        if (!gesture || gesture.moved || g.ui.mouse.down === false) return;
        gesture.longFired = true;
        // 撤销刚才的左键按下，改为右键按下
        if (g.ui.screen.mouseUp) g.ui.screen.mouseUp(g.ui, g.ui.mouse.x, g.ui.mouse.y, 0);
        if (g.ui.screen.mouseDown) g.ui.screen.mouseDown(g.ui, g.ui.mouse.x, g.ui.mouse.y, 2, false);
      }, 400);

      e.preventDefault();
    }, { passive: false });

    uic.addEventListener('touchmove', (e) => {
      if (!this.enabled || !g.ui.screen || !gesture) return;
      const t = e.changedTouches[0];
      const r = uic.getBoundingClientRect();
      const scale = g.ui.canvas.width / g.ui.w;
      const gx = (t.clientX - r.left) * scale;
      const gy = (t.clientY - r.top) * scale;
      const dx = gx - gesture.startX, dy = gy - gesture.startY;

      // 超过 6px 视为"拖动"，取消长按、进入拖动分配模式
      if (!gesture.moved && (Math.abs(dx) + Math.abs(dy)) > 6) {
        gesture.moved = true;
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        // 拖动分配：mouseDown 已触发，dragSlots 由 ContainerScreen.mouseMove 收集
        gesture.dragMode = true;
      }

      g.ui.mouse.x = gx;
      g.ui.mouse.y = gy;
      if (g.ui.screen.mouseMove) g.ui.screen.mouseMove(g.ui, gx, gy);
      e.preventDefault();
    }, { passive: false });

    uic.addEventListener('touchend', (e) => {
      if (!this.enabled || !g.ui.screen) { gesture = null; return; }
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }

      g.ui.mouse.down = false;
      if (gesture) {
        if (gesture.longFired) {
          // 长按已触发右键：松开右键
          if (g.ui.screen.mouseUp) g.ui.screen.mouseUp(g.ui, g.ui.mouse.x, g.ui.mouse.y, 2);
        } else {
          // 短按 / 拖动：松开左键（拖动分配在 mouseUp 里完成）
          if (g.ui.screen.mouseUp) g.ui.screen.mouseUp(g.ui, g.ui.mouse.x, g.ui.mouse.y, 0);
        }
      }
      gesture = null;
      e.preventDefault();
    }, { passive: false });

    uic.addEventListener('touchcancel', () => {
      if (!this.enabled || !g.ui.screen) { gesture = null; return; }
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      g.ui.mouse.down = false;
      if (gesture && g.ui.screen.mouseUp) {
        g.ui.screen.mouseUp(g.ui, g.ui.mouse.x, g.ui.mouse.y, gesture.longFired ? 2 : 0);
      }
      gesture = null;
    });
  },              
  
  bindButtons(g) {
    const pad = document.getElementById('joyPad'), knob = document.getElementById('joyKnob');
    if (!pad) return;
    if (pad._bound) return; pad._bound = true;
    const move = (t) => {
      const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const max = r.width * 0.42, len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      knob.style.transform = `translate(${dx|0}px,${dy|0}px)`;
      const nx = dx / max, ny = dy / max, dead = 0.22;
      g.keys.KeyW = ny < -dead; g.keys.KeyS = ny > dead;
      g.keys.KeyA = nx < -dead; g.keys.KeyD = nx > dead;
      g.keys.ControlLeft = Math.hypot(nx, ny) > 0.92;
    };
    pad.addEventListener('touchstart', (e) => { this.joyId = e.changedTouches[0].identifier; move(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
    pad.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === this.joyId) move(t); e.preventDefault(); }, { passive: false });
    const jend = (e) => { for (const t of e.changedTouches) if (t.identifier === this.joyId) {
      this.joyId = null; knob.style.transform = '';
      g.keys.KeyW = g.keys.KeyA = g.keys.KeyS = g.keys.KeyD = false; g.keys.ControlLeft = false;
    }};
    pad.addEventListener('touchend', jend); pad.addEventListener('touchcancel', jend);

    for (const el of document.querySelectorAll('#mobileUI .mbtn')) {
      const act = el.dataset.act;
      const down = (e) => { el.classList.add('on'); this.action(act, true, g); e.preventDefault(); };
      const up   = (e) => { el.classList.remove('on'); this.action(act, false, g); e.preventDefault(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
  },

  action(act, down, g) {
    if (act === 'jump') { g.keys.Space = down; return; }
    if (act === 'mine') { g.mouseBtn[0] = down; if (down) g.mouseClicked0 = true; return; }
    if (act === 'place') { g.mouseBtn[2] = down; if (down) g.useCd = 0; return; }
    if (act === 'sneak') { g.keys.ShiftLeft = down; return; }
    if (!down) return;
    if (act === 'inv') {
      if (g.ui.screen) g.ui.close();
      else g.ui.open(g.mode === 'creative' ? new CreativeScreen(g) : new CraftingScreen(g, 2));
    }
    if (act === 'view') g.perspective = (g.perspective + 1) % 3;
    if (act === 'mode') g.setMode(g.mode === 'creative' ? 'survival' : 'creative');
    if (act === 'fly') { if (g.mode === 'creative') { g.player.flying = !g.player.flying; g.player.vel[1] = 0; } }
    if (act === 'full') { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) {} }
    if (act === 'menu') { if (g.ui.screen) g.ui.close(); else g.ui.open(new PauseScreen(g)); }
  }
};

function bindInput(g) {
  const canvas = g.canvas, ui = g.ui;
  const locked = () => document.pointerLockElement === canvas;
  window.addEventListener('keydown', (e) => {
    if (document.activeElement === ui.input) return;
    Sound.init();
    const code = e.code;
    if (['Space', 'Tab', 'F1', 'F3', 'F5', 'Slash', 'KeyQ'].includes(code) || (e.ctrlKey && ['KeyS', 'KeyD', 'KeyW', 'KeyA'].includes(code))) e.preventDefault();
    if (ui.screen) {
      if (ui.key(e)) return;
      if (code === 'Escape' || (code === 'KeyE' && ui.screen instanceof ContainerScreen)) {
        if (ui.screen.onEsc) ui.screen.onEsc();
        else if (g.state === 'play' && !(ui.screen instanceof DeathScreen)) ui.close();
      }
      return;
    }
    if (g.state !== 'play') return;
    if (e.repeat && !code.startsWith('Digit')) { g.keys[code] = true; return; }
    g.keys[code] = true;
    const p = g.player, now = performance.now();
    if (code === 'Escape') { ui.open(new PauseScreen(g)); return; }
    if (code === 'KeyE') { ui.open(g.mode === 'creative' ? new CreativeScreen(g) : new CraftingScreen(g, 2)); return; }
    if (code === 'KeyT') { e.preventDefault(); ui.open(new ChatScreen(g)); return; }
    if (code === 'Slash') { ui.open(new ChatScreen(g, '/')); return; }
    if (code === 'KeyH') { ui.open(new HelpScreen(g, null)); ui.screen.parent = null; return; }
    if (code.startsWith('Digit')) { const n = +code.slice(5); if (n >= 1 && n <= 9) p.inv.sel = n - 1; }
    if (code === 'KeyQ') {
      const h = p.inv.held;
      if (h) { const n = e.ctrlKey ? h.count : 1; g.dropFromPlayer({ ...h, count: n }); h.count -= n; if (!h.count) p.inv.slots[p.inv.sel] = null; p.swingT = 6; }
    }
    if (code === 'F1') ui.hideHud = !ui.hideHud;
    if (code === 'F3') ui.debug = !ui.debug;
    if (code === 'F5') g.perspective = (g.perspective + 1) % 3;
    if (code === 'Space') {
      if (g.mode === 'creative' && now - (g.lastTap.space || 0) < 300) { p.flying = !p.flying; p.vel[1] = 0; g.lastTap.space = 0; }
      else g.lastTap.space = now;
    }
    if (code === 'KeyW') {
      if (now - (g.lastTap.w || 0) < 280) g.sprintToggle = true;
      g.lastTap.w = now;
    }
  });
  window.addEventListener('keyup', (e) => {
    g.keys[e.code] = false;
    if (e.code === 'KeyW') g.sprintToggle = false;
  });
  window.addEventListener('blur', () => { g.keys = {}; g.mouseBtn = [false, false, false]; g.sprintToggle = false; });
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) {
      g.mouseBtn = [false, false, false]; g.keys = {};
      if (g.touchMode) return;
      if (g.suppressPause) { g.suppressPause = false; return; }
      if (g.state === 'play' && !ui.screen) ui.open(new PauseScreen(g));
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (locked() && !ui.screen && g.state === 'play') {
      const p = g.player, s = g.settings.sens * 0.006 + 0.0006;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return; // browser glitch spikes
      p.yaw -= e.movementX * s;
      p.pitch = clamp(p.pitch - e.movementY * s, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    } else ui.mouseMove(e);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousedown', (e) => {
    if (e.target === ui.input) return;
    Sound.init();
    if (ui.screen) { ui.mouseDown(e); return; }
    if (g.state !== 'play') return;
    if (g.touchMode) return;
    if (!locked()) { g.capturePointer(); return; }
    g.mouseBtn[e.button] = true;
    if (e.button === 0) { g.mouseClicked0 = true; g.attackCd = Math.min(g.attackCd, 0); if (!g.targetEntity && !g.target) g.player.swingT = 6; }
    if (e.button === 2) g.useCd = 0;
    if (e.button === 1) { e.preventDefault(); g.pickBlock(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (ui.screen) { ui.mouseUp(e); }
    g.mouseBtn[e.button] = false;
  });
  window.addEventListener('wheel', (e) => {
    if (ui.screen) { ui.wheel(e.deltaY); return; }
    if (g.state !== 'play') return;
    const p = g.player;
    p.inv.sel = mod(p.inv.sel + Math.sign(e.deltaY), 9);
  }, { passive: true });
  window.addEventListener('beforeunload', (e) => {
    if (g.state === 'play') { g.saveWorld(true); e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && g.state === 'play') g.saveWorld(true); });
}

// Player preview for the survival inventory
Renderer.prototype.playerPreview = function (game, ui, x, y, w, h) {
  const gl = this.gl, S = Math.max(2, ui.scale), W = w * S, H = h * S;
  if (!this.pv || this.pv.W !== W || this.pv.H !== H) {
    if (this.pv) { gl.deleteFramebuffer(this.pv.fb); gl.deleteTexture(this.pv.tex); gl.deleteRenderbuffer(this.pv.rb); }
    const fb = gl.createFramebuffer(), tex = gl.createTexture(), rb = gl.createRenderbuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    this.pv = { fb, tex, rb, W, H, cv, ctx: cv.getContext('2d'), px: new Uint8Array(W * H * 4), img: cv.getContext('2d').createImageData(W, H) };
  }
  const pv = this.pv;
  gl.bindFramebuffer(gl.FRAMEBUFFER, pv.fb);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  const vp = M4.create(); M4.ortho(vp, -0.7, 0.7, -0.05, 1.95, -5, 5);
  const mx = (ui.mouse.x - (x + w / 2)) / 40, my = (ui.mouse.y - (y + h * 0.25)) / 40;
  const m = M4.create(); M4.translate(m, 0, 0, 0); M4.rotY(m, Math.PI - Math.atan(mx) * 0.7);
  M4.scale(m, 0.9375, 0.9375, 0.9375);
  const env = { day: 1, fogColor: [0, 0, 0], fogNear: 1e8, fogFar: 2e8, nightTint: [1, 1, 1] };
  const savedCam = this.camPos; this.camPos = [0, 0, 0];
  this.drawModel('steve', 'steve', m, { head: { ry: -Math.atan(mx) * 0.5, rx: Math.atan(my) * 0.6 } }, [1, 0], env, { vp });
  this.camPos = savedCam;
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pv.px);
  for (let r = 0; r < H; r++) pv.img.data.set(pv.px.subarray((H - 1 - r) * W * 4, (H - r) * W * 4), r * W * 4);
  pv.ctx.putImageData(pv.img, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  return pv.cv;
};

window.addEventListener('load', async () => {
  const g = window.game = new Game();
  try { await g.init(); }
  catch (e) {
    console.error(e);
    const d = document.getElementById('err');
    d.style.display = 'block';
    d.textContent = '启动失败：' + (e && e.message || e) + '\n\n请使用最新版 Chrome / Edge / Firefox 浏览器打开，并确保已启用 WebGL2 / 硬件加速。';
  }
});
