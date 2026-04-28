// ═══════════════════════════════════════════════════════════════════════════
//  SHARED
// ═══════════════════════════════════════════════════════════════════════════
const g   = id => parseFloat(document.getElementById(id).value);
const sv  = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
const f   = (v,d=2) => isNaN(v)?'—':parseFloat(v).toFixed(d);
const css = prop => getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
const isDark = () => document.documentElement.getAttribute('data-theme')==='dark';
const DEF={s_od:'120',s_len:'60',s_slots:'12',r_poles:'2',r_od:'76',airgap:'0.8',skew:'10',turns:'80',wire_d:'0.80',v_rated:'230',i_rated:'4.0',freq:'50',v_app:'230',i_app:'4.0',pf:'0.92','mode-tgt':'800'};

function switchAppTab(id, btn){
  document.querySelectorAll('.app-panel').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.atb').forEach(b=>b.classList.remove('on'));
  const targetId = id === '3d' ? 'tab3d' : (id === 'formulas' ? 'tabformulas' : 'tab2');
  document.getElementById(targetId).classList.add('on');
  btn.classList.add('on');
  if(id==='3d') { resize3d(); }
  else if(id==='lab') { setTimeout(()=>Object.values(CH).forEach(c=>c&&c.resize()),30); }
}

document.getElementById('btn-theme').addEventListener('click',()=>{
  document.documentElement.setAttribute('data-theme',isDark()?'light':'dark');
  dlRun(); draw3dScene();
});
document.getElementById('btn-reset').addEventListener('click',()=>{
  Object.entries(DEF).forEach(([id,val])=>{
    const el=document.getElementById(id);if(!el)return;
    el.value=val;
    const out=document.getElementById(id+'_v');
    if(out){const dec=el.step?.includes('.')?el.step.split('.')[1].length:0;out.textContent=parseFloat(val).toFixed(dec);}
  });
  setMode('cfm');dlRun();
});

