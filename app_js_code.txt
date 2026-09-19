
const LETTERS=["A","B","C","D"];
let manifest=[],deck=null,idx=0;
const $=id=>document.getElementById(id);

async function init(){
  manifest=await fetch("decks/index.json").then(r=>r.json());
  renderLibrary(manifest);

  $("search").addEventListener("input",e=>{
    const s=e.target.value.toLowerCase();
    renderLibrary(manifest.filter(d=>(d.title+" "+d.subject+" "+d.description).toLowerCase().includes(s)));
  });

  $("backBtn").onclick=()=>{
    $("studyView").classList.add("hidden");
    $("libraryView").classList.remove("hidden");
  };

  $("prevBtn").onclick=()=>{ if(idx>0){ idx--; renderQuestion(); } };
  $("nextBtn").onclick=()=>{ if(deck && idx<deck.questions.length-1){ idx++; renderQuestion(); } };
  $("revealBtn").onclick=()=>reveal();
  $("resetBtn").onclick=resetDeck;
  $("askBtn").onclick=askAI;
  $("clearChatBtn").onclick=()=>{$("chat").innerHTML='<div class="msg ai">Chat cleared.</div>';};

  ensureDrawingPadUI();
}

function renderLibrary(items){
  $("library").innerHTML=items.map(d=>`
    <article class="deck">
      <h3>${esc(d.title)}</h3>
      <div class="meta">${esc(d.subject)} · ${d.count} cards</div>
      <p>${esc(d.description)}</p>
      <button class="btn primary" onclick="openDeck('${d.file}')">Study deck</button>
    </article>`).join("");
}

async function openDeck(file){
  deck=await fetch(file).then(r=>r.json());
  idx=0;
  $("libraryView").classList.add("hidden");
  $("studyView").classList.remove("hidden");
  $("deckTitle").textContent=deck.title;
  $("totalCount").textContent=deck.questions.length;
  renderQuestion();
}

function progressKey(){ return "flashlib:"+deck.id; }
function state(){ return JSON.parse(localStorage.getItem(progressKey())||"{}"); }
function save(s){ localStorage.setItem(progressKey(),JSON.stringify(s)); }

function renderQuestion(){
  const q=deck.questions[idx], s=state(), r=s[q.n];

  $("qTitle").textContent=`Question ${q.n} · Card ${idx+1} of ${deck.questions.length}`;
  $("qImage").src="data:image/jpeg;base64,"+q.img;

  $("choices").innerHTML=LETTERS.map(l=>{
    let c="choice";
    if(r && q.correct && l===q.correct) c+=" correct";
    if(r && r.answer===l && q.correct && l!==q.correct) c+=" wrong";
    if(r && !q.correct && r.answer===l) c+=" ungraded";
    return `<button class="${c}" ${r?"disabled":""} onclick="answer('${l}')">${l}</button>`;
  }).join("");

  if(r){
    $("explain").classList.remove("hidden");
    if(q.correct){
      $("explain").innerHTML=
        `<strong>${r.correct?"✓ Correct":"✕ Incorrect"}</strong><br>
         Correct answer: <strong>${q.correct}</strong><br><br>${esc(q.solution)}`;
    }else{
      $("explain").innerHTML=
        `<strong>⚠ Not graded</strong><br>
         The printed source/data do not support one clean A–D answer.<br><br>${esc(q.solution)}`;
    }
  }else{
    $("explain").classList.add("hidden");
    $("explain").innerHTML="";
  }

  $("prevBtn").disabled=idx===0;
  $("nextBtn").disabled=idx===deck.questions.length-1;

  updateStats();
  configureDrawingPadForQuestion();
}

function answer(letter){
  const q=deck.questions[idx], s=state();
  if(s[q.n]) return;
  s[q.n]={
    answer:letter,
    correct:q.correct ? letter===q.correct : null,
    revealed:false
  };
  save(s);
  renderQuestion();
}

function reveal(){
  const q=deck.questions[idx], s=state();
  if(s[q.n]) return;
  s[q.n]={
    answer:null,
    correct:q.correct ? false : null,
    revealed:true
  };
  save(s);
  renderQuestion();
}

function updateStats(){
  if(!deck) return;
  const s=state();
  let c=0,w=0,a=0;
  Object.values(s).forEach(r=>{
    a++;
    if(r.correct===true) c++;
    if(r.correct===false) w++;
  });
  $("correctCount").textContent=c;
  $("wrongCount").textContent=w;
  $("answeredCount").textContent=a;
}

function resetDeck(){
  if(confirm("Reset answer progress for this deck? Your handwritten solution-pad drawings will be kept.")){
    localStorage.removeItem(progressKey());
    renderQuestion();
  }
}

async function askAI(){
  if(!deck) return;
  const endpoint=(window.FLASHCARD_APP_CONFIG||{}).aiEndpoint;
  const prompt=$("askBox").value.trim();
  if(!prompt) return;

  msg("user",prompt);
  $("askBox").value="";

  if(!endpoint){
    msg("ai","AI is not connected yet. Deploy the included backend and put its URL in config.js.");
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
          correct:q.correct,
          solution:q.solution
        }
      })
    });
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||"Request failed");
    msg("ai",data.answer||"No answer returned.");
    $("aiStatus").textContent="";
  }catch(e){
    msg("ai","AI request failed: "+e.message);
    $("aiStatus").textContent="Connection error.";
  }
}

function msg(type,text){
  const d=document.createElement("div");
  d.className="msg "+type;
  d.textContent=text;
  $("chat").appendChild(d);
  $("chat").scrollTop=$("chat").scrollHeight;
}

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
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
