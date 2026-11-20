const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {JSDOM}=require('jsdom');

async function setup(config={channelUrl:'',questions:{}}) {
  const dom=new JSDOM('<!doctype html><html><body><a id="channel-link" hidden></a><main id="root"></main></body></html>',{
    url:'https://jee-practice-web.vercel.app/',runScripts:'outside-only',pretendToBeVisual:true,
  });
  const w=dom.window;
  w.fetch=async()=>({ok:true,json:async()=>config});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(readFileSync(resolve(__dirname,'../public/assets/question-experience.js'),'utf8'));
  await w.QuestionExperience.ready;
  return {dom,w,document:w.document,root:w.document.querySelector('#root'),api:w.QuestionExperience,close:()=>w.close()};
}
function reviewed(fields={}) {return {reviewed:true,...fields};}
function actions(m) {
  const controls=m.document.createElement('div'),container=m.document.createElement('div');
  m.root.append(controls,container);
  return {controls,container};
}

test('reviewed hints reveal progressively without opening the full solution',async()=>{
  const m=await setup({questions:{'sample:1':reviewed({hints:['Identify the constant quantity.','Express work using the pressure change.']})}});
  try {
    const {controls,container}=actions(m);
    const solution=m.document.createElement('section');solution.className='solution';solution.hidden=true;m.root.append(solution);
    await m.api.addHints(controls,container,'sample:1');
    const hint=controls.querySelector('button');
    assert.ok(hint);assert.equal(hint.disabled,false);
    assert.equal(container.textContent.includes('Identify the constant quantity.'),false);
    hint.click();
    assert.match(container.textContent,/Identify the constant quantity\./);
    assert.equal(container.textContent.includes('Express work using the pressure change.'),false);
    assert.equal(solution.hidden,true);
    hint.click();
    assert.match(container.textContent,/Express work using the pressure change\./);
    assert.equal(solution.hidden,true);
  }finally{m.close();}
});

test('missing or unreviewed material does not invent hints, takeaways or videos',async()=>{
  const m=await setup({questions:{'sample:1':{reviewed:false,hints:['Unreviewed hint'],takeaway:'Unreviewed summary',video:{url:'https://www.youtube.com/watch?v=AbCdEfGhI12',title:'Unreviewed video'}}}});
  try {
    for(const id of ['sample:1','missing:1']) {
      const {controls,container}=actions(m);
      const solution=m.document.createElement('section');solution.textContent='Existing solution';m.root.append(solution);
      await m.api.addHints(controls,container,id);
      await m.api.decorateSolution(solution,id);
      assert.equal(controls.querySelector('button')?.disabled??true,true);
      assert.equal(container.textContent.includes('Unreviewed hint'),false);
      assert.equal(solution.textContent,'Existing solution');
      assert.equal(solution.querySelector('a'),null);
    }
  }finally{m.close();}
});

test('reviewed solution decoration preserves existing content and adds a timestamped video safely',async()=>{
  const m=await setup({questions:{'sample:1':reviewed({takeaway:'Keep a consistent sign convention.',steps:['Write the equation.','Substitute the known quantities.'],video:{url:'https://www.youtube.com/watch?v=AbCdEfGhI12',title:'Mirror formula',startSeconds:400}})}});
  try {
    const solution=m.document.createElement('section');solution.textContent='Original worked solution';m.root.append(solution);
    await m.api.decorateSolution(solution,'sample:1');
    assert.match(solution.textContent,/Original worked solution/);
    assert.match(solution.textContent,/Keep a consistent sign convention\./);
    assert.ok(solution.querySelector('ol'));
    const link=solution.querySelector('a');assert.ok(link);
    const url=new URL(link.href);
    assert.match(url.hostname,/(^|\.)youtube\.com$/);
    assert.equal(url.searchParams.get('v'),'AbCdEfGhI12');
    assert.match(url.searchParams.get('t')||'',/^400s?$/);
    assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);
    await m.api.decorateSolution(solution,'sample:1');
    assert.equal(solution.querySelectorAll('a').length,1,'repeat attachment must not duplicate a video card');
  }finally{m.close();}
});

test('non-YouTube, executable and lookalike video URLs do not create outbound links',async()=>{
  for(const url of ['javascript:alert(1)','https://youtube.com.evil.example/watch?v=AbCdEfGhI12','https://example.com/watch?v=AbCdEfGhI12','https://www.youtube.com@evil.example/watch?v=AbCdEfGhI12']) {
    const m=await setup({questions:{'sample:1':reviewed({video:{url,title:'<img src=x onerror=alert(1)>',startSeconds:0}})}});
    try {
      const solution=m.document.createElement('section');m.root.append(solution);
      await m.api.decorateSolution(solution,'sample:1');
      assert.equal(solution.querySelector('a'),null,url);
      assert.equal(solution.querySelector('img'),null);
    }finally{m.close();}
  }
});

test('grading feedback identifies selected wrong and correct options and clears on edit',async()=>{
  const m=await setup();
  try {
    const fields=m.document.createElement('fieldset');
    fields.innerHTML='<label class="choice"><input type="radio" value="A" name="answer">A</label><label class="choice"><input type="radio" value="B" name="answer" checked>B</label>';
    m.root.append(fields);
    m.api.markAnswers(fields,['A'],{numerical:false,correct:false});
    assert.equal(fields.querySelector('input[value="A"]').closest('label').classList.contains('answer-correct'),true);
    assert.equal(fields.querySelector('input[value="B"]').closest('label').classList.contains('answer-incorrect'),true);
    m.api.clearAnswerFeedback(fields);
    assert.equal(fields.querySelectorAll('.answer-correct,.answer-incorrect').length,0);
    assert.equal(fields.querySelector('input[value="B"]').checked,true,'feedback reset must preserve the current answer');
  }finally{m.close();}
});

test('figure enlargement preserves answer selection and closes with focus restoration',async()=>{
  const m=await setup();
  try {
    m.root.innerHTML='<fieldset><label class="choice"><input type="radio" name="answer" value="A"><strong>A</strong><div><img src="data:image/png;base64,AA==" alt="Ray diagram"></div></label></fieldset><svg role="img" aria-label="Mathematical expression"><path d="M0 0"></path></svg>';
    await m.api.attach(m.root,{id:'sample:1'});
    const trigger=m.root.querySelector('button');assert.ok(trigger);
    trigger.focus();trigger.click();
    assert.equal(m.root.querySelector('input').checked,false,'zoom must not select the containing answer');
    const dialog=m.document.querySelector('dialog');assert.ok(dialog);assert.equal(dialog.open,true);
    assert.equal(dialog.querySelector('img').alt,'Ray diagram');
    assert.equal(m.root.querySelectorAll('button').length,1,'inline mathematical SVG must not get an image zoom button');
    dialog.querySelector('button').click();
    assert.equal(dialog.open,false);
    assert.equal(m.document.activeElement,trigger);
  }finally{m.close();}
});

test('attempt reports identify the exact question and grading status',async()=>{
  const m=await setup();
  try {
    const seen=[];m.document.addEventListener('question-attempt',e=>seen.push({id:e.detail.id,status:e.detail.status}));
    m.api.reportAttempt('sample:1','correct');m.api.reportAttempt('sample:1','unattempted');
    assert.deepEqual(seen,[{id:'sample:1',status:'correct'},{id:'sample:1',status:'unattempted'}]);
  }finally{m.close();}
});
