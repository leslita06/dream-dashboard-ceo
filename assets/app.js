/* Dream Cosmetics · tableau de bord CEO (prototype) — toutes les données chargées depuis data/ */
(function(){
"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const MOISL=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const TYPES=["Invendus et retours","Périmés ou abîmés","Casse au transport","Impayés et créances douteuses","Écarts de stock"];
const TCOL=["#AE172A","#FF8087","#7A1020","#D9A43B","#82868A"];
const nf0=new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2});
function M(v){ // montant FCFA lisible
  if(v==null||isNaN(v)) return "—";
  const a=Math.abs(v);
  if(a>=1e9) return nf2.format(v/1e9)+" Md";
  if(a>=1e6) return nf1.format(v/1e6)+" M";
  if(a>=1e3) return nf0.format(v/1e3)+" k";
  return nf0.format(v);
}
const MF=v=>v==null||isNaN(v)?"—":M(v)+" FCFA";
const P=(v,d=1)=>v==null||!isFinite(v)?"—":(d?nf1:nf0).format(v*100)+" %";
const D=v=>v==null||!isFinite(v)?"—":(v>=0?"+":"−")+nf1.format(Math.abs(v)*100)+" %";
const cls=v=>v==null||!isFinite(v)?"":(v>=0?"up":"dn");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fdate=d=>d? d.getUTCDate()+" "+MOIS[d.getUTCMonth()]+" "+d.getUTCFullYear():"—";

async function csv(u){
  const r=await fetch(u); if(!r.ok) throw new Error(u);
  const t=(await r.text()).replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  const h=t[0].split(";");
  return t.slice(1).map(l=>{const c=l.split(";"),o={};h.forEach((k,i)=>o[k]=c[i]===undefined?"":c[i]);return o;});
}

let CFG,Z,EQ,G,PR,V,PE,OBJ,GEO,NB;
const S={gran:"A",per:"",cmp:true,zone:"",resp:"",comm:"",gross:"",univ:"",marq:"",mode:"ventes",types:new Set(TYPES),niv:"zone",sort:{k:"ca",asc:false},q:""};
let Y0,MAXMI,REF; // première année, dernier mois disponible (index), date d'arrêté
let A; // résultat des agrégats courants
const charts={};

/* ---------- chargement ---------- */
async function init(){
  const [cfg,zones,eq,gr,pr,ve,pe,ob,geo]=await Promise.all([
    fetch("data/config.json").then(r=>r.json()),csv("data/zones.csv"),csv("data/equipe.csv"),csv("data/grossistes.csv"),
    csv("data/produits.csv"),csv("data/ventes.csv"),csv("data/pertes.csv"),csv("data/objectifs.csv"),fetch("data/districts.geojson").then(r=>r.json())]);
  CFG=cfg; GEO=geo;
  NB=await fetch("data/voisins.geojson").then(r=>r.ok?r.json():null).catch(()=>null);
  if(cfg.fictif===false){const b=document.querySelector(".proto");if(b)b.remove();document.querySelector(".filtres").style.top="0";}
  Z=zones.map((z,i)=>({id:z.zone_id,nom:z.zone,col:z.couleur,i}));
  const zi=Object.fromEntries(Z.map(z=>[z.id,z.i]));
  EQ=eq.map((e,i)=>({id:e.commercial_id,nom:e.commercial,resp:e.responsable_zone,z:zi[e.zone_id],i}));
  const ci=Object.fromEntries(EQ.map(e=>[e.id,e.i]));
  const RESP=[...new Set(EQ.map(e=>e.resp))];
  EQ.forEach(e=>e.r=RESP.indexOf(e.resp));
  Z.forEach(z=>z.resp=[...new Set(EQ.filter(e=>e.z===z.i).map(e=>e.resp))].join(", "));
  G=gr.map((g,i)=>{const c=ci[g.commercial_id];return {id:g.grossiste_id,nom:g.grossiste,ville:g.ville,dist:g.district,z:zi[g.zone_id],lat:+g.latitude,lon:+g.longitude,c,r:EQ[c].r,i};});
  const gi=Object.fromEntries(G.map(g=>[g.id,g.i]));
  const UN=[...new Set(pr.map(p=>p.univers))].sort((a,b)=>a.localeCompare(b,"fr"));
  const MQ=[...new Set(pr.map(p=>p.marque))].sort((a,b)=>a.localeCompare(b,"fr"));
  PR=pr.map((p,i)=>({id:p.produit_id,nom:p.produit,marque:MQ.indexOf(p.marque),univ:UN.indexOf(p.univers),i}));
  PR.UN=UN; PR.MQ=MQ; PR.RESP=RESP;
  const pi=Object.fromEntries(PR.map(p=>[p.id,p.i]));
  REF=new Date((cfg.date_arrete||"")+"T00:00:00Z");
  Y0=Math.min(...ve.map(v=>+v.date.slice(0,4)));
  const n=ve.length;
  V={n,mi:new Int16Array(n),day:new Int32Array(n),g:new Int16Array(n),p:new Int16Array(n),q:new Float64Array(n),m:new Float64Array(n),o:new Int32Array(n)};
  const oid={};let no=0;
  ve.forEach((v,k)=>{const y=+v.date.slice(0,4),mo=+v.date.slice(5,7);
    V.mi[k]=(y-Y0)*12+mo-1; V.day[k]=Date.UTC(y,mo-1,+v.date.slice(8,10))/864e5;
    V.g[k]=gi[v.grossiste_id]??-1; V.p[k]=pi[v.produit_id]??-1; V.q[k]=+v.quantite||0; V.m[k]=+String(v.montant_ht).replace(",",".")||0;
    V.o[k]=oid[v.commande]??(oid[v.commande]=no++);});
  V.no=no;
  MAXMI=Math.max(...V.mi);
  const tix=Object.fromEntries(TYPES.map((t,i)=>[t,i]));
  PE=pe.map(p=>{const y=+p.date.slice(0,4),mo=+p.date.slice(5,7);
    return {mi:(y-Y0)*12+mo-1,g:gi[p.grossiste_id]??-1,t:tix[p.type_perte]??4,p:p.produit_id?(pi[p.produit_id]??-1):-1,m:+String(p.montant).replace(",",".")||0};}).filter(p=>p.g>=0);
  OBJ=ob.map(o=>({mi:(+o.mois.slice(0,4)-Y0)*12+(+o.mois.slice(5,7))-1,c:ci[o.commercial_id],m:+o.objectif_ht||0})).filter(o=>o.c!=null);
  $("#arrete").textContent="données arrêtées au "+fdate(REF);
  readHash(); buildFilters(); buildMap(); buildCharts(); bind();
  render();
  $("#chargement").classList.add("fin"); setTimeout(()=>$("#chargement").remove(),500);
}

/* ---------- périodes ---------- */
function periods(gran){
  const out=[], lastY=Y0+Math.floor(MAXMI/12);
  for(let y=lastY;y>=Y0;y--){
    if(gran==="A"){const part=(y===lastY&&MAXMI%12<11)?" (janv.–"+MOIS[MAXMI%12]+")":"";out.push(["A"+y,"Année "+y+part]);}
    if(gran==="T") for(let q=4;q>=1;q--){const a=(y-Y0)*12+(q-1)*3; if(a>MAXMI) continue;
      const part=(a+2>MAXMI)?" ("+MOIS[MAXMI%12]+(MAXMI>a?" inclus":"")+")":"";out.push(["T"+y+"-"+q,"T"+q+" "+y+(a+2>MAXMI?" (à fin "+MOIS[MAXMI%12]+")":"")]);}
    if(gran==="M") for(let m=12;m>=1;m--){const a=(y-Y0)*12+m-1; if(a>MAXMI) continue; out.push(["M"+y+"-"+m,MOISL[m-1]+" "+y]);}
  }
  return out;
}
function range(per){
  const t=per[0], y=+per.slice(1,5), x=+per.split("-")[1]||0; let a,b;
  if(t==="A"){a=(y-Y0)*12;b=a+11;} else if(t==="T"){a=(y-Y0)*12+(x-1)*3;b=a+2;} else {a=b=(y-Y0)*12+x-1;}
  b=Math.min(b,MAXMI); return [a,b,y];
}
const miLabel=mi=>MOIS[mi%12]+" "+(Y0+Math.floor(mi/12));
const miEnd=mi=>new Date(Date.UTC(Y0+Math.floor(mi/12),mi%12+1,0));

