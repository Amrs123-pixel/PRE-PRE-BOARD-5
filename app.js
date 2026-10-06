
const LETTERS=["A","B","C","D"];
let manifest=[],deck=null,idx=0;
const $=id=>document.getElementById(id);

async function init(){
  manifest=await fetch("decks/index.json").then(r=>r.json());
  ensureModernUI();
  renderLibrary(manifest);

  $("search").addEventListener("input",e=>{
    const s=e.target.value.toLowerCase();
    renderLibrary(manifest.filter(d=>(d.title+" "+d.subject+" "+d.description).toLowerCase().includes(s)));
  });

  $("backBtn").onclick=()=>{
    $("studyView").classList.add("hidden");
    $("libraryView").classList.remove("hidden");
    renderLibrary(manifest);
  };

  $("prevBtn").onclick=()=>{ if(idx>0){idx--;renderQuestion();} };
  $("nextBtn").onclick=()=>{ if(deck&&idx<deck.questions.length-1){idx++;renderQuestion();} };
  $("revealBtn").onclick=reveal;
  $("resetBtn").onclick=resetDeck;
  $("askBtn").onclick=askAI;
  $("clearChatBtn").onclick=()=>{$("chat").innerHTML='<div class="msg ai">Chat cleared.</div>';};

  ensureDrawingPadUI();
}

