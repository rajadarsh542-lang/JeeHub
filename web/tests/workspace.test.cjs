const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {JSDOM}=require('jsdom');

const publicDir=resolve(__dirname,'../public');
const source=name=>readFileSync(resolve(publicDir,'assets',name),'utf8');
const question=(id,subject='Physics',format='single_choice')=>({
  id,subject,exam:'JEE Main',year:2025,chapter:subject==='Physics'?'Mechanics':'Atomic structure',
  topic:subject==='Physics'?'Forces':'Quantum numbers',stem:'Review fixture '+id,format,
  options:format==='numerical'?[]:['A','B','C','D'].map(id=>({id,text:'Choice '+id})),
  answer:format==='numerical'?['2']:['C'],solution_steps:['Reviewed fixture explanation.'],assets:[],
});
const fixtures=[question('fixture-chemistry','Chemistry'),question('fixture-physics'),question('fixture-number','Physics','numerical')];

async function workspace({rows=fixtures,path='/',saved=[]}={}){
  const dom=new JSDOM(readFileSync(resolve(publicDir,'practice.html'),'utf8'),{
    url:'https://practice.example'+path,runScripts:'outside-only',pretendToBeVisual:true,
  });
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  for(const [key,value]of saved)w.localStorage.setItem(key,value);
  w.fetch=async()=>({ok:true,json:async()=>({channelUrl:'',questions:{}})});
  w.BankFiles={textOnly:false,ready:async()=>{},url:path=>'https://bank.example/'+path,json:async path=>{
    if(path==='questions.json')return structuredClone(rows);
    if(path==='catalog/index.json')return {papers:[],counts:{rows:0}};
    if(path==='catalog/search.json')return {rows:[]};
    throw new Error('Unexpected bank read '+path);
  }};
  w.LicensedPractice={index:async()=>[]};
  w.eval(source('question-experience.js'));
  await w.QuestionExperience.ready;
  w.eval(source('practice.js'));
  for(let n=0;n<10&&w.document.getElementById('card').hidden;n++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(w.document.getElementById('card').hidden,false,'fixture question loads through production bootstrap');
  const query=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
  return {w,dom,query,all,close:()=>w.close(),saved:()=>Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)])};
}
function choose(m,selector,value){const control=m.query(selector);control.value=value;control.dispatchEvent(new m.w.Event('change',{bubbles:true}));}
function answer(m,value){const control=m.query('#card input[value="'+value+'"]');control.checked=true;control.dispatchEvent(new m.w.Event('input',{bubbles:true}));}
function submit(m){m.all('#card button').find(x=>x.textContent.trim()==='Check answer').click();}

test('workspace: compact filters stay synchronized, question precedes navigator, subject constrains chapters',async()=>{
  const m=await workspace();
  try{
    assert.equal(m.query('#exams').tagName,'SELECT');
    assert.equal(m.query('#subjects').tagName,'SELECT');
    assert.ok(m.query('#exercise').compareDocumentPosition(m.query('#queue'))&m.w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(m.query('.hero'),null,'large hero no longer precedes question');
    choose(m,'#subjects','Physics');
    assert.equal(new URL(m.w.location.href).searchParams.get('subject'),'Physics');
    assert.equal(m.query('#count').textContent,'2');
    assert.match(m.query('#card').textContent,/Review fixture fixture-physics/);
    const chapters=m.all('#inline-chapter option,#facet-chapter option').map(x=>x.textContent);
    assert.ok(chapters.some(x=>x==='Mechanics'));
    assert.ok(!chapters.includes('Atomic structure'));
    assert.match(m.query('#open-filters').getAttribute('aria-label'),/1/);
    choose(m,'#subjects','Chemistry');
    assert.equal(m.query('#count').textContent,'1');
    assert.equal(m.query('#facet-chapter').value,'');
  }finally{m.close();}
});

test('workspace: submitting and editing updates option colors and navigator without replacing question',async()=>{
  const m=await workspace();
  try{
    const fields=m.query('#card fieldset');
    answer(m,'C');submit(m);
    assert.equal(m.query('#verdict').textContent,'Correct.');
    assert.ok(m.query('#list [aria-current="true"]').classList.contains('status-correct'));
    assert.ok(m.query('#card .answer-correct'));
    answer(m,'D');
    assert.equal(m.query('#card fieldset'),fields,'editing preserves the active question DOM');
    assert.equal(m.query('#verdict').textContent,'Answer changed — check again.');
    assert.equal(m.all('#card .answer-correct,#card .answer-incorrect').length,0);
    assert.ok(!m.query('#list [aria-current="true"]').classList.contains('status-correct'));
    submit(m);
    assert.ok(m.query('#list [aria-current="true"]').classList.contains('status-incorrect'));
    assert.ok(m.query('#card .answer-incorrect'));
    assert.equal(m.query('#solution').hidden,false);
  }finally{m.close();}
});

test('workspace: flags and checked attempt status survive navigation and reload',async()=>{
  let m=await workspace();
  try{
    answer(m,'D');submit(m);
    m.query('.flag-button').click();
    assert.ok(m.query('#list [aria-current="true"]').classList.contains('flagged'));
    const saved=m.saved();
    m.all('#list .q-link')[1].click();
    assert.match(m.query('#card').textContent,/Review fixture fixture-physics/);
    assert.ok(m.all('#list .q-link')[0].classList.contains('status-incorrect'));
    m.close();
    m=await workspace({saved});
    const current=m.query('#list [aria-current="true"]');
    assert.ok(current.classList.contains('status-incorrect'));
    assert.ok(current.classList.contains('flagged'));
    assert.equal(m.query('.flag-button').getAttribute('aria-pressed'),'true');
  }finally{m.close();}
});

test('workspace: editing a revisited question clears saved correctness before resubmission',async()=>{
  const m=await workspace();
  try{
    answer(m,'C');submit(m);
    m.all('#list .q-link')[1].click();
    m.all('#list .q-link')[0].click();
    assert.ok(m.query('#list [aria-current="true"]').classList.contains('status-correct'));
    assert.equal(m.query('#verdict').textContent,'');
    answer(m,'D');
    assert.ok(!m.query('#list [aria-current="true"]').classList.contains('status-correct'));
    assert.equal(m.query('#verdict').textContent,'','fresh selection is not a graded attempt');
    submit(m);
    assert.ok(m.query('#list [aria-current="true"]').classList.contains('status-incorrect'));
  }finally{m.close();}
});

test('workspace: numbered navigator paging reaches the last question and disables its next action',async()=>{
  const m=await workspace({rows:Array.from({length:31},(_,i)=>question('question-'+(i+1)))});
  try{
    assert.equal(m.all('#list .q-link').length,30);
    m.query('#list-next').click();
    assert.equal(m.all('#list .q-link').length,1);
    assert.match(m.query('#card').textContent,/Review fixture question-31/);
    assert.equal(m.query('#list-next').disabled,true);
    assert.ok(m.query('.question-footer'));
    assert.ok(m.all('.question-footer button').some(x=>/Next/.test(x.textContent)&&x.disabled));
    m.query('#list-prev').click();
    assert.equal(m.all('#list .q-link').length,30);
    assert.match(m.query('#card').textContent,/Review fixture question-1/);
  }finally{m.close();}
});