/* ---------- filtres ---------- */
function opt(sel,list,val,tous){
  sel.innerHTML=`<option value="">${tous}</option>`+list.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(val)?" selected":""}>${esc(l)}</option>`).join("");
  sel.classList.toggle("on",val!==""&&val!=null);
}
function buildFilters(){
  $("#f-gran").value=S.gran;
  const ps=periods(S.gran); if(!ps.find(p=>p[0]===S.per)) S.per=ps[0][0];
  $("#f-per").innerHTML=ps.map(([v,l])=>`<option value="${v}"${v===S.per?" selected":""}>${l}</option>`).join("");
  $("#f-cmp").checked=S.cmp;
  opt($("#f-zone"),Z.map(z=>[z.id,z.nom]),S.zone,"Toutes les zones");
  const resps=PR.RESP.map((r,i)=>[i,r]).filter(([i])=>!S.zone||EQ.some(e=>e.r===i&&Z[e.z].id===S.zone));
  if(S.resp!==""&&!resps.find(r=>String(r[0])===S.resp)) S.resp="";
  opt($("#f-resp"),resps.map(([i,r])=>[i,r+" · "+Z[EQ.find(e=>e.r===i).z].nom]),S.resp,"Tous");
  const comms=EQ.filter(e=>(!S.zone||Z[e.z].id===S.zone)&&(S.resp===""||e.r===+S.resp));
  if(S.comm&&!comms.find(e=>e.id===S.comm)) S.comm="";
  opt($("#f-comm"),comms.map(e=>[e.id,e.nom]),S.comm,"Tous");
  const gs=G.filter(g=>(!S.zone||Z[g.z].id===S.zone)&&(S.resp===""||g.r===+S.resp)&&(!S.comm||EQ[g.c].id===S.comm)).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
  if(S.gross&&!gs.find(g=>g.id===S.gross)) S.gross="";
  opt($("#f-gross"),gs.map(g=>[g.id,g.nom+" · "+g.ville]),S.gross,"Tous");
  opt($("#f-univ"),PR.UN.map((u,i)=>[i,u]),S.univ,"Tous");
  const mqs=PR.MQ.map((m,i)=>[i,m]).filter(([i])=>S.univ===""||PR.some(p=>p.marque===i&&p.univ===+S.univ));
  if(S.marq!==""&&!mqs.find(m=>String(m[0])===S.marq)) S.marq="";
  opt($("#f-marq"),mqs,S.marq,"Toutes");
  $("#raz").hidden=!(S.zone||S.resp!==""||S.comm||S.gross||S.univ!==""||S.marq!=="");
}
function writeHash(){
  const o={p:S.per,c:S.cmp?"":"0",z:S.zone,r:S.resp,co:S.comm,g:S.gross,u:S.univ,m:S.marq,v:S.mode==="ventes"?"":S.mode};
  const h=Object.entries(o).filter(([,v])=>v!==""&&v!=null).map(([k,v])=>k+"="+encodeURIComponent(v)).join("&");
  history.replaceState(null,"",h?"#"+h:location.pathname+location.search);
}
function readHash(){
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get("p")){S.per=h.get("p");S.gran=S.per[0];}
  if(h.get("c")==="0") S.cmp=false;
  S.zone=h.get("z")||"";S.resp=h.get("r")||"";S.comm=h.get("co")||"";S.gross=h.get("g")||"";S.univ=h.get("u")||"";S.marq=h.get("m")||"";
  if(["pertes","net"].includes(h.get("v"))) S.mode=h.get("v");
  const sv=+localStorage.getItem("dream-seuil"); if(sv) $("#seuil").value=sv;
}
function setF(k,v){S[k]=v;buildFilters();render();}

/* ---------- agrégats ---------- */
function compute(){
  const [a,b,y]=range(S.per), a1=a-12, b1=b-12;
  const gOK=G.map(g=>(!S.zone||Z[g.z].id===S.zone)&&(S.resp===""||g.r===+S.resp)&&(!S.comm||EQ[g.c].id===S.comm)&&(!S.gross||g.id===S.gross));
  const prodF=S.univ!==""||S.marq!=="";
  const pOK=PR.map(p=>(S.univ===""||p.univ===+S.univ)&&(S.marq===""||p.marque===+S.marq));
  const nG=G.length, ya=(y-Y0)*12;
  const R={a,b,y,a1,b1,gOK,prodF,hasPrev:a1>=0,
    gCa:new Float64Array(nG),gPrev:new Float64Array(nG),gOrd:new Int32Array(nG),gLast:new Float64Array(nG).fill(-1),
    gPe:new Float64Array(nG),gPePrev:new Float64Array(nG),gPeT:G.map(()=>new Float64Array(5)),
    univ:new Float64Array(PR.UN.length),marq:new Float64Array(PR.MQ.length),
    mois:new Float64Array(12),moisPrev:new Float64Array(12),peMois:TYPES.map(()=>new Float64Array(12)),peMoisCa:new Float64Array(12)};
  const seenO=new Uint8Array(V.no), refDay=Math.min(miEnd(b).getTime(),REF.getTime())/864e5;
  R.refDay=refDay;
  for(let k=0;k<V.n;k++){
    const g=V.g[k]; if(g<0) continue;
    const mi=V.mi[k];
    if(V.day[k]<=refDay&&V.day[k]>R.gLast[g]) R.gLast[g]=V.day[k];
    const p=V.p[k]; if(p<0||!pOK[p]) continue;
    const m=V.m[k];
    if(mi>=a&&mi<=b){ R.gCa[g]+=m; if(!seenO[V.o[k]]){seenO[V.o[k]]=1;R.gOrd[g]++;}
      if(gOK[g]){R.univ[PR[p].univ]+=m;R.marq[PR[p].marque]+=m;} }
    else if(mi>=a1&&mi<=b1) R.gPrev[g]+=m;
    if(gOK[g]){ if(mi>=ya&&mi<ya+12) R.mois[mi-ya]+=m; else if(mi>=ya-12&&mi<ya) R.moisPrev[mi-ya+12]+=m; }
  }
  for(const e of PE){
    if(!S.types.has(TYPES[e.t])) continue;
    if(prodF&&(e.p<0||!pOK[e.p])) continue;
    if(e.mi>=a&&e.mi<=b){R.gPe[e.g]+=e.m;R.gPeT[e.g][e.t]+=e.m;}
    else if(e.mi>=a1&&e.mi<=b1) R.gPePrev[e.g]+=e.m;
    if(gOK[e.g]&&e.mi>=ya&&e.mi<ya+12) R.peMois[e.t][e.mi-ya]+=e.m;
  }
  R.peMoisCa=R.mois;
  // objectifs : par commercial, uniquement sans filtre produit ni grossiste
  R.objOK=!prodF&&!S.gross&&R.a>=12;
  R.cObj=new Float64Array(EQ.length);R.cObjMois=new Float64Array(12);
  if(!prodF&&!S.gross) for(const o of OBJ){
    if(o.mi>=a&&o.mi<=b) R.cObj[o.c]+=o.m;
    const e=EQ[o.c],okc=(!S.zone||Z[e.z].id===S.zone)&&(S.resp===""||e.r===+S.resp)&&(!S.comm||e.id===S.comm);
    if(okc&&o.mi>=ya&&o.mi<ya+12) R.cObjMois[o.mi-ya]+=o.m;
  }
  R.objOK=!prodF&&!S.gross&&R.cObj.some(x=>x>0);
  // par zone / responsable / commercial (toujours sur tous les grossistes, la sélection est surlignée)
  const agg=(key,n)=>{const o=[...Array(n)].map(()=>({ca:0,prev:0,pe:0,pePrev:0,ord:0,nAct:0,obj:0,ok:false}));
    G.forEach(g=>{const x=o[key(g)];x.ca+=R.gCa[g.i];x.prev+=R.gPrev[g.i];x.pe+=R.gPe[g.i];x.pePrev+=R.gPePrev[g.i];x.ord+=R.gOrd[g.i];if(R.gCa[g.i]>0)x.nAct++;if(gOK[g.i])x.ok=true;});return o;};
  R.zones=agg(g=>g.z,Z.length); R.resps=agg(g=>g.r,PR.RESP.length); R.comms=agg(g=>g.c,EQ.length);
  EQ.forEach(e=>{R.comms[e.i].obj=R.cObj[e.i];R.resps[e.r].obj+=R.cObj[e.i];R.zones[e.z].obj+=R.cObj[e.i];});
  // totaux de la vue
  let ca=0,prev=0,pe=0,pePrev=0,ord=0,act=0,dorm=0,inScope=0;const dormL=[];
  G.forEach(g=>{if(!gOK[g.i])return;inScope++;ca+=R.gCa[g.i];prev+=R.gPrev[g.i];pe+=R.gPe[g.i];pePrev+=R.gPePrev[g.i];ord+=R.gOrd[g.i];if(R.gCa[g.i]>0)act++;
    if(R.gLast[g.i]>=0&&refDay-R.gLast[g.i]>30){dorm++;dormL.push(g);}});
  let obj=0; if(R.objOK) EQ.forEach(e=>{if((!S.zone||Z[e.z].id===S.zone)&&(S.resp===""||e.r===+S.resp)&&(!S.comm||e.id===S.comm)) obj+=R.cObj[e.i];});
  Object.assign(R,{ca,prev,pe,pePrev,ord,act,dorm,dormL,inScope,obj});
  return R;
}

/* ---------- carte ---------- */
let map,distLayer,bubLayer,zoneLbl=[];
function buildMap(){
  map=L.map("carte",{zoomControl:false,scrollWheelZoom:false,attributionControl:true,zoomSnap:.25,minZoom:6,maxZoom:12});
  L.control.zoom({position:"bottomright"}).addTo(map);
  map.attributionControl.setPrefix(false).addAttribution("Contours : geoBoundaries (CC BY 4.0)");
  if(NB) L.geoJSON(NB,{interactive:false,style:{fillColor:"#FFFFFF",fillOpacity:.75,color:"#D8CBC6",weight:1}}).addTo(map);
  if(NB) NB.features.forEach(f=>{const c=L.geoJSON(f).getBounds().getCenter();const pos={"Ghana":[7.6,-1.6],"Liberia":[6.6,-9.6],"Guinée":[9.3,-9.2],"Mali":[11.2,-7.0],"Burkina Faso":[11.0,-3.8]}[f.properties.pays]||[c.lat,c.lng];
    L.marker(pos,{interactive:false,icon:L.divIcon({className:"pays-lbl",html:esc(f.properties.pays),iconSize:null})}).addTo(map);});
  map.createPane("bulles").style.zIndex=450;
  map.createPane("villes").style.zIndex=460;map.getPane("villes").style.pointerEvents="none";
  distLayer=L.geoJSON(GEO,{style:()=>({}),onEachFeature:(f,l)=>{
    l.on("click",()=>{const z=f.properties.zone;setF("zone",S.zone===z?"":z);});
    l.on("mouseover",()=>l.setStyle({weight:2.2,color:"#16070A"}));
    l.on("mouseout",()=>styleDist());
  }}).addTo(map);
  L.marker([4.25,-5.6],{interactive:false,icon:L.divIcon({className:"ocean-lbl",html:"Golfe de Guinée",iconSize:null})}).addTo(map);
  bubLayer=L.layerGroup().addTo(map);
  // grandes villes (repères)
  [["Abidjan",5.36,-4.01],["Bouaké",7.69,-5.03],["Yamoussoukro",6.83,-5.29],["Daloa",6.88,-6.45],["San-Pédro",4.75,-6.64],["Korhogo",9.46,-5.63],["Man",7.41,-7.55],["Bondoukou",8.04,-2.80],["Odienné",9.51,-7.57],["Gagnoa",6.13,-5.95]]
    .forEach(([n,la,lo])=>L.marker([la,lo],{interactive:false,pane:"villes",icon:L.divIcon({className:"ville-lbl",html:"<span>"+esc(n)+"</span>",iconSize:null,iconAnchor:[-8,6]})}).addTo(map));
  fitView(true);
  $$("#mode button").forEach(b=>{b.classList.toggle("on",b.dataset.m===S.mode);b.onclick=()=>{S.mode=b.dataset.m;$$("#mode button").forEach(x=>x.classList.toggle("on",x===b));renderMap();writeHash();};});
}
function fitView(first){
  let bnds=null;
  if(S.zone){distLayer.eachLayer(l=>{if(l.feature.properties.zone===S.zone) bnds=bnds?bnds.extend(l.getBounds()):L.latLngBounds(l.getBounds().getSouthWest(),l.getBounds().getNorthEast());});}
  if(!bnds) bnds=distLayer.getBounds();
  map.fitBounds(bnds,{padding:[30,30],animate:!first});
}
function ramp(t){ // 0..1 -> crème -> rose -> rouge -> nuit
  const st=[[251,236,232],[255,128,135],[174,23,42],[22,7,10]];t=Math.max(0,Math.min(1,t))*(st.length-1);
  const i=Math.min(Math.floor(t),st.length-2),f=t-i,c=st[i].map((v,k)=>Math.round(v+(st[i+1][k]-v)*f));return `rgb(${c})`;
}
function styleDist(){
  const R=A, zv=R.zones;
  let val, lo, hi;
  if(S.mode==="pertes"){val=z=>zv[z].ca?zv[z].pe/zv[z].ca:0;}
  else if(S.mode==="net"){val=z=>zv[z].ca-zv[z].pe;}
  const zi=Object.fromEntries(Z.map(z=>[z.id,z.i]));
  if(val){const vs=Z.map(z=>val(z.i));lo=Math.min(...vs);hi=Math.max(...vs);}
  distLayer.eachLayer(l=>{
    const z=zi[l.feature.properties.zone], sel=S.zone===l.feature.properties.zone, dim=S.zone&&!sel;
    let fill=Z[z].col, op=sel?.42:.2;
    if(val){fill=ramp(S.mode==="pertes"?(val(z)-lo)/((hi-lo)||1)*.9+.08:.15+(val(z)-lo)/((hi-lo)||1)*.75);op=sel?.8:.62;}
    l.setStyle({fillColor:fill,fillOpacity:dim?op*.35:op,color:sel?"#16070A":"#ffffff",weight:sel?2.4:1.2,opacity:1});
    const zz=zv[z];
    l.bindTooltip(`<b>${esc(l.feature.properties.district)}</b> · zone ${esc(Z[z].nom)}<br>Ventes de la zone : ${MF(zz.ca)}<br>Pertes : ${MF(zz.pe)} <span class="m">(${P(zz.ca?zz.pe/zz.ca:null)})</span><br>Net après pertes : ${MF(zz.ca-zz.pe)}`,{className:"tt",sticky:true});
  });
  // légende
  const leg=$("#carte-leg");
  if(S.mode==="ventes") leg.innerHTML="<h4>Zones commerciales</h4>"+Z.map(z=>`<div class="z" data-z="${z.id}"><i style="background:${z.col}"></i>${esc(z.nom)}</div>`).join("")+`<div style="margin-top:6px;color:var(--doux)">Taille des bulles : chiffre d'affaires du grossiste</div>`;
  else if(S.mode==="pertes") leg.innerHTML=`<h4>Taux de perte par zone</h4><div class="grad" style="background:linear-gradient(90deg,${ramp(.08)},${ramp(.5)},${ramp(.98)})"></div><div class="gl"><span>${P(lo)}</span><span>${P(hi)}</span></div><div style="margin-top:6px;color:var(--doux)">Bulles : pertes du grossiste, couleur selon son taux</div>`;
  else leg.innerHTML=`<h4>Ventes nettes des pertes</h4><div class="grad" style="background:linear-gradient(90deg,${ramp(.15)},${ramp(.5)},${ramp(.9)})"></div><div class="gl"><span>${MF(lo)}</span><span>${MF(hi)}</span></div><div style="margin-top:6px;color:var(--doux)">Bulles : net après pertes du grossiste</div>`;
  $$("#carte-leg .z").forEach(d=>d.onclick=()=>setF("zone",S.zone===d.dataset.z?"":d.dataset.z));
}
function renderMap(){
  styleDist(); bubLayer.clearLayers();
  const R=A, v=g=>S.mode==="pertes"?R.gPe[g.i]:S.mode==="net"?R.gCa[g.i]-R.gPe[g.i]:R.gCa[g.i];
  const mx=Math.max(1,...G.map(v));
  const order=[...G].sort((x,y)=>v(y)-v(x));
  for(const g of order){
    const val=v(g); if(val<=0&&S.mode!=="ventes") continue;
    const r=Math.max(3.5,Math.sqrt(Math.max(val,0)/mx)*26), ok=R.gOK[g.i];
    let col=Z[g.z].col; const tx=R.gCa[g.i]?R.gPe[g.i]/R.gCa[g.i]:0;
    if(S.mode==="pertes") col=ramp(Math.min(1,tx/.09));
    const c=L.circleMarker([g.lat,g.lon],{pane:"bulles",radius:r,color:"#fff",weight:1.3,fillColor:col,fillOpacity:ok?.86:.18,opacity:ok?1:.3});
    const ev=R.hasPrev&&R.gPrev[g.i]?R.gCa[g.i]/R.gPrev[g.i]-1:null;
    c.bindTooltip(`<b>${esc(g.nom)}</b><br>${esc(g.ville)} · ${esc(Z[g.z].nom)}<br>Ventes : ${MF(R.gCa[g.i])}${S.cmp&&ev!=null?` <span class="m">(${D(ev)} vs N-1)</span>`:""}<br>Pertes : ${MF(R.gPe[g.i])} <span class="m">(${P(R.gCa[g.i]?tx:null)})</span><br>Commercial : ${esc(EQ[g.c].nom)}`,{className:"tt",direction:"top",offset:[0,-r]});
    c.on("click",e=>{L.DomEvent.stopPropagation(e);openFiche(g.i);});
    c.addTo(bubLayer);
  }
}

