"use strict";
const byId = id => document.getElementById(id);
function make(tag, text, cls) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
const facets = {exam:"Exam",year:"Year",session:"Session",batch:"Exam batch",date:"Exam date",shift:"Shift",paperNumber:"Paper number",subject:"Subject",chapter:"Chapter",topic:"Topic"};
const academicKeys=["session","batch","date","shift","paperNumber"];
const plurals={batch:"exam batches",paperNumber:"papers",date:"dates",chapter:"chapters",topic:"topics",subject:"subjects",exam:"exams",year:"years",session:"sessions",shift:"shifts"};
const optionLabels={batch:new Map(),session:new Map(),shift:new Map()};
const mirrorSelects=new Map(), optionSignatures=new WeakMap();
const taxonomies={subject:new Map(),chapter:new Map(),topic:new Map()};
const normalizeTag=value=>String(value??"").trim().replace(/\s+/g," ").toLowerCase();
function facetValue(row,key){return row.filterTags?.[key] ?? String(row[key]??"");}
const collator=new Intl.Collator("en-IN",{numeric:true,sensitivity:"base"});
const examDateFormat=new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
const selects = new Map();
let bank = [], shown = [], archiveRows = [], archivePapers = [], referencePapers = [];
let currentId = "", activeRecord = null, renderVersion = 0;
const recordById = new Map(), shards = new Map();
const pageSize = 30, prettyNumber = n=>Number(n).toLocaleString("en-IN");

