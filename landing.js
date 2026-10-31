/* Login page art: a pyramidal neuron (after Ramón y Cajal's drawings) that
   draws itself branch by branch, then shows the occasional impulse running
   from a dendrite tip to the cell body and down the axon.
   Runs only while the login page is visible and the tab is in view;
   reduced-motion users get the finished drawing with no animation. */
(function(){
  const canvas = document.getElementById('neuronArt');
  const gate = document.getElementById('authGate');
  if(!canvas || !gate || !canvas.getContext) return;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  const STROKE = 'rgba(235,242,255,.86)', AXON = 'rgba(255,214,140,.75)', PULSE = '255,214,140';

  let W, H, S, soma, segs, still, raf = 0, drawStart = 0, drawn = false, pulse = null, nextPulse = 0;

  // Fixed seed: everyone sees the same neuron.
  function build(){
    let seed = 7;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    segs = [];
    function branch(px, py, ang, len, w, depth, t0, parent){
      if(depth > 8 || len < 6) return;
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      const idx = segs.push({ px, py, ex, ey, w, t0, parent, kids: 0 }) - 1;
      if(parent >= 0) segs[parent].kids++;
      const t1 = t0 + len / (900 * S);
      const n = depth < 2 ? 3 : (rnd() < .75 ? 2 : 1);
      for(let i = 0; i < n; i++) branch(ex, ey, ang + (rnd() - .5) * 1.1, len * (.62 + rnd() * .25), w * .68, depth + 1, t1, idx);
    }
    soma = { x: W * .5, y: H * .62 };
    branch(soma.x, soma.y, -Math.PI / 2, 170 * S, 9 * S, 0, 0, -1);            // apical dendrite
    for(let i = 0; i < 6; i++){                                                  // basal dendrites
      branch(soma.x, soma.y, Math.PI / 2 + (i - 2.5) * .42 + (rnd() - .5) * .2, 85 * S, 6 * S, 1, .05, -1);
    }
    segs.push({ px: soma.x, py: soma.y, ex: soma.x + 10 * S, ey: H * 1.05, w: 3 * S, t0: .1, parent: -1, kids: 1, axon: true });
  }

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.max(1, canvas.clientWidth * dpr);
    H = canvas.height = Math.max(1, canvas.clientHeight * dpr);
    S = Math.min(W, H) / 1250;
    build();
    still = null;
  }

  function drawNeuron(c, t){
    c.lineCap = 'round';
    for(const s of segs){
      const p = Math.max(0, Math.min(1, (t - s.t0) / (s.axon ? 1.6 : .35)));
      if(!p) continue;
      c.strokeStyle = s.axon ? AXON : STROKE;
      c.lineWidth = s.w;
      c.beginPath(); c.moveTo(s.px, s.py); c.lineTo(s.px + (s.ex - s.px) * p, s.py + (s.ey - s.py) * p); c.stroke();
      if(p === 1 && !s.kids){
        c.fillStyle = 'rgba(235,242,255,.7)';
        c.beginPath(); c.arc(s.ex, s.ey, 1.6 * S, 0, 7); c.fill();
      }
    }
    const g = c.createRadialGradient(soma.x, soma.y, 0, soma.x, soma.y, 40 * S);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.5, 'rgba(220,232,255,.8)'); g.addColorStop(1, 'rgba(220,232,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(soma.x, soma.y - 34 * S); c.lineTo(soma.x + 22 * S, soma.y + 16 * S); c.lineTo(soma.x - 22 * S, soma.y + 16 * S); c.closePath(); c.fill();
  }

  // Cache the finished drawing so impulses only cost one image copy per frame.
  function finished(){
    if(!still){
      still = document.createElement('canvas'); still.width = W; still.height = H;
      drawNeuron(still.getContext('2d'), 1e9);
    }
    return still;
  }

  function newPulse(){
    const tips = segs.filter(s => !s.kids && !s.axon);
    let s = tips[Math.floor(Math.random() * tips.length)];
    const pts = [{ x: s.ex, y: s.ey }];
    while(s){ pts.push({ x: s.px, y: s.py }); s = s.parent >= 0 ? segs[s.parent] : null; }
    const ax = segs[segs.length - 1];
    pts.push({ x: ax.ex, y: ax.ey });
    let len = 0; const cum = [0];
    for(let i = 1; i < pts.length; i++){ len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); cum.push(len); }
    return { pts, cum, len, d: 0 };
  }

  function pointAt(p, d){
    let i = 1; while(i < p.cum.length - 1 && p.cum[i] < d) i++;
    const a = p.pts[i-1], b = p.pts[i], k = (d - p.cum[i-1]) / ((p.cum[i] - p.cum[i-1]) || 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  let last = 0;
  function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(48, now - (last || now)); last = now;
    ctx.clearRect(0, 0, W, H);
    if(!drawn){
      const t = (now - drawStart) / 1000 * .9;
      drawNeuron(ctx, t);
      if(t > 5.5){ drawn = true; nextPulse = now + 600; }
      return;
    }
    ctx.drawImage(finished(), 0, 0);
    if(!pulse && now > nextPulse) pulse = newPulse();
    if(pulse){
      pulse.d += dt * .45 * S * 2;
      if(pulse.d >= pulse.len){ pulse = null; nextPulse = now + 1400 + Math.random() * 1600; return; }
      const { x, y } = pointAt(pulse, pulse.d), r = 16 * S;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${PULSE},1)`); g.addColorStop(1, `rgba(${PULSE},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  function visible(){ return gate.style.display !== 'none' && !document.hidden; }
  function start(){
    if(raf || !visible()) return;
    if(!drawStart) drawStart = performance.now();
    last = 0; raf = requestAnimationFrame(frame);
  }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }
  function sync(){ visible() ? start() : stop(); }

  resize();
  if(reduced){
    drawNeuron(ctx, 1e9);
    let t = 0;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { resize(); drawNeuron(ctx, 1e9); }, 150); });
    return;
  }
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', sync);
  // app.js shows/hides the login page by setting authGate's inline display
  new MutationObserver(sync).observe(gate, { attributes: true, attributeFilter: ['style'] });
  sync();
})();
