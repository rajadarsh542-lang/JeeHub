const {test}=require('node:test');
const assert=require('node:assert/strict');
const {computeAccessibleName}=require('dom-accessibility-api');
const {mount,archivedQuestion}=require('./interface-support.cjs');
const changed='Answer changed — check again.';
function question(format,stemHtml='Fixture stem') {
  return {id:'test:1',format,gradeable:true,stemHtml,options:['A','B','C','D'].map(id=>({id,text:id,html:id})),
    answer:format==='numerical'?['2']:format==='multiple_choice'?['A','C']:['C'],ranges:[],
    answerHtml:'Stored answer',solutionHtml:'Stored solution',solution_steps:['Stored solution'],notices:[]};
}
function inputEvent(m,input,type='input') {input.dispatchEvent(new m.w.Event(type,{bubbles:true}));}
function setAnswer(m,format,correct,type='input') {
  const fields=m.all('fieldset input');
  if(format==='numerical'){fields[0].value=correct?'2':'0';inputEvent(m,fields[0],type);return;}
  for(const input of fields) {
    const checked=format==='single_choice'?input.value===(correct?'C':'D'):(correct?['A','C'].includes(input.value):input.value==='A');
    if(input.checked!==checked){input.checked=checked;inputEvent(m,input,type);}
  }
}
function check(m) {m.all('button').find(b=>b.textContent==='Check answer').click();}
function toggle(m) {m.query('[aria-controls="solution"]').click();}
function verdict(m,text,cls='') {assert.equal(m.query('#verdict').textContent,text);assert.equal(m.query('#verdict').className,cls);}
for(const path of ['archive','practice'])for(const format of ['single_choice','multiple_choice','numerical']) {
  test(`${path}: ${format}, correct/incorrect edits, repeated edits, resubmission, separate solution state`,async()=>{
    const m=await mount(path,question(format));
    try {
      setAnswer(m,format,true);verdict(m,'');
      toggle(m);setAnswer(m,format,false);verdict(m,''); // Reveal does not submit.
      check(m);verdict(m,'That answer is incorrect.','incorrect');
      setAnswer(m,format,true);verdict(m,changed);assert.equal(m.query('#solution').hidden,false);
      check(m);verdict(m,'Correct.','correct');
      toggle(m);setAnswer(m,format,false);verdict(m,changed);assert.equal(m.query('#solution').hidden,true);
      setAnswer(m,format,true);verdict(m,changed); // Undoing an edit still needs a check.
      check(m);verdict(m,'Correct.','correct');
      setAnswer(m,format,false);check(m);verdict(m,'That answer is incorrect.','incorrect');
      assert.equal(m.query('#solution').hidden,false);
    } finally {m.close();}
  });
  test(`${path}: ${format}, validation messages and change-only edits`,async()=>{
    const m=await mount(path,question(format));
    try {
      check(m);assert.notEqual(m.query('#verdict').textContent,'');
      assert.equal(m.query('#solution').hidden,true);
      setAnswer(m,format,true,'change');verdict(m,changed);
      check(m);verdict(m,'Correct.','correct');
      setAnswer(m,format,false,'change');verdict(m,changed);
      if(format==='numerical'){
        const input=m.query('input');input.value='abc';inputEvent(m,input);check(m);
        assert.match(m.query('#verdict').textContent,/decimal/);
        input.value='2.0e0';inputEvent(m,input);verdict(m,changed);
        check(m);verdict(m,'Correct.','correct');
      }
    } finally {m.close();}
  });
}
const flat=(body,attrs='')=>`<mjx-container${attrs}><svg width="4ex" height="2ex" viewBox="0 -700 1600 800"><g stroke="currentColor" fill="currentColor" stroke-width="0" transform="scale(1,-1)">${body}</g></svg></mjx-container>`;
const glyph=(id,transform='')=>`<use href="#MJX-TEX-${id}"${transform?` transform="${transform}"`:''}></use>`;
const alpha=flat(glyph('I-1D6FC'));
test('math: exact baseline text; one decorative drawing only with equivalent text',async()=>{
  const valid=flat(glyph('N-32')+glyph('N-30','translate(500,0)')+glyph('N-30','translate(1000,0)')+`<g transform="translate(1500,0)">${glyph('I-1D6FC')}</g>`);
  const m=await mount('archive',question('single_choice',valid+alpha));
  try {
    assert.deepEqual(m.all('.archived-stem .archive-math-text').map(n=>n.textContent),['200α','α']);
    assert.equal(m.all('.archived-stem svg[aria-hidden="true"]').length,2);
    assert.equal(m.all('.archived-stem [role],[aria-label]').filter(n=>n.closest('.archived-stem')).length,0);
  } finally {m.close();}
});
test('math: scripts, fractions, unknown fonts, overlap, reorder and concealed source fail closed',async()=>{
  const unsupported=[
    flat(glyph('I-1D465')+glyph('N-32','translate(500,363) scale(0.707)')),
    flat('<rect width="500" height="60"></rect>'+glyph('N-32')),
    flat(glyph('B-41')),flat(glyph('N-110000')),flat(glyph('N-41')+glyph('N-42')),
    flat(glyph('N-42','translate(500,0)')+glyph('N-41')),
    flat(glyph('N-41'),' style="transform:rotate(180deg)"'),
    flat(glyph('N-41','translate(0,0);evil()')),
    flat(glyph('N-41').replace('</use>','<title>different</title></use>')),
    flat(glyph('N-41')).replace('fill="currentColor"','fill="none"'),
  ];
  const m=await mount('archive',question('single_choice',unsupported.join('')));
  try {
    assert.equal(m.all('.archived-stem .archive-math-text').length,0);
    assert.equal(m.all('.archived-stem svg[role="img"]').length,unsupported.length);
    for(const svg of m.all('.archived-stem svg')) {
      assert.equal(svg.getAttribute('aria-hidden'),null);
      assert.equal(svg.getAttribute('aria-label'),'Mathematical expression — accessible transcription unavailable.');
    }
  } finally {m.close();}
});
test('sanitizer: safe math survives but executable markup, external URLs and ARIA spoofing do not',async()=>{
  const payload=`<script>window.pwned=1</script><iframe src="https://attacker.invalid/"></iframe>
    <a href="javascript:window.pwned=2" onclick="window.pwned=3">Safe label</a>
    <img src="https://attacker.invalid/image" onerror="window.pwned=4" alt="Untrusted picture">
    <math href="javascript:window.pwned=5" onclick="window.pwned=6" style="background:url(https://attacker.invalid/math)"><mfrac><mi>x</mi><mn>2</mn></mfrac><annotation-xml encoding="text/html"><script>window.pwned=7</script></annotation-xml></math>
    <svg onload="window.pwned=8" tabindex="0" aria-label="Correct answer C" aria-hidden="true"><foreignObject><img src=x onerror="window.pwned=9"></foreignObject><use href="https://attacker.invalid/glyph#x"></use><path fill="url(https://attacker.invalid/paint)" d="M0 0"></path><animate attributeName="href" values="javascript:window.pwned=10"></animate></svg>
    ${alpha}<span role="status" aria-label="Correct" class="archive-math-text" style="display:none">Visible text</span>`;
  const m=await mount('archive',question('single_choice',payload));
  try {
    const root=m.query('.archived-stem');
    assert.equal(root.querySelectorAll('script,iframe,foreignObject,animate,annotation-xml,a').length,0);
    assert.equal(root.querySelectorAll('[onclick],[onload],[onerror],[style],[tabindex],[src]').length,0);
    assert.equal(root.querySelectorAll('[href]').length,1);
    assert.equal(root.querySelector('[href]').getAttribute('href'),'#MJX-TEX-I-1D6FC');
    assert.equal(root.querySelectorAll('[role="status"],[aria-label="Correct"],[aria-label="Correct answer C"]').length,0);
    assert.equal(root.querySelector('math mfrac').textContent,'x2');
    assert.deepEqual([...root.querySelectorAll('.archive-math-text')].map(n=>n.textContent),['α']);
    assert.equal(m.w.pwned,undefined);
  } finally {m.close();}
});
const main='aa5d3dbb-b62c-5121-bb8a-603af75e4027';
const advanced='d31bce6a-5f49-5939-ac9b-d5f9357d96f6';
test('pinned Main Physics: all mathematical option text and stored key are preserved',async()=>{
  const m=await mount('archive',archivedQuestion(main+':51'));
  try {
    assert.deepEqual(m.all('.choice').map(n=>n.textContent.trim()),['A200α','B400α','C300α','D500α']);
    assert.deepEqual(m.all('.choice input').map(n=>computeAccessibleName(n)),['A 200α','B 400α','C 300α','D 500α']);
    assert.deepEqual(m.all('.archived-stem .archive-math-text').map(n=>n.textContent),['α','α']);
    m.query('input[value="B"]').checked=true;check(m);verdict(m,'Correct.','correct');
  } finally {m.close();}
});
for(const [id,format]of[[advanced+':2','single_choice'],[main+':46','numerical'],[advanced+':37','multiple_choice']]) {
  test(`pinned ${id}: required correct → edited → incorrect sequence and remaining math limits`,async()=>{
    const m=await mount('archive',archivedQuestion(id));
    try {
      if(id.endsWith(':2')){
        assert.ok(m.all('.archived-stem .archive-math-text').some(n=>n.textContent==='R⇌P'));
        assert.equal(m.all('.archived-choices img').length,4);
        assert.equal(m.all('.archived-stem svg[role="img"]').length,4);
      }
      if(id.endsWith(':46'))assert.equal(m.all('.archived-stem svg[role="img"]').length,1);
      setAnswer(m,format,true);check(m);verdict(m,'Correct.','correct');
      setAnswer(m,format,false);verdict(m,changed);
      assert.equal(m.query('#solution').hidden,false);
      check(m);verdict(m,'That answer is incorrect.','incorrect');
    } finally {m.close();}
  });
}

