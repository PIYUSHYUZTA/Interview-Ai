// Used by scripts/verify-cinematic-landing.ts: page.evaluate(`${source}('.cinema')`).
// WCAG 2.x contrast for every visible element that has its own text, inside `rootSelector`.
(function (rootSelector) {
  function parse(c) { var m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; var p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); if (p.length < 4) p.push(1); return p; }
  function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function background(el) { while (el) { var c = parse(getComputedStyle(el).backgroundColor); if (c && c[3] > 0.5) return c; el = el.parentElement; } return [10, 10, 10, 1]; }
  function opacity(el) { var o = 1; while (el) { o *= Number(getComputedStyle(el).opacity); el = el.parentElement; } return o; }
  var failures = {}, checked = 0;
  document.querySelectorAll(rootSelector + ' *').forEach(function (el) {
    var own = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); }).map(function (n) { return n.textContent.trim(); }).join(' ');
    if (!own) return;
    var style = getComputedStyle(el), box = el.getBoundingClientRect();
    if (style.visibility === 'hidden' || style.display === 'none' || box.width === 0 || box.height === 0) return;
    var visible = opacity(el);
    if (visible < 0.05) return; // fully transparent (e.g. an unfocused skip link) is not rendered text
    checked++;
    var fg = parse(style.color), bg = background(el), alpha = fg[3] * visible;
    var mixed = [0, 1, 2].map(function (i) { return fg[i] * alpha + bg[i] * (1 - alpha); });
    var a = lum(mixed), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    var size = parseFloat(style.fontSize), large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      var cls = (typeof el.className === 'string' && el.className.split(' ')[0]) || (el.parentElement && String(el.parentElement.className).split(' ')[0]) || '';
      var key = el.tagName.toLowerCase() + '.' + cls;
      failures[key] = failures[key] || { ratio: Number(ratio.toFixed(2)), size: size, text: own.slice(0, 40), color: style.color, count: 0 };
      failures[key].count++;
    }
  });
  return { checked: checked, failing: Object.keys(failures).length, failures: failures };
})
