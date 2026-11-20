/* Resolve the question bank to one immutable commit. Only the application release can set its pin. */
window.BankFiles=(()=>{
  "use strict";
  const repository="https://raw.githubusercontent.com/rajadarsh542-lang/JeeHub/";
  let base,loading,textOnly=false;
  async function ready(){
    if(base)return;
    if(!loading)loading=fetch("/assets/bank-release.json",{credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"})
      .then(async response=>{
        if(!response.ok)throw new Error("Bank configuration unavailable");
        const release=await response.json();
        const {commit}=release;
        if(typeof commit!=="string"||!(/^[0-9a-f]{40}$/).test(commit))throw new Error("Invalid bank release");
        textOnly=release.textOnly===true;
        base=repository+commit+"/bank/";
      }).catch(error=>{loading=null;throw error;});
    return loading;
  }
  function url(logicalPath){
    if(!base)throw new Error("Bank release is not ready");
    if(typeof logicalPath!=="string"||/[\\?#:\u0000-\u001f]/.test(logicalPath))throw new Error("Invalid bank file");
    const segments=logicalPath.split("/");
    if(segments.some(part=>!part||part==="."||part===".."))throw new Error("Invalid bank file");
    return base+segments.map(encodeURIComponent).join("/");
  }
  async function json(logicalPath){
    await ready();
    const response=await fetch(url(logicalPath),{mode:"cors",credentials:"omit",referrerPolicy:"no-referrer",redirect:"error"});
    if(!response.ok)throw new Error("Bank file unavailable");
    return response.json();
  }
  return Object.freeze({ready,url,json,get textOnly(){return textOnly;}});
})();