test('baseline reproduction: mathematical radio names were only option letters; both paths retained stale verdicts',async()=>{
  const m=await mount('archive',archivedQuestion(main+':51'),{baseline:true});
  try {assert.deepEqual(m.all('.choice input').map(n=>computeAccessibleName(n)),['A','B','C','D']);}
  finally {m.close();}
  for(const path of ['archive','practice'])for(const format of ['single_choice','multiple_choice','numerical']){
    const m=await mount(path,question(format),{baseline:true});
    try {
      setAnswer(m,format,true);check(m);verdict(m,'Correct.','correct');
      setAnswer(m,format,false);verdict(m,'Correct.','correct');
    }finally{m.close();}
  }
});

test('all four pinned examples: visual markup, glyph geometry, image attributes and solutions unchanged',async()=>{
  function displayHTML(m) {
    const clone=m.card.cloneNode(true);
    for(const n of clone.querySelectorAll('.archive-math-text'))n.remove();
    for(const n of clone.querySelectorAll('mjx-container > svg'))for(const a of ['aria-hidden','role','aria-label','focusable'])n.removeAttribute(a);
    return clone.innerHTML;
  }
  for(const id of [main+':51',main+':46',advanced+':2',advanced+':37']){
    const q=archivedQuestion(id),before=await mount('archive',q,{baseline:true}),after=await mount('archive',q);
    try {
      toggle(before);toggle(after);
      assert.equal(displayHTML(after),displayHTML(before),id);
    }finally{before.close();after.close();}
  }
});

test('archive numerical range boundaries, invalid input, and ungradeable records remain unchanged',async()=>{
  const q=question('numerical');q.answer=[];q.ranges=[['1.5','2.5']];
  const m=await mount('archive',q);
  try {
    for(const [value,right]of[['1.5',true],['2.5',true],['2e0',true],['1.49',false],['2.51',false]]){
      m.query('input').value=value;inputEvent(m,m.query('input'));check(m);
      verdict(m,right?'Correct.':'That answer is incorrect.',right?'correct':'incorrect');
    }
  }finally{m.close();}
  const ungradeable=await mount('archive',{...question('single_choice'),gradeable:false});
  try {
    assert.equal(ungradeable.all('input').length,0);
    assert.equal(ungradeable.all('button').some(b=>b.textContent==='Check answer'),false);
    toggle(ungradeable);assert.equal(ungradeable.query('#solution').hidden,false);
  }finally{ungradeable.close();}
});