/* ---------- zones (panneau) ---------- */
function renderZones(){
  const R=A, mx=Math.max(...R.zones.map(z=>z.ca),1);
  $("#panneau-sous").textContent="Chiffre d'affaires, évolution, objectif et pertes · "+$("#f-per").selectedOptions[0].text;
  $("#zones").innerHTML=Z.map(z=>({z,x:R.zones[z.i]})).sort((p,q)=>q.x.ca-p.x.ca).map(({z,x})=>{
    const ev=R.hasPrev&&x.prev?x.ca/x.prev-1:null, at=R.objOK&&x.obj?x.ca/x.obj:null, tx=x.ca?x.pe/x.ca:null;
    return `<div class="zr${S.zone===z.id?" on":""}" data-z="${z.id}"><div class="n"><i style="background:${z.col}"></i>${esc(z.nom)}</div><div class="v">${MF(x.ca)}</div>
    <div class="s"><span>${esc(z.resp)}</span><span>${S.cmp&&ev!=null?`<b class="${cls(ev)}">${D(ev)}</b> · `:""}${at!=null?`objectif ${P(at,0)}`:x.nAct+" grossistes"}</span></div>
    <div class="s"><span>Pertes ${MF(x.pe)}</span><span class="${tx>seuil()?"dn":""}">${P(tx)}</span></div>
    <div class="bar"><span style="width:${x.ca/mx*100}%;background:${z.col}"></span></div></div>`;}).join("");
  $$("#zones .zr").forEach(d=>d.onclick=()=>setF("zone",S.zone===d.dataset.z?"":d.dataset.z));
}