function labelValue(raw) {
  if(raw==null) return "";
  const text=String(raw).trim().replace(/[-_]+/g," ");
  return text.charAt(0).toUpperCase()+text.slice(1);
}
function statusWarning(message) {
  const el=byId("catalog-status");
  el.hidden=false;
  el.textContent=[el.textContent,message].filter(Boolean).join(" ");
}
const bankJson=path=>window.BankFiles.json(path);
async function fetchArchive() {
  const [index,search]=await Promise.all([bankJson("catalog/index.json"),bankJson("catalog/search.json")]);
  archivePapers=index.papers;
  referencePapers=(index.supplementalPapers||[]).map(p=>{
    const batch=p.batchId||p.exam.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"/"+p.year+"/annual";
    return {...p,archive:true,session:p.session||"",batchId:batch,batch,batchLabel:p.batchLabel||"Annual exam",
      shift:String(p.shiftNumber||p.shift||""),paperNumber:p.paperNumber||""};
  });
  for(const p of [...archivePapers,...referencePapers]){
    if(p.batchId)optionLabels.batch.set(String(p.batchId),[p.exam,p.year,p.batchLabel||p.title].filter(Boolean).join(" · "));
    if(p.session)optionLabels.session.set(String(p.session),"Session "+p.session);
    const shift=String(p.shiftNumber || p.shift || "");
    if(shift)optionLabels.shift.set(shift,shift==="1"?"Shift 1 · Morning":shift==="2"?"Shift 2 · Afternoon/evening":labelValue(p.shift));
  }
  archiveRows=search.rows.map(([paperIndex,n,id,subject,chapter,topic,type])=>{
    const paper=archivePapers[paperIndex];
    return {id,n,paperIndex,archive:true,subject:labelValue(subject),chapter:labelValue(chapter),topic:labelValue(topic),
      exam:paper.exam,year:paper.year,date:paper.date||"",session:paper.session||"",batch:paper.batchId||"",
      shift:String(paper.shiftNumber||paper.shift||""),paperNumber:paper.paperNumber||"",type,stem:paperName(paper)+" · Q"+n};
  });
  if(archiveRows.length!==index.counts.rows)throw new Error("Incomplete index");
  return archiveRows;
}
function searchText(q) {
  return [q.id,q.exam,q.year,q.date,optionLabels.session.get(String(q.session)),optionLabels.batch.get(String(q.batch)),optionLabels.shift.get(String(q.shift)),q.shift,q.paperNumber?"Paper "+q.paperNumber:"",q.subject,q.chapter,q.topic,q.stem,q.archive?"Q"+q.n:"",q.archive?archivePapers[q.paperIndex].title:""].filter(Boolean).join(" ").toLowerCase().replace(/[-_]+/g," ");
}
function collectionMatches(q,group){
  if(group==="papers")return Boolean(q.archive)&&archivePapers[q.paperIndex]?.collection==="live";
  if(group==="archive")return Boolean(q.archive);
  if(group==="practice")return !q.archive;
  return true;
}
function installBank(groups) {
  bank=groups.flat();
  recordById.clear();
  for(const names of Object.values(taxonomies))names.clear();
  for(const q of bank){
    q.filterTags={};
    for(const [key,names] of Object.entries(taxonomies)){
      const raw=String(q[key]??"").trim(),tag=normalizeTag(raw);
      if(!names.has(tag))names.set(tag,raw);
      q.filterTags[key]=names.get(tag);
    }
    q.searchText=searchText(q);recordById.set(q.id,q);
  }
  byId("fields").replaceChildren();selects.clear();byId("subjects").replaceChildren();
  buildFilters();buildExamNav();buildSubjectNav();
}
function paperName(paper){return String(paper.title || paper.exam || "").replace(/\s*\(fork\)\s*$/i,"");}
function recordTitle(q){return q.topic || q.chapter || (q.archive?"Question "+q.n:q.subject) || "Question";}
function recordPreview(q){return q.stem || "";}
function loadPaper(q){
  const paper=archivePapers[q.paperIndex];
  if(!shards.has(paper.id)){
    shards.set(paper.id,bankJson(paper.shard.replace(/^\//,"")).then(data=>new Map(data.rows.map(row=>[row.id,row]))).catch(error=>{shards.delete(paper.id);throw error;}));
    if(shards.size>8)shards.delete(shards.keys().next().value);
  }
  return shards.get(paper.id);
}
const subjectIcons = {Physics:"atom", Chemistry:"flask", Mathematics:"triangle"};
const svgNamespace = "http://www.w3.org/2000/svg";
function icon(name) {
  const svg = document.createElementNS(svgNamespace,"svg");
  svg.setAttribute("class","icon");
  svg.setAttribute("aria-hidden","true");
  const use = document.createElementNS(svgNamespace,"use");
  use.setAttribute("href","#i-"+name);
  svg.append(use);
  return svg;
}
function button(label, cls, handler) {
  const control = make("button", label, cls);
  control.type = "button";
  control.onclick = handler;
  return control;
}
function mobileView() { return matchMedia("(max-width:740px)").matches; }
function focusExercise() {
  if (mobileView()) {
    byId("browse").open = false;
    byId("exercise").focus({preventScroll:true});
    byId("exercise").scrollIntoView({block:"start"});
  }
}
const primaryExams = ["JEE Main","JEE Advanced"];
function buildExamNav(){ byId("exams").onchange=()=>chooseExam(byId("exams").value); }
function buildSubjectNav() { byId("subjects").onchange=()=>changeFacet("subject",byId("subjects").value); }
function showFilterCount() {
  const count=[...selects.values()].filter(select=>select.value).length
    + Number(byId("collection").value!=="all") + Number(Boolean(byId("bank-search").value.trim()));
  byId("filter-count").textContent="("+count+")";byId("filter-count").hidden=!count;
  for(const id of ["open-filters","mobile-filters"])byId(id)?.setAttribute("aria-label",count?"Filters, "+count+" active":"Filters");
}
const progressKey="jee-practice-progress-v1";
let progress={};
try {
  const saved=JSON.parse(localStorage.getItem(progressKey)||"{}");
  if(saved && typeof saved==="object" && !Array.isArray(saved)) {
    for(const [id,value] of Object.entries(saved).slice(-5000)) {
      if(value && typeof value==="object")progress[id]={status:["correct","incorrect"].includes(value.status)?value.status:"unattempted",flagged:value.flagged===true};
    }
  }
} catch { /* Practice still works when storage is unavailable. */ }
function saveProgress(id,patch) {
  progress[id]={status:"unattempted",flagged:false,...progress[id],...patch};
  const entries=Object.entries(progress);if(entries.length>5000)progress=Object.fromEntries(entries.slice(-5000));
  try {localStorage.setItem(progressKey,JSON.stringify(progress));} catch {}
  refreshProgress();
}
function refreshProgress() {
  for(const row of byId("list").querySelectorAll("[data-question-id]")) {
    const state=progress[row.dataset.questionId]||{},current=row.getAttribute("aria-current")==="true";
    row.classList.toggle("status-correct",state.status==="correct");
    row.classList.toggle("status-incorrect",state.status==="incorrect");
    row.classList.toggle("flagged",Boolean(state.flagged));row.classList.toggle("current",current);
    const status=state.status==="correct"?"Correct":state.status==="incorrect"?"Incorrect":"Unattempted";
    row.setAttribute("aria-label",row.dataset.questionLabel+". "+status+(state.flagged?". Flagged":"")+(current?". Current question":""));
    row.title=row.getAttribute("aria-label");
    let marker=row.querySelector(".status-marker");
    if(!marker){marker=make("span",null,"status-marker");marker.setAttribute("aria-hidden","true");row.append(marker);}
    marker.textContent=state.flagged?"⚑":state.status==="correct"?"✓":state.status==="incorrect"?"×":"";
  }
  const flag=byId("flag-question");
  if(flag&&activeRecord){const marked=!!progress[activeRecord.id]?.flagged;flag.setAttribute("aria-pressed",String(marked));flag.textContent=marked?"Flagged":"Flag question";}
  const summary=byId("progress-summary");
  if(summary){const answered=shown.filter(q=>["correct","incorrect"].includes(progress[q.id]?.status)).length;summary.textContent=prettyNumber(answered)+" answered · saved on this device";}
}
document.addEventListener("question-attempt",event=>{
  const {id,status}=event.detail||{};
  if(typeof id==="string" && ["correct","incorrect","unattempted"].includes(status))saveProgress(id,{status});
});
function questionType(q){
  const type=String(q.format||q.type||"").toLowerCase();
  if(/numer|integer/.test(type))return "Numerical";
  if(/multiple|multi|more/.test(type))return "Multiple choice";
  return type?"Single choice":"Practice";
}
function addQuestionFooter(card,q,index){
  const footer=make("div",null,"question-footer");
  const prev=button("Previous","secondary",()=>{if(shown[index-1]){go(shown[index-1].id);focusExercise();}});
  prev.disabled=!shown[index-1];prev.setAttribute("aria-label","Previous question");
  const flag=button("Flag question","secondary flag-button",()=>saveProgress(q.id,{flagged:!progress[q.id]?.flagged}));flag.id="flag-question";
  const next=button("Skip / Next","secondary",()=>{if(shown[index+1]){go(shown[index+1].id);focusExercise();}});
  next.disabled=!shown[index+1];next.setAttribute("aria-label","Next question");
  footer.append(prev,flag,next);card.append(footer);refreshProgress();
}
const pageId = () => {
  try {return decodeURIComponent(location.pathname.split("/")[2] || "");}
  catch {return location.pathname.split("/")[2];}
};
function sameTopic(q, candidates) {
  if(!q.topic)return [q];
  return candidates.filter(item=>item.topic===q.topic && item.subject===q.subject && Boolean(item.archive)===Boolean(q.archive) && Boolean(item.licensedArchive)===Boolean(q.licensedArchive));
}
function nextPeer(q, peers) {
  return peers[(peers.findIndex(item=>item.id===q.id)+1)%peers.length];
}
function readRoute() {
  currentId = pageId();
  if (new URLSearchParams(location.search).get("next") !== "1") return;
  const source = recordById.get(currentId);
  if (source) currentId = nextPeer(source,sameTopic(source,bank)).id;
}
function currentFilters(){
  return {facets:Object.fromEntries([...selects].map(([k,v])=>[k,v.value])),search:byId("bank-search").value,collection:byId("collection").value};
}
function readFilterState(saved){
  const query=new URLSearchParams(location.search), state={facets:{},search:"",collection:"all"};
  const hasFilterQuery=[...Object.keys(facets),"collection","q"].some(key=>query.has(key));
  if(!hasFilterQuery && saved?.facets)return saved;
  for(const key of Object.keys(facets))state.facets[key]=query.get(key)||"";
  state.search=query.get("q")||"";state.collection=query.get("collection")||"all";
  return state;
}
function restoreFilters(saved){
  const state=readFilterState(saved);
  const legacyCollections=["jeehub","paper-library"];
  const collection=legacyCollections.includes(state.collection)?"papers":state.collection;
  const url=new URL(location.href);
  if(legacyCollections.includes(url.searchParams.get("collection"))){
    url.searchParams.set("collection","papers");
    history.replaceState(history.state,"",url.pathname+url.search+url.hash);
  }
  byId("collection").value=["archive","practice","papers"].includes(collection)?collection:"all";
  byId("bank-search").value=state.search||"";
  refreshFacets(state.facets);
}
function go(id,{replace=false}={}) {
  const state=currentFilters(), query=new URLSearchParams();
  for(const [key,value] of Object.entries(state.facets))if(value)query.set(key,value);
  if(state.collection!=="all")query.set("collection",state.collection);
  if(state.search.trim())query.set("q",state.search.trim());
  const url=(id?"/practice/"+encodeURIComponent(id):"/")+(query.size?"?"+query:"");
  if(location.pathname+location.search!==url){
    if(replace)history.replaceState(state,"",url);else history.pushState(state,"",url);
  }else history.replaceState(state,"",url);
  currentId=id;render();
}
function setNotice(text) {
  byId("notice").textContent = text;
  byId("notice").hidden = false;
  byId("card").hidden = true;
}
function resetFilters() {
  byId("collection").value="all";byId("bank-search").value="";
  refreshFacets({});
}
function facetLabel(key,value){
  if(optionLabels[key]?.has(value))return optionLabels[key].get(value);
  if(key==="date"&&/^\d{4}-\d{2}-\d{2}$/.test(value))return examDateFormat.format(new Date(value+"T00:00:00Z"));
  if(key==="paperNumber")return "Paper "+value;
  return value;
}
function fillSelect(control,options,value,prompt,key){
  const signature=prompt+"|"+options.join("\x1f");
  if(optionSignatures.get(control)!==signature){
    const frag=document.createDocumentFragment();frag.append(new Option(prompt,""));
    for(const option of options)frag.append(new Option(facetLabel(key,option),option));
    control.replaceChildren(frag);optionSignatures.set(control,signature);
  }
  control.value=value;
  control.disabled=!options.length;
}
function updateSelect(key,rows,desired,prompt=""){
  const distinct=new Set();
  for(const row of rows){const value=facetValue(row,key);if(value)distinct.add(value);}
  const options=[...distinct].sort((a,b)=>{
    if(key==="year" || key==="date")return b.localeCompare(a);
    if(key==="batch")return collator.compare(facetLabel(key,a),facetLabel(key,b));
    return collator.compare(a,b);
  });
  const raw=String(desired??""), requested=taxonomies[key]?.get(normalizeTag(raw))??raw;
  const selected=distinct.has(requested)?requested:"";
  const label=prompt||(options.length?"All "+plurals[key]:"No recorded "+facets[key].toLowerCase());
  fillSelect(selects.get(key),options,selected,label,key);
  if(mirrorSelects.has(key))fillSelect(mirrorSelects.get(key),options,selected,label,key);
  return selected;
}
function refreshFacets(desired,changed){
  const values=desired||currentFilters().facets,group=byId("collection").value;
  let allowed=bank.filter(q=>collectionMatches(q,group));
  if(group==="all"||group==="archive")allowed=allowed.concat(referencePapers);
  for(const key of ["exam","year"]){
    const value=updateSelect(key,allowed,values[key]);if(value)allowed=allowed.filter(row=>facetValue(row,key)===value);
  }
  // Calendar fields describe the same sitting. Each menu excludes its own restriction,
  // so a date limits batches just as a batch limits dates, shifts and paper numbers.
  const complete=allowed,accepted=new Map(),priority=academicKeys.filter(k=>values[k]);
  if(priority.includes(changed)){priority.splice(priority.indexOf(changed),1);priority.unshift(changed);}
  for(const key of priority){
    const value=String(values[key]),candidate=allowed.filter(row=>facetValue(row,key)===value);
    if(candidate.length){accepted.set(key,value);allowed=candidate;}
  }
  for(const key of academicKeys){
    const other=[...accepted].filter(([k])=>k!==key);
    const choices=accepted.has(key)?complete.filter(row=>other.every(([k,v])=>facetValue(row,k)===v)):allowed;
    updateSelect(key,choices,accepted.get(key));
  }
  const subject=updateSelect("subject",allowed,values.subject);
  const subjectRows=subject?allowed.filter(row=>facetValue(row,"subject")===subject):[];
  const chapter=updateSelect("chapter",subjectRows,values.chapter,subject?"":"Select subject first");
  const topicRows=chapter?subjectRows.filter(row=>facetValue(row,"chapter")===chapter):subjectRows;
  updateSelect("topic",topicRows,values.topic,subject?"":"Select subject first");
}
function chooseExam(exam){
  const group=byId("collection").value;
  // Keep a chosen source where it contains the exam. Public practice has no official sittings.
  if(group==="practice" || (exam && !bank.some(q=>q.exam===exam&&collectionMatches(q,group))))byId("collection").value="all";
  byId("bank-search").value="";
  refreshFacets({exam});go("");
}
function changeFacet(key,value){
  const requested=currentFilters().facets;requested[key]=value;
  if(key==="subject"){requested.chapter="";requested.topic="";}
  if(key==="chapter")requested.topic="";
  refreshFacets(requested,key);go("");
}
function buildFilters() {
  const learning=byId("learning-fields");learning?.replaceChildren();mirrorSelects.clear();
  for(const [key,name] of Object.entries(facets)){
    if(["exam","subject"].includes(key)) {
      selects.set(key,byId(key==="exam"?"exams":"subjects"));continue;
    }
    const primary=make("select"),label=make("label",name);
    primary.id="facet-"+key;primary.onchange=()=>changeFacet(key,primary.value);
    selects.set(key,primary);label.append(primary);
    (learning&&["chapter","topic"].includes(key)?learning:byId("fields")).append(label);
  }
}
function bankLink(logicalPath,label){
  if(!logicalPath)return null;
  try{
    const a=make("a",label);a.href=window.BankFiles.url(logicalPath);a.target="_blank";a.rel="noopener noreferrer";return a;
  }catch{return null;}
}
function render() {
  const version=++renderVersion;
  const activeFacets=[...selects].filter(([,select])=>select.value).map(([key,select])=>[key,select.value]);
  const typed=byId("bank-search").value.trim(), uniqueId=recordById.get(typed)||recordById.get(typed.toLowerCase());
  const terms=typed.toLowerCase().replace(/[-_]+/g," ").trim().split(/\s+/).filter(Boolean);
  const group=byId("collection").value;
  const candidates=uniqueId?[uniqueId]:bank;
  shown=candidates.filter(q=>collectionMatches(q,group)&&activeFacets.every(([key,value])=>facetValue(q,key)===value)&&
    terms.every(term=>q.searchText.includes(term)));
  if(selects.get("exam").value && group==="all" && !uniqueId){
    // An exam selection starts with a sitting from the exam. Undated practice remains in the same results.
    shown=shown.filter(row=>row.archive).concat(shown.filter(row=>!row.archive));
  }
  showFilterCount();
  byId("count").textContent = prettyNumber(shown.length);
  byId("count").setAttribute("aria-label",shown.length+" matching questions");
  const list = byId("list");
  const q = currentId ? shown.find(item=>item.id===currentId) : shown[0];
  activeRecord=q||null;
  const index = q ? shown.indexOf(q) : 0;
  const first=Math.floor(index/pageSize)*pageSize, end=Math.min(first+pageSize,shown.length);
  byId("list-pager").hidden=shown.length<=pageSize;
  byId("list-range").textContent=prettyNumber(shown.length?first+1:0)+"–"+prettyNumber(end)+" of "+prettyNumber(shown.length);
  byId("list-prev").disabled=first===0;byId("list-next").disabled=end===shown.length;
  byId("list-prev").onclick=()=>go(shown[Math.max(0,first-pageSize)].id);
  byId("list-next").onclick=()=>{if(end<shown.length)go(shown[end].id);};

  list.replaceChildren();
  shown.slice(first,end).forEach((item,offset)=>{
    const i=first+offset;
    const row = button(null,"q-link",()=>{
      go(item.id);
      focusExercise();
    });
    row.setAttribute("aria-current",String(item.id===q?.id));
    row.dataset.questionId=item.id;row.dataset.questionLabel="Question "+(i+1)+": "+recordTitle(item);
    const num = make("span",String(i+1).padStart(2,"0"),"row-num");
    num.setAttribute("aria-hidden","true");
    const copy = make("span",undefined,"row-copy");
    copy.append(make("span",recordTitle(item),"row-title"),make("span",recordPreview(item),"row-stem"));
    row.append(num,copy);
    list.append(row);
  });
  refreshProgress();
  const activeRow = list.querySelector('[aria-current="true"]');
  if (activeRow && byId("browse").open) {
    const rowBounds = activeRow.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (rowBounds.bottom > listBounds.bottom) list.scrollTop += rowBounds.bottom-listBounds.bottom+4;
    else if (rowBounds.top < listBounds.top) list.scrollTop -= listBounds.top-rowBounds.top+4;
  }
  if (!q) {
    setNotice(currentId ? "This question is unavailable. Choose another from the question list." : "No questions match these filters.");
    const academic=activeFacets.filter(([key])=>!["subject","chapter","topic"].includes(key));
    const pdfs=(group==="all"||group==="archive") && !typed && !currentId && academic.length
      ? referencePapers.filter(p=>academic.every(([k,v])=>String(p[k]??"")===v)) : [];
    if(pdfs.length){
      const notice=byId("notice");
      notice.textContent=window.BankFiles.textOnly
        ? "This sitting has a PDF only. The PDF is unavailable in this edition."
        : "This sitting is available as an official paper. It has no individually indexed questions here.";
      const links=make("div",null,"archive-links");
      for(const p of window.BankFiles.textOnly?[]:pdfs){const link=bankLink(p.pdfPath,p.title+" · Official PDF");if(link)links.append(link);}
      notice.append(links);
    }
    const recover = button("Reset filters","text-button",()=>{resetFilters();go("");});
    byId("notice").append(make("br"),recover);
    return;
  }
  byId("notice").hidden = true;
  const card = byId("card");
  card.hidden = false;
  const top = make("div",undefined,"card-top");
  const category = make("div",undefined,"category");
  const badge = make("span",undefined,"subject-badge");
  badge.dataset.subject=q.subject;
  badge.append(icon(subjectIcons[q.subject] || "layers"),q.subject);
  category.append(badge);
  if(q.exam) category.append(make("span",[q.exam,q.year].filter(Boolean).join(" · "),"meta-pill"));
  if(q.chapter) category.append(make("span",q.chapter,"meta-pill chapter-pill"));
  category.append(make("span",questionType(q),"meta-pill type-pill"));
  const pager=make("div",null,"pager");
  const position=make("span",prettyNumber(index+1)+" / "+prettyNumber(shown.length),"page-index");
  position.setAttribute("aria-label","Question "+(index+1)+" of "+shown.length);pager.append(position);
  top.append(category,pager);
  const heading=make("h2",recordTitle(q));
  card.replaceChildren(top,heading);
  if(q.archive){showArchiveCard(card,q,version);addQuestionFooter(card,q,index);return;}
  if(q.licensedArchive){
    const loading=make("p","Loading question…","archive-help");card.append(loading);
    window.LicensedPractice.load(q).then(full=>{
      if(version!==renderVersion)return;
      loading.remove();card.append(make("p",full.stem,"stem"));
      window.LicensedPractice.renderAttempt(card,full,showAttempt);
      window.LicensedPractice.typeset(card);
      card.querySelector(".type-pill").textContent=questionType(full);
      window.QuestionExperience?.attach(card,full);addQuestionFooter(card,q,index);
    }).catch(()=>{if(version===renderVersion)loading.textContent="This practice question could not be loaded. Reload to try again.";});
    return;
  }
  card.append(make("p",q.stem,"stem"));
  for(const asset of q.assets||[]){
    if(!asset.path)continue;
    if(window.BankFiles.textOnly){card.append(make("p","Figure unavailable in this edition.","archive-note"));continue;}
    const figure=make("figure"),img=make("img");
    img.src=window.BankFiles.url(asset.path);img.alt=asset.alt||"Question figure";figure.append(img);card.append(figure);
  }
  showAttempt(card,q);
  window.QuestionExperience?.attach(card,q);addQuestionFooter(card,q,index);
}
function normalNumber(value) {
  const s = String(value).trim().replace(/^−/,"-");
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m || !(m[2] || m[3])) return null;
  const fraction = m[3] || "";
  const digits = (m[2]+fraction).replace(/^0+/,"");
  if (!digits) return "0";
  const significant = digits.replace(/0+$/,"");
  const exp = BigInt(m[4] || "0") - BigInt(fraction.length) + BigInt(digits.length - significant.length);
  return (m[1]==="-" ? "-" : "") + significant + "e" + exp;
}
function showAttempt(card,q) {
  const numerical = q.format==="numerical", multi = q.format==="multiple_choice";
  const fields = make("fieldset");
  fields.append(make("legend",numerical ? "Enter your numerical answer" : multi ? "Select all correct options" : "Select one option"));
  let numericInput;
  if (numerical) {
    numericInput = make("input");
    numericInput.type="text"; numericInput.inputMode="decimal"; numericInput.maxLength=100;
    numericInput.setAttribute("aria-label","Numerical answer"); fields.append(numericInput);
  } else {
    const choices=make("div",undefined,"choices");
    fields.append(choices);
    for (const opt of q.options) {
    const label=make("label",undefined,"choice");
    const input=make("input");
    input.type=multi ? "checkbox" : "radio"; input.name="choice"; input.value=opt.id;
    label.append(input,make("strong",opt.id),make("span",opt.text)); choices.append(label);
    }
  }
  const actions=make("div",undefined,"actions");
  const submit=make("button","Check answer","primary"), reveal=make("button","Show solution","secondary");
  submit.type=reveal.type="button";
  submit.prepend(icon("check"));
  reveal.prepend(icon("book"));
  const verdict=make("p"); verdict.id="verdict"; verdict.setAttribute("role","status");
  function invalidateAttempt() {
    window.QuestionExperience?.clearAnswerFeedback(fields);
    window.QuestionExperience?.reportAttempt(q.id,"unattempted");
    if (!verdict.textContent) return;
    verdict.className=""; verdict.textContent="Answer changed — check again.";
  }
  fields.addEventListener("input",invalidateAttempt);
  fields.addEventListener("change",invalidateAttempt);
  const solution=make("section",undefined,"solution"); solution.hidden=true; solution.id="solution";
  reveal.setAttribute("aria-controls","solution"); reveal.setAttribute("aria-expanded","false");
  const labels=q.answer.map(a=> {
    const option=q.options.find(o=>o.id===a);
    return option ? a+" · "+option.text : a;
  });
  solution.append(make("h3","Worked solution"),make("p","Answer: "+labels.join(numerical ? " or " : ", ")));
  const ol=make("ol"); for (const step of q.solution_steps) ol.append(make("li",step)); solution.append(ol);
  window.QuestionExperience?.decorateSolution(solution,q.id);
  function openSolution() {
    solution.hidden=false; reveal.replaceChildren(icon("book"),"Hide solution"); reveal.setAttribute("aria-expanded","true");
  }
  reveal.onclick=()=>{if (solution.hidden) openSolution(); else {solution.hidden=true;reveal.replaceChildren(icon("book"),"Show solution");reveal.setAttribute("aria-expanded","false");}};
  submit.onclick=()=>{
    const values=numerical ? [numericInput.value.trim()].filter(Boolean) : [...fields.querySelectorAll("input:checked")].map(i=>i.value);
    if (!values.length) {verdict.className="";verdict.textContent=numerical ? "Enter a number first." : "Choose an option first.";return;}
    if (numerical && normalNumber(values[0])===null) {verdict.className="";verdict.textContent="Enter a decimal number. Scientific notation is also accepted.";return;}
    const right=numerical ? q.answer.some(a=>normalNumber(a)===normalNumber(values[0])) : values.length===q.answer.length && values.every(v=>q.answer.includes(v));
    window.QuestionExperience?.markAnswers(fields,q.answer,{numerical,correct:right});
    window.QuestionExperience?.reportAttempt(q.id,right?"correct":"incorrect");
    verdict.className=right ? "correct" : "incorrect"; verdict.textContent=right ? "Correct." : "That answer is incorrect."; openSolution();
  };
  const hintHost=make("div",null,"hint-host");
  actions.append(submit);window.QuestionExperience?.addHints(actions,hintHost,q.id);actions.append(reveal);
  card.append(fields,actions,hintHost,verdict,solution);

}
byId("jump-list").onclick=()=>{
  const browse=byId("browse");
  browse.open=true;
  browse.querySelector("summary").focus({preventScroll:true});
  byId("queue").scrollIntoView({block:"nearest"});
};
const filterDialog=byId("filter-dialog");
for (const id of ["open-filters","mobile-filters"]) byId(id).onclick=()=>filterDialog.showModal();
for (const id of ["close-filters","apply-filters"]) byId(id).onclick=()=>filterDialog.close();
filterDialog.onclick=e=>{
  if(e.target!==filterDialog) return;
  const rect=filterDialog.getBoundingClientRect();
  if(e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom) filterDialog.close();
};
byId("clear").onclick=()=>{resetFilters();go("");};
byId("collection").onchange=()=>{refreshFacets();go("");};
let searchTimer;
byId("bank-search").oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>go("",{replace:Boolean(new URLSearchParams(location.search).get("q"))}),140);};
addEventListener("popstate",event=>{clearTimeout(searchTimer);restoreFilters(event.state);readRoute();render();});