function ensureModernUI(){
  // Percentage pill in the existing stats bar.
  const stats=document.querySelector(".stats");
  if(stats && !$("percentageCount")){
    const p=document.createElement("span");
    p.className="pill score-pill";
    p.innerHTML='Score: <span id="percentageCount">0%</span>';
    stats.appendChild(p);
  }

  // Progress bar below the study header.
  const bar=document.querySelector(".card .bar");
  if(bar && !$("examProgress")){
    const wrap=document.createElement("div");
    wrap.className="exam-progress-wrap";
    wrap.innerHTML='<div class="exam-progress-track"><div id="examProgress" class="exam-progress-fill"></div></div><div id="examProgressText" class="exam-progress-text">0% complete</div>';
    bar.insertAdjacentElement("afterend",wrap);
  }

  // Text flashcard display for Q&A decks.
  const slide=document.querySelector(".slide");
  if(slide && !$("questionText")){
    const q=document.createElement("div");
    q.id="questionText";
    q.className="question-text-card hidden";
    slide.appendChild(q);
  }

  // Final result modal.
  if(!$("finalResults")){
    const modal=document.createElement("div");
    modal.id="finalResults";
    modal.className="results-modal hidden";
    modal.innerHTML=`
      <div class="results-panel">
        <div class="results-badge">EXAM COMPLETE</div>
        <h2 id="resultTitle">Final Result</h2>
        <div id="resultPercent" class="result-percent">0%</div>
        <div id="resultBreakdown" class="result-breakdown"></div>
        <div id="resultMessage" class="result-message"></div>
        <div class="results-actions">
          <button id="reviewResultsBtn" class="btn primary">Review Answers</button>
          <button id="closeResultsBtn" class="btn">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    $("closeResultsBtn").onclick=()=>modal.classList.add("hidden");
    $("reviewResultsBtn").onclick=()=>{modal.classList.add("hidden");idx=0;renderQuestion();};
  }
}

function renderLibrary(items){
  $("library").innerHTML=items.map(d=>{
    const s=JSON.parse(localStorage.getItem("flashlib:"+d.id)||"{}");
    const graded=Object.values(s).filter(r=>r && (r.correct===true || r.correct===false)).length;
    const correct=Object.values(s).filter(r=>r && r.correct===true).length;
    const pct=graded ? Math.round(correct/graded*100) : 0;
    const complete=Math.min(100,Math.round(graded/d.count*100));
    return `
      <article class="deck">
        <div class="deck-topline">
          <span class="deck-subject">${esc(d.subject)}</span>
          <span class="deck-score">${graded?`${pct}% score`:"Not started"}</span>
        </div>
        <h3>${esc(d.title)}</h3>
        <div class="meta">${d.count} cards</div>
        <p>${esc(d.description)}</p>
        <div class="library-progress"><div style="width:${complete}%"></div></div>
        <div class="library-progress-label">${graded}/${d.count} completed</div>
        <button class="btn primary" onclick="openDeck('${d.file}')">${graded?"Continue":"Start"} deck</button>
      </article>`;
  }).join("");
}

async function openDeck(file){
  deck=await fetch(file).then(r=>r.json());
  idx=0;
  $("libraryView").classList.add("hidden");
  $("studyView").classList.remove("hidden");
  $("deckTitle").textContent=deck.title;
  $("totalCount").textContent=deck.questions.length;
  $("finalResults").classList.add("hidden");
  renderQuestion();
}

function progressKey(){return "flashlib:"+deck.id}
function state(){return JSON.parse(localStorage.getItem(progressKey())||"{}")}
function save(s){localStorage.setItem(progressKey(),JSON.stringify(s))}

function isQAMode(q){return deck?.mode==="qa"}
function isTextMCQ(q){return deck?.mode==="mcq_text" && !!q.question && !!q.choices}

function renderQuestion(){
  const q=deck.questions[idx], s=state(), r=s[q.n];
  $("qTitle").textContent=`Question ${q.n} · Card ${idx+1} of ${deck.questions.length}`;

  const qa=isQAMode(q);
  const textMCQ=isTextMCQ(q);
  const usesText=qa||textMCQ;
  $("qImage").classList.toggle("hidden",usesText);
  $("questionText").classList.toggle("hidden",!usesText);
  $("choices").classList.toggle("text-mcq",textMCQ);

  if(textMCQ){
    $("questionText").textContent=q.question;
    $("revealBtn").textContent="Reveal Answer";
    $("choices").innerHTML=LETTERS.map(l=>{
      let c="choice text-choice";
      if(r&&l===q.correct)c+=" correct";
      if(r&&r.answer===l&&l!==q.correct)c+=" wrong";
      return `<button class="${c}" ${r?"disabled":""} onclick="answer('${l}')">
        <span class="choice-letter">${l}</span><span class="choice-copy">${esc(q.choices[l])}</span>
      </button>`;
    }).join("");

    if(r){
      $("explain").classList.remove("hidden");
      $("explain").innerHTML=`
        <strong class="${r.correct?"result-good":"result-bad"}">${r.correct?"✓ Correct":"✕ Incorrect"}</strong><br>
        Correct answer: <strong>${q.correct}. ${esc(q.choices[q.correct])}</strong><br><br>
        ${esc(q.solution)}`;
    }else{
      $("explain").classList.add("hidden");
      $("explain").innerHTML="";
    }
  }else if(qa){
    $("questionText").textContent=q.question;
    $("choices").innerHTML="";
    $("revealBtn").textContent=(r&&r.revealed)?"Answer Revealed":"Reveal Answer";

    if(r && r.revealed){
      $("explain").classList.remove("hidden");
      const gradeButtons=(r.correct===null || r.correct===undefined)
        ? `<div class="self-grade">
             <div class="self-grade-label">Did you get it right?</div>
             <button class="btn grade-correct" onclick="selfGrade(true)">✓ Correct</button>
             <button class="btn grade-wrong" onclick="selfGrade(false)">✕ Wrong</button>
           </div>`
        : `<div class="graded-note ${r.correct?"graded-good":"graded-bad"}">${r.correct?"✓ Marked correct":"✕ Marked wrong"}</div>`;

      $("explain").innerHTML=`
        <div class="source-answer-label">SOURCE ANSWER</div>
        <div class="source-answer">${esc(q.answer)}</div>
        ${gradeButtons}`;
    }else{
      $("explain").classList.add("hidden");
      $("explain").innerHTML="";
    }
  }else{
    $("qImage").src="data:image/jpeg;base64,"+q.img;
    $("revealBtn").textContent="Reveal";
    $("choices").innerHTML=LETTERS.map(l=>{
      let c="choice";
      if(r&&q.correct&&l===q.correct)c+=" correct";
      if(r&&r.answer===l&&q.correct&&l!==q.correct)c+=" wrong";
      if(r&&!q.correct&&r.answer===l)c+=" ungraded";
      return `<button class="${c}" ${r?"disabled":""} onclick="answer('${l}')">${l}</button>`;
    }).join("");

    if(r){
      $("explain").classList.remove("hidden");
      if(q.correct){
        $("explain").innerHTML=`<strong>${r.correct?"✓ Correct":"✕ Incorrect"}</strong><br>
          Correct answer: <strong>${q.correct}</strong><br><br>${esc(q.solution)}`;
      }else{
        $("explain").innerHTML=`<strong>⚠ Not graded</strong><br>
          The printed source/data do not support one clean A–D answer.<br><br>${esc(q.solution)}`;
      }
    }else{
      $("explain").classList.add("hidden");
      $("explain").innerHTML="";
    }
  }

  $("prevBtn").disabled=idx===0;
  $("nextBtn").disabled=idx===deck.questions.length-1;
  updateStats();
  configureDrawingPadForQuestion();
}

function answer(letter){
  const q=deck.questions[idx],s=state();
  if(s[q.n])return;
  s[q.n]={answer:letter,correct:q.correct?letter===q.correct:null,revealed:false};
  save(s);
  renderQuestion();
  maybeFinish();
}

function reveal(){
  const q=deck.questions[idx],s=state();

  if(isQAMode(q)){
    const existing=s[q.n]||{};
    if(existing.revealed)return;
    s[q.n]={...existing,answer:null,correct:null,revealed:true};
    save(s);
    renderQuestion();
    return;
  }

  if(s[q.n])return;
  s[q.n]={answer:null,correct:q.correct?false:null,revealed:true};
  save(s);
  renderQuestion();
  maybeFinish();
}

function selfGrade(value){
  const q=deck.questions[idx],s=state();
  const r=s[q.n]||{revealed:true};
  r.correct=!!value;
  r.revealed=true;
  s[q.n]=r;
  save(s);
  renderQuestion();
  maybeFinish();
}

function scoreData(){
  if(!deck)return {c:0,w:0,a:0,pct:0};
  const s=state();
  let c=0,w=0,a=0;
  deck.questions.forEach(q=>{
    const r=s[q.n];
    if(!r)return;
    if(r.correct===true){c++;a++}
    else if(r.correct===false){w++;a++}
  });
  return {c,w,a,pct:a?Math.round(c/a*100):0};
}

function updateStats(){
  if(!deck)return;
  const x=scoreData();
  $("correctCount").textContent=x.c;
  $("wrongCount").textContent=x.w;
  $("answeredCount").textContent=x.a;
  if($("percentageCount"))$("percentageCount").textContent=x.pct+"%";

  const complete=Math.round((x.a/deck.questions.length)*100);
  if($("examProgress"))$("examProgress").style.width=complete+"%";
  if($("examProgressText"))$("examProgressText").textContent=`${complete}% complete · ${x.a}/${deck.questions.length} graded`;
}

function maybeFinish(){
  const x=scoreData();
  if(x.a!==deck.questions.length)return;

  $("resultTitle").textContent=deck.title;
  $("resultPercent").textContent=x.pct+"%";
  $("resultBreakdown").innerHTML=`<span>✓ ${x.c} correct</span><span>✕ ${x.w} wrong</span><span>${x.a}/${deck.questions.length} completed</span>`;
  $("resultMessage").textContent =
    x.pct>=90 ? "Excellent result." :
    x.pct>=75 ? "Good result. Review the missed cards to push the score higher." :
    x.pct>=60 ? "You have a workable base. Focus your next review on the missed cards." :
                "Review the missed cards, then retake the deck.";
  $("finalResults").classList.remove("hidden");
}

function resetDeck(){
  const keepDrawings=deck?.drawingPad!==false;
  const msg=keepDrawings
    ?"Reset answer progress for this deck? Your handwritten solution-pad drawings will be kept."
    :"Reset all answer progress and the score for this deck?";
  if(confirm(msg)){
    localStorage.removeItem(progressKey());
    $("finalResults").classList.add("hidden");
    renderQuestion();
  }
}

async function askAI(){
  if(!deck)return;
  const endpoint=(window.FLASHCARD_APP_CONFIG||{}).aiEndpoint;
  const prompt=$("askBox").value.trim();
  if(!prompt)return;

  addMsg("user",prompt);
  $("askBox").value="";

  if(!endpoint){
    addMsg("ai","AI is not connected yet. Deploy the backend and put its URL in config.js.");
    $("aiStatus").textContent="Backend not configured.";
    return;
  }

  const q=deck.questions[idx];
  $("aiStatus").textContent="Thinking...";
  try{
    const res=await fetch(endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        question:prompt,
        deckTitle:deck.title,
        currentQuestion:{
          number:q.n,
          question:q.question||null,
          correct:q.correct||null,
          answer:q.answer||null,
          solution:q.solution||null
        }
      })
    });
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||"Request failed");
    addMsg("ai",data.answer||"No answer returned.");
    $("aiStatus").textContent="";
  }catch(e){
    addMsg("ai","AI request failed: "+e.message);
    $("aiStatus").textContent="Connection error.";
  }
}

function addMsg(type,text){
  const d=document.createElement("div");
  d.className="msg "+type;
  d.textContent=text;
  $("chat").appendChild(d);
  $("chat").scrollTop=$("chat").scrollHeight;
}

function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}

/* ---------------- iPad / Apple Pencil solution pad ---------------- */


let drawState={
  canvas:null,ctx:null,tool:"pen",size:4,drawing:false,current:null,
  strokes:[],redo:[],resizeObserver:null
};

function ensureDrawingPadUI(){
  if(document.getElementById("solutionPad")) return;

  const choices=$("choices");
  const panel=document.createElement("section");
  panel.id="solutionPad";
  panel.className="solution-pad hidden";
  panel.innerHTML=`
    <div class="solution-pad-head">
      <div>
        <strong>✍️ Your Solution Pad</strong>
        <div class="note">Apple Pencil, stylus, mouse, and finger supported. Your work is saved per question on this device.</div>
      </div>
      <button id="padExpandBtn" class="btn pad-small" type="button">Expand</button>
    </div>

    <div class="draw-toolbar" role="toolbar" aria-label="Drawing tools">
      <button id="penBtn" class="btn draw-tool active" type="button">Pen</button>
      <button id="eraserBtn" class="btn draw-tool" type="button">Eraser</button>
      <button id="undoDrawBtn" class="btn pad-small" type="button">Undo</button>
      <button id="redoDrawBtn" class="btn pad-small" type="button">Redo</button>
      <button id="clearDrawBtn" class="btn pad-small" type="button">Clear</button>
      <label class="size-control">Pen size
        <input id="penSize" type="range" min="2" max="14" value="4" step="1">
      </label>
    </div>

    <div class="canvas-wrap">
      <canvas id="solutionCanvas" aria-label="Handwriting solution canvas"></canvas>
    </div>
    <div id="drawStatus" class="draw-status">Ready to write.</div>
  `;
  choices.insertAdjacentElement("afterend",panel);

  drawState.canvas=document.getElementById("solutionCanvas");
  drawState.ctx=drawState.canvas.getContext("2d",{alpha:false});

  document.getElementById("penBtn").onclick=()=>setDrawTool("pen");
  document.getElementById("eraserBtn").onclick=()=>setDrawTool("eraser");
  document.getElementById("undoDrawBtn").onclick=undoDrawing;
  document.getElementById("redoDrawBtn").onclick=redoDrawing;
  document.getElementById("clearDrawBtn").onclick=clearDrawing;
  document.getElementById("penSize").oninput=e=>{
    drawState.size=Number(e.target.value);
  };
  document.getElementById("padExpandBtn").onclick=togglePadExpand;

  const c=drawState.canvas;
  c.addEventListener("pointerdown",pointerDown);
  c.addEventListener("pointermove",pointerMove);
  c.addEventListener("pointerup",pointerUp);
  c.addEventListener("pointercancel",pointerUp);
  c.addEventListener("contextmenu",e=>e.preventDefault());

  if(window.ResizeObserver){
    drawState.resizeObserver=new ResizeObserver(()=>resizeCanvasAndRedraw());
    drawState.resizeObserver.observe(c.parentElement);
  }else{
    window.addEventListener("resize",resizeCanvasAndRedraw);
  }
}

function configureDrawingPadForQuestion(){
  const panel=document.getElementById("solutionPad");
  if(!panel || !deck) return;

  if(deck.drawingPad){
    panel.classList.remove("hidden");
    loadDrawing();
    requestAnimationFrame(resizeCanvasAndRedraw);
  }else{
    panel.classList.add("hidden");
  }
}

function drawingKey(){
  const q=deck.questions[idx];
  return `flashdraw:v2:${deck.id}:${q.n}`;
}

function loadDrawing(){
  drawState.redo=[];
  try{
    const saved=JSON.parse(localStorage.getItem(drawingKey())||"[]");
    drawState.strokes=Array.isArray(saved)?saved:[];
  }catch{
    drawState.strokes=[];
  }
  updateDrawButtons();
  redrawCanvas();
}

function saveDrawing(){
  try{
    localStorage.setItem(drawingKey(),JSON.stringify(drawState.strokes));
    setDrawStatus("Saved automatically.");
  }catch(e){
    setDrawStatus("Storage is full. Clear older drawings or browser site data.");
  }
}

function setDrawTool(tool){
  drawState.tool=tool;
  document.getElementById("penBtn").classList.toggle("active",tool==="pen");
  document.getElementById("eraserBtn").classList.toggle("active",tool==="eraser");
  drawState.canvas.classList.toggle("eraser-cursor",tool==="eraser");
  setDrawStatus(tool==="pen"?"Pen selected.":"Eraser selected.");
}

function normalizedPoint(e){
  const r=drawState.canvas.getBoundingClientRect();
  return {
    x:(e.clientX-r.left)/r.width,
    y:(e.clientY-r.top)/r.height,
    p:(typeof e.pressure==="number" && e.pressure>0)?e.pressure:0.5
  };
}

function pointerDown(e){
  if(!deck || !deck.drawingPad) return;
  if(e.pointerType==="mouse" && e.button!==0) return;

  e.preventDefault();
  drawState.canvas.setPointerCapture?.(e.pointerId);
  drawState.drawing=true;
  drawState.redo=[];

  drawState.current={
    tool:drawState.tool,
    size:drawState.size,
    points:[normalizedPoint(e)]
  };
  drawState.strokes.push(drawState.current);

  redrawCanvas();
  updateDrawButtons();
}

function pointerMove(e){
  if(!drawState.drawing || !drawState.current) return;
  e.preventDefault();

  const events=e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for(const ev of events){
    drawState.current.points.push(normalizedPoint(ev));
  }
  redrawCanvas();
}

function pointerUp(e){
  if(!drawState.drawing) return;
  e.preventDefault();
  drawState.drawing=false;
  drawState.current=null;
  try{ drawState.canvas.releasePointerCapture?.(e.pointerId); }catch{}
  saveDrawing();
  updateDrawButtons();
}

function canvasMetrics(){
  const c=drawState.canvas;
  const rect=c.getBoundingClientRect();
  return {w:rect.width,h:rect.height,dpr:Math.max(1,window.devicePixelRatio||1)};
}

function resizeCanvasAndRedraw(){
  if(!drawState.canvas || document.getElementById("solutionPad")?.classList.contains("hidden")) return;
  const {w,h,dpr}=canvasMetrics();
  if(w<10 || h<10) return;
  const nw=Math.round(w*dpr), nh=Math.round(h*dpr);
  if(drawState.canvas.width!==nw || drawState.canvas.height!==nh){
    drawState.canvas.width=nw;
    drawState.canvas.height=nh;
  }
  redrawCanvas();
}

function redrawCanvas(){
  const c=drawState.canvas;
  const ctx=drawState.ctx;
  if(!c || !ctx) return;

  const rect=c.getBoundingClientRect();
  if(rect.width<1 || rect.height<1) return;

  const sx=c.width/rect.width, sy=c.height/rect.height;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,c.width,c.height);
  ctx.lineCap="round";
  ctx.lineJoin="round";

  for(const stroke of drawState.strokes){
    const pts=stroke.points||[];
    if(!pts.length) continue;

    ctx.strokeStyle=stroke.tool==="eraser"?"#ffffff":"#111827";
    const base=Math.max(1,Number(stroke.size)||4);

    if(pts.length===1){
      const p=pts[0];
      ctx.beginPath();
      ctx.arc(p.x*c.width,p.y*c.height,(base*sx)/2,0,Math.PI*2);
      ctx.fillStyle=ctx.strokeStyle;
      ctx.fill();
      continue;
    }

    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], b=pts[i];
      const pressure=stroke.tool==="pen" ? Math.max(.45,(a.p+b.p)/2) : 1;
      ctx.lineWidth=base*sx*(stroke.tool==="pen" ? (0.75+0.5*pressure) : 2.4);
      ctx.beginPath();
      ctx.moveTo(a.x*c.width,a.y*c.height);
      ctx.lineTo(b.x*c.width,b.y*c.height);
      ctx.stroke();
    }
  }
}

function undoDrawing(){
  if(!drawState.strokes.length) return;
  drawState.redo.push(drawState.strokes.pop());
  redrawCanvas();
  saveDrawing();
  updateDrawButtons();
}

function redoDrawing(){
  if(!drawState.redo.length) return;
  drawState.strokes.push(drawState.redo.pop());
  redrawCanvas();
  saveDrawing();
  updateDrawButtons();
}

function clearDrawing(){
  if(!drawState.strokes.length) return;
  if(!confirm("Clear your handwritten solution for this question?")) return;
  drawState.redo.push(...drawState.strokes.splice(0));
  redrawCanvas();
  saveDrawing();
  updateDrawButtons();
}

function updateDrawButtons(){
  const u=document.getElementById("undoDrawBtn");
  const r=document.getElementById("redoDrawBtn");
  if(u) u.disabled=!drawState.strokes.length;
  if(r) r.disabled=!drawState.redo.length;
}

function togglePadExpand(){
  const panel=document.getElementById("solutionPad");
  panel.classList.toggle("expanded");
  const expanded=panel.classList.contains("expanded");
  document.getElementById("padExpandBtn").textContent=expanded?"Collapse":"Expand";
  requestAnimationFrame(resizeCanvasAndRedraw);
  if(expanded) panel.scrollIntoView({behavior:"smooth",block:"start"});
}

let statusTimer=null;
function setDrawStatus(text){
  const el=document.getElementById("drawStatus");
  if(!el) return;
  el.textContent=text;
  clearTimeout(statusTimer);
  statusTimer=setTimeout(()=>{ if(el) el.textContent="Ready to write."; },1800);
}

init();
