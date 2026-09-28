/* =====================================================================
   EGE UI kit  v1.0   (behavior that goes with ege-ui.css)
   Everything hangs off window.EGE. No libraries needed.

   EGE.toast("Saved.")
   EGE.copy(text, "Report")                      clipboard with fallback
   EGE.sheet.open(html) / EGE.sheet.close()      bottom popup
   EGE.twoTap(button, "Tap again to clear", fn)  confirm without popups
   EGE.store.get(key, fallback) / .set(key, v)   safe localStorage
   EGE.required({ button, fields:[{el, wrap}], onReady })
       Grays the button until every field has text. Tapping it early puts
       *Required on every empty one and focuses the first.
   EGE.mic({ button, textarea, status, pill, onText, onDone })
       Big talk button. Browser speech when it's allowed, iPad keyboard
       dictation when it isn't. onText fires live as words come in.
   EGE.photo(file, { max:1600, stamp:"1.2 Work Executed | Job | time" })
       Resizes and stamps a photo. Returns a Promise of a JPEG Blob.
   EGE.share({ title, text, files })             iPad share sheet, false if not available
   EGE.flags(container, [["warn","text"], ...])  colored flag chips
   EGE.wordsToDigits("twelve and a half")        "12.5"
   ===================================================================== */
(function(){
"use strict";
const EGE={};
const $=s=>typeof s==="string"?document.querySelector(s):s;

/* ---------- storage ---------- */
EGE.store={
  get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
  json(k,d){ try{ return JSON.parse(localStorage.getItem(k))??d; }catch(e){ return d; } }
};

/* ---------- toast ---------- */
let toastEl=null, toastT=null;
EGE.toast=function(msg,ms){
  if(!toastEl){ toastEl=document.createElement("div"); toastEl.className="ege-toast"; toastEl.setAttribute("role","status"); document.body.appendChild(toastEl); }
  toastEl.textContent=msg; toastEl.classList.add("show"); clearTimeout(toastT);
  toastT=setTimeout(()=>toastEl.classList.remove("show"),ms||2600);
};

/* ---------- copy ---------- */
EGE.copy=async function(text,label){
  label=label||"Text";
  try{ await navigator.clipboard.writeText(text); EGE.toast(label+" copied."); return true; }
  catch(e){ const ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand("copy"); }catch(e2){} ta.remove();
    EGE.toast(ok?label+" copied.":"Copy is blocked here. Select the text and copy it by hand."); return ok; }
};

/* ---------- bottom sheet ---------- */
let sheetEl=null;
EGE.sheet={
  open(html){
    if(!sheetEl){ sheetEl=document.createElement("div"); sheetEl.className="ege-sheet"; sheetEl.setAttribute("role","dialog"); sheetEl.setAttribute("aria-modal","true"); sheetEl.innerHTML='<div class="ege-sheet-box"></div>'; document.body.appendChild(sheetEl);
      sheetEl.addEventListener("click",e=>{ if(e.target===sheetEl||e.target.closest("[data-close]")) EGE.sheet.close(); });
      document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&sheetEl&&!sheetEl.hidden) EGE.sheet.close(); }); }
    sheetEl.firstChild.innerHTML=html; sheetEl.hidden=false; return sheetEl.firstChild;
  },
  close(){ if(sheetEl){ sheetEl.hidden=true; sheetEl.firstChild.innerHTML=""; } }
};

/* ---------- two tap confirm (alert/confirm popups don't work everywhere) ---------- */
EGE.twoTap=function(btn,armText,fn){
  btn=$(btn); const orig=btn.textContent; let t=null;
  btn.addEventListener("click",()=>{
    if(!btn.classList.contains("arm")){ btn.classList.add("arm"); btn.textContent=armText||"Tap again"; clearTimeout(t); t=setTimeout(()=>{ btn.classList.remove("arm"); btn.textContent=orig; },3000); return; }
    clearTimeout(t); btn.classList.remove("arm"); btn.textContent=orig; fn();
  });
};