/* ---------- KPI ---------- */
function renderKpis(){
  const R=A, ev=R.hasPrev&&R.prev?R.ca/R.prev-1:null, at=R.objOK&&R.obj?R.ca/R.obj:null, pan=R.ord?R.ca/R.ord:null;
  const tx=R.ca?R.pe/R.ca:null, txp=R.prev?R.pePrev/R.prev:null;
  const cmp=S.cmp&&R.hasPrev;
  const k=[
    `<div class="kpi hero"><div class="l">Chiffre d'affaires</div><div class="v">${M(R.ca)}<small>FCFA</small></div><div class="d">${cmp&&ev!=null?`<span class="${cls(ev)}">${D(ev)}</span> vs ${M(R.prev)} FCFA l'an dernier`:"hors taxes, sur la période"}</div></div>`,
    `<div class="kpi"><div class="l">Réalisé / objectif</div><div class="v">${at!=null?P(at,0):"—"}</div><div class="d">${at!=null?`objectif ${MF(R.obj)} · ${at>=1?'<span class="up">atteint</span>':`<span class="dn">manque ${M(R.obj-R.ca)}</span>`}`:R.prodF||S.gross?"objectifs fixés par commercial, tous produits":"pas d'objectif sur la période"}</div>${at!=null?`<div class="jauge"><span style="width:${Math.min(at,1)*100}%;background:${at>=1?"var(--vert)":"var(--rouge)"}"></span></div>`:""}</div>`,
    `<div class="kpi"><div class="l">Grossistes actifs</div><div class="v">${nf0.format(R.act)}<small>/ ${R.inScope}</small></div><div class="d">au moins une commande sur la période</div></div>`,
    `<div class="kpi"><div class="l">Panier moyen</div><div class="v">${M(pan)}<small>FCFA</small></div><div class="d">${nf0.format(R.ord)} commandes</div></div>`,
    `<div class="kpi"><div class="l">Sans commande depuis 30 jours</div><div class="v ${R.dorm?"dn":""}">${R.dorm}</div><div class="d">au ${fdate(new Date(R.refDay*864e5))}${R.dorm?` · <a href="#alertes" style="font-weight:600">voir la liste</a>`:""}</div></div>`,
    `<div class="kpi perte"><div class="l">Pertes</div><div class="v">${M(R.pe)}<small>FCFA</small></div><div class="d">${cmp&&R.pePrev?`<span class="${cls(-(R.pe/R.pePrev-1))}">${D(R.pe/R.pePrev-1)}</span> vs N-1`:"invendus, casse, impayés…"}</div></div>`,
    `<div class="kpi perte"><div class="l">Taux de perte</div><div class="v ${tx>seuil()?"dn":""}">${P(tx)}</div><div class="d">pertes / ventes${cmp&&txp!=null?` · ${P(txp)} l'an dernier`:""}</div></div>`,
    `<div class="kpi perte"><div class="l">Net après pertes</div><div class="v">${M(R.ca-R.pe)}<small>FCFA</small></div><div class="d">ventes moins pertes</div></div>`];
  $("#kpis").innerHTML=k.join("");
}

