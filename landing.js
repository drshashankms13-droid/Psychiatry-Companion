/* Login page background: a slowly drifting network of "neurons" with the
   occasional impulse travelling along a connection. Runs only while the login
   page is visible and the tab is in view; skipped for reduced-motion users. */
(function(){
  const canvas = document.getElementById('neuralBg');
  const gate = document.getElementById('authGate');
  if(!canvas || !gate || !canvas.getContext) return;
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const GOLD = '212,175,55', BLUE = '120,160,235';
  const LINK = 150;            // max px between connected neurons
  let W = 0, H = 0, dpr = 1, nodes = [], pulses = [], raf = 0, last = 0;

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(24, Math.min(80, Math.round(W * H / 17000)));
    nodes = Array.from({length: count}, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12,
      r: 1.2 + Math.random() * 1.8, gold: Math.random() < .28,
      phase: Math.random() * Math.PI * 2
    }));
    pulses = [];
  }

  function spawnPulse(){
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    let best = null, bestD = LINK;
    for(const b of nodes){
      if(b === a) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if(d < bestD && Math.random() < .6){ best = b; bestD = d; }
    }
    if(best) pulses.push({ a, b: best, t: 0 });
  }

  function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(48, now - (last || now)); last = now;
    ctx.clearRect(0, 0, W, H);

    for(const n of nodes){
      n.x += n.vx * dt * .25; n.y += n.vy * dt * .25;
      if(n.x < -20) n.x = W + 20; if(n.x > W + 20) n.x = -20;
      if(n.y < -20) n.y = H + 20; if(n.y > H + 20) n.y = -20;
    }

    // connections (dendrites)
    for(let i = 0; i < nodes.length; i++){
      for(let j = i + 1; j < nodes.length; j++){
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if(d < LINK){
          ctx.strokeStyle = `rgba(${BLUE},${(1 - d / LINK) * .22})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // impulses travelling along a connection
    if(Math.random() < .03 && pulses.length < 6) spawnPulse();
    pulses = pulses.filter(p => (p.t += dt / 1400) < 1);
    for(const p of pulses){
      const x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
      g.addColorStop(0, `rgba(${GOLD},.95)`); g.addColorStop(1, `rgba(${GOLD},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    }

    // somas, gently "breathing"
    for(const n of nodes){
      const glow = .55 + .45 * Math.sin(now / 1600 + n.phase);
      const c = n.gold ? GOLD : BLUE;
      ctx.fillStyle = `rgba(${c},${.35 + .5 * glow})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      if(n.gold){
        ctx.fillStyle = `rgba(${GOLD},${.08 * glow})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function visible(){ return gate.style.display !== 'none' && !document.hidden; }
  function start(){ if(!raf && visible()){ last = 0; raf = requestAnimationFrame(frame); } }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }
  function sync(){ visible() ? start() : stop(); }

  resize();
  window.addEventListener('resize', () => { resize(); });
  document.addEventListener('visibilitychange', sync);
  // app.js shows/hides the login page by setting authGate's inline display
  new MutationObserver(sync).observe(gate, { attributes: true, attributeFilter: ['style'] });
  sync();
})();
