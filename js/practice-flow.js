/* 実際の練習を案内し、途中経過と振り返りを既存の記録につなぐ。 */
window.GolfPractice = (function () {
  'use strict';
  function create(o) {
    const D = o.data, esc = o.esc;
    let interval = null, tickAt = 0;
    const $ = s => document.querySelector(s);
    const drill = id => D.drills.find(d => d.id === id);
    const task = id => D.weeks.flatMap(w => w.tasks).find(t => t.id === id);
    const clamp = (n, max) => Math.max(0, Math.min(max, Number(n) || 0));
    const ratingText = { done: '取り組めた', hard: '難しかった', skip: '今回は見送り' };
    const stages = ['説明', '準備', '練習', '振り返り'];
    const readiness = [
      { id: 'shot', name: 'ショット', route: 'practice', items: [
        ['shot-setup', 'グリップと構えを自分で作って練習した'],
        ['shot-clubs', 'コースで使うクラブを一通り試した'],
        ['shot-choice', 'ティーショットで使うクラブを決めた'],
      ] },
      { id: 'putt', name: 'パター・アプローチ', route: 'drill-putting-stroke', items: [
        ['putt-short', '短いパットを実際に練習した'],
        ['putt-long', '長いパットの距離感を試した'],
        ['putt-approach', '転がしアプローチを練習した'],
      ] },
      { id: 'rules', name: 'ルール・マナー', route: 'rules', items: [
        ['rules-safety', '打つ前に周囲を確認する場面を理解した'],
        ['rules-pace', '進行を遅らせない動き方を確認した'],
        ['rules-help', '困ったときに同伴者へ相談する準備ができた'],
      ] },
      { id: 'day', name: '当日の準備', route: 'debut', items: [
        ['day-booking', '予約・集合時間・行き方を確認した'],
        ['day-kit', '服装と持ち物を確認した'],
        ['day-flow', '受付からラウンド終了までの流れを読んだ'],
      ] },
    ];
    function model() {
      const s = o.state();
      if (!s.practice) s.practice = {};
      const p = s.practice;
      p.reviews ||= {}; p.readiness ||= {}; p.visit ||= {};
      return p;
    }
    function reviewKey() { return `${o.state().profile.start}:${o.week()}`; }
    function lastLog() { return [...o.state().logs].reverse().find(l => l.sessionId); }
    function pendingReview(mode) {
      const seen = new Set();
      for (const log of [...o.state().logs].reverse()) {
        for (const item of log.items || []) {
          const key = item.drill || item.task;
          if (!key || item.rating === 'skip' || seen.has(key)) continue;
          seen.add(key);
          if (item.rating === 'hard' && eligible(item, mode)) return { ...item, repeat: true };
        }
      }
      return null;
    }
    function eligible(t, mode) {
      if (t.tool === 'putting' || ['quiz', 'log'].includes(t.link) || t.check || t.where === 'コース') return false;
      return mode === 'range' ? t.where === '練習場' : ['自宅', 'どこでも', 'アプリ'].includes(t.where);
    }
    function plan(mode, selected) {
      const n = o.week(), current = D.weeks[n - 1];
      let candidates;
      if (selected) {
        const t = task(selected);
        const d = drill(selected);
        candidates = t ? [t] : d ? [{ drill: d.id, text: d.name, where: d.where }] : [];
      } else {
        const next = task(model().reviews[reviewKey()]?.nextTask);
        const repeat = pendingReview(mode);
        const pool = current.tasks.concat(n > 1 ? D.weeks[n - 2].tasks : []).filter(t => eligible(t, mode));
        candidates = [...(next && eligible(next, mode) ? [{ ...next, repeat: true }] : []), ...(repeat ? [repeat] : []),
          ...pool.filter(t => !o.state().done[t.id]), ...pool];
      }
      const unique = [];
      for (const t of candidates) {
        const key = t.drill || t.link || t.id || t.task;
        if (key && !unique.some(x => (x.drill || x.link || x.id || x.task) === key)) unique.push(t);
      }
      if (!unique.length) {
        const d = drill(mode === 'range' ? 'half-swing' : n >= 9 ? 'slope' : 'grip');
        unique.push({ drill: d.id, text: d.name, where: d.where });
      }
      const count = selected || mode === '5' || n === 12 ? 1 : mode === 'range' ? 3 : 2;
      const chosen = unique.slice(0, count);
      const total = selected ? (parseInt(drill(chosen[0].drill)?.time, 10) || 5) : mode === 'range' ? (n === 12 ? 20 : 40) : Number(mode);
      return chosen.map((t, i) => {
        const d = drill(t.drill);
        return { task: t.id || t.task || null, drill: t.drill || null, link: t.link || null,
          title: d?.name || t.text || t.title, target: t.text || t.target || t.title,
          where: t.where, repeat: !!t.repeat, minutes: Math.floor(total / chosen.length) + (i < total % chosen.length ? 1 : 0),
          elapsed: 0, actual: 0, rating: '', fullGoal: false };
      });
    }
    function start(mode, selected) {
      if (model().active) { o.go('session'); return; }
      const items = plan(mode, selected);
      model().active = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: o.today(),
        week: o.week(), mode, items, index: 0, stage: 0, ready: {}, review: { memo: '', next: '', minutes: '',
          place: items.some(x => x.where === '練習場') ? '練習場' : items.every(x => x.where === 'アプリ') ? 'アプリ' : '自宅' } };
      o.save(); o.go('session');
    }
    function dailyCard(mode) {
      const active = model().active, items = active?.items || plan(mode);
      const last = lastLog();
      return `<section class="card daily-session" aria-labelledby="daily-session-title">
        <div class="section-head"><span class="eyebrow">${active ? '保存してある練習' : 'TODAY’S PRACTICE'}</span><span class="tag">${active ? `${active.index + 1}/${items.length}` : `約${items.reduce((sum, x) => sum + x.minutes, 0)}分`}</span></div>
        <h2 id="daily-session-title">${active ? '前回のつづきから' : '今日の練習'}</h2>
        ${active ? `<p class="goal">${esc(items[active.index].title)} ・ ${stages[active.stage] || '振り返り'}から再開できます。</p>` : `<div class="seg" role="radiogroup" aria-label="今日の練習時間">${[['5', '5分だけ'], ['15', '15分'], ['range', '練習場']].map(([id, text]) => `<button class="seg-b" role="radio" aria-checked="${mode === id}" data-mode="${id}">${text}</button>`).join('')}</div>`}
        <ol class="session-menu">${items.map(x => `<li><span>${x.repeat ? '<small class="repeat-label">もう一度</small>' : ''}${esc(x.title)}</span><small>${x.minutes}分</small></li>`).join('')}</ol>
        ${last?.nextFocus ? `<p class="carry-note"><b>前回の自分から</b><br>${esc(last.nextFocus)}</p>` : ''}
        <button class="btn btn-primary btn-block" data-practice="start">${active ? '練習を再開する' : '今日の練習を始める'} ${o.icon('arrow')}</button>
        <p class="note">${active ? '途中の内容はこの端末に保存しています。' : '説明 → 準備 → 練習 → 振り返り。短く取り組んでも記録できます。'}</p>
      </section>`;
    }
    function readinessCard() {
      return `<section class="card section"><div class="section-head"><h2>デビューへの準備</h2><a class="more" href="#readiness">確認する</a></div>
        <div class="readiness-grid">${readiness.map(g => { const n = g.items.filter(([id]) => model().readiness[id]).length;
          return `<a href="#readiness" class="readiness-mini"><span>${g.name}</span><b>${n}/${g.items.length}</b><span class="progress"><span style="width:${100 * n / g.items.length}%"></span></span></a>`;
        }).join('')}</div><p class="note">自分で確認した準備の記録です。チェック数やゲームの成績で実力を判定しません。</p></section>`;
    }
    function weeklyCard() {
      const review = model().reviews[reviewKey()];
      return `<a class="weekly-link card" href="#weekreview"><span>${o.icon('book')}</span><span><b>今週を振り返る</b><small>${review?.date ? '保存した振り返りを見直す' : 'できたこと・難しかったことを、次の練習へ'}</small></span>${o.icon('arrow')}</a>`;
    }
    function prepCard() {
      const remaining = o.daysLeft();
      if (remaining > 21) return '';
      const n = D.checklist.filter(c => o.state().checklist[c.id]).length;
      return `<section class="card prep-reminder section"><span class="eyebrow">${remaining < 0 ? '次のラウンドにも' : 'デビュー前の確認'}</span><h2>練習と一緒に、当日の準備も</h2>
        <p class="goal">持ち物 ${n}/${D.checklist.length}項目 ・ 集合時間と行き方を確認しましょう。</p><a class="btn btn-pine btn-block" href="#debut">デビュー準備を開く</a></section>`;
    }
    function viewSession() {
      const a = model().active;
      if (!a) return summary();
      const x = a.items[a.index], d = drill(x.drill);
      const stage = Math.min(a.stage, 3);
      const shell = `<div class="page page-narrow session-page"><div class="session-topline"><span class="tag">WEEK ${a.week}</span><span>${a.index + 1}/${a.items.length}メニュー ・ 約${x.minutes}分</span></div>
        <ol class="session-stages" aria-label="練習の手順">${stages.map((text, i) => `<li ${stage === i ? 'aria-current="step"' : ''} class="${i < stage ? 'done' : ''}"><span>${i < stage ? '✓' : i + 1}</span>${text}</li>`).join('')}</ol>`;
      if (stage === 3) return shell + reviewForm(a) + '</div>';
      const intro = `<div class="session-heading"><span class="eyebrow">${x.repeat ? '前回の復習' : stages[stage]}</span><h2>${esc(x.title)}</h2><p class="goal">${esc(d?.summary || x.target)}</p></div>`;
      let content = '';
      if (stage === 0) {
        content = `${d?.svg ? o.illus(d.svg) : ''}<section class="card section"><h3>今日の取り組み</h3><p>${x.minutes}分を目安に、できるところまで取り組みましょう。</p>
          <p class="goal">${x.task ? '週の目標：' : 'テーマ：'}${esc(x.target)}</p>${d ? `<ol class="steps">${d.steps.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ol>` : `<a class="btn btn-ghost" href="#${esc(x.link || 'debut')}">教材を開く（練習は保存されます）</a>`}</section>
          ${d?.point ? `<section class="point"><strong>ポイント</strong><p>${esc(d.point)}</p></section>` : ''}`;
      } else if (stage === 1) {
        content = `<section class="card section"><h3>始める前の確認</h3><dl class="facts"><div><dt>場所</dt><dd>${esc(x.where)}</dd></div><div><dt>使うもの</dt><dd>${esc(d?.club || 'このアプリ')}</dd></div></dl>
          <label class="prepare-check"><input type="checkbox" data-session-ready="equipment" ${a.ready.equipment ? 'checked' : ''}>使うものを準備した</label>
          <label class="prepare-check"><input type="checkbox" data-session-ready="space" ${a.ready.space ? 'checked' : ''}>練習できる場所・周囲を確認した</label></section>`;
      } else {
        content = `<section class="card session-clock"><span class="eyebrow">取り組んだ時間</span><output class="num" id="session-clock">${time(x.elapsed)}</output><span class="note">目安 ${x.minutes}分 ・ 時間になっても自動で達成にはなりません</span>
          <button class="btn btn-pine" data-practice="timer" id="session-timer" aria-pressed="false">タイマーを開始</button></section>
          ${d?.svg ? o.illus(d.svg) : ''}<section class="card section"><h3>意識すること</h3>${d ? `<ol class="steps">${d.steps.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ol>` : `<p>${esc(x.target)}</p><a class="btn btn-ghost" href="#${esc(x.link || 'debut')}">教材を開く</a>`}
          ${d?.tool ? `<a class="btn btn-ghost" href="#${d.tool}">テンポ練習の音を使う（途中保存）</a>` : ''}</section>
          ${d ? `<section class="card session-counter"><span id="session-count" class="num">${x.actual}</span><span>回数・球数（任意）</span><div class="btn-row"><button class="btn btn-ghost" data-practice="count" data-add="-1" aria-label="回数を1減らす">−1</button><button class="btn btn-ghost" data-practice="count" data-add="1">＋1</button><button class="btn btn-ghost" data-practice="count" data-add="10">＋10</button></div></section>` : ''}`;
      }
      const next = stage === 0 ? '準備へ進む' : stage === 1 ? '練習へ進む' : a.index + 1 < a.items.length ? '次のメニューへ' : '振り返りへ進む';
      return shell + intro + content + `<div class="session-controls"><button class="btn btn-primary btn-block" data-practice="next" ${stage === 1 && !(a.ready.equipment && a.ready.space) ? 'disabled' : ''}>${next}</button>
        ${stage > 0 ? '<button class="btn btn-ghost" data-practice="back">ひとつ戻る</button>' : ''}${stage < 3 ? '<button class="btn btn-ghost" data-practice="skip">このメニューは見送る</button>' : ''}<button class="btn btn-ghost" data-practice="pause">保存してホームへ</button></div></div>`;
    }
    function time(seconds) { const n = Math.floor(seconds || 0); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
    function suggestedMinutes(a) { return Math.ceil(a.items.filter(x => x.rating !== 'skip').reduce((n, x) => n + x.elapsed, 0) / 60); }
    function reviewForm(a) {
      const r = a.review;
      const minutes = r.minutes === '' ? suggestedMinutes(a) : r.minutes;
      return `<div class="session-heading"><span class="eyebrow">おつかれさまでした</span><h2>今日の練習を振り返ろう</h2><p class="goal">難しかった内容は、次回の復習候補に残ります。</p></div>
        <form class="form" id="session-review">${a.items.map((x, i) => `<fieldset class="card session-review-item"><legend>${esc(x.title)}</legend><div class="review-ratings">${Object.entries(ratingText).map(([id, text]) => `<label><input type="radio" name="rating-${i}" value="${id}" data-session-rating="${i}" ${x.rating === id ? 'checked' : ''} required><span>${text}</span></label>`).join('')}</div>
          ${x.task ? `<label class="prepare-check goal-check"><input type="checkbox" data-session-goal="${i}" ${x.fullGoal ? 'checked' : ''} ${x.rating === 'skip' ? 'disabled' : ''}><span>週の目標まで取り組めた<br><small>${esc(x.target)}</small></span></label>` : ''}<p class="note">${x.actual ? `${x.actual}回・球を記録 ／ ` : ''}短時間の練習は、週の目標にチェックしなくても記録できます。</p></fieldset>`).join('')}
          <section class="card form"><div class="field"><label for="session-place">練習した場所</label><select id="session-place" data-session-field="place">${['自宅', '練習場', 'アプリ', 'ショートコース', 'コース'].map(p => `<option ${r.place === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div class="field"><label for="session-minutes">実際に取り組んだ時間（分）</label><input id="session-minutes" type="number" inputmode="numeric" min="0" max="600" step="1" value="${esc(minutes)}" data-session-field="minutes" required><p class="note">タイマーの時間を入れています。タイマーを使わなかった時間は修正できます。</p></div>
          <div class="field"><label for="session-memo">気づいたこと（任意）</label><textarea id="session-memo" maxlength="400" data-session-field="memo" placeholder="例：構えるときに肩の力が入りやすかった">${esc(r.memo)}</textarea></div>
          <div class="field"><label for="session-next">次に意識すること（任意）</label><input id="session-next" maxlength="120" data-session-field="next" value="${esc(r.next)}" placeholder="例：握る力を弱めてから始める"></div></section>
          <button type="submit" class="btn btn-primary btn-block">振り返りを保存する</button><button type="button" class="btn btn-ghost" data-practice="back">最後のメニューに戻る</button><button type="button" class="btn btn-ghost" data-practice="pause">途中保存してホームへ</button></form>`;
    }
    function afterSession() {
      const form = $('#session-review');
      if (form) form.addEventListener('submit', e => {
        e.preventDefault();
        const a = model().active;
        if (!a || !form.reportValidity()) return;
        a.review.minutes = clamp($('#session-minutes').value, 600);
        const performed = a.items.filter(x => x.rating !== 'skip');
        const s = o.state();
        if (performed.length && !s.logs.some(l => l.sessionId === a.id)) {
          const entry = { id: Date.now(), sessionId: a.id, date: o.today(), week: a.week,
            place: $('#session-place').value,
            focus: performed.map(x => x.title).join('・'), minutes: a.review.minutes,
            balls: performed.filter(x => x.where === '練習場' && x.drill !== 'stretch').reduce((n, x) => n + x.actual, 0),
            score: '', feel: performed.some(x => x.rating === 'hard') ? 2 : 4, memo: a.review.memo, nextFocus: a.review.next,
            items: a.items.map(x => ({ ...x })) };
          s.logs.push(entry); o.save();
          o.track('log'); o.gain(30 + Math.min(20, Math.round(entry.minutes / 6)), '練習の振り返り');
          performed.filter(x => x.fullGoal && x.task).forEach(x => o.completeTask(x.task));
          o.checkBadges();
        }
        model().last = { id: a.id, count: performed.length, minutes: a.review.minutes, next: a.review.next,
          hard: performed.filter(x => x.rating === 'hard').map(x => x.title), date: o.today() };
        model().active = null; o.save(); o.render();
      });
    }
    function summary() {
      const last = model().last;
      return `<div class="page page-narrow session-page"><section class="card session-summary"><img src="assets/face-${o.character()}.jpg" width="76" height="76" alt="あなたのゴルファー">
        <span class="eyebrow">${last?.count ? 'PRACTICE SAVED' : '次の一歩へ'}</span><h2>${last?.count ? '今日の一歩を、記録しました' : 'できる日に、また一緒に'}</h2>
        <p>${last?.count ? `${last.count}メニュー ・ ${last.minutes}分` : '今日は見送っても大丈夫。次回は5分から始められます。'}</p>
        ${last?.hard.length ? `<p class="carry-note">次回の復習候補：${esc(last.hard.join('・'))}</p>` : ''}${last?.next ? `<p class="carry-note">次に意識すること：${esc(last.next)}</p>` : ''}
        <a class="btn btn-primary btn-block" href="#home">ホームへ戻る</a><a class="btn btn-ghost" href="#log">練習の記録を見る</a></section></div>`;
    }
    function viewWeekly() {
      const w = D.weeks[o.week() - 1], r = model().reviews[reviewKey()] || {};
      const logs = o.state().logs.filter(l => l.date >= o.weekStart() && l.date <= o.today());
      return `<div class="page page-narrow"><section class="session-heading"><span class="eyebrow">WEEK ${w.n}</span><h2>${esc(w.title)}を振り返る</h2><p class="goal">今週の練習 ${new Set(logs.map(l => l.date)).size}日 ・ ${logs.reduce((n, l) => n + (Number(l.minutes) || 0), 0)}分。少しの進歩も残しましょう。</p></section>
        <form class="card form" id="weekly-review"><div class="field"><label for="weekly-good">できたこと（任意）</label><textarea id="weekly-good" maxlength="400" data-weekly-field="good">${esc(r.good)}</textarea></div>
        <div class="field"><label for="weekly-hard">難しかったこと（任意）</label><textarea id="weekly-hard" maxlength="400" data-weekly-field="hard">${esc(r.hard)}</textarea></div>
        <div class="field"><label for="weekly-task">次にもう一度取り組むメニュー</label><select id="weekly-task" data-weekly-field="nextTask"><option value="">今日のおすすめに任せる</option>${w.tasks.filter(t => !t.check && t.drill && t.where !== 'コース').map(t => `<option value="${t.id}" ${r.nextTask === t.id ? 'selected' : ''}>${esc(t.text)}</option>`).join('')}</select></div>
        <p class="note">選んだメニューは、練習する場所が合うときに優先して案内します。</p><button class="btn btn-primary btn-block">振り返りを保存する</button></form>
        <a class="btn btn-ghost" href="#week-${w.n}">今週のメニューを確認する</a></div>`;
    }
    function afterWeekly() {
      $('#weekly-review').addEventListener('submit', e => { e.preventDefault();
        model().reviews[reviewKey()] = { good: $('#weekly-good').value.trim(), hard: $('#weekly-hard').value.trim(), nextTask: $('#weekly-task').value, date: o.today() };
        o.save(); o.toast('今週の振り返りを保存しました'); o.go('home');
      });
    }
    function viewReadiness() {
      return `<div class="page page-narrow"><section class="session-heading"><span class="eyebrow">YOUR FIRST ROUND</span><h2>デビューへの準備を確認</h2><p class="goal">練習と準備の経験を、自分で振り返るチェックです。未確認の項目から、次の一歩を選べます。</p></section>
        ${readiness.map(g => `<section class="card section"><div class="section-head"><h3>${g.name}</h3><span class="tag">${g.items.filter(([id]) => model().readiness[id]).length}/${g.items.length}</span></div>
          ${g.items.map(([id, text]) => `<label class="prepare-check"><input type="checkbox" data-readiness="${id}" ${model().readiness[id] ? 'checked' : ''}><span>${text}</span></label>`).join('')}
          <a class="btn btn-ghost" href="#${g.route}">${g.id === 'day' ? '当日の準備を開く' : '関連する練習・説明を見る'}</a></section>`).join('')}
        <p class="note">チェックは準備を振り返るためのものです。不安が残る項目は、同伴者に相談することも次の一歩になります。</p></div>`;
    }
    function visitForm() {
      const v = model().visit;
      return `<section class="card section"><h2>当日の予定メモ</h2><p class="goal">予約の情報を一か所に。入力した内容はこの端末に保存します。</p><div class="form">
        <div class="field"><label for="visit-course">コース名</label><input id="visit-course" data-visit="course" maxlength="100" value="${esc(v.course)}"></div>
        <div class="form-row"><div class="field"><label for="visit-meet">集合時間</label><input id="visit-meet" type="time" data-visit="meet" value="${esc(v.meet)}"></div><div class="field"><label for="visit-tee">スタート時間</label><input id="visit-tee" type="time" data-visit="tee" value="${esc(v.tee)}"></div></div>
        <div class="field"><label for="visit-memo">集合場所・行き方・確認事項</label><textarea id="visit-memo" data-visit="memo" maxlength="400">${esc(v.memo)}</textarea></div><p class="note" role="status" id="visit-status">入力すると自動で保存します。</p></div></section>`;
    }
    function tick() {
      const now = performance.now(), a = model().active;
      if (a && a.stage === 2) a.items[a.index].elapsed += (now - tickAt) / 1000;
      tickAt = now; o.save(); updateClock();
    }
    function updateClock() {
      const a = model().active;
      if ($('#session-clock') && a) $('#session-clock').textContent = time(a.items[a.index].elapsed);
      const b = $('#session-timer');
      if (b) { b.textContent = interval ? 'タイマーを一時停止' : 'タイマーを開始'; b.setAttribute('aria-pressed', String(!!interval)); }
    }
    function pause() {
      if (interval) { tick(); clearInterval(interval); interval = null; updateClock(); }
    }
    function action(button) {
      const a = model().active, name = button.dataset.practice;
      if (name === 'start') { start(o.mode(), button.dataset.selected); return; }
      if (name === 'pause') { pause(); o.save(); o.go('home'); return; }
      if (!a) return;
      if (name === 'timer') {
        if (interval) pause(); else if (!document.hidden && a.stage === 2) { tickAt = performance.now(); interval = setInterval(tick, 1000); updateClock(); }
        return;
      }
      if (name === 'count') { a.items[a.index].actual = clamp(a.items[a.index].actual + Number(button.dataset.add), 2000); o.save(); $('#session-count').textContent = a.items[a.index].actual; return; }
      pause();
      if (name === 'back') a.stage = Math.max(0, a.stage - 1);
      if (name === 'next' || name === 'skip') {
        if (name === 'next' && a.stage === 1 && !(a.ready.equipment && a.ready.space)) return;
        if (name === 'skip') { a.items[a.index].rating = 'skip'; a.items[a.index].fullGoal = false; }
        if (a.stage === 2 || name === 'skip') {
          if (a.index + 1 < a.items.length) { a.index++; a.stage = 0; a.ready = {}; }
          else a.stage = 3;
        } else a.stage++;
      }
      o.save(); o.render();
    }
    document.addEventListener('input', e => {
      const t = e.target, a = model().active;
      if (t.dataset.sessionField && a) { a.review[t.dataset.sessionField] = t.value; o.save(); }
      if (t.dataset.weeklyField) { model().reviews[reviewKey()] ||= {}; model().reviews[reviewKey()][t.dataset.weeklyField] = t.value; o.save(); }
      if (t.dataset.visit) { model().visit[t.dataset.visit] = t.value; o.save(); $('#visit-status').textContent = 'この端末に保存しました'; }
    });
    document.addEventListener('change', e => {
      const t = e.target, a = model().active;
      if (t.dataset.sessionReady && a) {
        a.ready[t.dataset.sessionReady] = t.checked; o.save();
        const b = $('[data-practice="next"]'); if (b) b.disabled = !(a.ready.equipment && a.ready.space);
      }
      if (t.dataset.sessionRating != null && a) {
        const x = a.items[Number(t.dataset.sessionRating)]; x.rating = t.value;
        const c = $(`[data-session-goal="${t.dataset.sessionRating}"]`);
        if (c) { c.disabled = t.value === 'skip'; if (c.disabled) { c.checked = false; x.fullGoal = false; } }
        if (a.review.minutes === '') $('#session-minutes').value = suggestedMinutes(a);
        o.save();
      }
      if (t.dataset.sessionGoal != null && a) { a.items[Number(t.dataset.sessionGoal)].fullGoal = t.checked; o.save(); }
      if (t.dataset.readiness) { model().readiness[t.dataset.readiness] = t.checked; o.save(); o.render(true); $(`[data-readiness="${t.dataset.readiness}"]`)?.focus({ preventScroll: true }); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('pagehide', pause);
    function returnLink() {
      return model().active ? '<a class="session-return" href="#session">練習のつづきに戻る →</a>' : '';
    }
    return { start, dailyCard, readinessCard, weeklyCard, prepCard, viewSession, afterSession,
      viewWeekly, afterWeekly, viewReadiness, visitForm, action, pause, returnLink };
  }
  return { create };
})();
