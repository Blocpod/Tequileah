import '@fontsource-variable/funnel-display';
import '@fontsource-variable/funnel-sans';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource-variable/geist-mono';
import './styles/main.css';
import './styles/form.css';
import geo from './data/geo.json';
import { createStage } from './stage/stage.js';
import { posterSVG } from './stage/poster.js';
import { initChrome } from './chrome.js';
import { FLOWS } from './forms.js';
import { FORM_ENDPOINT } from './config.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 860px)').matches;
const flow = FLOWS[document.body.dataset.flow];
const places = new Map([...geo.towns, ...geo.hubs].map(([n, x, y]) => [n, [x, y]]));

const stage = createStage({ canvas: document.querySelector('.stage__canvas'), labelsEl: document.querySelector('.stage__labels'), geo, mobile: MOBILE, mode: 'apply', still: RM });
if (!stage) { document.documentElement.classList.add('no-webgl'); document.querySelector('.stage__fallback').innerHTML = posterSVG(geo); }
stage?.setYouColor(flow.color === 'aqua' ? '#46e0c9' : '#ffb347');
stage?.setT(0, true);
initChrome();

// ---------- render steps ----------
const form = document.querySelector('.flow');
const stepsEl = form.querySelector('.flow__steps');
const total = flow.steps.length;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

stepsEl.innerHTML = flow.steps.map((s, i) => {
  const hintId = `${s.id}-hint`, errId = `${s.id}-err`;
  const describedby = `${s.hint ? hintId + ' ' : ''}${errId}`;
  let field = '';
  if (s.type === 'textarea') field = `<textarea id="${s.id}" name="${s.id}" rows="4" placeholder="${esc(s.placeholder || '')}" aria-describedby="${describedby}" ${s.required ? 'required' : ''}></textarea>`;
  else if (s.type === 'place' || s.type === 'chips') {
    const multi = s.type === 'chips';
    field = `<div class="chips" role="${multi ? 'group' : 'radiogroup'}" aria-labelledby="${s.id}-q" aria-describedby="${describedby}">${s.options.map((o, k) => `<label class="chip"><input type="${multi ? 'checkbox' : 'radio'}" name="${s.id}" value="${esc(o)}" ${k === 0 && !multi ? '' : ''}/><span>${esc(o)}</span></label>`).join('')}</div>`;
  } else field = `<input id="${s.id}" name="${s.id}" type="${s.type}" placeholder="${esc(s.placeholder || '')}" autocomplete="${s.autocomplete || 'off'}" aria-describedby="${describedby}" ${s.required ? 'required' : ''} ${s.type === 'url' ? 'inputmode="url"' : ''} />`;
  const labelFor = s.type === 'place' || s.type === 'chips' ? '' : `for="${s.id}"`;
  return `<fieldset class="step-q" data-i="${i}" ${i ? 'hidden' : ''}>
    <p class="step-q__n" aria-hidden="true">${String(i + 1).padStart(2, '0')} <span>/ ${String(total).padStart(2, '0')}</span></p>
    <label class="step-q__q" id="${s.id}-q" ${labelFor}>${esc(s.q)}${s.required ? '' : ' <span class="opt">Optional</span>'}</label>
    ${field}
    ${s.hint ? `<p class="step-q__hint" id="${hintId}">${esc(s.hint)}</p>` : ''}
    <p class="step-q__err" id="${errId}" role="alert"></p>
  </fieldset>`;
}).join('');

const sets = [...stepsEl.querySelectorAll('.step-q')];
const bar = form.querySelector('.flow__bar i');
const back = form.querySelector('[data-back]');
const next = form.querySelector('[data-next]');
const live = form.querySelector('.flow__live');
let cur = 0;

