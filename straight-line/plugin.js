// src/index.ts
var capture = (line, points) => {
  if (points.length < 2) {
    return [...line];
  }
  const x = points[points.length - 2];
  const y = points[points.length - 1];
  return line.length >= 2 ? [line[0], line[1], x, y] : [x, y];
};
var ICON = '<path d="M5 19 19 5" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" />';
var plugin = {
  id: "straight-line",
  // The major this plugin was written against: see types/toonop.ts.
  api: 1,
  icon: ICON,
  // Its own words, under its own namespace in the editor's i18next. The
  // manifest below points into them by key; `host.t` would read the same.
  locales: {
    ru: { label: "\u041B\u0438\u043D\u0438\u044F", title: "\u0420\u043E\u0432\u043D\u0430\u044F \u043B\u0438\u043D\u0438\u044F (L)" },
    en: { label: "Line", title: "Straight line (L)" }
  },
  tools: {
    "straight-line": {
      label: { t: "label" },
      title: { t: "title" },
      key: "l",
      icon: ICON,
      stroke: {
        kind: "pencil",
        descriptor: ({ width, color }) => ({ kind: "pencil", geometry: "smooth", width, color }),
        // Its own rules, so the line is the same whatever brush the preset
        // would have handed it. The numbers are logical pixels, as every
        // brush's are, and no document rescales them.
        rules: () => ({
          range: { min: 1, max: 500 },
          defaults: { width: 5, smooth: 3, minDistance: 3 },
          // Two points: neither thinning number has anything to do here.
          smoothing: false,
          capture,
          prepare: (points) => [...points]
        })
      }
    }
  }
};
var index_default = plugin;
export {
  index_default as default
};