/* ---------- escape ---------- */
EGE.esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- flags ---------- */
EGE.flags=function(box,list,okText){
  box=$(box); box.innerHTML="";
  if(!list.length&&okText) list=[["ok",okText]];
  list.forEach(([k,t])=>{ const s=document.createElement("span"); s.className="ege-flag "+k; s.textContent=t; box.appendChild(s); });
};

/* ---------- required fields + gated button ---------- */
EGE.required=function(opt){
  const btn=$(opt.button);
  const items=()=>(typeof opt.fields==="function"?opt.fields():opt.fields).map(f=>({el:$(f.el),wrap:$(f.wrap||$(f.el).closest(".ege-card")||$(f.el).closest(".ege-field")),onFocus:f.onFocus}));
  function empty(){ return items().filter(f=>!String(f.el.value||"").trim()); }
  function paint(){ const ok=!empty().length; btn.setAttribute("aria-disabled",ok?"false":"true"); btn.classList.toggle("accent",ok); btn.classList.toggle("gray",!ok);
    items().forEach(f=>{ if(String(f.el.value||"").trim()&&f.wrap) f.wrap.classList.remove("missing"); }); return ok; }
  items().forEach(f=>{ ensureReq(f.wrap); f.el.addEventListener("input",paint); f.el.addEventListener("change",paint); });
  btn.addEventListener("click",()=>{
    const miss=empty(); document.querySelectorAll(".missing").forEach(x=>x.classList.remove("missing"));
    if(miss.length){ miss.forEach(f=>f.wrap&&f.wrap.classList.add("missing")); const first=miss[0];
      if(first.onFocus) first.onFocus(); first.el.focus({preventScroll:true}); first.el.scrollIntoView({block:"center",behavior:"smooth"});
      EGE.toast(miss.length+" required "+(miss.length>1?"boxes are":"box is")+" empty."); return; }
    opt.onReady&&opt.onReady();
  });
  paint(); return {paint,empty};
};
function ensureReq(wrap){ if(!wrap||wrap.querySelector(":scope>.ege-req")) return; const r=document.createElement("span"); r.className="ege-req"; r.textContent="*Required"; wrap.prepend(r); }

/* ---------- share sheet ---------- */
EGE.share=async function(data){
  if(!navigator.share) return false;
  const d={title:data.title,text:data.text};
  if(data.files&&data.files.length&&navigator.canShare&&navigator.canShare({files:data.files})) d.files=data.files;
  try{ await navigator.share(d); return true; }catch(e){ return e&&e.name==="AbortError"?"cancel":false; }
};

/* ---------- photos ---------- */
EGE.photo=async function(file,opt){
  opt=opt||{}; const max=opt.max||1600;
  const url=URL.createObjectURL(file);
  const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
  const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)); const w=Math.round(img.naturalWidth*sc), h=Math.round(img.naturalHeight*sc);
  const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const g=cv.getContext("2d"); g.drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
  if(opt.stamp){ const bh=Math.max(28,Math.round(h*0.045)); g.fillStyle="rgba(19,26,70,.72)"; g.fillRect(0,h-bh,w,bh);
    g.fillStyle="#fff"; g.font="500 "+Math.round(bh*0.48)+"px Roboto, Helvetica, Arial, sans-serif"; g.textBaseline="middle";
    let t=opt.stamp; while(g.measureText(t).width>w-bh&&t.length>10) t=t.slice(0,-2); g.fillText(t,Math.round(bh*0.4),h-bh/2); }
  return await new Promise(r=>cv.toBlob(r,"image/jpeg",opt.quality||0.82));
};
EGE.stamp=function(parts){ const d=new Date(); return parts.filter(Boolean).concat(d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+" "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})).join("  |  "); };

