"use strict";
window.LicensedPractice = (() => {
  const chunks = new Map();
  const imagePacks = new Map();
  let imageIndex;
  const subjects = {chemistry:"Chemistry", physics:"Physics", mathematics:"Mathematics"};
  async function json(file) {
    return window.BankFiles.json("licensed/" + file);
  }
  async function index() {
    const data = await json("index.json");
    return data.rows.map(([group, line, chapter, topic, preview, canGrade], i) => {
      const prefix = data.groups[group];
      return {
        id:prefix + ":" + line, subject:subjects[prefix.split(":")[2]], exam:"JEE Main",
        chapter:data.chapters[chapter], topic:data.topics[topic], stem:preview || "Image-based source record",
        kind:"licensed_practice", collection:"practice", licensedArchive:true, canGrade:!!canGrade,
        chunk:Math.floor(i / data.chunkSize), offset:i % data.chunkSize
      };
    });
  }
  async function load(summary) {
    if (!chunks.has(summary.chunk)) {
      const promise = json("q-" + summary.chunk + ".json").catch(error => { chunks.delete(summary.chunk); throw error; });
      chunks.set(summary.chunk, promise);
      if (chunks.size > 5) chunks.delete(chunks.keys().next().value);
    }
    const record = (await chunks.get(summary.chunk))[summary.offset];
    return {
      ...summary, stem:record.stem || "Question text is unavailable for this record.",
      format:record.numerical ? "numerical" : "single_choice",
      options:record.options.map((text, i) => ({id:String.fromCharCode(65 + i), text})),
      answer:record.answer, solution_steps:record.solution ? [record.solution] : [], assets:[],
      sourceRecord:record
    };
  }
  function node(tag, content, cls) {
    const output = document.createElement(tag);
    if (content) output.textContent = content;
    if (cls) output.className = cls;
    return output;
  }
  async function figureData(path) {
    if (!imageIndex) imageIndex = json('figures/index.json').catch(error => { imageIndex = null; throw error; });
    const index = await imageIndex;
    const entry = index.files[path];
    if (!entry) throw new Error('Unknown figure');
    const [number, expected, mime] = entry;
    const filename = index.packs[number];
    if (!/^pack-\d+\.json$/.test(filename) || !['image/jpeg','image/png'].includes(mime)) throw new Error('Invalid figure');
    if (!imagePacks.has(filename)) {
      const request = json('figures/' + filename).catch(error => { imagePacks.delete(filename); throw error; });
      imagePacks.set(filename,request);
      if (imagePacks.size > 3) imagePacks.delete(imagePacks.keys().next().value);
    }
    const encoded = (await imagePacks.get(filename))[path];
    const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
    const hash = await crypto.subtle.digest('SHA-256',bytes);
    const actual = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,'0')).join('');
    if (actual !== expected) throw new Error('Figure mismatch');
    return 'data:' + mime + ';base64,' + encoded;
  }
  function figures(host, urls, description) {
    if (!urls.length) return;
    if(window.BankFiles.textOnly){
      host.append(node("p",description+(urls.length>1?"s are":" is")+" unavailable in this edition.","licensed-note"));
      return;
    }
    const details = node("details", "", "credit");
    details.append(node("summary", description + (urls.length > 1 ? "s" : "")));
    details.addEventListener("toggle", () => {
      if (!details.open || details.childElementCount > 1) return;
      urls.forEach((url, i) => {
        const figure = node("figure");
        const label = description + (urls.length > 1 ? " " + (i + 1) : "");
        const img = node("img");
        img.alt = label;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        const path = url.replace(/^\//, "");
        if (!/^licensed\/figures\/(chemistry|physics|mathematics)\/images\/[a-zA-Z0-9_.-]+\.(png|jpeg)$/.test(path)) return;
        figure.append(img);
        details.append(figure);
        const unavailable = () => img.replaceWith(node("figcaption", label + " is unavailable."));
        img.onerror = unavailable;
        figureData(path).then(src => { if (img.isConnected) { img.src = src; window.QuestionExperience?.attach(figure); } }).catch(unavailable);
      });
    });
    host.append(details);
  }
  function typeset(element) { return window.PracticeMath.render(element); }
  function renderAttempt(card, q, showAttempt) {
    const record = q.sourceRecord;
    card.querySelector('.stem')?.classList.add('licensed-stem');
    const needsFigure=record.questionImages.length>0||record.issues.some(issue=>
      /question (?:references an image|refers to a figure)|figures to interpret this question/i.test(issue));
    const issues=window.BankFiles.textOnly?record.issues.map(issue=>{
      if(/question (?:references an image|refers to a figure)|figures to interpret this question/i.test(issue))return "The question requires a figure that is unavailable in this edition.";
      if(/solution image/i.test(issue))return "A solution figure is unavailable in this edition.";
      return issue;
    }):record.issues;
    if (issues.length) card.append(node("p", [...new Set(issues)].join(" "), "licensed-note"));
    figures(card, record.questionImages, "Question figure");
    if (q.canGrade && !(window.BankFiles.textOnly && needsFigure)) {
      showAttempt(card, q);
      const section = card.querySelector("#solution");
      if (section) {
        const heading = section.querySelector("h3");
        if (heading) heading.textContent = "Worked solution";
        if (!record.solution) section.append(node("p", "A written explanation is missing from this record."));
        figures(section, record.solutionImages, "Solution figure");
      }
      return;
    }
    if (q.options.length) {
      const list = node("div", "", "choices");
      for (const option of q.options) {
        const line = node("div", "", "choice licensed-read-choice");
        line.append(node("strong", option.id), node("span", option.text || "Choice text unavailable"));
        list.append(line);
      }
      card.append(list);
    }
    const details = node("details", "", "credit licensed-retained");
    details.append(node("summary", "Show solution"));
    if (q.answer.length) details.append(node("p", "Answer: " + q.answer.join(" or ")));
    details.append(node("p", record.solution || "A written explanation is missing from this record."));
    figures(details, record.solutionImages, "Solution figure");
    card.append(details);
  }
  return {index, load, renderAttempt, typeset};
})();
