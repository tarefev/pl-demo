/**
 * pl-demo: стенд вариантов навигации по шагам визарда.
 *
 * Три таба в чёрной полоске — три варианта поведения заголовка «Шаг N из M»
 * и кнопок «Назад / Далее»:
 *   v1 — заголовок приклеен к верху панели, кнопки приклеены к низу;
 *   v2 — заголовок и кнопки в потоке ленты;
 *   v3 — заголовок липнет в ленте и подменяется заголовком видимого шага при
 *        прокрутке; кнопки прячутся, когда активный шаг не на экране.
 *
 * Сценарий один: «О признании доказательства недопустимым», полная карточка
 * (4 шага). Баннер сценария и чат-композер скрыты. Переключение таба полностью
 * сбрасывает состояние. Кнопка «Далее» жмёт скрытую «Готово» активного шага —
 * вся логика шагов (валидации, двухтактные предупреждения) остаётся родной.
 */

const FLOW_VARIANTS = [
  { key: 'v1', tab: '1 · Липкие шапка и кнопки', hint: 'Шаг приклеен к верху, кнопки — к низу; после последнего шага кнопки исчезают' },
  { key: 'v2', tab: '2 · Всё в ленте', hint: 'Заголовок шага и кнопки — обычные элементы ленты' },
  { key: 'v3', tab: '3 · Шапка за прокруткой', hint: 'Заголовок липнет и меняется при прокрутке; кнопки прячутся, когда активный шаг не виден' },
  { key: 'v4', tab: '4 · Активный у кнопок', hint: 'Сверху липнет заголовок видимого шага, внизу у кнопок — номер активного; кнопки не прячутся' }
];

let flowVariant = 0;
let flowSteps = [];        // [{ el, n, total }] — сообщения шагов в ленте
let flowDone = false;      // визард завершён — управление исчезает
let flowObserver = null;   // v3: следит, виден ли активный шаг
// стёртые «Назад» шаги с их данными: если ответ предыдущего шага не менялся,
// при «Далее» шаг восстанавливается с введёнными данными; поменялся — обнуляется
let flowCache = [];        // [{ el, n, total, prevKey, prevAnswer }]

/* ---------- DOM стенда: топ-бар, док с кнопками ---------- */

const assistantPane = document.querySelector('.assistant-pane');
const assistantScroll = document.getElementById('assistant-scroll');

const flowTop = document.createElement('div');
flowTop.id = 'flow-top';
assistantPane.insertBefore(flowTop, assistantScroll);

const flowNav = document.createElement('div');
flowNav.id = 'flow-nav';
flowNav.innerHTML = `
  <button id="flow-back" type="button">Назад</button>
  <button id="flow-next" type="button">Далее</button>`;

const flowDock = document.createElement('div');
flowDock.id = 'flow-dock';
// v4: подпись активного шага живёт прямо над кнопками — кнопки влияют на него
flowDock.innerHTML = '<div id="flow-dock-label" hidden></div>';
assistantPane.appendChild(flowDock);

const flowActive = () => flowSteps[flowSteps.length - 1] || null;

flowNav.querySelector('#flow-next').addEventListener('click', () => {
  const a = flowActive();
  if (!a || state.busy) return;
  const ok = a.el.querySelector('.mw-ok');
  if (ok && !ok.disabled) ok.click();   // родная «Готово» шага (скрыта стилями)
});

flowNav.querySelector('#flow-back').addEventListener('click', () => {
  if (state.busy) return;
  flowBack();
});

/* ---------- Регистрация шагов (хук из mwRunStep) ---------- */

function flowStepMounted(el, n, total) {
  // «назад → ничего не менял → далее»: восстанавливаем стёртый шаг с данными;
  // ответ предыдущего шага изменился — кэш обнуляется, шаг рендерится пустым
  const cached = flowCache[flowCache.length - 1];
  if (cached) {
    const nowAnswer = JSON.stringify(mwCtx && mwCtx.answers[cached.prevKey]);
    if (nowAnswer === cached.prevAnswer) {
      flowCache.pop();
      el.replaceWith(cached.el);
      el = cached.el;
      n = cached.n;
      total = cached.total;
      flowUnlock(el);
      // шаги с живой сборкой подтягивают восстановленный текст в документ
      el.querySelectorAll('.mw-input').forEach(i => i.dispatchEvent(new Event('input', { bubbles: true })));
    } else {
      flowCache = [];
    }
  }
  document.querySelectorAll('.mw-step-msg.is-step-active').forEach(x => x.classList.remove('is-step-active'));
  el.classList.add('is-step-active');
  flowSteps.push({ el, n, total });
  updateFlowNav();
}

