/* Render a normalized question, its worked material and saved figures from the released bank. */
import {getQuestion,getAsset} from "./hosted-bank.js";
import {baselineMathText,exposeArchiveMath} from "./archive-math.js";
let glyphJob;
  const safeTags = new Set(("article section figure figcaption p br div span sub sup strong b em i u s mark small ol ul li table tbody thead tfoot tr td th blockquote pre code hr h2 h3 h4 h5 center a img details summary math semantics mrow mi mn mo ms mtext mfrac msup msub msubsup msqrt mroot mtable mtr mtd mstyle mspace mover munder munderover mmultiscripts mprescripts none mpadded menclose mphantom mfenced mjx-container svg g path use defs rect line polygon polyline circle ellipse title desc").split(" "));
  const geom=new Set("viewbox width height x y x1 x2 y1 y2 cx cy r rx ry points d transform fill stroke stroke-width stroke-linecap stroke-linejoin fill-rule preserveaspectratio".split(" "));
  const mathAttrs=new Set("mathvariant display stretchy fence accent rowspan columnspan colspan".split(" "));
  const archiveAsset = /^a\/[a-f0-9]{64}\.(?:webp|png|jpe?g|gif|svg|avif|bmp)$/i;
  function elem(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
  function glyphs(){
    if(!glyphJob){
      const font=window.BankFiles.textOnly ? Promise.resolve("/assets/source-font/tex-glyphs.svg") : getAsset("math/tex-glyphs.svg");
      glyphJob=font.then(url=>fetch(url)).then(response=>{
        if(!response.ok)throw new Error("Math font unavailable");
        return response.text();
      }).then(source=>{
        const parsed=new DOMParser().parseFromString(source,"image/svg+xml");
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"),defs=document.createElementNS(svg.namespaceURI,"defs");
        for(const path of parsed.querySelectorAll("defs path[id][d]")){
          const id=path.getAttribute("id");if(!/^MJX-[\w.-]+$/.test(id))continue;
          const node=document.createElementNS(svg.namespaceURI,"path");node.id=id;node.setAttribute("d",path.getAttribute("d"));defs.append(node);
        }
        svg.id="bank-math-glyphs";svg.setAttribute("width","0");svg.setAttribute("height","0");svg.setAttribute("aria-hidden","true");svg.style.position="absolute";
        svg.append(defs);document.body.append(svg);
      }).catch(error=>{glyphJob=null;throw error;});
    }
    return glyphJob;
  }
  function material(html){
    const root=elem("div",null,"personal-rich");
    // Template contents are inert. Remove everything except the reader's display vocabulary before insertion.
    const t=document.createElement("template");t.innerHTML=html||"";
    // Inspect the original shape before sanitization removes untrusted attributes.
    // A removed transform/style must never turn an ambiguous drawing into text.
    const mathRuns=new Map([...t.content.querySelectorAll("mjx-container")].map(node=>[node,baselineMathText(node)]));
    for(const node of [...t.content.querySelectorAll("*")]){
      const tag=node.localName.toLowerCase();
      if(!safeTags.has(tag)){node.remove();continue;}
      const href=node.getAttribute("href")||node.getAttribute("xlink:href");
      const asset=node.getAttribute("data-asset"), alt=node.getAttribute("alt");
      for(const att of [...node.attributes]){
        const key=att.name.toLowerCase(),val=att.value;
        if(node.namespaceURI==="http://www.w3.org/2000/svg"&&geom.has(key)&&!(/url\s*\(|[<>;@]/i).test(val))continue;
        if(mathAttrs.has(key))continue;
        node.removeAttributeNode(att);
      }
      if(tag==="use"&&/^#MJX-[\w.-]+$/.test(href||""))node.setAttribute("href",href);
      if(tag==="img"){
        if(window.BankFiles.textOnly){
          const label=(alt||"").trim();
          const description=label&&!/^(?:image|figure|question figure)$/i.test(label)?label+" · ":"";
          node.replaceWith(elem("span",description+"Figure unavailable in this edition.","archive-note"));
          continue;
        }
        node.alt=alt||"Question figure";
        if(asset&&archiveAsset.test(asset))node.dataset.bankFigure=asset;
        else node.replaceWith(elem("span","Figure unavailable","archive-note"));
      }
      // Archived links are outside the practice flow. A plain label may still be part of an exam stimulus.
      if(tag==="a")node.replaceWith(...node.childNodes);
    }
    for(const [node,text] of mathRuns)if(t.content.contains(node))exposeArchiveMath(node,text);
    root.append(t.content);
    return root;
  }
function hydrate(root){
  for(const img of root.querySelectorAll("img[data-bank-figure]")){
    const name=img.dataset.bankFigure;delete img.dataset.bankFigure;
    getAsset(name).then(url=>{if(img.isConnected)img.src=url;}).catch(()=>{
      if(img.isConnected)img.replaceWith(elem("span","This figure could not be loaded.","archive-note"));
    });
  }
  if(root.querySelector('use[href^="#MJX-"]'))glyphs().catch(()=>{
    if(root.isConnected)root.append(elem("p","Some equation symbols could not be loaded.","archive-note"));
  });
  window.PracticeMath?.render(root);
}
function noticeText(value){
  if(/bonus/i.test(value))return "This was a bonus question.";
  if(/figure/i.test(value))return "Some question or option figures are unavailable.";
  if(/disagree|disputes|conflict/i.test(value))return "The recorded answer and its supporting information disagree.";
  if(/incomplete.*key|key is incomplete/i.test(value))return "The answer key is incomplete.";
  if(value.startsWith("editorial review: "))return "This question is under review for "+value.slice(18).replaceAll("_"," ")+".";
  return "This question is under review.";
}
function addAttempt(root,q){
  const fields=elem("fieldset"), numeric=q.format==="numerical",multiple=q.format==="multiple_choice";
  const inputs=[];
  fields.append(elem("legend",q.gradeable?(numeric?"Enter your numerical answer":multiple?"Select all correct options":"Select one option"):"Answer choices"));
  if(q.gradeable&&numeric){
    const input=elem("input");input.type="text";input.inputMode="decimal";input.maxLength=100;input.setAttribute("aria-label","Numerical answer");
    inputs.push(input);fields.append(input);
  }else{
    const choices=elem("div",null,"choices archived-choices");fields.append(choices);
    for(const option of q.options||[]){
      const label=elem(q.gradeable?"label":"div",null,"choice");
      if(q.gradeable){
        const input=elem("input");input.type=multiple?"checkbox":"radio";input.name="exam-answer";input.value=option.id;
        label.append(input);inputs.push(input);
      }
      label.append(elem("strong",option.id),material(option.html));choices.append(label);
    }
  }
  if(inputs.length||q.options?.length)root.append(fields);
  const actions=elem("div",null,"actions"),verdict=elem("p");verdict.id="verdict";verdict.setAttribute("role","status");
  function invalidateAttempt(){
    window.QuestionExperience?.clearAnswerFeedback(fields);
    window.QuestionExperience?.reportAttempt(q.id,"unattempted");
    if(!verdict.textContent)return;
    verdict.className="";verdict.textContent="Answer changed — check again.";
  }
  fields.addEventListener("input",invalidateAttempt);
  fields.addEventListener("change",invalidateAttempt);
  const solution=elem("section",null,"solution archived-solution");solution.id="solution";solution.hidden=true;
  const reveal=elem("button","Show solution","secondary");reveal.type="button";reveal.setAttribute("aria-controls","solution");reveal.setAttribute("aria-expanded","false");
  function showSolution(open){
    if(open&&!solution.childElementCount){
      solution.append(elem("h3","Answer"),material(q.answerHtml||"An answer key is unavailable."),elem("h3","Worked solution"),material(q.solutionHtml||"A worked solution is unavailable."));
      hydrate(solution);
      window.QuestionExperience?.decorateSolution(solution,q.id);
      window.QuestionExperience?.attach(solution,q);
    }
    solution.hidden=!open;reveal.textContent=open?"Hide solution":"Show solution";reveal.setAttribute("aria-expanded",String(open));
  }
  reveal.onclick=()=>showSolution(solution.hidden);
  if(q.gradeable){
    const check=elem("button","Check answer","primary");check.type="button";actions.append(check);
    check.onclick=()=>{
      let correct=false;
      if(numeric){
        const text=inputs[0].value.trim().replace(/^−/,"-"),n=Number(text);
        if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)||!Number.isFinite(n)){verdict.textContent="Enter a decimal number or scientific notation.";verdict.className="";return;}
        correct=q.answer.some(a=>normalNumber(a)===normalNumber(text))||(q.ranges||[]).some(([lo,hi])=>n>=Number(lo)&&n<=Number(hi));
      }else{
        const answer=inputs.filter(i=>i.checked).map(i=>i.value);
        if(!answer.length){verdict.className="";verdict.textContent="Choose an option first.";return;}
        correct=answer.length===q.answer.length&&answer.every(val=>q.answer.includes(val));
      }
      verdict.className=correct?"correct":"incorrect";verdict.textContent=correct?"Correct.":"That answer is incorrect.";
      window.QuestionExperience?.markAnswers(fields,q.answer,{numerical:numeric,correct});
      window.QuestionExperience?.reportAttempt(q.id,correct?"correct":"incorrect");
      showSolution(true);
    };
  }
  const hintHost=elem("div",null,"hint-host");
  window.QuestionExperience?.addHints(actions,hintHost,q.id);
  actions.append(reveal);root.append(actions);
  if(window.QuestionExperience)root.append(hintHost);
  root.append(verdict,solution);
}
function needsQuestionFigure(q){
  return [q.stemHtml,...(q.options||[]).map(o=>o.html)].some(html=>/<img\b/i.test(html)) ||
    (q.notices||[]).some(note=>/question or option figures are unavailable/i.test(note));
}
// These IDs belong to the paper already in memory. No other paper or figure is downloaded.
export async function findTextQuestion(ids){
  for(const id of ids){
    const q=await getQuestion(id);
    if(q.gradeable&&!needsQuestionFigure(q))return id;
  }
  return null;
}
export async function renderArchivedQuestion(root,id){
  const q=await getQuestion(id);
  if(q?.id!==id)throw new Error("Unknown question");
  if(!root.isConnected)return;
  const stem=material(q.stemHtml);
  stem.classList.add("archived-stem");root.replaceChildren(stem);
  for(const note of new Set((q.notices||[]).map(noticeText)))root.append(elem("p",note,"archive-note"));
  const missingPrompt=window.BankFiles.textOnly&&needsQuestionFigure(q);
  if(missingPrompt)root.append(elem("p","This question uses a figure. You can review its answer and worked solution below.","archive-note"));
  addAttempt(root,missingPrompt?{...q,gradeable:false}:q);hydrate(root);
  window.QuestionExperience?.attach(root,q);
  return {missingPrompt,format:q.format};
}