function value(s) {
  if (s.type === 'chips') return [...form.querySelectorAll(`input[name="${s.id}"]:checked`)].map((i) => i.value);
  if (s.type === 'place') return form.querySelector(`input[name="${s.id}"]:checked`)?.value || '';
  return form.querySelector(`#${s.id}`).value.trim();
}
function validate(i) {
  const s = flow.steps[i], v = value(s);
  let msg = '';
  if (s.required && (!v || (Array.isArray(v) && !v.length))) msg = s.type === 'chips' ? 'Pick at least one.' : s.type === 'place' ? 'Pick one to continue.' : 'This one is needed to continue.';
  else if (s.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) msg = 'That email looks off. Check it once more?';
  else if (s.type === 'url' && v && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}/i.test(v)) msg = 'Paste a full link, like https://yourproject.com';
  else if (s.min && v.length < s.min) msg = `A little more detail, please (at least ${s.min} characters).`;
  sets[i].querySelector('.step-q__err').textContent = msg;
  sets[i].classList.toggle('has-err', !!msg);
  const input = sets[i].querySelector('input:not([type=radio]):not([type=checkbox]), textarea');
  input?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  return !msg;
}
function show(i, dir = 1) {
  const prev = sets[cur];
  cur = i;
  sets.forEach((f, k) => { f.hidden = k !== i; });
  const nowEl = sets[i];
  if (!RM) { nowEl.classList.remove('in-l', 'in-r'); void nowEl.offsetWidth; nowEl.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
  bar.style.transform = `scaleX(${(i + 1) / total})`;
  back.disabled = i === 0;
  next.querySelector('span').textContent = i === total - 1 ? (flow.kind === 'investor' ? 'Join the circle' : 'Send application') : 'Continue';
  live.textContent = `Step ${i + 1} of ${total}: ${flow.steps[i].q}`;
  const focusEl = nowEl.querySelector('input:not([type=radio]):not([type=checkbox]), textarea') || nowEl.querySelector('input');
  if (prev !== nowEl) setTimeout(() => focusEl?.focus({ preventScroll: true }), RM ? 0 : 120);
}

// place picks move your light on the map
form.addEventListener('change', (e) => {
  const s = flow.steps[cur];
  if (s.type === 'place' && e.target.name === s.id) {
    const p = places.get(e.target.value);
    stage?.setYou(p ? [p[0], p[1], 0.12] : null);
    stage?.setFocus(p ? [p[0], p[1]] : null);
    sets[cur].querySelector('.step-q__err').textContent = '';
  }
  if (s.type === 'chips') sets[cur].querySelector('.step-q__err').textContent = '';
});
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA' && !(e.metaKey || e.ctrlKey)) return;
  if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); go(); }
});
back.addEventListener('click', () => { if (cur > 0) show(cur - 1, -1); });
form.addEventListener('submit', (e) => { e.preventDefault(); go(); });

async function go() {
  if (!validate(cur)) { sets[cur].querySelector('input, textarea')?.focus(); return; }
  if (cur < total - 1) { show(cur + 1, 1); return; }
  // submit
  const data = Object.fromEntries(flow.steps.map((s) => [s.id, value(s)]));
  data.kind = flow.kind;
  next.disabled = true; next.classList.add('is-busy'); next.querySelector('span').textContent = 'Sending';
  try {
    if (FORM_ENDPOINT) {
      const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error('status ' + r.status);
    } else {
      await new Promise((r) => setTimeout(r, 900)); // demo mode: nothing leaves the browser
    }
    finish(data);
  } catch (err) {
    next.disabled = false; next.classList.remove('is-busy'); next.querySelector('span').textContent = 'Try again';
    sets[cur].querySelector('.step-q__err').textContent = "That didn't go through. Your answers are still here. Try again in a moment.";
  }
}

function finish(data) {
  const p = places.get(data.town);
  form.hidden = true;
  document.querySelector('.panel__title').hidden = true;
  const done = document.querySelector('.done');
  done.hidden = false;
  done.querySelector('.done__k').textContent = flow.done.k;
  done.querySelector('.done__t').textContent = flow.done.t;
  done.querySelector('.done__d').textContent = flow.done.d;
  done.querySelector('h1, h2')?.focus();
  // your light travels to the room
  if (!stage || !p || RM) { stage?.setYou([0, 0, 0.12]); stage?.setFocus([0, 0]); return; }
  const t0 = performance.now(), dur = 2600;
  const L = Math.hypot(p[0], p[1]);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const px = p[0] * (1 - e), py = p[1] * (1 - e);
    const perp = [-p[1] / (L || 1), p[0] / (L || 1)];
    const bend = Math.sin(e * Math.PI) * L * 0.18;
    stage.setYou([px + perp[0] * bend, py + perp[1] * bend, 0.12 + Math.sin(e * Math.PI) * (L * 0.12 + 0.4)]);
    if (k < 1) requestAnimationFrame(step); else { stage.setFocus([0, 0]); document.querySelector('.done').classList.add('is-landed'); }
  };
  stage.setFocus(null);
  requestAnimationFrame(step);
}

show(0);
if (matchMedia('(pointer: fine)').matches) sets[0].querySelector('input, textarea')?.focus({ preventScroll: true });
document.body.classList.remove('is-loading');
