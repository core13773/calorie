// Client-side food search. Loads the compact per-language index once, filters in-browser.
// Index rows are tuples: [slug, name, kcal].
(function () {
  var input = document.getElementById('q');
  if (!input) return;
  var results = document.getElementById('results');
  var status = document.getElementById('status');
  var prefix = input.dataset.prefix || '/food/';
  var ko = (document.documentElement.lang || 'ko').indexOf('ko') === 0;
  var INDEX_URL = '/search-data/' + (ko ? 'ko' : 'en') + '.json';
  var LOADING = ko ? '불러오는 중…' : 'Loading…';
  var RESULT = ko ? '검색 결과 ' : 'Results: ';
  var NONE = ko ? '검색어를 입력하세요.' : 'Type to search.';
  var DATA = null, loaded = false;

  function ensure() {
    if (loaded) return Promise.resolve(DATA);
    loaded = true;
    status.textContent = LOADING;
    return fetch(INDEX_URL).then(function (r) { return r.json(); }).catch(function () { return []; }).then(function (d) { DATA = d; return d; });
  }
  function render(q) {
    var ql = q.toLowerCase().trim();
    if (!ql) { results.innerHTML = ''; status.textContent = NONE; return; }
    var hits = [];
    for (var i = 0; i < DATA.length && hits.length < 150; i++) {
      var row = DATA[i];
      var name = row[1];
      if (name && name.toLowerCase().indexOf(ql) >= 0) hits.push(row);
    }
    results.innerHTML = hits.length
      ? hits.map(function (row) {
          var slug = row[0], name = row[1], k = row[2];
          return '<li><a href="' + prefix + slug + '">' + name + '</a>' + (k != null ? ' <span class="muted">' + k + ' kcal</span>' : '') + '</li>';
        }).join('')
      : '<li class="muted">' + (ko ? '결과가 없습니다.' : 'No results.') + '</li>';
    status.textContent = RESULT + hits.length + (hits.length === 150 ? (ko ? ' (상위 150)' : ' (top 150)') : '');
  }
  var t;
  input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { ensure().then(function () { render(input.value); }); }, 120); });
  if (input.value) { ensure().then(function () { render(input.value); }); }
  else { status.textContent = NONE; }
})();