/* ---------- alertes ---------- */
const seuil=()=>(+$("#seuil").value)/100;
function renderAlertes(){
  const R=A, s=seuil();
  const baisse=G.filter(g=>R.gOK[g.i]&&R.gPrev[g.i]>500000&&R.gCa[g.i]/R.gPrev[g.i]-1<-.15).map(g=>({g,v:R.gCa[g.i]/R.gPrev[g.i]-1})).sort((a,b)=>a.v-b.v);
  const zs=R.objOK?Z.filter(z=>R.zones[z.i].obj&&R.zones[z.i].ca/R.zones[z.i].obj<.95).map(z=>({z,v:R.zones[z.i].ca/R.zones[z.i].obj})).sort((a,b)=>a.v-b.v):[];
  const cs=R.objOK?EQ.filter(e=>R.comms[e.i].obj&&R.comms[e.i].ca/R.comms[e.i].obj<.9).map(e=>({e,v:R.comms[e.i].ca/R.comms[e.i].obj})).sort((a,b)=>a.v-b.v):[];
  const zp=Z.filter(z=>R.zones[z.i].ca&&R.zones[z.i].pe/R.zones[z.i].ca>s).map(z=>({z,v:R.zones[z.i].pe/R.zones[z.i].ca})).sort((a,b)=>b.v-a.v);
  const box=(t,ic,list,html,vide)=>`<div class="al"><h4>${ic} ${t}<span class="cpt${list.length?"":" z"}">${list.length}</span></h4>${list.length?`<ul>${list.map(html).join("")}</ul>`:`<div class="vide">${vide}</div>`}</div>`;
  $("#alertes").innerHTML=
    box("Grossistes en forte baisse","↘",baisse,x=>`<li data-g="${x.g.i}"><span>${esc(x.g.nom)} <small style="color:var(--doux)">· ${esc(x.g.ville)}</small></span><span class="x dn">${D(x.v)}</span></li>`,R.hasPrev?"Aucun grossiste en recul de plus de 15 % sur un an.":"Pas d'année précédente à comparer.")+
    box("Zones sous l'objectif","◎",zs,x=>`<li data-z="${x.z.id}"><span>${esc(x.z.nom)}</span><span class="x dn">${P(x.v,0)}</span></li>`,R.objOK?"Toutes les zones sont à 95 % de l'objectif ou plus.":"Objectifs non disponibles pour ce filtre.")+
    box("Commerciaux en retard","⌛",cs,x=>`<li data-c="${x.e.id}"><span>${esc(x.e.nom)} <small style="color:var(--doux)">· ${esc(Z[x.e.z].nom)}</small></span><span class="x dn">${P(x.v,0)}</span></li>`,R.objOK?"Tous les commerciaux sont à 90 % de l'objectif ou plus.":"Objectifs non disponibles pour ce filtre.")+
    box("Zones au-dessus du seuil de perte","⚠",zp,x=>`<li data-z="${x.z.id}"><span>${esc(x.z.nom)}</span><span class="x dn">${P(x.v)}</span></li>`,`Aucune zone au-dessus de ${P(s)} de pertes.`);
  if(R.dorm){ $("#alertes").insertAdjacentHTML("beforeend",`<div class="al" style="grid-column:1/-1"><h4>⏸ Sans commande depuis plus de 30 jours<span class="cpt">${R.dorm}</span></h4><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));column-gap:20px">${R.dormL.sort((a,b)=>R.gLast[a.i]-R.gLast[b.i]).map(g=>`<li data-g="${g.i}"><span>${esc(g.nom)} <small style="color:var(--doux)">· ${esc(g.ville)}</small></span><span class="x">${Math.round(R.refDay-R.gLast[g.i])} j</span></li>`).join("")}</ul></div>`);}
  $$("#alertes li").forEach(li=>li.onclick=()=>{if(li.dataset.g)openFiche(+li.dataset.g);else if(li.dataset.z)setF("zone",li.dataset.z);else if(li.dataset.c)setF("comm",li.dataset.c);});
}

/* ---------- classements ---------- */
function rankHTML(items,onkey){
  const mx=Math.max(1,...items.map(x=>Math.max(x.ca,x.obj||0)));
  return items.map(x=>{const at=x.obj?x.ca/x.obj:null;
    return `<div class="row${x.on?" on":""}" data-k="${esc(x.key)}"><div class="nm">${esc(x.nom)}<small>${esc(x.sub)}</small></div>
    <div class="tr"><div class="b${at>=1?" ok":""}" style="width:${x.ca/mx*100}%"></div>${x.obj?`<div class="o" style="left:${x.obj/mx*100}%"></div>`:""}<span class="lb">${M(x.ca)}</span></div>
    <div class="pc ${at!=null?(at>=1?"up":at<.9?"dn":""):""}">${at!=null?P(at,0):"—"}<small>${x.obj?"obj. "+M(x.obj):"sans objectif"}</small></div></div>`;}).join("");
}
function renderRanks(){
  const R=A, ok=R.objOK;
  const rs=PR.RESP.map((r,i)=>{const x=R.resps[i],z=Z[EQ.find(e=>e.r===i).z];return {key:i,nom:r,sub:z.nom+" · "+EQ.filter(e=>e.r===i).length+" commerciaux",ca:x.ca,obj:ok?x.obj:0,on:S.resp===String(i)};})
    .sort((a,b)=>ok?(b.ca/b.obj)-(a.ca/a.obj):b.ca-a.ca);
  $("#rk-resp").innerHTML=rankHTML(rs);
  const scope=e=>(!S.zone||Z[e.z].id===S.zone)&&(S.resp===""||e.r===+S.resp);
  const cs=EQ.filter(scope).map(e=>{const x=R.comms[e.i];return {key:e.id,nom:e.nom,sub:Z[e.z].nom+" · "+G.filter(g=>g.c===e.i).length+" grossistes",ca:x.ca,obj:ok?x.obj:0,on:S.comm===e.id};})
    .sort((a,b)=>ok?(b.ca/b.obj)-(a.ca/a.obj):b.ca-a.ca);
  $("#rk-comm").innerHTML=rankHTML(cs);
  $("#rk-comm-sous").textContent=ok?"Classés par taux d'atteinte de l'objectif":"Classés par chiffre d'affaires (objectifs fixés tous produits confondus)";
  $$("#rk-resp .row").forEach(d=>d.onclick=()=>{S.zone="";setF("resp",S.resp===d.dataset.k?"":d.dataset.k);});
  $$("#rk-comm .row").forEach(d=>d.onclick=()=>setF("comm",S.comm===d.dataset.k?"":d.dataset.k));
}

