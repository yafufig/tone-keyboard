/* ==========================================================================
   «Тон» — движение на страницах.
   Правила: анимируем только transform и opacity; всё выключается
   при prefers-reduced-motion: reduce; сцены встают на паузу,
   когда уходят с экрана или когда вкладка неактивна.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var MOTION = root.classList.contains('motion');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- тема ---------- */

  var themeBtn = document.getElementById('theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme');
      if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('tone-theme', next); } catch (e) {}
    });
  }

  /* ---------- оркестрованный вход первого экрана ---------- */

  /* Вход первого экрана целиком на CSS-анимациях — JS для него не нужен. */

  /* ---------- раскрытие по скроллу ---------- */

  $$('[data-stagger]').forEach(function (box) {
    $$(':scope > *', box).forEach(function (el, i) { el.style.setProperty('--i', i); });
  });

  var revealables = $$('[data-rv]');
  if (!MOTION || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('rv-in'); });
  } else {
    var rvIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var d = parseInt(el.getAttribute('data-rv-delay') || '0', 10);
        if (d) el.style.transitionDelay = d + 'ms';
        el.classList.add('rv-in');
        rvIO.unobserve(el);
      });
    }, { rootMargin: '-4% 0px -12% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { rvIO.observe(el); });
  }

  /* ---------- сценарист: очередь шагов с отменой ---------- */

  function Scene(build) {
    this.steps = [];
    build(this);
    this.h = null;
    this.i = 0;
    this.on = false;
  }
  Scene.prototype.add = function (d, fn) { this.steps.push({ d: d, fn: fn }); return this; };

  /* Набор текста: неравномерный ритм — множитель, а не ±несколько мс.
     Паузы на пробелах и знаках препинания дают главное ощущение живого. */
  function keyDelay(base, prev) {
    var d = base * (0.55 + Math.random() * 1.25);
    if (prev === ' ') d += Math.random() * 45;
    if (prev && ',;:—'.indexOf(prev) > -1) d += 150;
    if (prev && '.!?'.indexOf(prev) > -1) d += 320;
    if (Math.random() < 0.04) d += 180 + Math.random() * 240;
    return d;
  }
  Scene.prototype.type = function (get, text, base) {
    var self = this;
    for (var i = 1; i <= text.length; i++) {
      (function (n) {
        self.add(function () { return keyDelay(base, text.charAt(n - 2)); }, function () {
          var el = get(); if (el) { el.textContent = text.slice(0, n); mark(el); }
        });
      })(i);
    }
    return this;
  };
  /* Стирание — это зажатый backspace: ровнее и вдвое быстрее набора. */
  Scene.prototype.erase = function (get, from, speed) {
    var self = this;
    for (var i = from - 1; i >= 0; i--) {
      (function (n) {
        self.add(function () { return speed * (0.75 + Math.random() * 0.5); }, function () {
          var el = get(); if (el) { el.textContent = el.textContent.slice(0, n); mark(el); }
        });
      })(i);
    }
    return this;
  };
  /* пока идёт набор, курсор не мигает — как в настоящем поле ввода */
  var markT = null;
  function mark(el) {
    var box = el.closest ? el.closest('.fld, .d') : null;
    if (!box) return;
    box.setAttribute('data-typing', '');
    clearTimeout(markT);
    markT = setTimeout(function () { box.removeAttribute('data-typing'); }, 450);
  }
  Scene.prototype._tick = function () {
    var self = this;
    if (!this.on) return;
    if (this.i >= this.steps.length) this.i = 0;
    var s = this.steps[this.i++];
    var d = typeof s.d === 'function' ? s.d() : s.d;
    this.h = setTimeout(function () {
      if (!self.on) return;
      try { s.fn(); } catch (e) {}
      self._tick();
    }, d);
  };
  Scene.prototype.start = function () { if (this.on) return; this.on = true; this._tick(); };
  Scene.prototype.stop = function () { this.on = false; clearTimeout(this.h); };
  Scene.prototype.rewind = function () { this.stop(); this.i = 0; };

  /* Сцена играет, только пока видна, пока вкладка активна
     и пока человек не нажал «пауза». */
  var PAUSED = false;
  var syncs = [];
  function syncAll() { syncs.forEach(function (f) { f(); }); }

  function bind(scene, el) {
    if (!MOTION) return;
    var visible = false;
    function sync() {
      if (visible && !document.hidden && !PAUSED) scene.start();
      else scene.stop();
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (!visible) scene.rewind();
        sync();
      }, { threshold: 0 }).observe(el);
    } else { visible = true; }
    document.addEventListener('visibilitychange', sync);
    syncs.push(sync);
    sync();
  }

  /* WCAG 2.2.2: у движущегося дольше пяти секунд должна быть остановка. */
  var pauseBtn = document.getElementById('demo-pause');
  if (pauseBtn) {
    if (!MOTION) { pauseBtn.hidden = true; }
    else {
      pauseBtn.addEventListener('click', function () {
        PAUSED = !PAUSED;
        pauseBtn.setAttribute('aria-pressed', PAUSED ? 'true' : 'false');
        pauseBtn.setAttribute('aria-label', PAUSED ? 'Продолжить показ' : 'Остановить показ');
        pauseBtn.classList.toggle('is-paused', PAUSED);
        syncAll();
      });
    }
  }

  /* ---------- живой прототип клавиатуры ---------- */

  var demo = document.getElementById('demo');
  if (demo) {
    var q = function (s) { return $(s, demo); };
    var bIn = q('[data-b="2"]'), bOut = q('[data-b="3"]'), sent = q('[data-sent]');
    var ph = q('[data-ph]'), typed = q('[data-typed]'), fld = q('.fld');
    var strip = q('[data-strip]'), sheet = q('[data-sheet]'), hintKey = q('[data-hintkey]');
    var sendBtn = q('[data-send]'), tap = q('[data-tap]'), status = q('[data-status]');
    var opts = $$('[data-opt]', demo);
    var kb = q('.kb');
    var PICK = 'Отлично) Тогда беру билеты, а ты выбираешь, кого слушаем первыми.';

    function tapAt(el, scale) {
      if (!el || !tap || !kb) return;
      var a = el.getBoundingClientRect(), b = kb.getBoundingClientRect();
      tap.style.transform = 'translate(' + (a.left - b.left + a.width / 2) + 'px,' +
        (a.top - b.top + a.height / 2) + 'px) translate(-50%,-50%) scale(' + (scale || 1) + ')';
      tap.classList.remove('hit');
      void tap.offsetWidth;
      tap.classList.add('hit');
    }

    var inner = q('[data-inner]');
    function measureShift() {
      if (!inner || !bOut) return;
      var h = bOut.getBoundingClientRect().height;
      inner.style.setProperty('--shift', (h + 7) + 'px');
    }
    measureShift();
    window.addEventListener('resize', measureShift);

    var kbScene = new Scene(function (s) {
      /* 0. исходное положение — ставится, пока сцена ещё прозрачна */
      s.add(360, function () {
        bIn.classList.remove('on');
        bOut.classList.remove('on');
        if (inner) inner.classList.remove('up');
        typed.textContent = '';
        ph.classList.remove('off');
        fld.classList.remove('live');
        sheet.classList.remove('on', 'out');
        strip.classList.remove('off');
        opts.forEach(function (o) { o.classList.remove('on', 'sel', 'out'); });
        hintKey.classList.remove('press', 'pulse');
        sendBtn.classList.remove('press');
        if (tap) tap.classList.remove('hit');
        status.textContent = 'была в сети недавно';
        demo.classList.remove('resetting');
      });

      /* 1. собеседник отвечает односложно */
      s.add(900, function () { status.textContent = 'печатает…'; status.classList.add('typing'); });
      s.add(1500, function () {
        status.textContent = 'была в сети недавно'; status.classList.remove('typing');
        bIn.classList.add('on');
      });

      /* 2. человек пробует ответить сам — и стирает */
      s.add(1300, function () { ph.classList.add('off'); fld.classList.add('live'); });
      s.type(function () { return typed; }, 'ну ладно', 62);
      s.add(1150, function () {});
      s.erase(function () { return typed; }, 8, 28);
      s.add(620, function () {});
      s.type(function () { return typed; }, 'а ты', 62);
      s.add(880, function () {});
      s.erase(function () { return typed; }, 4, 28);
      s.add(1000, function () { hintKey.classList.add('pulse'); });

      /* 3. одно нажатие — и только оно */
      s.add(760, function () {
        hintKey.classList.remove('pulse');
        hintKey.classList.add('press');
        tapAt(hintKey);
      });
      s.add(230, function () { hintKey.classList.remove('press'); strip.classList.add('off'); });
      s.add(120, function () { sheet.classList.add('on'); });

      /* 4. три варианта разного тона */
      s.add(520, function () { opts[0].classList.add('on'); });
      s.add(70, function () { opts[1].classList.add('on'); });
      s.add(70, function () { opts[2].classList.add('on'); });

      /* 5. выбор */
      s.add(1900, function () { opts[1].classList.add('sel'); tapAt(opts[1], 1.6); });
      s.add(480, function () {
        sheet.classList.add('out');
        typed.textContent = PICK;
        fld.classList.add('paste');
      });
      s.add(360, function () {
        sheet.classList.remove('on', 'out');
        strip.classList.remove('off');
        fld.classList.remove('paste');
      });

      /* 6. отправка — старые сообщения уезжают вверх, как в настоящем чате */
      s.add(1150, function () { sendBtn.classList.add('press'); tapAt(sendBtn, 1.3); });
      s.add(190, function () {
        sendBtn.classList.remove('press');
        sent.textContent = PICK;
        bOut.classList.add('on');
        if (inner) inner.classList.add('up');
        typed.textContent = '';
        ph.classList.remove('off');
        fld.classList.remove('live');
      });

      /* 7. пауза на результате, потом продуманный выход, а не обрыв */
      s.add(2600, function () { demo.classList.add('resetting'); });
      s.add(520, function () {});
    });

    if (!MOTION) {
      /* статичный кадр — итог сцены, а не её начало */
      bIn.classList.add('on');
      sheet.classList.add('on');
      strip.classList.add('off');
      opts.forEach(function (o) { o.classList.add('on'); });
      opts[1].classList.add('sel');
      ph.classList.add('off');
      typed.textContent = 'ну ладно';
    } else {
      bind(kbScene, demo);
    }
  }

  /* ---------- сцена «пишет и стирает» в блоке про момент ---------- */

  var draftBox = $('[data-draft]');
  if (draftBox) {
    var dtype = $('[data-dtype]', draftBox);
    if (!MOTION) { dtype.textContent = 'Привет'; }
    else {
      var draftScene = new Scene(function (s) {
        s.add(1200, function () { dtype.textContent = ''; });
        s.type(function () { return dtype; }, 'Привет', 150);
        s.add(2600, function () {});
        s.erase(function () { return dtype; }, 6, 70);
        s.add(1400, function () {});
      });
      bind(draftScene, draftBox);
    }
  }

  /* ---------- живая сцена «черновик → смягчить» ---------- */

  var soften = document.getElementById('soften');
  if (soften) {
    var rwIn = $('[data-rw]', soften);
    var rwOut = $('[data-rwout]', soften);
    var outBox = $('[data-outbox]', soften);
    var pills = $$('[data-sp]', soften);
    var SRC = 'у меня вообще-то выходные, почему всегда я';
    var DST = 'Могу взяться в понедельник с утра — выходные уже занял. Если горит, давай обсудим, что сдвинуть.';

    function words(el, text) {
      el.textContent = '';
      text.split(' ').forEach(function (w, i) {
        var s = document.createElement('span');
        s.className = 'w on';
        s.style.setProperty('--i', i);
        s.textContent = w;
        el.appendChild(s);
        el.appendChild(document.createTextNode(' '));
      });
      return $$('.w', el);
    }

    var srcWords = words(rwIn, SRC);
    var dstWords = words(rwOut, DST);

    if (!MOTION) {
      srcWords.forEach(function (w) { w.classList.add('on'); });
      dstWords.forEach(function (w) { w.classList.add('on'); });
      outBox.classList.add('on');
      pills[0].classList.add('on');
    } else {
      var sfScene = new Scene(function (s) {
        s.add(900, function () {
          srcWords.forEach(function (w) { w.classList.add('on'); w.classList.remove('gone'); });
          dstWords.forEach(function (w) { w.classList.remove('on'); });
          outBox.classList.remove('on');
          pills.forEach(function (p) { p.classList.remove('on'); });
        });
        s.add(1600, function () { pills[0].classList.add('on'); });
        s.add(420, function () { srcWords.forEach(function (w) { w.classList.add('gone'); }); });
        s.add(560, function () { outBox.classList.add('on'); });
        s.add(160, function () { dstWords.forEach(function (w) { w.classList.add('on'); }); });
        s.add(3400, function () {});
      });
      bind(sfScene, soften);
    }
  }

  /* ---------- страница заявки: таймлайн ---------- */

  var weeks = $$('[data-week]');
  if (weeks.length) {
    weeks.forEach(function (w) {
      var head = $('.week-head', w);
      if (!head) return;
      head.addEventListener('click', function () {
        var open = w.classList.contains('open');
        weeks.forEach(function (o) { o.classList.remove('open'); $('.week-head', o).setAttribute('aria-expanded', 'false'); });
        if (!open) { w.classList.add('open'); head.setAttribute('aria-expanded', 'true'); }
      });
    });
  }

  /* прогресс-линия таймлайна */
  var spine = $('[data-spine]');
  if (spine && MOTION && 'IntersectionObserver' in window) {
    var spineIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('lit'); spineIO.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -45% 0px', threshold: 0.01 });
    weeks.forEach(function (w) { spineIO.observe(w); });
  } else if (spine) {
    weeks.forEach(function (w) { w.classList.add('lit'); });
  }

  /* ---------- страница заявки: функции на LLM ---------- */

  var llm = $('[data-llm]');
  if (llm) {
    var tabs = $$('[data-fn]', llm);
    var panes = $$('[data-fnpane]');
    function pick(id) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-fn') === id;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
      });
      panes.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-fnpane') === id); });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(t.getAttribute('data-fn')); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (n) { e.preventDefault(); n.focus(); pick(n.getAttribute('data-fn')); }
      });
    });
    pick(tabs[0].getAttribute('data-fn'));
  }

  /* ---------- страница заявки: активный пункт в рельсе ---------- */

  var railLinks = $$('.rail a');
  if (railLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    railLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var seen = {};
    var qs = $$('.q');
    var railIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      var first = null;
      qs.forEach(function (s) { if (!first && seen[s.id]) first = s.id; });
      for (var k in map) map[k].classList.toggle('on', k === first);
    }, { rootMargin: '-10% 0px -70% 0px' });
    qs.forEach(function (s) { railIO.observe(s); });
  }

  /* ---------- анкета: счётчик ответов в первом экране ---------- */

  $$('[data-tick]').forEach(function (t, i) { t.style.setProperty('--i', i); });
})();