/** Назад: активный шаг стирается из ленты, предпоследний снова активен. */
function flowBack() {
  if (flowSteps.length < 2 || !mwCtx) return;
  const cur = flowSteps.pop();
  const prev = flowActive();
  // стираем всё после сообщения предыдущего шага: ответ-пузырь, активный шаг, предупреждения
  while (prev.el.nextSibling) prev.el.nextSibling.remove();

  // откатываем визард на предыдущий шаг и снимаем его ответ
  const steps = mwCtx.def.steps;
  let i = mwCtx.step - 1;
  while (i >= 0 && steps[i].when && !steps[i].when(mwCtx)) i -= 1;
  if (i < 0) return;
  // стёртый шаг сохраняем вместе с ответом предыдущего: не изменится — восстановим
  flowCache.push({
    el: cur.el, n: cur.n, total: cur.total,
    prevKey: steps[i].key,
    prevAnswer: JSON.stringify(mwCtx.answers[steps[i].key])
  });
  delete mwCtx.answers[steps[i].key];
  mwCtx.step = i;
  mwSync();

  flowUnlock(prev.el);
  prev.el.classList.add('is-step-active');
  updateFlowNav();
  // проматываем ленту к ставшему активным шагу
  prev.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Разбудить погашенный шаг: контролы снова активны, выбор в них сохранён. */
function flowUnlock(msg) {
  msg.querySelectorAll('.mw-ok, .mw-add, .mw-item, .mw-all, .mw-choice, .mw-check input, .mw-field input, .mw-field select, .mw-chip button, .mw-free input')
    .forEach(x => { x.disabled = false; });
  msg.querySelectorAll('.mw-input, .mw-thesis, .mw-arg__text').forEach(x => { x.contentEditable = 'true'; });
}

/* ---------- Раскладка «Назад/Далее» и заголовка по варианту ---------- */

function updateFlowNav() {
  const a = flowActive();
  const v = FLOW_VARIANTS[flowVariant].key;

  if (!a || flowDone) {
    flowTop.hidden = true;
    flowDock.hidden = true;
    flowNav.remove();
    if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }
    return;
  }

  // подпись активного шага: v1 — липкий топ-бар, v4 — над кнопками внизу
  flowTop.textContent = `Шаг ${a.n} из ${a.total}`;
  flowTop.hidden = v !== 'v1';
  const dockLabel = document.getElementById('flow-dock-label');
  dockLabel.textContent = `Шаг ${a.n} из ${a.total}`;
  dockLabel.hidden = v !== 'v4';

  // «Назад» только со второго шага; одна кнопка занимает всю ширину.
  // Кнопки всегда включаем заново: обработчики «Готово» шагов гасят все
  // кнопки своего сообщения, а в v2 навигация лежит внутри него
  flowNav.querySelectorAll('button').forEach(b => { b.disabled = false; });
  flowNav.querySelector('#flow-back').hidden = flowSteps.length < 2;

  if (v === 'v2') {
    // кнопки — в потоке ленты, под блоком активного шага
    flowDock.hidden = true;
    a.el.appendChild(flowNav);
  } else {
    flowDock.hidden = false;
    flowDock.appendChild(flowNav);
  }

  if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }
  if (v === 'v3') {
    // кнопки видны, только пока активный шаг в поле зрения
    flowObserver = new IntersectionObserver(entries => {
      flowDock.classList.toggle('is-offscreen', !entries[0].isIntersecting);
    }, { root: assistantScroll, threshold: 0.05 });
    flowObserver.observe(a.el);
  } else {
    flowDock.classList.remove('is-offscreen');
  }
}

/** Финал визарда: после последнего шага управление исчезает, остаётся чеклист. */
function flowFinish() {
  flowDone = true;
  updateFlowNav();
}

/* ---------- Табы вариантов и запуск сценария ---------- */

function renderVariantSwitcher() {
  switcherTabsEl.innerHTML = '';
  FLOW_VARIANTS.forEach((vr, i) => {
    const btn = document.createElement('button');
    btn.className = 'demo-tab' + (i === flowVariant ? ' is-active' : '');
    btn.textContent = vr.tab;
    btn.title = vr.hint;
    btn.addEventListener('click', () => startFlowDemo(i));
    switcherTabsEl.appendChild(btn);
  });
}

/** Полный сброс и автозапуск визарда недопустимости на полной карточке. */
function startFlowDemo(variant) {
  flowVariant = variant;
  flowSteps = [];
  flowCache = [];
  flowDone = false;
  document.body.classList.remove('flow-v1', 'flow-v2', 'flow-v3', 'flow-v4');
  document.body.classList.add('flow-' + FLOW_VARIANTS[variant].key);

  // состояние как в resetDemo, но без стартового сценария выбора типа
  state.tabIndex = 2;                       // полная карточка
  state.card = clone(DEMO_TABS[2].card);
  state.blocks = clone(DOC_BLOCKS);
  state.pleas = [];
  state.structure = null;
  state.factsSource = null;
  state.boundLines = new Set();
  state.warnExplained = false;
  state.activeSubpart = null;
  state.activeBlockId = null;
  state.docType = { key: 'motion', label: 'Ходатайство' };
  state.scenario = null;
  state.busy = false;

  feedEl.innerHTML = '';
  setBusy(false);
  document.body.classList.remove('text-only');
  const vt = document.getElementById('view-toggle');
  if (vt) vt.classList.add('is-on');

  topbarTitleEl.textContent = 'Новый документ';
  docTitleEl.textContent = 'Новый документ';
  docHeaderBodyEl.innerHTML = '<p class="placeholder">Шапка документа сформируется после выбора типа</p>';

  renderVariantSwitcher();
  renderBlocks();
  renderPleas();
  renderContextChip();
  updateFlowNav();

  // сразу визард «О признании доказательства недопустимым»
  startScenario('motion', 'Подготовка ходатайства');
  pickMotion('inadmissible');
}

// стенд стартует сам — вместо resetDemo из app.js
startFlowDemo(0);