/* ---------- graphiques ---------- */
function buildCharts(){
  Chart.defaults.font.family="Figtree, system-ui, sans-serif"; Chart.defaults.font.size=12; Chart.defaults.color="#6E5F62";
  Chart.defaults.plugins.legend.labels.boxWidth=10; Chart.defaults.plugins.legend.labels.boxHeight=10;
  Chart.defaults.plugins.tooltip.backgroundColor="#16070A"; Chart.defaults.plugins.tooltip.padding=10; Chart.defaults.plugins.tooltip.cornerRadius=10;
  Chart.defaults.maintainAspectRatio=false;
  const yM={ticks:{callback:v=>M(v)},grid:{color:"#F1E7E3"},border:{display:false}}, xg={grid:{display:false},border:{display:false}};
  const tipM={callbacks:{label:c=>" "+c.dataset.label+" : "+MF(c.raw)}};
  charts.mois=new Chart($("#ch-mois"),{data:{labels:MOIS,datasets:[
    {type:"bar",label:"Ventes",data:[],backgroundColor:[],borderRadius:6,order:2},
    {type:"line",label:"Année précédente",data:[],borderColor:"#82868A",borderDash:[5,4],pointRadius:0,borderWidth:2,tension:.3,order:1},
    {type:"line",label:"Objectif",data:[],borderColor:"#16070A",pointRadius:3,pointBackgroundColor:"#16070A",borderWidth:1.5,stepped:"middle",order:0}]},
    options:{scales:{y:yM,x:xg},plugins:{tooltip:tipM,legend:{position:"bottom"}}}});
  charts.univ=new Chart($("#ch-univ"),{type:"doughnut",data:{labels:[],datasets:[{data:[],backgroundColor:[],borderColor:"#fff",borderWidth:2}]},
    options:{cutout:"62%",plugins:{legend:{position:"bottom",labels:{font:{size:11.5}}},tooltip:{callbacks:{label:c=>" "+c.label+" : "+MF(c.raw)+" ("+P(c.raw/c.dataset.data.reduce((a,b)=>a+b,0))+")"}}},
      onClick:(e,el)=>{if(el.length){const u=PR.UN.indexOf(charts.univ.data.labels[el[0].index]);setF("univ",S.univ===String(u)?"":String(u));}}}});
  charts.marq=new Chart($("#ch-marq"),{type:"bar",data:{labels:[],datasets:[{label:"Ventes",data:[],backgroundColor:[],borderRadius:5}]},
    options:{scales:{y:yM,x:{...xg,ticks:{autoSkip:false,maxRotation:50,minRotation:0}}},plugins:{legend:{display:false},tooltip:tipM},
      onClick:(e,el)=>{if(el.length){const m=PR.MQ.indexOf(charts.marq.data.labels[el[0].index]);setF("marq",S.marq===String(m)?"":String(m));}}}});
  charts.types=new Chart($("#ch-types"),{type:"doughnut",data:{labels:TYPES,datasets:[{data:[],backgroundColor:TCOL,borderColor:"#fff",borderWidth:2}]},
    options:{cutout:"60%",plugins:{legend:{position:"bottom",labels:{font:{size:11}}},tooltip:{callbacks:{label:c=>" "+c.label+" : "+MF(c.raw)}}}}});
  charts.pertes=new Chart($("#ch-pertes"),{data:{labels:MOIS,datasets:[
    ...TYPES.map((t,i)=>({type:"bar",label:t,data:[],backgroundColor:TCOL[i],stack:"p",yAxisID:"y",order:2})),
    {type:"line",label:"Taux de perte",data:[],borderColor:"#16070A",backgroundColor:"#16070A",pointRadius:3,borderWidth:2,yAxisID:"y1",tension:.3,order:0}]},
    options:{scales:{x:{...xg,stacked:true},y:{...yM,stacked:true},y1:{position:"right",grid:{display:false},border:{display:false},ticks:{callback:v=>nf1.format(v*100)+" %"},beginAtZero:true}},
      plugins:{legend:{position:"bottom",labels:{font:{size:11}}},tooltip:{callbacks:{label:c=>" "+c.dataset.label+" : "+(c.dataset.yAxisID==="y1"?P(c.raw):MF(c.raw))}}}}});
  charts.net=new Chart($("#ch-net"),{type:"bar",data:{labels:[],datasets:[
    {label:"Net après pertes",data:[],backgroundColor:"#AE172A",borderRadius:4,stack:"s"},{label:"Pertes",data:[],backgroundColor:"#FF8087",borderRadius:4,stack:"s"}]},
    options:{indexAxis:"y",scales:{x:{...yM,stacked:true},y:{...xg,stacked:true}},plugins:{legend:{position:"bottom"},
      tooltip:{callbacks:{label:c=>" "+c.dataset.label+" : "+MF(c.raw),afterBody:it=>{const i=it[0].dataIndex,d=charts.net.data;const ca=d.datasets[0].data[i]+d.datasets[1].data[i];return "Taux de perte : "+P(ca?d.datasets[1].data[i]/ca:null);}}}},
      onClick:(e,el)=>{if(el.length){const z=Z.find(z=>z.nom===charts.net.data.labels[el[0].index]);setF("zone",S.zone===z.id?"":z.id);}}}});
}
function renderCharts(){
  const R=A, ya=(R.y-Y0)*12, n=Math.min(12,MAXMI-ya+1);
  const c=charts.mois;
  c.data.datasets[0].data=[...R.mois].slice(0,n);
  c.data.datasets[0].backgroundColor=c.data.datasets[0].data.map((_,i)=>ya+i>=R.a&&ya+i<=R.b?"#AE172A":"#F2C3C7");
  c.data.datasets[1].data=S.cmp&&ya>=12?[...R.moisPrev]:[];
  c.data.datasets[1].hidden=!(S.cmp&&ya>=12);
  const oo=[...R.cObjMois].slice(0,12); c.data.datasets[2].data=(!R.prodF&&!S.gross&&oo.some(x=>x))?oo:[];
  c.update();
  $("#evo-sous").textContent="Ventes "+R.y+(S.cmp&&ya>=12?" comparées à "+(R.y-1):"")+" · la période choisie est en rouge plein";
  const un=PR.UN.map((u,i)=>[u,R.univ[i]]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  const pal=["#AE172A","#FF8087","#7A1020","#D9A43B","#82868A","#E0606B","#C98B5E","#16070A","#F4B5B9","#5E6A75"];
  charts.univ.data.labels=un.map(x=>x[0]);charts.univ.data.datasets[0].data=un.map(x=>x[1]);
  charts.univ.data.datasets[0].backgroundColor=un.map((x,i)=>S.univ===""||PR.UN[+S.univ]===x[0]?pal[i%pal.length]:"#eadad6");charts.univ.update();
  const mq=PR.MQ.map((m,i)=>[m,R.marq[i]]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,20);
  charts.marq.data.labels=mq.map(x=>x[0]);charts.marq.data.datasets[0].data=mq.map(x=>x[1]);
  charts.marq.data.datasets[0].backgroundColor=mq.map((x,i)=>S.marq!==""&&PR.MQ[+S.marq]===x[0]?"#16070A":i<3?"#AE172A":"#E0606B");charts.marq.update();
  // pertes
  const tot=TYPES.map((t,i)=>G.reduce((s,g)=>s+(R.gOK[g.i]?R.gPeT[g.i][i]:0),0));
  charts.types.data.datasets[0].data=tot;charts.types.update();
  TYPES.forEach((t,i)=>charts.pertes.data.datasets[i].data=[...R.peMois[i]].slice(0,n));
  charts.pertes.data.datasets[5].data=[...Array(n)].map((_,m)=>{const p=TYPES.reduce((s,t,i)=>s+R.peMois[i][m],0);return R.mois[m]?p/R.mois[m]:null;});
  charts.pertes.update();
  const zs=Z.map(z=>({z,x:R.zones[z.i]})).sort((a,b)=>(b.x.ca-b.x.pe)-(a.x.ca-a.x.pe));
  charts.net.data.labels=zs.map(o=>o.z.nom);charts.net.data.datasets[0].data=zs.map(o=>o.x.ca-o.x.pe);charts.net.data.datasets[1].data=zs.map(o=>o.x.pe);
  charts.net.data.datasets[0].backgroundColor=zs.map(o=>!S.zone||S.zone===o.z.id?"#AE172A":"#e8c9cc");
  charts.net.data.datasets[1].backgroundColor=zs.map(o=>!S.zone||S.zone===o.z.id?"#FF8087":"#f6e1e2");
  charts.net.update();
}

/* ---------- pertes : listes et tableau ---------- */
function renderPertes(){
  const R=A;
  $("#types").innerHTML=`<span style="font-size:12px;color:var(--doux);align-self:center;margin-right:4px">Natures prises en compte :</span>`+TYPES.map((t,i)=>`<button class="chip${S.types.has(t)?"":" off"}" data-t="${i}"><i style="background:${TCOL[i]}"></i>${t}</button>`).join("")+
    (R.prodF?`<span style="font-size:12px;color:var(--doux);align-self:center;margin-left:6px">Filtre marque ou univers actif : seules les pertes rattachées à un produit sont comptées.</span>`:"");
  $$("#types .chip").forEach(b=>b.onclick=()=>{const t=TYPES[+b.dataset.t];if(S.types.has(t)){if(S.types.size>1)S.types.delete(t);}else S.types.add(t);render();});
  const tz=Z.map(z=>({z,x:R.zones[z.i]})).sort((a,b)=>b.x.pe-a.x.pe).slice(0,5);
  $("#top-zones").innerHTML=tz.map(o=>`<li data-z="${o.z.id}"><div class="nm">${esc(o.z.nom)}<small>${esc(o.z.resp)}</small></div><div class="x">${MF(o.x.pe)}<small>${P(o.x.ca?o.x.pe/o.x.ca:null)} des ventes</small></div></li>`).join("");
  const tg=G.filter(g=>R.gOK[g.i]&&R.gPe[g.i]>0).sort((a,b)=>R.gPe[b.i]-R.gPe[a.i]).slice(0,5);
  $("#top-gross").innerHTML=tg.length?tg.map(g=>`<li data-g="${g.i}"><div class="nm">${esc(g.nom)}<small>${esc(g.ville)} · ${esc(EQ[g.c].nom)}</small></div><div class="x">${MF(R.gPe[g.i])}<small>${P(R.gCa[g.i]?R.gPe[g.i]/R.gCa[g.i]:null)} des ventes</small></div></li>`).join(""):`<li style="cursor:default"><div class="nm">Aucune perte sur la vue</div></li>`;
  $$("#top-zones li").forEach(l=>l.onclick=()=>setF("zone",l.dataset.z));
  $$("#top-gross li[data-g]").forEach(l=>l.onclick=()=>openFiche(+l.dataset.g));
  // tableau par niveau
  let rows;
  const s=seuil();
  if(S.niv==="zone") rows=Z.map(z=>({k:z.id,nom:z.nom,sub:z.resp,x:R.zones[z.i],click:()=>setF("zone",z.id)}));
  else if(S.niv==="resp") rows=PR.RESP.map((r,i)=>({k:i,nom:r,sub:Z[EQ.find(e=>e.r===i).z].nom,x:R.resps[i],click:()=>setF("resp",String(i))}));
  else if(S.niv==="comm") rows=EQ.filter(e=>(!S.zone||Z[e.z].id===S.zone)&&(S.resp===""||e.r===+S.resp)).map(e=>({k:e.id,nom:e.nom,sub:Z[e.z].nom+" · "+e.resp,x:R.comms[e.i],click:()=>setF("comm",e.id)}));
  else rows=G.filter(g=>R.gOK[g.i]).map(g=>({k:g.i,nom:g.nom,sub:g.ville+" · "+EQ[g.c].nom,x:{ca:R.gCa[g.i],pe:R.gPe[g.i],prev:R.gPrev[g.i],pePrev:R.gPePrev[g.i]},click:()=>openFiche(g.i)}));
  rows.forEach(r=>r.tx=r.x.ca?r.x.pe/r.x.ca:0);
  rows.sort((a,b)=>b.tx-a.tx);
  const mxt=Math.max(...rows.map(r=>r.tx),.0001);
  $("#t-pertes thead").innerHTML=`<tr><th>${{zone:"Zone",resp:"Responsable de zone",comm:"Commercial",gross:"Grossiste"}[S.niv]}</th><th>Rattachement</th><th class="n">Ventes</th><th class="n">Pertes</th><th class="n">Taux de perte</th>${S.cmp&&R.hasPrev?`<th class="n">Taux N-1</th>`:""}<th class="n">Net après pertes</th><th></th></tr>`;
  $("#t-pertes tbody").innerHTML=rows.map((r,i)=>{const txp=r.x.prev?r.x.pePrev/r.x.prev:null;return `<tr data-i="${i}"><td><b>${esc(r.nom)}</b></td><td style="color:var(--doux)">${esc(r.sub)}</td><td class="n">${MF(r.x.ca)}</td><td class="n">${MF(r.x.pe)}</td>
    <td class="n"><span class="mini"><span style="width:${r.tx/mxt*100}%;background:${r.tx>s?"var(--rouge)":"var(--rose)"}"></span></span><b class="${r.tx>s?"dn":""}">${P(r.x.ca?r.tx:null)}</b></td>${S.cmp&&R.hasPrev?`<td class="n" style="color:var(--doux)">${P(txp)}</td>`:""}<td class="n">${MF(r.x.ca-r.x.pe)}</td><td>${r.tx>s?'<span class="tag r">au-dessus du seuil</span>':""}</td></tr>`;}).join("");
  $$("#t-pertes tbody tr").forEach(tr=>tr.onclick=()=>rows[+tr.dataset.i].click());
}

/* ---------- tableau des grossistes ---------- */
const COLS=[["rang","#",0],["nom","Grossiste",0],["ville","Ville",0],["zone","Zone",0],["comm","Commercial",0],["ca","Ventes",1],["ev","Évol. N-1",1],["part","Part",1],["ord","Commandes",1],["pan","Panier moyen",1],["last","Dernière commande",1],["pe","Pertes",1],["tx","Taux de perte",1],["statut","Statut",0]];
function gRows(){
  const R=A, tot=R.ca||1, s=seuil();
  return G.filter(g=>R.gOK[g.i]).map(g=>{const ca=R.gCa[g.i],ev=R.hasPrev&&R.gPrev[g.i]?ca/R.gPrev[g.i]-1:null,tx=ca?R.gPe[g.i]/ca:null,ld=R.gLast[g.i],j=ld>=0?R.refDay-ld:null;
    let st="Actif",sc="v"; if(j==null||j>30){st="Sans commande +30 j";sc="r";} else if(ev!=null&&ev<-.15){st="En baisse";sc="r";} else if(tx>s){st="Pertes élevées";sc="a";} else if(ev!=null&&ev>.15){st="En croissance";sc="v";}
    return {g,nom:g.nom,ville:g.ville,zone:Z[g.z].nom,comm:EQ[g.c].nom,resp:EQ[g.c].resp,ca,ev,part:ca/tot,ord:R.gOrd[g.i],pan:R.gOrd[g.i]?ca/R.gOrd[g.i]:null,last:ld>=0?ld:null,pe:R.gPe[g.i],tx,statut:st,sc};});
}
function renderTable(){
  let rows=gRows(); const byCa=[...rows].sort((a,b)=>b.ca-a.ca); byCa.forEach((r,i)=>r.rang=i+1);
  const q=S.q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(q) rows=rows.filter(r=>(r.nom+" "+r.ville+" "+r.zone+" "+r.comm+" "+r.resp).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(q));
  const k=S.sort.k, dir=S.sort.asc?1:-1;
  rows.sort((a,b)=>{const x=a[k],y=b[k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (typeof x==="string"?x.localeCompare(y,"fr"):x-y)*dir;});
  $("#t-gross thead").innerHTML="<tr>"+COLS.filter(c=>c[0]!=="ev"||S.cmp).map(([k2,l,n])=>`<th data-k="${k2}" class="${n?"n":""}${S.sort.k===k2?" s"+(S.sort.asc?" asc":""):""}">${l}</th>`).join("")+"</tr>";
  $("#t-gross tbody").innerHTML=rows.map(r=>`<tr data-g="${r.g.i}"><td class="rk-num">${r.rang}</td><td><b>${esc(r.nom)}</b></td><td>${esc(r.ville)}</td><td><span class="zp"><i style="background:${Z[r.g.z].col}"></i>${esc(r.zone)}</span></td><td>${esc(r.comm)}</td>
    <td class="n"><b>${M(r.ca)}</b></td>${S.cmp?`<td class="n ${cls(r.ev)}">${D(r.ev)}</td>`:""}<td class="n">${P(r.part)}</td><td class="n">${r.ord}</td><td class="n">${M(r.pan)}</td><td class="n">${r.last!=null?fdate(new Date(r.last*864e5)):"—"}</td>
    <td class="n">${M(r.pe)}</td><td class="n ${r.tx>seuil()?"dn":""}">${P(r.tx)}</td><td><span class="tag ${r.sc}">${r.statut}</span></td></tr>`).join("");
  $("#t-cpt").textContent=rows.length+" grossiste"+(rows.length>1?"s":"");
  $$("#t-gross th").forEach(th=>th.onclick=()=>{const k2=th.dataset.k;if(S.sort.k===k2)S.sort.asc=!S.sort.asc;else{S.sort.k=k2;S.sort.asc=["nom","ville","zone","comm","statut","rang"].includes(k2);}renderTable();});
  $$("#t-gross tbody tr").forEach(tr=>tr.onclick=()=>openFiche(+tr.dataset.g));
}

/* ---------- export ---------- */
function exporter(){
  const rows=gRows().sort((a,b)=>b.ca-a.ca), R=A;
  const f=v=>v==null||!isFinite(v)?"":String(Math.round(v));
  const pc=v=>v==null||!isFinite(v)?"":(v*100).toFixed(1).replace(".",",");
  const head=["Grossiste","Ville","District","Zone","Commercial","Responsable de zone","Ventes HT (FCFA)","Ventes N-1 HT (FCFA)","Évolution N-1 (%)","Commandes","Panier moyen (FCFA)","Dernière commande","Pertes (FCFA)","Taux de perte (%)","Net après pertes (FCFA)","Statut"];
  const lines=rows.map(r=>[r.nom,r.ville,r.g.dist,r.zone,r.comm,r.resp,f(r.ca),f(R.gPrev[r.g.i]),pc(r.ev),r.ord,f(r.pan),r.last!=null?new Date(r.last*864e5).toISOString().slice(0,10):"",f(r.pe),pc(r.tx),f(r.ca-r.pe),r.statut]);
  const titre=[["Dream Cosmetics · prototype · données de démonstration fictives"],["Période : "+$("#f-per").selectedOptions[0].text+" · Filtres : "+(ctxText()||"aucun")],[]];
  const txt="\uFEFF"+[...titre,head,...lines].map(l=>l.map(c=>{c=String(c);return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(";")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/csv;charset=utf-8"}));
  a.download="dream-grossistes-"+S.per.toLowerCase()+".csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}

/* ---------- fiche grossiste ---------- */
let ficheChart=null;
function openFiche(i){
  const g=G[i], R=A, e=EQ[g.c];
  const ca=R.gCa[i], ev=R.hasPrev&&R.gPrev[i]?ca/R.gPrev[i]-1:null, tx=ca?R.gPe[i]/ca:null, ld=R.gLast[i];
  // historique 24 mois (tous produits), produits de la période
  const end=MAXMI, start=Math.max(0,end-23), hist=new Float64Array(end-start+1), prod={};
  const pOK=p=>(S.univ===""||PR[p].univ===+S.univ)&&(S.marq===""||PR[p].marque===+S.marq);
  for(let k=0;k<V.n;k++){ if(V.g[k]!==i) continue; const mi=V.mi[k];
    if(mi>=start) hist[mi-start]+=V.m[k];
    if(mi>=R.a&&mi<=R.b&&pOK(V.p[k])){const p=V.p[k];(prod[p]||(prod[p]={q:0,m:0})).q+=V.q[k];prod[p].m+=V.m[k];}}
  const tp=Object.entries(prod).sort((a,b)=>b[1].m-a[1].m).slice(0,12);
  const pt=R.gPeT[i];
  $("#fiche").innerHTML=`<div class="fh"><button class="ferm" aria-label="Fermer">×</button><div class="k">Grossiste · ${esc(Z[g.z].nom)}</div><h3>${esc(g.nom)}</h3>
    <div class="m">${esc(g.ville)}, ${esc(g.dist)} · commercial <b>${esc(e.nom)}</b> · responsable de zone <b>${esc(e.resp)}</b></div></div>
    <div class="fb">
      <div class="k4">
        <div><div class="l">Ventes de la période</div><div class="v">${MF(ca)}</div><div class="d">${S.cmp&&ev!=null?`<span class="${cls(ev)}">${D(ev)}</span> vs N-1`:$("#f-per").selectedOptions[0].text}</div></div>
        <div><div class="l">Commandes · panier</div><div class="v">${R.gOrd[i]}</div><div class="d">panier moyen ${MF(R.gOrd[i]?ca/R.gOrd[i]:null)}</div></div>
        <div><div class="l">Pertes · taux</div><div class="v ${tx>seuil()?"dn":""}">${MF(R.gPe[i])}</div><div class="d">${P(tx)} des ventes</div></div>
        <div><div class="l">Dernière commande</div><div class="v">${ld>=0?fdate(new Date(ld*864e5)):"—"}</div><div class="d">${ld>=0?(d=>d<1?"à la date d'arrêté":d<2?"la veille de l'arrêté":`${d} jours avant l'arrêté`)(Math.round(R.refDay-ld)):""}</div></div>
      </div>
      <div class="bx"><h4>Historique sur 24 mois</h4><div class="ch sm"><canvas id="ch-fiche"></canvas></div></div>
      <div class="bx"><h4>Produits achetés sur la période</h4>${tp.length?`<div class="tw" style="max-height:330px;border:0"><table class="t"><thead><tr><th>Produit</th><th>Marque</th><th class="n">Quantité</th><th class="n">Montant</th></tr></thead><tbody>
        ${tp.map(([p,x])=>`<tr style="cursor:default"><td style="white-space:normal">${esc(PR[p].nom)}</td><td>${esc(PR.MQ[PR[p].marque])}</td><td class="n">${nf0.format(x.q)}</td><td class="n">${M(x.m)}</td></tr>`).join("")}</tbody></table></div>`:`<div style="color:var(--doux)">Aucun achat sur la période.</div>`}</div>
      <div class="bx"><h4>Pertes de la période par nature</h4>${TYPES.map((t,k)=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid #F3EAE7;font-size:13.5px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${TCOL[k]};margin-right:7px"></i>${t}</span><b>${MF(pt[k])}</b></div>`).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn plein" id="f-filtrer">Filtrer la page sur ce grossiste</button><button class="btn" id="f-comm">Voir tout le portefeuille de ${esc(e.nom)}</button></div>
    </div>`;
  $("#fiche").classList.add("on");$("#voile").classList.add("on");$("#fiche").setAttribute("aria-hidden","false");$("#fiche").scrollTop=0;
  $("#fiche .ferm").onclick=closeFiche;
  $("#f-filtrer").onclick=()=>{closeFiche();S.zone="";S.resp="";S.comm="";setF("gross",g.id);};
  $("#f-comm").onclick=()=>{closeFiche();S.gross="";S.zone="";S.resp="";setF("comm",e.id);};
  if(ficheChart) ficheChart.destroy();
  ficheChart=new Chart($("#ch-fiche"),{type:"bar",data:{labels:[...hist].map((_,k)=>miLabel(start+k)),datasets:[{label:"Ventes",data:[...hist],borderRadius:4,
    backgroundColor:[...hist].map((_,k)=>start+k>=R.a&&start+k<=R.b?"#AE172A":"#F2C3C7")}]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>" "+MF(c.raw)}}},scales:{y:{ticks:{callback:v=>M(v)},grid:{color:"#F1E7E3"},border:{display:false}},x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}}}}});
}
function closeFiche(){$("#fiche").classList.remove("on");$("#voile").classList.remove("on");$("#fiche").setAttribute("aria-hidden","true");}

/* ---------- contexte ---------- */
function ctxText(){
  const p=[];
  if(S.zone)p.push("Zone "+Z.find(z=>z.id===S.zone).nom);
  if(S.resp!=="")p.push("Responsable "+PR.RESP[+S.resp]);
  if(S.comm)p.push("Commercial "+EQ.find(e=>e.id===S.comm).nom);
  if(S.gross)p.push("Grossiste "+G.find(g=>g.id===S.gross).nom);
  if(S.univ!=="")p.push("Univers "+PR.UN[+S.univ]);
  if(S.marq!=="")p.push("Marque "+PR.MQ[+S.marq]);
  return p.join(" · ");
}
function renderCtx(){
  const R=A, per=$("#f-per").selectedOptions[0].text;
  const cmp=S.cmp&&R.hasPrev?`comparée à ${miLabel(R.a1)}${R.a1!==R.b1?" – "+miLabel(R.b1):""}`:(S.cmp?"pas de N-1 disponible":"");
  const f=ctxText();
  $("#contexte").innerHTML=`<span class="pill">${esc(per)}</span>${cmp?`<span>${cmp}</span>`:""}${f?f.split(" · ").map(x=>`<span class="pill r">${esc(x)}</span>`).join(""):`<span>· toute la Côte d'Ivoire, tous produits</span>`}`;
}

/* ---------- liaisons ---------- */
function bind(){
  $("#f-gran").onchange=e=>{S.gran=e.target.value;S.per="";buildFilters();render();};
  $("#f-per").onchange=e=>{S.per=e.target.value;render();};
  $("#f-cmp").onchange=e=>{S.cmp=e.target.checked;render();};
  $("#f-zone").onchange=e=>setF("zone",e.target.value);
  $("#f-resp").onchange=e=>setF("resp",e.target.value);
  $("#f-comm").onchange=e=>setF("comm",e.target.value);
  $("#f-gross").onchange=e=>setF("gross",e.target.value);
  $("#f-univ").onchange=e=>setF("univ",e.target.value);
  $("#f-marq").onchange=e=>setF("marq",e.target.value);
  $("#raz").onclick=()=>{S.zone="";S.resp="";S.comm="";S.gross="";S.univ="";S.marq="";buildFilters();render();};
  $("#seuil").oninput=e=>{$("#seuil-v").textContent=nf1.format(+e.target.value).replace(",0","")+" %";localStorage.setItem("dream-seuil",e.target.value);if(!A)return;styleDist();renderAlertes();renderZones();renderKpis();renderPertes();renderTable();};
  $("#seuil").oninput({target:$("#seuil")});
  $("#q").oninput=e=>{S.q=e.target.value;renderTable();};
  $("#b-export").onclick=exporter;$("#b-export2").onclick=exporter;
  $("#voile").onclick=closeFiche; document.addEventListener("keydown",e=>{if(e.key==="Escape")closeFiche();});
  $$("#niv-pertes button").forEach(b=>b.onclick=()=>{S.niv=b.dataset.n;$$("#niv-pertes button").forEach(x=>x.classList.toggle("on",x===b));renderPertes();});
}
let lastZone=null;
function render(){
  A=compute(); writeHash();
  renderCtx(); renderKpis(); renderMap(); renderZones(); renderAlertes(); renderRanks(); renderCharts(); renderPertes(); renderTable();
  if(lastZone!==S.zone){ if(lastZone!==null) fitView(false); lastZone=S.zone; }
}
init().catch(err=>{console.error(err);document.getElementById("chargement").innerHTML='<div style="text-align:center;padding:30px;font:16px Figtree,sans-serif;color:#16070A">Les données n\'ont pas pu être chargées.<br><small>Vérifiez la présence des fichiers du dossier « data ».</small></div>';});
})();
