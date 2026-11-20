/* Optional, reviewed teaching material and shared question interactions. */
(() => {
  "use strict";
  const empty = {channelUrl:"",questions:{}};
  let config = empty, dialog, dialogImage, returnFocus;
  const element = (tag,text,cls) => {
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(cls)node.className=cls;
    return node;
  };
  function channelUrl(raw) {
    try {
      const url=new URL(raw);
      if(url.protocol!=="https:"||!["youtube.com","www.youtube.com"].includes(url.hostname)||url.username||url.password)return null;
      if(!/^\/(?:@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)\/?$/.test(url.pathname))return null;
      return url.href;
    } catch { return null; }
  }
  function videoLink(video) {
    if(!video||typeof video.title!=="string"||!video.title.trim())return null;
    try {
      const url=new URL(video.url);
      if(url.protocol!=="https:"||url.username||url.password)return null;
      let id;
      if(["youtube.com","www.youtube.com"].includes(url.hostname)&&url.pathname==="/watch")id=url.searchParams.get("v");
      else if(url.hostname==="youtu.be")id=url.pathname.slice(1);
      if(!/^[\w-]{11}$/.test(id||""))return null;
      const seconds=video.startSeconds??0;
      if(!Number.isInteger(seconds)||seconds<0||seconds>86400)return null;
      const canonical=new URL("https://www.youtube.com/watch");
      canonical.searchParams.set("v",id);
      if(seconds)canonical.searchParams.set("t",String(seconds)+"s");
      return {href:canonical.href,title:video.title.trim(),seconds};
    } catch { return null; }
  }
  function reviewed(id) {
    const entry=config.questions?.[id];
    return entry&&entry.reviewed===true ? entry : null;
  }
  function textList(value) {
    return Array.isArray(value)?value.filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim()):[];
  }
  const ready=fetch("/assets/teaching-links.json").then(response=>{
    if(!response.ok)throw new Error("Teaching links unavailable");
    return response.json();
  }).then(data=>{
    config=data&&typeof data==="object"&&!Array.isArray(data)?data:empty;
    const link=document.getElementById("channel-link"),url=channelUrl(config.channelUrl);
    if(link&&url){link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.hidden=false;}
    return config;
  }).catch(()=>empty);
  function addHints(actions,container,id) {
    const button=element("button","Hint","secondary hint-button");
    button.type="button";button.disabled=true;button.title="A reviewed hint is not available for this question yet.";
    actions.append(button);
    ready.then(()=>{
      const hints=textList(reviewed(id)?.hints);
      if(!hints.length)return;
      button.disabled=false;button.title="Reveal a hint without opening the solution";
      let shown=0;
      const card=element("section",null,"hint-card");card.hidden=true;card.setAttribute("aria-label","Hints");card.setAttribute("aria-live","polite");
      const heading=element("h3","Hints"),steps=element("ol");
      card.append(heading,steps);container.append(card);
      button.onclick=()=>{
        card.hidden=false;
        if(shown<hints.length)steps.append(element("li",hints[shown++]));
        button.textContent=shown<hints.length?"Next hint ("+shown+"/"+hints.length+")":"Hints shown ("+shown+"/"+hints.length+")";
        button.disabled=shown===hints.length;
      };
    });
    return button;
  }
  function decorateSolution(solution,id) {
    if(solution.dataset.teachingDecorated)return;
    solution.dataset.teachingDecorated="true";
    ready.then(()=>{
      const entry=reviewed(id);if(!entry)return;
      if(typeof entry.takeaway==="string"&&entry.takeaway.trim()){
        const takeaway=element("section",null,"solution-takeaway");
        takeaway.append(element("h3","Key idea"),element("p",entry.takeaway.trim()));
        solution.prepend(takeaway);
      }
      const steps=textList(entry.steps);
      if(steps.length){
        const walkthrough=element("section",null,"reviewed-solution-steps"),ol=element("ol");
        walkthrough.append(element("h3","Step-by-step explanation"),ol);
        for(const step of steps)ol.append(element("li",step));
        const takeaway=solution.querySelector(".solution-takeaway");
        if(takeaway)takeaway.after(walkthrough);else solution.prepend(walkthrough);
      }
      const video=videoLink(entry.video);
      if(video){
        const card=element("aside",null,"video-card");
        card.append(element("p","Visual walkthrough","video-context"),element("h3",video.title,"video-title"));
        const stamp=Math.floor(video.seconds/60)+":"+String(video.seconds%60).padStart(2,"0");
        const link=element("a",video.seconds?"Watch from "+stamp+" on YouTube":"Watch on YouTube","video-link");
        link.href=video.href;link.target="_blank";link.rel="noopener noreferrer";
        link.setAttribute("aria-label",link.textContent+" (opens in a new tab)");
        card.append(link);solution.append(card);
      }
    });
  }
  function getDialog() {
    if(dialog)return dialog;
    dialog=element("dialog",null,"figure-dialog");dialog.setAttribute("aria-labelledby","figure-dialog-title");
    const header=element("div",null,"figure-dialog-head"),title=element("h2","Figure");title.id="figure-dialog-title";
    const close=element("button","Close","secondary");close.type="button";close.setAttribute("aria-label","Close enlarged figure");
    close.onclick=()=>dialog.close();
    header.append(title,close);
    dialogImage=element("img",null,"figure-dialog-image");
    dialog.append(header,dialogImage);document.body.append(dialog);
    dialog.addEventListener("close",()=>{
      dialogImage.removeAttribute("src");
      if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    });
    dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
    return dialog;
  }
  function attach(root,record={}) {
    for(const img of root.querySelectorAll("img")){
      if(img.dataset.figureEnhanced||img.closest("mjx-container,math,.figure-dialog,.video-card"))continue;
      img.dataset.figureEnhanced="true";
      const frame=element("span",null,"figure-frame"),zoom=element("button","Enlarge figure","figure-zoom");
      zoom.type="button";
      zoom.setAttribute("aria-haspopup","dialog");
      zoom.setAttribute("aria-label","Enlarge "+(img.alt||"question figure"));
      img.replaceWith(frame);frame.append(img,zoom);
      zoom.onclick=event=>{
        event.preventDefault();event.stopPropagation();
        if(!img.currentSrc&&!img.getAttribute("src"))return;
        const viewer=getDialog();if(typeof viewer.showModal!=="function")return;
        returnFocus=zoom;dialogImage.src=img.currentSrc||img.src;dialogImage.alt=img.alt||"Question figure";
        viewer.showModal();
      };
    }
  }
  function reportAttempt(id,status) {
    if(!id||!["correct","incorrect","unattempted"].includes(status))return;
    document.dispatchEvent(new CustomEvent("question-attempt",{detail:{id,status}}));
  }
  function clearAnswerFeedback(fields) {
    for(const node of fields.querySelectorAll(".answer-correct,.answer-incorrect")){
      node.classList.remove("answer-correct","answer-incorrect");
      if(node.matches("input"))node.removeAttribute("aria-invalid");
    }
    for(const marker of fields.querySelectorAll(".answer-marker"))marker.remove();
  }
  function markAnswers(fields,correctIds,{numerical=false,correct=false}={}) {
    clearAnswerFeedback(fields);
    if(numerical){
      const input=fields.querySelector("input");
      if(input){input.classList.add(correct?"answer-correct":"answer-incorrect");input.setAttribute("aria-invalid",String(!correct));}
      return;
    }
    for(const input of fields.querySelectorAll("input[type=radio],input[type=checkbox]")){
      const choice=input.closest(".choice");if(!choice)continue;
      const right=correctIds.includes(input.value);
      if(!right&&!input.checked)continue;
      choice.classList.add(right?"answer-correct":"answer-incorrect");
      const marker=element("span",right?"Correct option":"Your answer","answer-marker");marker.setAttribute("aria-hidden","true");choice.append(marker);
    }
  }
  window.QuestionExperience={ready,attach,addHints,decorateSolution,reportAttempt,markAnswers,clearAnswerFeedback};
})();
