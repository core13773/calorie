// Client-side food search. Loads /foods-index.json once, filters in-browser.
(function () {
  var input = document.getElementById('q');
  if (!input) return;
  var results = document.getElementById('results');
  var status = document.getElementById('status');
  var prefix = input.dataset.prefix || '/food/';
  var ko = (document.documentElement.lang || 'ko').indexOf('ko') === 0;
  var LOADING = ko ? '불러오는 중…' : 'Loading…';
  var RESULT = ko ? '검색 결과 ' : 'Results: ';
  var NONE = ko ? '검색어를 입력하세요.' : 'Type to search.';
  var DATA = null, loaded = false;

  function nm(f) { return f.ko || f.en || f.slug; }
  function ensure() {
    if (loaded) return Promise.resolve(DATA);
    loaded = true;
    status.textContent = LOADING;
    return fetch('/foods-index.json').then(function (r) { return r.json(); }).catch(function () { return []; }).then(function (d) { DATA = d; return d; });
  }
  function render(q) {
    var ql = q.toLowerCase().trim();
    if (!ql) { results.innerHTML = ''; status.textContent = NONE; return; }
    var hits = DATA.filter(function (f) {
      if (ko && !f.ko) return false;   // Korean search: only Korean-named foods
      if (!ko && !f.en) return false;  // English search: only English-named foods
      return ((f.en || '') + ' ' + (f.ko || '')).toLowerCase().indexOf(ql) >= 0;
    }).slice(0, 150);
    results.innerHTML = hits.length
      ? hits.map(function (f) { return '<li><a href="' + prefix + f.slug + '">' + nm(f) + '</a>' + (f.k != null ? ' <span class="muted">' + f.k + ' kcal</span>' : '') + '</li>'; }).join('')
      : '<li class="muted">' + (ko ? '결과가 없습니다.' : 'No results.') + '</li>';
    status.textContent = RESULT + hits.length + (hits.length === 150 ? (ko ? ' (상위 150)' : ' (top 150)') : '');
  }
  var t;
  input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { ensure().then(function () { render(input.value); }); }, 120); });
  if (input.value) { ensure().then(function () { render(input.value); }); }
  else { status.textContent = NONE; }
})();