// wire all range inputs in tab2 (with rotor/stator constraint)
document.querySelectorAll('#sb input[type=range]').forEach(inp=>{
  inp.addEventListener('input',()=>{
    // enforce rotor + 2*gap + 4 <= stator
    const rodEl=document.getElementById('r_od'),sodEl=document.getElementById('s_od'),gapEl=document.getElementById('airgap');
    if(rodEl&&sodEl&&gapEl){
      const rod=parseFloat(rodEl.value),sod=parseFloat(sodEl.value),ag=parseFloat(gapEl.value);
      const minSod=rod+2*ag+4;
      if(sod<minSod){sodEl.value=Math.min(parseFloat(sodEl.max),Math.ceil(minSod));document.getElementById('s_od_v').textContent=parseFloat(sodEl.value).toFixed(0);}
    }
    const dec=inp.step?.includes('.')?inp.step.split('.')[1].length:0;
    const out=document.getElementById(inp.id+'_v');
    if(out) out.textContent=parseFloat(inp.value).toFixed(dec);
    dlRun();
  });
});
// wire tab1 sliders (with rotor/stator constraint)
document.querySelectorAll('#ctrl3d input[type=range]').forEach(inp=>{
  inp.addEventListener('input',()=>{
    // enforce rotor + 2*gap + 4 <= stator
    const rodEl=document.getElementById('c3-rod'),sodEl=document.getElementById('c3-sod'),gapEl=document.getElementById('c3-gap');
    if(rodEl&&sodEl&&gapEl){
      const rod=parseFloat(rodEl.value),sod=parseFloat(sodEl.value),ag=parseFloat(gapEl.value);
      const minSod=rod+2*ag+4;
      if(sod<minSod){sodEl.value=Math.min(parseFloat(sodEl.max),Math.ceil(minSod));document.getElementById('c3-sod_v').textContent=parseFloat(sodEl.value).toFixed(0);}
    }
    const dec=inp.step?.includes('.')?inp.step.split('.')[1].length:0;
    const out=document.getElementById(inp.id+'_v');
    if(out) out.textContent=parseFloat(inp.value).toFixed(dec);
    run3dPhysics(); draw3dScene(); update3dMiniCharts();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 1 — 3D ENGINE
// ═══════════════════════════════════════════════════════════════════════════
let scene, camera, renderer, motorGroup;
let exploded=false, cutaway=false, showLabels=true;
let labelEls=[];
let labelData=[];
let rotorAngle=0;
let animId=null;
let mode3d='cfm';
let P3={};

// orbit state
let orbit={active:false,startX:0,startY:0,theta:0.6,phi:1.0,radius:3.0,panX:0,panY:0,rightBtn:false};

function init3d(){
  const canvas=document.getElementById('canvas3d');
  const vp=document.getElementById('viewport3d');

  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled=true;

  scene=new THREE.Scene();

  camera=new THREE.PerspectiveCamera(45,1,0.01,100);
  updateCameraFromOrbit();

  // lights
  const amb=new THREE.AmbientLight(0xffffff,0.5);
  scene.add(amb);
  const dir=new THREE.DirectionalLight(0xffffff,1.0);
  dir.position.set(3,5,4);
  dir.castShadow=true;
  scene.add(dir);
  const dir2=new THREE.DirectionalLight(0x8899ff,0.4);
  dir2.position.set(-3,-2,2);
  scene.add(dir2);

  // orbit controls (manual)
  canvas.addEventListener('mousedown',e=>{orbit.active=true;orbit.startX=e.clientX;orbit.startY=e.clientY;orbit.rightBtn=e.button===2;});
  window.addEventListener('mouseup',()=>{orbit.active=false;});
  window.addEventListener('mousemove',e=>{
    if(!orbit.active)return;
    const dx=e.clientX-orbit.startX, dy=e.clientY-orbit.startY;
    orbit.startX=e.clientX; orbit.startY=e.clientY;
    if(orbit.rightBtn){orbit.panX-=dx*0.005;orbit.panY+=dy*0.005;}
    else{orbit.theta-=dx*0.008;orbit.phi=Math.max(0.2,Math.min(Math.PI-0.2,orbit.phi+dy*0.008));}
    updateCameraFromOrbit();
  });
  canvas.addEventListener('wheel',e=>{orbit.radius=Math.max(0.8,Math.min(8,orbit.radius+e.deltaY*0.005));updateCameraFromOrbit();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  resize3d();
  window.addEventListener('resize',resize3d);

  build3dMotor();
  animate3d();
  run3dPhysics();
  update3dMiniCharts();
}

function resize3d(){
  const vp=document.getElementById('viewport3d');
  const w=vp.clientWidth, h=vp.clientHeight;
  if(!renderer||w<1||h<1)return;
  renderer.setSize(w,h);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

function updateCameraFromOrbit(){
  if(!camera)return;
  const x=orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.theta);
  const y=orbit.radius*Math.cos(orbit.phi);
  const z=orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.theta);
  camera.position.set(x+orbit.panX,y+orbit.panY,z);
  camera.lookAt(orbit.panX,orbit.panY,0);
}

function setView(v,btn){
  document.querySelectorAll('[id^=vbtn-]').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  if(v==='front') {orbit.theta=0;orbit.phi=Math.PI/2;}
  else if(v==='side') {orbit.theta=Math.PI/2;orbit.phi=Math.PI/2;}
  else if(v==='top')  {orbit.theta=0;orbit.phi=0.05;}
  orbit.panX=0;orbit.panY=0;orbit.radius=3;
  updateCameraFromOrbit();
}

function toggleExplode(btn){
  exploded=!exploded;btn.classList.toggle('on',exploded);
  build3dMotor();
}
function toggleCutaway(btn){
  cutaway=!cutaway;btn.classList.toggle('on',cutaway);
  build3dMotor();
}
function toggleLabels(btn){
  showLabels=!showLabels;btn.classList.toggle('on',showLabels);
  document.querySelectorAll('.lbl3d').forEach(l=>l.style.opacity=showLabels?'1':'0');
}
function set3dMode(m,btn){
  mode3d=m;
  document.querySelectorAll('[id^=c3m-]').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const lbl=document.getElementById('c3m-lbl');
  const inp=document.getElementById('c3-tgt');
  const out=document.getElementById('c3-tgt_v');
  if(m==='cfm')   {lbl.textContent='Target CFM';    inp.min=100;inp.max=2000;inp.step=50; inp.value=800;}
  if(m==='torque'){lbl.textContent='Target τ (N·m)';inp.min=0.1;inp.max=5.5; inp.step=0.1;inp.value=0.8;}
  if(m==='speed') {lbl.textContent='Target n (rpm)';inp.min=100;inp.max=3800;inp.step=50; inp.value=1200;}
  const dec=inp.step.includes('.')?inp.step.split('.')[1].length:0;
  out.textContent=parseFloat(inp.value).toFixed(dec);
  run3dPhysics(); update3dMiniCharts();
}

// ── BUILD 3D MOTOR ──────────────────────────────────────────────────────────
function build3dMotor(){
  if(motorGroup){scene.remove(motorGroup);}
  motorGroup=new THREE.Group();
  scene.add(motorGroup);
  labelData=[];
  document.getElementById('labels3d').innerHTML='';
  labelEls=[];

  const SOD = (g('c3-sod')||120)/200;
  const ROD = (g('c3-rod')||76)/200;
  const SL  = (g('c3-slen')||60)/200;
  const nSlots = g('c3-slots')||12;
  const nPoles = (g('c3-poles')||2)*2;
  const gapNorm = (g('c3-gap')||0.8)/200;
  const c3Turns = g('c3-turns')||80;
  const c3WireD = g('c3-wired')||0.8;
  const EX  = exploded ? 1.0 : 0;

  const dark=isDark();
  const STEEL_COL  = dark?0x37474f:0x607d8b;
  const TOOTH_COL  = dark?0x263238:0x455a64;
  const WIND_COL   = dark?0x1565c0:0x4a90e2;
  const PLATE_COL  = dark?0x546e7a:0x78909c;
  const ROTOR_COL  = dark?0x546e7a:0x90a4ae;
  const MAG_N_COL  = dark?0x1565c0:0x42a5f5;
  const MAG_S_COL  = dark?0xb71c1c:0xef5350;
  const SHAFT_COL  = dark?0x9e9e9e:0xbdbdbd;
  const BEAR_OUT   = dark?0x757575:0x9e9e9e;
  const BEAR_IN    = dark?0x616161:0x757575;

  function mat(col,rough=0.4,metal=0.3){
    return new THREE.MeshStandardMaterial({color:col,roughness:rough,metalness:metal,side:cutaway?THREE.DoubleSide:THREE.FrontSide});
  }

  // ── SHAFT ──
  const shaftR=0.04;
  const shaftLen=SL*2+0.5+EX*1.6;
  const shaftGeo=new THREE.CylinderGeometry(shaftR,shaftR,shaftLen,20);
  const shaft=new THREE.Mesh(shaftGeo,mat(SHAFT_COL,0.2,0.9));
  shaft.rotation.x=Math.PI/2;
  motorGroup.add(shaft);
  addLabel(shaft,'Shaft',[0,shaftR+0.05,SL+0.25+EX*0.4]);

  // ── BEARINGS — cylindrical ring style ──
  [-1,1].forEach((side,i)=>{
    const bPos=side*(SL+0.015+EX*0.65);
    const outerGeo=new THREE.CylinderGeometry(shaftR*3.2,shaftR*3.2,0.04,24);
    const outer=new THREE.Mesh(outerGeo,mat(BEAR_OUT,0.25,0.7));
    outer.rotation.x=Math.PI/2; outer.position.z=bPos;
    motorGroup.add(outer);
    const innerGeo=new THREE.CylinderGeometry(shaftR*1.6,shaftR*1.6,0.045,24);
    const inner=new THREE.Mesh(innerGeo,mat(BEAR_IN,0.2,0.8));
    inner.rotation.x=Math.PI/2; inner.position.z=bPos;
    motorGroup.add(inner);
    if(i===0)addLabel(outer,'Bearing',[shaftR*5,0,bPos]);
  });

  // ── ROTOR GROUP ──
  const rotorGroup=new THREE.Group();
  rotorGroup.position.z=EX*0.4;
  motorGroup.add(rotorGroup);
  rotorGroup.userData.isRotor=true;

  const rcGeo=new THREE.CylinderGeometry(ROD,ROD,SL*1.9,36,1,cutaway);
  const rotor=new THREE.Mesh(rcGeo,mat(ROTOR_COL,0.5,0.4));
  rotor.rotation.x=Math.PI/2;
  rotorGroup.add(rotor);
  addLabel(rotor,'Rotor core',[ROD+0.08,0,-SL*0.5]);

  for(let i=0;i<nPoles;i++){
    const ang=i/nPoles*Math.PI*2;
    const isN=i%2===0;
    const magW=(2*Math.PI/nPoles)*0.72;
    const magGeo=new THREE.CylinderGeometry(ROD+0.015,ROD+0.015,SL*1.7,6,1,false,ang-magW/2,magW);
    const mag=new THREE.Mesh(magGeo,mat(isN?MAG_N_COL:MAG_S_COL,0.6,0.1));
    mag.rotation.x=Math.PI/2;
    rotorGroup.add(mag);
    if(i===0)addLabel(mag,'N-pole magnet',[ROD+0.07,0,SL*0.6]);
    if(i===1)addLabel(mag,'S-pole magnet',[-ROD-0.07,0,SL*0.6]);
  }

  // ── STATOR GROUP ──
  const statorGroup=new THREE.Group();
  motorGroup.add(statorGroup);

  const yokeGeo=new THREE.CylinderGeometry(SOD,SOD,SL*2,36,1,cutaway,0,cutaway?Math.PI:Math.PI*2);
  const yoke=new THREE.Mesh(yokeGeo,mat(STEEL_COL,0.5,0.3));
  yoke.rotation.x=Math.PI/2;
  statorGroup.add(yoke);
  addLabel(yoke,'Stator yoke',[-SOD-0.05,0,0]);

  const innerR=ROD+gapNorm+0.01;
  const boreGeo=new THREE.CylinderGeometry(innerR,innerR,SL*2.02,36,1,true);
  const bore=new THREE.Mesh(boreGeo,mat(TOOTH_COL,0.6,0.1));
  bore.rotation.x=Math.PI/2;
  statorGroup.add(bore);

  // Stator teeth + visible windings
  const toothDepth=(SOD-innerR)*0.75;
  const windScale=Math.min(1,c3Turns/80)*(c3WireD/0.8);
  const windThick=Math.max(0.008,0.025*windScale);
  for(let i=0;i<nSlots;i++){
    const ang=i/nSlots*Math.PI*2;
    const toothW=(2*Math.PI/nSlots)*0.45;
    const slotW=(2*Math.PI/nSlots)*0.50;

    const tGeo=new THREE.CylinderGeometry(innerR+toothDepth,innerR+toothDepth,SL*1.8,6,1,false,ang-toothW/2,toothW);
    const tooth=new THREE.Mesh(tGeo,mat(TOOTH_COL,0.5,0.2));
    tooth.rotation.x=Math.PI/2;
    statorGroup.add(tooth);

    // Winding body in slot
    const wR=innerR+toothDepth+windThick;
    const wCoil=new THREE.CylinderGeometry(wR,wR,SL*1.6,6,1,false,ang-slotW/2,slotW);
    const winding=new THREE.Mesh(wCoil,mat(WIND_COL,0.7,0.05));
    winding.rotation.x=Math.PI/2;
    statorGroup.add(winding);

    // End-winding overhang (front & rear)
    [-1,1].forEach(side=>{
      const ewGeo=new THREE.CylinderGeometry(wR,innerR+toothDepth*0.5,0.04+windThick*2,6,1,false,ang-slotW/2,slotW);
      const ew=new THREE.Mesh(ewGeo,mat(WIND_COL,0.7,0.05));
      ew.rotation.x=Math.PI/2;
      ew.position.z=side*(SL*0.85+0.03);
      statorGroup.add(ew);
    });
    if(i===0)addLabel(winding,'Stator winding',[SOD*0.6,SOD*0.6,0]);
    if(i===1)addLabel(tooth,'Stator tooth',[SOD*0.7,SOD*0.2,SL]);
  }
  addLabel(yoke,'Lamination stack',[0,SOD+0.08,0]);

  // ── END PLATES ──
  [-1,1].forEach((side,i)=>{
    const pGeo=new THREE.CylinderGeometry(SOD*0.98,SOD*0.98,0.025,36,1,cutaway,0,cutaway?Math.PI:Math.PI*2);
    const plate=new THREE.Mesh(pGeo,mat(PLATE_COL,0.3,0.5));
    plate.rotation.x=Math.PI/2;
    plate.position.z=side*(SL+0.012+EX*0.8);
    motorGroup.add(plate);
    if(i===0)addLabel(plate,'End plate (rear)',[-SOD*0.5,SOD*0.5,plate.position.z-0.05]);
    if(i===1)addLabel(plate,'End plate (front)',[SOD*0.5,SOD*0.5,plate.position.z+0.05]);
  });

  // ── LAMINATION STACK INDICATOR ──
  for(let j=-2;j<=2;j++){
    const lGeo=new THREE.CylinderGeometry(SOD+0.001,SOD+0.001,0.002,36,1,true);
    const lm=new THREE.Mesh(lGeo,mat(dark?0x1a1a2e:0xeceff1,0.8,0.0));
    lm.rotation.x=Math.PI/2;
    lm.position.z=j*(SL/2.5);
    statorGroup.add(lm);
  }

  buildLabelEls();
}

function addLabel(mesh,text,offset){
  labelData.push({mesh,text,offset:new THREE.Vector3(...offset)});
}

function buildLabelEls(){
  const container=document.getElementById('labels3d');
  container.innerHTML='';labelEls=[];
  labelData.forEach(ld=>{
    const el=document.createElement('div');
    el.className='lbl3d';
    el.textContent=ld.text;
    el.style.opacity=showLabels?'1':'0';
    container.appendChild(el);
    labelEls.push(el);
  });
}

function updateLabels(){
  if(!camera||!renderer)return;
  const vp=document.getElementById('viewport3d');
  const W=vp.clientWidth, H=vp.clientHeight;
  const v3=new THREE.Vector3();
  labelData.forEach((ld,i)=>{
    v3.copy(ld.offset);
    // project to screen
    v3.project(camera);
    const sx=(v3.x*0.5+0.5)*W;
    const sy=(-v3.y*0.5+0.5)*H;
    const el=labelEls[i];
    if(!el)return;
    // hide if behind camera
    if(v3.z>1){el.style.display='none';return;}
    el.style.display='block';
    el.style.left=sx+'px';
    el.style.top=sy+'px';
    el.style.opacity=showLabels?'1':'0';
  });
}

// ── 3D ANIMATE ──────────────────────────────────────────────────────────────
function animate3d(){
  animId=requestAnimationFrame(animate3d);
  const rpm=Math.max(0,P3.op_rpm||0);
  rotorAngle+=rpm/60/60*2*Math.PI;
  motorGroup&&motorGroup.traverse(obj=>{
    if(obj.userData.isRotor) obj.rotation.z=rotorAngle;
  });

  renderer.render(scene,camera);
  updateLabels();
}

// ── 3D PHYSICS ───────────────────────────────────────────────────────────────
function run3dPhysics(){
  const p=g('c3-poles'), r_od=g('c3-rod'), s_od=g('c3-sod'), s_len=g('c3-slen');
  const freq=g('c3-f'), v_app=g('c3-v'), i_app=g('c3-i'), tgt=g('c3-tgt');
  const turns=g('c3-turns')||80, wd=g('c3-wired')||0.8, gap=g('c3-gap')||0.8, skew=10;
  const v_rated=230, i_rated=4.0, pf=0.92;

  const sync_rpm=(60*freq)/p;
  const rated_rpm=sync_rpm*0.96;
  const tau=Math.PI*(r_od/1000)/(2*p);
  const Lm=s_len/1000, rr=r_od/2/1000;
  const B_air=Math.min(1.70,v_app/(4.44*freq*turns*p*tau*Lm+1e-9))*0.85;
  const skew_f=Math.cos((skew*Math.PI/180)/2);
  const rho=1.72e-8, Aw=Math.PI*Math.pow(wd/2/1000,2);
  const Lmean=Math.PI*(rr+gap/1000+0.01)+2*Lm+0.04;
  const R_phase=(rho*turns*Lmean)/Aw;
  const Kt=(3*p*B_air*rr*Lm*turns*0.95)/Math.PI*skew_f;
  const v_ratio=v_app/v_rated;
  let op_rpm=Math.max(0,Math.min(sync_rpm,rated_rpm*v_ratio));

  let op_torq=Kt*i_app;
  if(mode3d==='cfm'){const rn=Math.max(0,Math.pow(Math.max(0,tgt)/800,1/3)*rated_rpm);op_rpm=Math.max(0,Math.min(op_rpm,rn));op_torq=Kt*i_rated*(op_rpm/Math.max(rated_rpm,1));}
  else if(mode3d==='torque'){op_torq=Math.min(tgt,Kt*i_app);}
  else if(mode3d==='speed'){op_rpm=Math.max(0,Math.min(tgt,op_rpm));op_torq=Kt*i_rated*(op_rpm/Math.max(rated_rpm,1));}

  const omega=op_rpm*2*Math.PI/60;
  const P_shaft=Math.max(0,op_torq*omega);
  const cu_loss=3*i_app*i_app*(R_phase/3);
  const fe_loss=0.003*B_air*B_air*freq*Math.pow(s_od/1000,2)*Lm*7650*50;
  const P_input=v_app*i_app*pf;
  const eta=P_input>1?Math.min(99,Math.max(0,P_shaft/P_input*100)):0;
  const op_cfm=Math.max(0,800*Math.pow(op_rpm/Math.max(rated_rpm,1),3));

  P3={sync_rpm,rated_rpm,op_rpm,omega,Kt,Ke:Kt,R_phase,B_air,skew_f,op_torq,P_shaft,cu_loss,fe_loss,P_input,eta,op_cfm,i_rated,i_app,pf,v_app,v_rated,freq,p};

  sv('m3-rpm',f(op_rpm,0));sv('m3-torq',f(op_torq,2));
  sv('m3-pw',f(P_shaft,0));sv('m3-eff',f(eta,1));
  sv('m3-cfm',f(op_cfm,0));sv('m3-cu',f(cu_loss,1));
}

// ── MINI CHARTS ──────────────────────────────────────────────────────────────
const MCH={};
const RPMS=Array.from({length:41},(_,i)=>i*100);

function initMiniCharts(){
  const opts=(xl,yl)=>({
    responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{display:false}},
    scales:{
      x:{type:'linear',min:0,max:4000,ticks:{color:css('--dim'),maxTicksLimit:5,font:{size:9}},grid:{color:'rgba(0,0,0,0.05)'},title:{display:true,text:xl,color:css('--dim'),font:{size:9}}},
      y:{min:0,ticks:{color:css('--dim'),maxTicksLimit:5,font:{size:9}},grid:{color:'rgba(0,0,0,0.05)'},title:{display:true,text:yl,color:css('--dim'),font:{size:9}}}
    }
  });
  MCH.tn =new Chart(document.getElementById('mg-tn'), {type:'scatter',data:{datasets:[{data:[],borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.1)',pointRadius:0,showLine:true,tension:0.3,fill:true,borderWidth:1.5},{data:[],borderColor:'#2563eb',backgroundColor:'#2563eb',pointRadius:7,showLine:false}]},options:{...opts('rpm','N·m'),scales:{...opts('rpm','N·m').scales,y:{...opts('rpm','N·m').scales.y,min:0,max:6}}}});
  MCH.eff=new Chart(document.getElementById('mg-eff'),{type:'scatter',data:{datasets:[{data:[],borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,.1)',pointRadius:0,showLine:true,tension:0.3,fill:true,borderWidth:1.5},{data:[],borderColor:'#16a34a',backgroundColor:'#16a34a',pointRadius:7,showLine:false}]},options:{...opts('rpm','%'),  scales:{...opts('rpm','%').scales,  y:{...opts('rpm','%').scales.y,  min:0,max:100}}}});
  MCH.cfm=new Chart(document.getElementById('mg-cfm'),{type:'scatter',data:{datasets:[{data:[],borderColor:'#d97706',backgroundColor:'rgba(217,119,6,.1)',pointRadius:0,showLine:true,tension:0.3,fill:true,borderWidth:1.5},{data:[],borderColor:'#d97706',backgroundColor:'#d97706',pointRadius:7,showLine:false}]},options:{...opts('rpm','cfm'),scales:{...opts('rpm','cfm').scales,y:{...opts('rpm','cfm').scales.y,min:0,max:2400}}}});
}

function update3dMiniCharts(){
  if(!MCH.tn||!P3.sync_rpm)return;
  const tn=RPMS.map(n=>({x:n,y:n>P3.sync_rpm?0:Math.max(0,P3.Kt*P3.i_rated*(1-Math.pow(n/Math.max(P3.sync_rpm,1),1.8))*P3.skew_f)}));
  const ef=RPMS.map(n=>{const om=n*2*Math.PI/60;const t=Math.max(0,P3.Kt*P3.i_rated*(1-Math.pow(n/Math.max(P3.sync_rpm,1),1.8))*P3.skew_f);const ps=t*om;const fe=P3.fe_loss*Math.pow(n/Math.max(P3.rated_rpm,1),1.5);const pin=ps+P3.cu_loss+fe;return{x:n,y:pin>1?Math.min(99,ps/pin*100):0};});
  const cf=RPMS.map(n=>({x:n,y:800*Math.pow(n/Math.max(P3.rated_rpm,1),3)}));
  MCH.tn.data.datasets[0].data=tn;
  MCH.tn.data.datasets[1].data=[{x:P3.op_rpm,y:P3.op_torq}];
  MCH.tn.update('none');
  MCH.eff.data.datasets[0].data=ef;
  MCH.eff.data.datasets[1].data=[{x:P3.op_rpm,y:P3.eta}];
  MCH.eff.update('none');
  MCH.cfm.data.datasets[0].data=cf;
  MCH.cfm.data.datasets[1].data=[{x:P3.op_rpm,y:P3.op_cfm}];
  MCH.cfm.update('none');
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 2 — DESIGN LAB
// ═══════════════════════════════════════════════════════════════════════════
const AX={rpm:{min:0,max:4000},torq:{min:0,max:6},eff:{min:0,max:100},cfm:{min:0,max:2400},ps:{min:0,max:1200},cur:{min:0,max:25},volt:{min:0,max:520},pow:{min:0,max:2000},fe:{min:0,max:300}};
const RPT=Array.from({length:41},(_,i)=>i*100);
const VPT=Array.from({length:27},(_,i)=>i*20);
const CPT=Array.from({length:26},(_,i)=>i);
let dlMode='cfm', DLC={};
const CH={};

function setMode(m){
  dlMode=m;
  ['cfm','torque','speed'].forEach(x=>document.getElementById('mb-'+x).classList.toggle('on',x===m));
  const lbl=document.getElementById('mode-lbl'),inp=document.getElementById('mode-tgt'),out=document.getElementById('mode-tgt_v');
  if(m==='cfm')   {lbl.textContent='Target CFM';       inp.min=100; inp.max=2000;inp.step=50; inp.value=800;}
  if(m==='torque'){lbl.textContent='Target τ (N·m)';   inp.min=0.1; inp.max=5.5; inp.step=0.1;inp.value=0.8;}
  if(m==='speed') {lbl.textContent='Target n (rpm)';   inp.min=100; inp.max=3800;inp.step=50; inp.value=1200;}
  const dec=inp.step.includes('.')?inp.step.split('.')[1].length:0;
  out.textContent=parseFloat(inp.value).toFixed(dec);
  dlRun();
}
document.getElementById('mode-tgt').addEventListener('input',()=>{
  const inp=document.getElementById('mode-tgt');
  const dec=inp.step?.includes('.')?inp.step.split('.')[1].length:0;
  document.getElementById('mode-tgt_v').textContent=parseFloat(inp.value).toFixed(dec);
  dlRun();
});

function dlPhysics(){
  const s_od=g('s_od'),s_len=g('s_len'),s_slots=g('s_slots');
  const p=g('r_poles'),r_od=g('r_od'),gap=g('airgap'),skew=g('skew');
  const turns=g('turns'),wd=g('wire_d');
  const freq=g('freq'),v_rated=g('v_rated'),i_rated=g('i_rated');
  const v_app=g('v_app'),i_app=g('i_app'),pf=g('pf'),tgt=g('mode-tgt');
  const sync_rpm=(60*freq)/p, rated_rpm=sync_rpm*0.96;
  const tau=Math.PI*(r_od/1000)/(2*p), Lm=s_len/1000, rr=r_od/2/1000;
  const B_peak=Math.min(1.70,v_rated/(4.44*freq*turns*p*tau*Lm+1e-9)), B_air=B_peak*0.85;
  const skew_f=Math.cos((skew*Math.PI/180)/2);
  const rho=1.72e-8, Aw=Math.PI*Math.pow(wd/2/1000,2);
  const Lmean=Math.PI*(rr+gap/1000+0.01)+2*Lm+0.04;
  const R_phase=(rho*turns*Lmean)/Aw;
  const Kt=(3*p*B_air*rr*Lm*turns*0.95)/Math.PI*skew_f, Ke=Kt;
  const v_ratio=v_app/v_rated;
  let op_rpm=Math.max(0,Math.min(sync_rpm,rated_rpm*v_ratio));
  const omega=op_rpm*2*Math.PI/60, back_emf=Ke*omega;
  let op_torq=Kt*i_app;
  if(dlMode==='cfm'){const rn=Math.max(0,Math.pow(Math.max(0,tgt)/800,1/3)*rated_rpm);const a=Math.max(0,Math.min(op_rpm,rn));op_torq=Kt*i_rated*(a/Math.max(rated_rpm,1));}
  else if(dlMode==='torque'){op_torq=Math.min(tgt,Kt*i_app);}
  else if(dlMode==='speed'){op_torq=Kt*i_rated*(Math.min(tgt,op_rpm)/Math.max(op_rpm,1));}
  const P_shaft=Math.max(0,op_torq*omega);
  const cu_loss=3*i_app*i_app*(R_phase/3);
  const fe_loss=0.003*B_air*B_air*freq*Math.pow(s_od/1000,2)*Lm*7650*50;
  const P_input=v_app*i_app*pf;
  const eta=P_input>1?Math.min(99,Math.max(0,P_shaft/P_input*100)):0;
  const slot_area=Math.PI*Math.pow((s_od-r_od-2*gap)/4,2)*((r_od/2+gap/2)*2*Math.PI/s_slots)*0.65;
  const Aw_mm2=Aw*1e6, fill=(turns*Aw_mm2)/Math.max(slot_area,0.1);
  const cu_vol=turns*s_slots*Lmean*Aw, cu_mass=cu_vol*8960*1000;
  const op_cfm=800*Math.pow(op_rpm/Math.max(rated_rpm,1),3);
  const temp_rise=cu_loss/(10*(Math.PI*(s_od/1000)*(s_len/1000)+0.01));
  DLC={s_od,s_len,s_slots,p,r_od,gap,skew,turns,wd,freq,v_rated,i_rated,v_app,i_app,pf,tgt,sync_rpm,rated_rpm,op_rpm,omega,B_peak,B_air,skew_f,R_phase,Aw,Aw_mm2,Lmean,Kt,Ke,back_emf,op_torq,P_shaft,cu_loss,fe_loss,P_input,eta,slot_area,fill,cu_vol,cu_mass,op_cfm,temp_rise,v_ratio,tau,rr,Lm};
}

// curves
function tnC(){return RPT.map(n=>{if(n>DLC.sync_rpm)return{x:n,y:0};return{x:n,y:Math.max(0,DLC.Kt*DLC.i_rated*(1-Math.pow(n/Math.max(DLC.sync_rpm,1),1.8))*DLC.skew_f)}});}
function effC(){return RPT.map(n=>{const om=n*2*Math.PI/60,t=Math.max(0,DLC.Kt*DLC.i_rated*(1-Math.pow(n/Math.max(DLC.sync_rpm,1),1.8))*DLC.skew_f),ps=t*om,fe=DLC.fe_loss*Math.pow(n/Math.max(DLC.rated_rpm,1),1.5),pin=ps+DLC.cu_loss+fe;return{x:n,y:pin>1?Math.min(99,ps/pin*100):0};});}
function cfmC(){return RPT.map(n=>({x:n,y:800*Math.pow(n/Math.max(DLC.rated_rpm,1),3)}));}
function psC() {return RPT.map(n=>{const om=n*2*Math.PI/60,t=Math.max(0,DLC.Kt*DLC.i_rated*(1-Math.pow(n/Math.max(DLC.sync_rpm,1),1.8))*DLC.skew_f);return{x:n,y:t*om};});}
function tiC() {return CPT.map(i=>({x:i,y:DLC.Kt*i}));}
function feC() {return RPT.map(n=>({x:n,y:DLC.fe_loss*Math.pow(n/Math.max(DLC.rated_rpm,1),1.5)}));}
function vsC() {return VPT.map(v=>({x:v,y:DLC.rated_rpm*(v/Math.max(DLC.v_rated,1))*0.96}));}
function pvC() {return VPT.map(v=>({x:v,y:v*DLC.i_app*DLC.pf}));}
function tvC() {return VPT.map(v=>({x:v,y:DLC.Kt*DLC.i_app*(v/Math.max(DLC.v_rated,1))}));}
function evC() {return VPT.map(v=>{const n=DLC.rated_rpm*(v/Math.max(DLC.v_rated,1)),om=n*2*Math.PI/60,t=Math.max(0,DLC.Kt*DLC.i_app*(v/Math.max(DLC.v_rated,1))),ps=t*om,pin=v*DLC.i_app*DLC.pf;return{x:v,y:pin>1?Math.min(99,ps/pin*100):0};});}

function axO(xd,yd,xl,yl){
  const tc=css('--muted'),gc=isDark()?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)';
  return{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},
    scales:{x:{type:'linear',min:xd.min,max:xd.max,ticks:{color:tc,maxTicksLimit:7,font:{size:9}},grid:{color:gc},title:{display:!!xl,text:xl,color:tc,font:{size:9}}},
            y:{type:'linear',min:yd.min,max:yd.max,ticks:{color:tc,maxTicksLimit:6,font:{size:9}},grid:{color:gc},title:{display:!!yl,text:yl,color:tc,font:{size:9}}}}};
}
function mkCh(id,col,xd,yd,xl,yl){
  const ctx=document.getElementById(id);if(!ctx)return null;
  return new Chart(ctx,{type:'scatter',data:{datasets:[{data:[],borderColor:col,backgroundColor:col+'18',pointRadius:0,showLine:true,tension:0.3,borderWidth:1.5,fill:true}]},options:axO(xd,yd,xl,yl)});
}
function initDLCharts(){
  const ac=css('--accent'),gr=css('--green'),am=css('--amber'),re=css('--red');
  CH.op=new Chart(document.getElementById('ch-op'),{type:'scatter',data:{datasets:[{data:[],borderColor:isDark()?'#2a3a5a':'#c8d8f0',backgroundColor:'transparent',pointRadius:0,showLine:true,tension:0.3,borderWidth:1.5,fill:false},{data:[],borderColor:ac,backgroundColor:ac,pointRadius:8,showLine:false}]},options:axO(AX.rpm,AX.torq,'Speed (rpm)','N·m')});
  CH.loss=new Chart(document.getElementById('ch-loss'),{type:'bar',data:{labels:['Cu','Fe','Shaft'],datasets:[{data:[0,0,0],backgroundColor:[re+'aa',am+'aa',gr+'aa'],borderWidth:0,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:css('--muted'),font:{size:9}},grid:{color:isDark()?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)'}},y:{min:0,max:800,ticks:{color:css('--muted'),font:{size:9}},grid:{color:isDark()?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)'},title:{display:true,text:'W',color:css('--muted'),font:{size:9}}}}}});
  CH.tn    =mkCh('ch-tn',    ac,    AX.rpm,AX.torq,'rpm','N·m');
  CH.eff   =mkCh('ch-eff',   gr,    AX.rpm,AX.eff, 'rpm','%');
  CH.cfmspd=mkCh('ch-cfmspd',am,    AX.rpm,AX.cfm, 'rpm','cfm');
  CH.pspd  =mkCh('ch-pspd',  '#8b5cf6',AX.rpm,AX.ps,'rpm','W');
  CH.ti    =mkCh('ch-ti',    am,    AX.cur,AX.torq,'A','N·m');
  CH.fe    =mkCh('ch-fe',    re,    AX.rpm,AX.fe,  'rpm','W');
  CH.vsag  =mkCh('ch-vsag',  re,    AX.volt,AX.rpm,'V','rpm');
  CH.pv    =mkCh('ch-pv',    ac,    AX.volt,AX.pow,'V','W');
  CH.tv    =mkCh('ch-tv',    gr,    AX.volt,AX.torq,'V','N·m');
  CH.effv  =mkCh('ch-effv',  am,    AX.volt,AX.eff, 'V','%');
}
function updDLCharts(){
  if(CH.op){CH.op.data.datasets[0].data=tnC();CH.op.data.datasets[1].data=[{x:DLC.op_rpm,y:DLC.op_torq}];CH.op.update('none');}
  if(CH.loss){CH.loss.data.datasets[0].data=[DLC.cu_loss,DLC.fe_loss,DLC.P_shaft];const mx=Math.max(DLC.cu_loss+DLC.fe_loss+DLC.P_shaft,10)*1.2;CH.loss.options.scales.y.max=Math.ceil(mx/50)*50;CH.loss.update('none');}
  [[CH.tn,tnC],[CH.eff,effC],[CH.cfmspd,cfmC],[CH.pspd,psC],[CH.ti,tiC],[CH.fe,feC],[CH.vsag,vsC],[CH.pv,pvC],[CH.tv,tvC],[CH.effv,evC]].forEach(([ch,fn])=>{if(ch){ch.data.datasets[0].data=fn();ch.update('none');}});
}

// ── 2D CROSS SECTION (DPR-aware) ────────────────────────────────────────────
function drawMotor2d(){
  const canvas=document.getElementById('motor-canvas');
  const dpr=window.devicePixelRatio||1;
  const W=canvas.width/dpr, H=canvas.height/dpr;
  let ctx=canvas.getContext('2d');

  // ensure DPR scaling applied once
  if(!canvas._dprSet){
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    canvas.style.width=W+'px';canvas.style.height=H+'px';
    ctx.scale(dpr,dpr);canvas._dprSet=true;
  }
  ctx.clearRect(0,0,W,H);

  const dark=isDark(),C=DLC;
  if(!C.s_od)return;
  const cx=W/2,cy=H/2;
  const scale=(Math.min(W,H)*.44)/(C.s_od/2);
  const Rs=(C.s_od/2)*scale,Rr=(C.r_od/2)*scale,Rg=(C.r_od/2+C.gap)*scale,Ry=Rg+(Rs-Rg)*.75;
  const ns=C.s_slots,pitch=2*Math.PI/ns,sAng=pitch*.55;

  ctx.beginPath();ctx.arc(cx,cy,Rs,0,2*Math.PI,false);ctx.arc(cx,cy,Ry,0,2*Math.PI,true);
  ctx.fillStyle=dark?'#2a3a4a':'#b0bec5';ctx.fill('evenodd');
  for(let i=0;i<ns;i++){
    const center=i*pitch-Math.PI/2;
    ctx.beginPath();ctx.arc(cx,cy,Ry,center-sAng/2,center+sAng/2,false);ctx.arc(cx,cy,Rg,center+sAng/2,center-sAng/2,true);ctx.closePath();
    ctx.fillStyle=C.fill>0.68?dark?'#7f1d1d':'#ffcdd2':C.fill>0.55?dark?'#78350f':'#fff3e0':dark?'#134e4a':'#e0f2f1';ctx.fill();
    const t1=center+sAng/2,t2=center+pitch-sAng/2;
    if(t2>t1+.001){ctx.beginPath();ctx.arc(cx,cy,Ry,t1,t2,false);ctx.arc(cx,cy,Rg,t2,t1,true);ctx.closePath();ctx.fillStyle=dark?'#1e2d3d':'#90a4ae';ctx.fill();}
  }
  const gw=Math.max(1.5,C.gap*scale*1.8);
  ctx.beginPath();ctx.arc(cx,cy,(Rg+Rr)/2,0,2*Math.PI);
  ctx.strokeStyle=dark?'rgba(96,165,250,.2)':'rgba(37,99,235,.15)';ctx.lineWidth=gw;ctx.stroke();
  const np=2*C.p;
  for(let i=0;i<np;i++){
    const a1=i/np*2*Math.PI-Math.PI/2,a2=(i+1)/np*2*Math.PI-Math.PI/2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,Rr*.96,a1,a2,false);ctx.closePath();
    ctx.fillStyle=i%2===0?dark?'#1e3a5f':'#bbdefb':dark?'#5f1e1e':'#ffcdd2';ctx.fill();
    if(Rr>18){
      const mid=(a1+a2)/2;
      ctx.fillStyle=i%2===0?(dark?'#93c5fd':'#1565c0'):(dark?'#fca5a5':'#b71c1c');
      ctx.font=`600 ${Math.max(7,Math.min(11,Rr*.22))}px 'Plus Jakarta Sans',sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i%2===0?'N':'S',cx+Math.cos(mid)*Rr*.62,cy+Math.sin(mid)*Rr*.62);
    }
  }
  ctx.beginPath();ctx.arc(cx,cy,Rr,0,2*Math.PI);ctx.strokeStyle=dark?'#2e3448':'#bdbdbd';ctx.lineWidth=1;ctx.stroke();
  const sr=Math.max(3,Rr*.12);ctx.beginPath();ctx.arc(cx,cy,sr,0,2*Math.PI);ctx.fillStyle=dark?'#374151':'#9e9e9e';ctx.fill();
  if(C.skew>0){const sk=(C.skew*Math.PI/180)/2;ctx.save();ctx.strokeStyle=dark?'rgba(251,191,36,.7)':'rgba(180,83,9,.6)';ctx.lineWidth=1.2;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(cx+sr*Math.cos(-Math.PI/2-sk),cy+sr*Math.sin(-Math.PI/2-sk));ctx.lineTo(cx+Rr*.9*Math.cos(-Math.PI/2+sk),cy+Rr*.9*Math.sin(-Math.PI/2+sk));ctx.stroke();ctx.setLineDash([]);ctx.restore();}
  // labels — crisp because DPR is correct
  ctx.font=`400 9px 'Plus Jakarta Sans',sans-serif`;ctx.textAlign='left';ctx.textBaseline='top';
  ctx.fillStyle=dark?'#4b5563':'#9e9e9e';
  ctx.fillText(`Ø${C.s_od}·${C.s_slots} slots`,3,2);
  ctx.fillText(`Ø${C.r_od}·${np}p·${C.gap}mm gap`,3,13);
}

function drawSlot2d(id,autoW){
  const canvas=document.getElementById(id);if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  if(autoW){
    const pw=canvas.parentElement?.clientWidth||640;
    const ph=parseInt(canvas.getAttribute('height')||'72');
    canvas.width=Math.round(pw*dpr);canvas.height=Math.round(ph*dpr);
    canvas.style.width=pw+'px';canvas.style.height=ph+'px';
  }
  const W=canvas.width/dpr,H=canvas.height/dpr;
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const dark=isDark();
  ctx.fillStyle=dark?'#1f1f23':'#f5f4f0';ctx.fillRect(0,0,W,H);
  const r=Math.min(6,Math.max(1.2,(DLC.wd/2)*5));
  const pd=4,cols=Math.floor((W-pd)/(r*2+1.5)),rows=Math.floor((H-pd)/(r*2+1.5));
  const cap=cols*rows,shown=Math.min(DLC.turns,cap);
  const wc=DLC.fill>0.68?(dark?'#ef4444':'#ef4444'):DLC.fill>0.55?(dark?'#fbbf24':'#d97706'):(dark?'#60a5fa':'#2563eb');
  for(let i=0;i<shown;i++){const col=i%cols,row=Math.floor(i/cols);ctx.beginPath();ctx.arc(pd+col*(r*2+1.5)+r,pd+row*(r*2+1.5)+r,r,0,2*Math.PI);ctx.fillStyle=wc;ctx.fill();}
  sv(id==='slot-mini'?'wind-stat':'slot-big-info',`${DLC.turns} turns · Ø${DLC.wd}mm · ${(DLC.fill*100).toFixed(0)}% fill · R=${DLC.R_phase.toFixed(2)}Ω${DLC.turns>cap?` (${cap} shown)`:''}`);
}

function setEq(id,expr,val,cls=''){
  const row=document.getElementById('eq-'+id);if(!row)return;
  document.getElementById('eq-'+id+'-e').textContent=expr;
  document.getElementById('eq-'+id+'-v').textContent=val;
  row.className='eq'+(cls?' '+cls:'');
}
function updEqs(){
  setEq('ns',`60·${DLC.freq}/${DLC.p}`,`${f(DLC.sync_rpm,0)} rpm`);
  setEq('emf',`${f(DLC.Ke,3)}·${f(DLC.omega,1)} rad/s`,`${f(DLC.back_emf,1)} V`,DLC.back_emf>DLC.v_app*.95?'err':'');
  setEq('kt',`${f(DLC.Kt,3)}·${f(DLC.i_app,1)} A`,`${f(DLC.op_torq,3)} N·m`);
  setEq('r',`ρ·N·Lmean/Aw`,`${f(DLC.R_phase,3)} Ω`);
  setEq('cu',`3·${f(DLC.i_app,1)}²·${f(DLC.R_phase/3,3)}`,`${f(DLC.cu_loss,1)} W`,DLC.cu_loss>200?'warn':'');
  setEq('eff',`${f(DLC.P_shaft,0)}/${f(DLC.P_input,0)} W`,`${f(DLC.eta,1)} %`,DLC.eta<50?'err':DLC.eta<70?'warn':'ok');
  setEq('fill',`${DLC.turns}·${f(DLC.Aw_mm2,3)}/${f(DLC.slot_area,1)}mm²`,`${f(DLC.fill,3)}`,DLC.fill>0.70?'err':DLC.fill>0.55?'warn':'');
  setEq('cfm',`800·(${f(DLC.op_rpm,0)}/${f(DLC.rated_rpm,0)})³`,`${f(DLC.op_cfm,0)} cfm`);
}
function updKPIs(){
  sv('k-rpm',f(DLC.op_rpm,0));sv('k-torq',f(DLC.op_torq,2));sv('k-ps',f(DLC.P_shaft,0));sv('k-eff',f(DLC.eta,1));sv('k-cfm',f(DLC.op_cfm,0));sv('k-pin',f(DLC.P_input,0));
  sv('i-b',f(DLC.B_air,3));sv('i-emf',f(DLC.back_emf,1));sv('i-kt',f(DLC.Kt,4));sv('i-ns',f(DLC.sync_rpm,0));sv('i-r',f(DLC.R_phase,3));sv('i-cu',f(DLC.cu_loss,1));sv('i-fe',f(DLC.fe_loss,1));sv('i-tr',f(DLC.temp_rise,1));sv('i-fill',f(DLC.fill*100,1)+'%');sv('i-cm',f(DLC.cu_mass,1));
  sv('e-pin',f(DLC.P_input,0));sv('e-va',f(DLC.v_app*DLC.i_app,0));sv('e-vr',f(DLC.v_ratio*100,1));sv('e-ir',f(DLC.i_app/DLC.i_rated*100,1));sv('e-sag',f((1-DLC.v_ratio)*100,1));sv('e-ol',DLC.i_app>DLC.i_rated*1.1?'YES':'No');
  sv('g-sa',f(DLC.slot_area,1));sv('g-wc',f(DLC.Aw_mm2,4));sv('g-ff',f(DLC.fill*100,1)+'%');sv('g-ml',f(DLC.Lmean*1000,1));sv('g-tl',f(DLC.turns*DLC.s_slots*DLC.Lmean,1));sv('g-cv',f(DLC.cu_vol*1e6,2));sv('g-cm',f(DLC.cu_mass,1));sv('g-dl',f(DLC.s_od/DLC.s_len,2));sv('g-agr',f(DLC.gap/DLC.r_od*100,2));sv('g-sp',f(DLC.s_slots/DLC.p,1));sv('g-ss',f(DLC.sync_rpm,0));sv('g-tau',f(DLC.tau*1000,2));sv('g-r',f(DLC.R_phase,3));sv('g-sk',f(DLC.skew_f,4));
}
function updAlerts(){
  const a=[];
  if(DLC.B_air>1.6)a.push({t:'Flux saturation',c:'err'});
  if(DLC.fill>0.70)a.push({t:'Slot overfill',c:'err'});else if(DLC.fill>0.55)a.push({t:'Fill factor high',c:'warn'});
  if(DLC.temp_rise>80)a.push({t:'High temp rise',c:'err'});else if(DLC.temp_rise>50)a.push({t:'Moderate temp rise',c:'warn'});
  if(DLC.i_app>DLC.i_rated*1.1)a.push({t:'Overcurrent',c:'err'});
  if(DLC.v_ratio<0.85)a.push({t:'Voltage sag >15%',c:'warn'});
  if(DLC.r_od>=DLC.s_od-2*DLC.gap-4)a.push({t:'Rotor too large',c:'err'});
  if(DLC.back_emf>DLC.v_app*.95)a.push({t:'Back-EMF ≥ supply',c:'err'});
  if(a.length===0)a.push({t:'All parameters OK',c:'ok'});
  document.getElementById('alert-row').innerHTML=a.map(x=>`<span class="badge ${x.c}">${x.t}</span>`).join('');
}

function swTab(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  document.getElementById('p-'+id).classList.add('on');btn.classList.add('on');
  setTimeout(()=>Object.values(CH).forEach(c=>c&&c.resize()),20);
}

function dlRun(){
  dlPhysics();drawMotor2d();drawSlot2d('slot-mini',false);drawSlot2d('slot-big',true);
  updEqs();updKPIs();updAlerts();updDLCharts();
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded',()=>{
  // init slider display values
  document.querySelectorAll('input[type=range]').forEach(inp=>{
    const dec=inp.step?.includes('.')?inp.step.split('.')[1].length:0;
    const out=document.getElementById(inp.id+'_v');
    if(out) out.textContent=parseFloat(inp.value).toFixed(dec);
  });

  // Tab 2 charts
  initDLCharts();

  // Init 3D after short delay (allows Three.js to load)
  init3d();
  initMiniCharts();

  // Resize handle for left panel
  const resizeHandle=document.getElementById('ctrl3d-resize');
  const ctrlPanel=document.getElementById('ctrl3d');
  if(resizeHandle&&ctrlPanel){
    let resizing=false,startX=0,startW=0;
    resizeHandle.addEventListener('mousedown',e=>{resizing=true;startX=e.clientX;startW=ctrlPanel.offsetWidth;e.preventDefault();});
    window.addEventListener('mousemove',e=>{if(!resizing)return;const w=Math.max(220,Math.min(420,startW+(e.clientX-startX)));ctrlPanel.style.width=w+'px';ctrlPanel.style.minWidth=w+'px';});
    window.addEventListener('mouseup',()=>{if(resizing){resizing=false;resize3d();}});
  }

  // first compute
  dlPhysics();
  run3dPhysics();
  dlRun();
  update3dMiniCharts();
  draw3dScene();
});

function draw3dScene(){
  // rebuild motor with updated theme colors
  if(scene) build3dMotor();
}