function loadingQuestion(){
  const line=make("p","Loading question…","question-loading");
  line.setAttribute("role","status");
  return line;
}
function showQuestionError(host,retry){
  const group=make("div",null,"question-error");
  group.append(make("p","This question could not be loaded."),button("Try again","secondary",retry));
  host.replaceChildren(group);
}
async function showArchiveCard(card,q,version){
  const paper=archivePapers[q.paperIndex],wrap=make("section");wrap.id="archive-detail";
  const header=make("header",null,"archive-question-head"),questionNumber=make("span",null,"question-num");
  header.append(make("span",paperName(paper),"paper-label"),questionNumber);
  const mount=make("section",null,"question-reader");mount.id="source-question";mount.setAttribute("aria-label","Question and solution");
  const details=make("details",null,"credit archive-details"),summary=make("summary"),body=make("div",null,"credit-body");
  summary.append(make("span","Paper details"),icon("right"));details.append(summary,body);
  wrap.append(header,mount,details);card.append(wrap);
  const date=paper.date?facetLabel("date",String(paper.date)):paper.year;
  body.append(make("p",[paper.exam,date,paper.shiftLabel,paper.paperNumber?"Paper "+paper.paperNumber:""].filter(Boolean).join(" · ")));
  async function load(){
    mount.replaceChildren(loadingQuestion());
    try{
      const {renderArchivedQuestion,findTextQuestion}=await import("/assets/archive-question.js");
      if(version!==renderVersion||!wrap.isConnected)return;
      const state=await renderArchivedQuestion(mount,q.id);
      if(version===renderVersion&&state?.format)card.querySelector(".type-pill").textContent=questionType({format:state.format});
      if(state?.missingPrompt&&version===renderVersion){
        const peers=shown.filter(row=>row.archive&&row.paperIndex===q.paperIndex);
        const index=peers.findIndex(row=>row.id===q.id);
        const ordered=peers.slice(index+1).concat(peers.slice(0,index)).map(row=>row.id);
        const nextId=await findTextQuestion(ordered);
        if(nextId&&version===renderVersion&&mount.isConnected)mount.append(button("Try a text question from this paper","text-button",()=>go(nextId)));
      }
    }catch{if(version===renderVersion&&mount.isConnected)showQuestionError(mount,load);}
  }
  // Individual question content and the optional catalogue detail are independent.
  loadPaper(q).then(rows=>{
    if(version!==renderVersion||!wrap.isConnected)return;
    const record=rows.get(q.id);
    questionNumber.textContent=record?.paperQuestionNumber?"Question "+record.paperQuestionNumber:"Item "+q.n;
    body.append(make("p",[record?.section||q.subject,questionNumber.textContent].filter(Boolean).join(" · ")));
  }).catch(()=>{if(version===renderVersion)questionNumber.textContent="Item "+q.n;});
  await load();
}
async function start() {
  await window.BankFiles.ready();
  const notices=byId("bank-notices");notices.href=window.BankFiles.url("NOTICES.txt");notices.hidden=false;
  const tasks=await Promise.allSettled([bankJson("questions.json"),window.LicensedPractice.index(),fetchArchive()]);
  if(tasks[2].status==="rejected"){archiveRows=[];archivePapers=[];referencePapers=[];}
  const labels=["Practice questions","Practice sets","Exam papers"];
  const groups=tasks.map((task,i)=>{if(task.status==="fulfilled")return task.value;statusWarning(labels[i]+" could not be loaded. Reload to try again.");return [];});
  if(!groups.some(rows=>rows.length)){setNotice("The question bank could not be loaded. Reload to try again.");return;}
  installBank(groups);restoreFilters(history.state);readRoute();byId("browse").open=!mobileView();
  render();
}
start().catch(()=>{
  setNotice("The question bank could not be loaded.");
  byId("notice").append(make("br"),button("Try again","secondary",()=>location.reload()));
});
