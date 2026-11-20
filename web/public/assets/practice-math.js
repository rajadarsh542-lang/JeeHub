"use strict";
window.PracticeMath = (() => {
  const base = "/assets/katex/";
  let ready;
  function script(name) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = base + name;
      tag.onload = resolve;
      tag.onerror = () => { tag.remove(); reject(new Error("Could not load the formula renderer.")); };
      document.head.append(tag);
    });
  }
  function load() {
    if (!ready) {
      if (!document.querySelector("link[data-practice-math]")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = base + "katex.min.css";
        link.dataset.practiceMath = "";
        document.head.append(link);
      }
      ready = script("katex.min.js").then(() => script("mhchem.min.js"))
        .then(() => script("auto-render.min.js")).catch(error => { ready = null; throw error; });
    }
    return ready;
  }
  async function render(element) {
    if (!element || !/\$|\\[[(]/.test(element.textContent)) return;
    try {
      await load();
      if (!element.isConnected) return;
      window.renderMathInElement(element, {
        delimiters: [
          {left:"$$", right:"$$", display:true}, {left:"\\[", right:"\\]", display:true},
          {left:"\\(", right:"\\)", display:false}, {left:"$", right:"$", display:false}
        ],
        trust:false, throwOnError:false, maxExpand:1000, maxSize:20,
        ignoredTags:["script","noscript","style","textarea","pre","code","svg","math","mjx-container"],
        ignoredClasses:["katex","katex-display"], errorCallback:() => {}
      });
    } catch { /* Preserve the publisher's original formula text during a network failure. */ }
  }
  return {render};
})();