/* ---------- dates ---------- */
EGE.today=function(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
EGE.niceDate=function(iso){ if(!iso) return ""; return new Date(iso+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
EGE.stampNow=function(){ const d=new Date(); return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+" at "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); };

/* ---------- spoken numbers ---------- */
const ONES={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENS={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
EGE.wordsToDigits=function(t){
  t=t.replace(/\b(no|any|some|every)\s+one\b/gi,"$1​one");
  t=t.replace(/\b(\w+)\s+and\s+a\s+half\b/gi,(m,a)=>a+" point five");
  t=t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,(m,a,b)=>TENS[a.toLowerCase()]+ONES[b.toLowerCase()]);
  t=t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,m=>TENS[m.toLowerCase()]);
  t=t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi,m=>ONES[m.toLowerCase()]);
  t=t.replace(/(\d)\s+point\s+(\d)/gi,"$1.$2");
  t=t.replace(/\b(\d+)\s+hundred(?:\s+and)?(?:\s+(\d{1,2})\b)?/gi,(m,a,b)=>String(+a*100+(b?+b:0)));
  t=t.replace(/\b(\d+)\s+thousand\b/gi,(m,a)=>String(+a*1000));
  return t.replace(/​/g," ");
};

/* ---------- sentence cleanup for dictated text ---------- */
EGE.tidySentences=function(s){
  s=s.replace(/\b(?:um+|uh+|uhm|er|you know|i mean)\b[,]?\s*/gi,"").replace(/\b(\w+)(\s+\1\b)+/gi,"$1");
  s=s.replace(/\bi\b/g,"I").replace(/\s+([,.;:!?])/g,"$1").replace(/([,.;:!?])(?=[A-Za-z])/g,"$1 ").replace(/\.{2,}/g,".").replace(/\s{2,}/g," ").trim();
  if(!s) return s;
  s=s.charAt(0).toUpperCase()+s.slice(1); s=s.replace(/([.!?]\s+)([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  return /[.!?)]$/.test(s)?s:s+".";
};

/* ---------- talk button: browser speech or keyboard dictation ---------- */
EGE.isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
EGE.mic=function(opt){
  const btn=$(opt.button), ta=$(opt.textarea), status=$(opt.status), pill=$(opt.pill), modeline=$(opt.modeline), tip=$(opt.tip);
  const key=opt.storeKey||"ege_micmode"; const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let mode=EGE.store.get(key,"auto"), blocked=false, rec=null, wantOn=false, base="", interim="", restarts=0, restartT=null, dictating=false, dictT=null;
  const say=m=>{ if(status) status.textContent=m; };
  const setPill=(ok,m)=>{ if(pill){ pill.textContent=m; pill.classList.toggle("off",!ok); } };
  const dictation=()=>blocked||!SR||mode==="dictate"||(mode==="auto"&&EGE.isIOS);
  const fire=()=>opt.onText&&opt.onText(ta.value);
  function paint(){ const on=dictation()?dictating:wantOn; btn.classList.toggle("listening",on); btn.setAttribute("aria-pressed",on?"true":"false");
    btn.textContent=dictation()?(dictating?"Dictating":"Tap to dictate"):(wantOn?"Tap to stop":"Tap to talk"); opt.onState&&opt.onState(on); paintMode(); }
  function paintMode(){ if(!modeline) return;
    modeline.innerHTML=dictation()?(SR&&!blocked?'Using keyboard dictation. <button type="button" class="ege-link">Use browser mic instead</button>':"Using keyboard dictation."):'Browser mic. <button type="button" class="ege-link">Use keyboard dictation instead</button>';
    const b=modeline.querySelector("button"); if(b) b.onclick=()=>{ mode=dictation()?"browser":"dictate"; EGE.store.set(key,mode); setPill(true,dictation()?"dictation":"mic ready"); paint(); }; }
  function dStart(){ dictating=true; ta.classList.add("dictating"); tip&&(tip.hidden=false); paint(); say("Tap the mic key on the keyboard and talk.");
    if(ta.value.trim()) ta.value=ta.value.trimEnd()+" "; ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); setTimeout(()=>ta.scrollIntoView({block:"center",behavior:"smooth"}),150); }
  function dDone(){ if(!dictating) return; dictating=false; clearTimeout(dictT); ta.classList.remove("dictating"); tip&&(tip.hidden=true); paint(); ta.blur(); say(opt.doneText||"Got it."); fire(); opt.onDone&&opt.onDone(ta.value); }
  ta.addEventListener("input",()=>{ base=ta.value; fire(); if(dictating){ say("Hearing you..."); clearTimeout(dictT); dictT=setTimeout(()=>{ if(dictating) say("Paused. Keep talking, or tap the button to finish."); },4000); } });
  ta.addEventListener("blur",()=>{ if(dictating) setTimeout(()=>{ if(dictating&&document.activeElement!==ta) dDone(); },300); });
  function block(){ blocked=true; wantOn=false; setPill(true,"dictation"); paint(); say("Browser mic is blocked here. Tap the button and use the keyboard mic."); }
  if(SR){ rec=new SR(); rec.lang=opt.lang||"en-US"; rec.interimResults=true; rec.continuous=!EGE.isIOS;
    rec.onstart=()=>{ say(opt.listenText||"Listening. Tap the button when you're done."); setPill(true,"mic live"); };
    rec.onresult=e=>{ restarts=0; let fin="",inter=""; for(let i=e.resultIndex;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) fin+=r[0].transcript+" "; else inter+=r[0].transcript; }
      if(fin) base=(base+" "+fin).replace(/\s+/g," ").trimStart(); interim=inter; ta.value=(base+(interim?" "+interim:"")).trimStart(); ta.scrollTop=ta.scrollHeight; fire(); };
    rec.onerror=e=>{ if(e.error==="not-allowed"||e.error==="service-not-allowed") return block(); if(e.error==="no-speech"||e.error==="aborted") return;
      if(e.error==="network"){ wantOn=false; paint(); return say("Speech needs internet. Check the connection, or use keyboard dictation."); } say("Mic hiccup ("+e.error+"). Still listening."); };
    rec.onend=()=>{ if(interim){ base=(base+" "+interim).trim(); interim=""; ta.value=base; }
      if(wantOn){ if(restarts++>40){ wantOn=false; paint(); return say("Mic stopped after a long quiet stretch. Tap to talk again."); } clearTimeout(restartT); restartT=setTimeout(()=>{ if(wantOn) try{ rec.start(); }catch(e){} },EGE.isIOS?250:120); return; }
      paint(); setPill(true,"mic ready"); say(opt.doneText||"Got it."); fire(); opt.onDone&&opt.onDone(ta.value); }; }
  async function sStart(){ wantOn=true; restarts=0; paint(); say("Starting mic...");
    try{ const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); }catch(e){ return block(); }
    base=ta.value.trim(); interim=""; try{ rec.start(); }catch(e){ try{ rec.stop(); }catch(e2){} setTimeout(()=>{ try{ rec.start(); }catch(e3){ wantOn=false; paint(); say("Mic busy. Tap again."); } },300); } }
  function sStop(){ wantOn=false; clearTimeout(restartT); paint(); say("Finishing..."); try{ rec.stop(); }catch(e){} }
  btn.addEventListener("click",()=>{ if(dictation()){ dictating?dDone():dStart(); return; } wantOn?sStop():sStart().catch(block); });
  document.addEventListener("visibilitychange",()=>{ if(document.hidden&&wantOn) sStop(); });
  setPill(true,dictation()?"dictation":"mic ready"); paint(); say(opt.idleText||"Tap the button and talk.");
  return {
    append(text){ const v=ta.value.replace(/\s+$/,""); ta.value=(v?v+" ":"")+text; base=ta.value; fire(); if(dictating){ ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); } },
    set(text){ ta.value=text; base=text; fire(); },
    get listening(){ return dictation()?dictating:wantOn; }
  };
};

window.EGE=EGE;
})();
