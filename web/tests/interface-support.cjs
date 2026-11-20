const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {gunzipSync} = require('node:zlib');
const {JSDOM} = require('jsdom');
const {execFileSync} = require('node:child_process');
const publicDir=resolve(__dirname,'../public');
const bankDir=resolve(__dirname,'../../bank');
const source=name=>readFileSync(resolve(publicDir,'assets',name),'utf8');
function archivedQuestion(id) {
  const manifest=JSON.parse(readFileSync(resolve(bankDir,'manifest.json')));
  const [file,offset,size]=manifest.papers[id.split(':')[0]];
  return JSON.parse(gunzipSync(readFileSync(resolve(bankDir,file)).subarray(offset,offset+size))).find(q=>q.id===id);
}
async function mount(path,q,{baseline=false}={}) {
  const script=name=>baseline ? execFileSync('git',['show','d078778fea8f1d2488ad57ba0b6a34db6cf9602e:web/public/assets/'+name],{cwd:bankDir,encoding:'utf8'}) : source(name);
  const dom=new JSDOM(readFileSync(resolve(publicDir,'practice.html'),'utf8'),{
    url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,
  });
  const w=dom.window;
  // Keep the application bootstrap pending; test the unmodified rendering
  // functions with fixture data, without fetching catalogs or invoking services.
  w.BankFiles={ready:()=>new Promise(()=>{}),textOnly:false};
  w.eval(script('practice.js')+'\nwindow.showAttempt=showAttempt;window.normalNumber=normalNumber;');
  w.eval(source('archive-math.js').replace(/export function /g,'function ')+'\nwindow.mathAPI={baselineMathText,exposeArchiveMath};');
  w.fixtureQuestion=q;
  w.eval(script('archive-question.js').replace(/^import .*;\n/gm,'')
    .replace(/export async function /g,'async function ')
    .replace('let glyphJob;',`let glyphJob=Promise.resolve();
      const {baselineMathText,exposeArchiveMath}=window.mathAPI;
      const getQuestion=async()=>window.fixtureQuestion;
      const getAsset=async()=>"data:image/png;base64,";`)
    +'\nwindow.archiveAPI={renderArchivedQuestion};');
  const card=w.document.getElementById('card');card.hidden=false;card.replaceChildren();
  if(path==='archive')await w.archiveAPI.renderArchivedQuestion(card,q.id);
  else w.showAttempt(card,q);
  return {dom,w,card,query:s=>card.querySelector(s),all:s=>[...card.querySelectorAll(s)],close:()=>w.close()};
}
module.exports={mount,archivedQuestion};
