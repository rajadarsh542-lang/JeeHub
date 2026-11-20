/* Local-only browser review. Never shipped under public/ or enabled in production.
 * Mirrors the exact pinned bank locally and can serve baseline assets for A/B.
 */
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {resolve,extname,sep}=require('node:path');
const {execFileSync}=require('node:child_process');
const root=resolve(__dirname,'../..'),publicDir=resolve(root,'web/public'),bankDir=resolve(root,'bank');
const pin='b3a96e2a8d74eb8d6fbc8cf24fde5641790f0cd9';
const prefix=`https://raw.githubusercontent.com/rajadarsh542-lang/JeeHub/${pin}/bank/`;
const baseline=process.env.REVIEW_BASELINE==='1';
const base='d078778fea8f1d2488ad57ba0b6a34db6cf9602e';
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const ids=['aa5d3dbb-b62c-5121-bb8a-603af75e4027:51','aa5d3dbb-b62c-5121-bb8a-603af75e4027:46','d31bce6a-5f49-5939-ac9b-d5f9357d96f6:2','d31bce6a-5f49-5939-ac9b-d5f9357d96f6:37'];
createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/__review'){
      const id=ids.includes(url.searchParams.get('id'))?url.searchParams.get('id'):ids[0];
      const mobile=url.searchParams.get('view')!=='desktop',width=mobile?390:1363,height=mobile?844:936;
      res.setHeader('Content-Type','text/html');
      return res.end(`<!doctype html><title>Part 5 local ${baseline?'baseline':'candidate'} review</title>
        <style>body{font:14px sans-serif;margin:8px}iframe{border:1px solid #ddd;display:block}</style>
        <p>Local ${baseline?'baseline':'candidate'} · actual iframe viewport ${width} × ${height} CSS px · no touch/device or screen-reader certification.</p>
        <form><label>Question <select name="id">${ids.map(q=>`<option ${q===id?'selected':''}>${q}</option>`).join('')}</select></label>
        <label>Viewport <select name="view"><option value="mobile" ${mobile?'selected':''}>390 × 844 portrait</option><option value="desktop" ${mobile?'':'selected'}>1363 × 936 desktop</option></select></label><button>Load review</button></form>
        <iframe title="Local practice review" width="${width}" height="${height}" src="/practice/${encodeURIComponent(id)}"></iframe>`);
    }
    let path=decodeURIComponent(url.pathname),dir=publicDir;
    if(path.startsWith('/__bank/')){dir=bankDir;path=path.slice('/__bank'.length);}
    else if(path==='/'||path.startsWith('/practice/'))path='/practice.html';
    const file=resolve(dir,'.'+path);
    if(!file.startsWith(dir+sep))throw Error('Outside root');
    let data=baseline&&dir===publicDir&&['/assets/practice.js','/assets/archive-question.js','/assets/practice.css'].includes(path)
      ?execFileSync('git',['show',base+':web/public'+path],{cwd:root}):readFileSync(file);
    if(path==='/practice.html'){
      // Test-only network substitution. Do not alter bank-release.json, pin,
      // textOnly, pack contents, answer keys or production configuration.
      data=data.toString().replace('<head>',`<head><script>
        const originalFetch=window.fetch.bind(window);
        window.fetch=(input,init)=>{
          const address=typeof input==='string'?input:input.url;
          if(address.startsWith(${JSON.stringify(prefix)})) return originalFetch('/__bank/'+address.slice(${prefix.length}),init);
          return originalFetch(input,init);
        };
      </script>`);
    }
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
  }catch{res.statusCode=404;res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local ${baseline?'baseline':'candidate'} review: http://127.0.0.1:${port}/__review`));
