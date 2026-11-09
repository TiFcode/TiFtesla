import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const PARTS=[['front-bumper','Front bumper','Body','01','bumper'],['hood','Hood','Body','02','hood'],['windshield','Windshield','Glass','03','windshield'],['roof','Glass roof','Glass','04','roof'],['trunk','Trunk lid','Body','05','trunk'],['rear-bumper','Rear bumper','Body','06','bumper'],['front-left-door','Front left door','Body','07','door'],['front-right-door','Front right door','Body','08','door'],['rear-left-door','Rear left door','Body','09','door'],['rear-right-door','Rear right door','Body','10','door'],['mirrors','Side mirrors','Body','11','mirrors'],['seats','Interior seats','Interior','12','seats'],['dashboard','Dashboard','Interior','13','dashboard'],['battery','Battery pack','Chassis','14','battery'],['front-wheels','Front wheels','Chassis','15','wheel'],['rear-wheels','Rear wheels','Chassis','16','wheel']].map(([id,name,group,icon,kind])=>({id,name,group,icon,kind}));
const removed=new Set(),meshes=new Map(),photorealMeshesBySource=new Map(),photorealRoots=new Map(),sceneEl=document.querySelector('#scene');
function classifyTriangle(mesh,center){
  const materialName=Array.isArray(mesh.material)?mesh.material.map(m=>m?.name||'').join(' '):(mesh.material?.name||'');
  const name=`${mesh.name||''} ${materialName}`.toLowerCase();
  if(name.includes('wheel')||name.includes('cal'))return center.z>0?'front-wheels':'rear-wheels';
  if(name.includes('tire')||name.includes('rim'))return center.z>0?'front-wheels':'rear-wheels';
  if(name.includes('int'))return center.y>.85?'seats':'dashboard';
  if(name.includes('hood'))return 'hood';
  if(name.includes('window')||name.includes('glass'))return center.z>.65?'windshield':'roof';
  if(name.includes('door')){
    const side=Math.abs(center.x)>.72,left=center.x<0?'left':'right',end=center.z>0?'front':'rear';
    if(side&&Math.abs(center.z)<2.15)return `${end}-${left}-door`;
  }
  if(/\bln\d|tail|brake|stop|rear.?light|taillight/.test(name))return center.z>0?'front-bumper':'rear-bumper';

  // The source GLB contains large body meshes, not four door nodes. Split their
  // triangles by the actual vehicle side and longitudinal position instead of
  // assigning a whole mesh to whichever door its centre happens to touch.
  const side=Math.abs(center.x)>.72;
  if(side&&center.y>.42&&center.y<1.42&&Math.abs(center.z)<2.15){
    const left=center.x<0?'left':'right',end=center.z>0?'front':'rear';
    return `${end}-${left}-door`;
  }
  if(center.y>1.25)return center.z>0?'hood':'trunk';
  if(Math.abs(center.z)>2.25)return center.z>0?'front-bumper':'rear-bumper';
  return center.z>0?'front-bumper':'rear-bumper';
}
function splitRealMesh(mesh,photorealMeshes){
  const source=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
  const position=source.getAttribute('position'),normal=source.getAttribute('normal'),uv=source.getAttribute('uv');
  if(!position)return;
  const buckets=new Map(PARTS.map(p=>[p.id,{positions:[],normals:[],uvs:[]}])) ,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),center=new THREE.Vector3();
  for(let i=0;i<position.count;i+=3){
    a.fromBufferAttribute(position,i);b.fromBufferAttribute(position,i+1);c.fromBufferAttribute(position,i+2);
    center.copy(a).add(b).add(c).multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld);
    const id=classifyTriangle(mesh,center),bucket=buckets.get(id);if(!bucket)continue;
    for(const v of [a,b,c])bucket.positions.push(v.x,v.y,v.z);
    if(normal)for(let j=0;j<3;j++){const n=new THREE.Vector3().fromBufferAttribute(normal,i+j);bucket.normals.push(n.x,n.y,n.z)}
    if(uv)for(let j=0;j<3;j++){const q=j*2;bucket.uvs.push(uv.getX(i+j),uv.getY(i+j))}
  }
  // A split geometry has no material groups. Passing a multi-material array
  // here makes Three.js skip the draw call, which leaves some GLB models
  // apparently "loaded" but invisible. The source materials were already
  // normalized by makePhotorealWhite(), so one material is sufficient.
  const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  buckets.forEach((bucket,id)=>{if(!bucket.positions.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));if(bucket.normals.length)g.setAttribute('normal',new THREE.Float32BufferAttribute(bucket.normals,3));else g.computeVertexNormals();if(bucket.uvs.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(bucket.uvs,2));const part=new THREE.Mesh(g,material);part.name=`${mesh.name}-${id}`;part.position.copy(mesh.position);part.quaternion.copy(mesh.quaternion);part.scale.copy(mesh.scale);part.castShadow=true;part.receiveShadow=true;part.userData.partId=id;mesh.parent.add(part);photorealMeshes.get(id).push(part)});
  // Hide the source only after every split mesh was created. If mobile Safari
  // fails during segmentation, a loaded model must remain visible.
  mesh.visible=false;
}
function fitRealModel(model,rotation){
  model.rotation.set(...rotation);model.scale.setScalar(1);model.updateMatrixWorld(true,true);
  const raw=new THREE.Box3().setFromObject(model),rawSize=raw.getSize(new THREE.Vector3());
  const scale=5.7/Math.max(rawSize.x,rawSize.z);model.scale.setScalar(scale);model.updateMatrixWorld(true,true);
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
  model.position.add(new THREE.Vector3(-center.x,-bounds.min.y,-center.z));model.updateMatrixWorld(true,true);
}
function frameRealModel(modelRoot){
  const bounds=new THREE.Box3().setFromObject(modelRoot),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const radius=Math.max(size.x,size.y,size.z),distance=Math.max(9,radius/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2))*1.65);
  // Start from the requested front-left three-quarter view. A slightly raised
  // look target moves the vehicle down in the mobile viewport, leaving room
  // above the glass roof instead of clipping it at startup.
  const viewTarget=center.clone().add(new THREE.Vector3(0,.2,0));camera.position.copy(viewTarget).add(new THREE.Vector3(-1,.58,-1).normalize().multiplyScalar(distance));controls.target.copy(viewTarget);controls.update();
}
let explodeMode=false,flightMode=false,flightClock=0;
function loadingState(text,done=false,error=false){const overlay=document.querySelector('#loadingOverlay');if(!overlay)return;overlay.classList.toggle('is-hidden',done);overlay.classList.toggle('error',error);const label=document.querySelector('#loadingText');if(label)label.textContent=text}
function explodeOffset(center,origin){const direction=center.clone().sub(origin);if(direction.lengthSq()<.001)direction.set(0,1,0);const lift=Math.max(0,center.y-origin.y)*.18;return direction.normalize().multiplyScalar(1.28).add(new THREE.Vector3(0,lift,0))}
function applyExplode(){
  const active=photorealMeshesBySource.get(modelSource),realRoot=photorealRoots.get(modelSource);
  if(active&&realRoot?.userData.loaded){const origin=new THREE.Box3().setFromObject(realRoot).getCenter(new THREE.Vector3());active.forEach(items=>items.forEach(mesh=>{if(!mesh.userData.explodeBase)mesh.userData.explodeBase=mesh.position.clone();if(!mesh.userData.explodeDelta){const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());mesh.userData.explodeDelta=explodeOffset(center,origin)}mesh.position.copy(mesh.userData.explodeBase).add(explodeMode?mesh.userData.explodeDelta:new THREE.Vector3())}))}
  if(realRoot?.userData.loaded&&modelSource==='cybertruck'){const origin=new THREE.Box3().setFromObject(realRoot).getCenter(new THREE.Vector3());realRoot.traverse(mesh=>{if(!mesh.isMesh)return;if(!mesh.userData.explodeBase)mesh.userData.explodeBase=mesh.position.clone();if(!mesh.userData.explodeDelta){const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());mesh.userData.explodeDelta=explodeOffset(center,origin)}mesh.position.copy(mesh.userData.explodeBase).add(explodeMode?mesh.userData.explodeDelta:new THREE.Vector3())})}
  meshes.forEach(mesh=>{if(!mesh.userData.explodeBase)mesh.userData.explodeBase=mesh.position.clone();if(!mesh.userData.explodeDelta){const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());mesh.userData.explodeDelta=explodeOffset(center,new THREE.Vector3(0,1,0))}mesh.position.copy(mesh.userData.explodeBase).add(explodeMode?mesh.userData.explodeDelta:new THREE.Vector3())});
  const button=document.querySelector('#explodeButton');if(button){button.classList.toggle('active',explodeMode);button.setAttribute('aria-pressed',String(explodeMode))}
}
function animateFlight(time){const target=modelSource==='procedural'?root:photorealRoots.get(modelSource);if(!target)return;if(!target.userData.flightBase){target.userData.flightBase={position:target.position.clone(),rotation:target.rotation.clone()}}const base=target.userData.flightBase;if(flightMode){target.position.y=base.position.y+.22+Math.sin(time*2.4)*.11;target.rotation.z=base.rotation.z+Math.sin(time*1.7)*.055;target.rotation.x=base.rotation.x+Math.sin(time*2.1)*.025}else{target.position.copy(base.position);target.rotation.copy(base.rotation)}}
const whitePaint=new THREE.MeshPhysicalMaterial({color:0xf3f6f8,metalness:.48,roughness:.2,clearcoat:.42,clearcoatRoughness:.14}),blackTrim=new THREE.MeshStandardMaterial({color:0x111722,metalness:.65,roughness:.28}),clearGlass=new THREE.MeshPhysicalMaterial({color:0x1b3851,metalness:.08,roughness:.08,transmission:.12,transparent:true,opacity:.78}),rubber=new THREE.MeshStandardMaterial({color:0x080a0e,roughness:.78}),rimMetal=new THREE.MeshStandardMaterial({color:0x7c8790,metalness:.82,roughness:.22});
function makePhotorealWhite(model,source='real'){model.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(material=>{if(!material?.color)return;const name=(o.name+' '+(material.name||'')).toLowerCase();if(name.includes('glass')||name.includes('window')){material.color.set(0x1b3851);material.transparent=true;material.opacity=.78;return}if(name.includes('tire')||name.includes('wheel')){material.color.set(0x080a0e);material.roughness=.78;return}if(name.includes('rim')||name.includes('chrome')){material.color.set(0x7c8790);material.metalness=.82;material.roughness=.22;return}if(/\bln\d|tail|brake|stop|rear.?light|taillight/.test(name)){material.color.set(0xe21d2f);material.emissive?.set(0x4a0008);material.emissiveIntensity=1.4;return}if(name.includes('headlight')||name.includes('lamp')){material.color.set(0xf7fbff);material.emissive?.set(0x547a91);material.emissiveIntensity=.35;return}if(source==='cybertruck'){material.color.set(0x8d969d);material.metalness=.84;material.roughness=.26;return}material.color.set(0xf3f6f8);material.metalness=.48;material.roughness=.2})});}
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x0b1020,9,34);const camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(-10.5,6.6,-11.5);const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;sceneEl.appendChild(renderer.domElement);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,2.2,0);controls.enableDamping=true;controls.minDistance=4.6;controls.maxDistance=26;controls.maxPolarAngle=Math.PI*.48;
scene.add(new THREE.HemisphereLight(0xbcd7ff,0x131829,2.1));const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(4,8,5);key.castShadow=true;scene.add(key);const rim=new THREE.PointLight(0x7ee7de,13,12);rim.position.set(-4,3,-4);scene.add(rim);const root=new THREE.Group();scene.add(root);root.visible=false;
const photorealSpecs={real:{url:'./assets/model-3-heritage/scene.gltf',rotation:[-Math.PI/2,0,0]},'highland-2026':{url:'./assets/model-3-highland-2026/model.glb',rotation:[0,Math.PI/2,0]},'model-y-legacy':{url:'./assets/model-y-legacy/model.glb',rotation:[0,0,0]},'model-y-juniper':{url:'./assets/model-y-juniper/model.glb',rotation:[0,0,0]},cybertruck:{url:'./assets/cybertruck-2025/model.glb',rotation:[0,0,0]}};
function activateRealBackup(){const backup=photorealRoots.get('real');if(!backup?.userData.loaded)return false;modelSource='real';const select=document.querySelector('#modelSelect');if(select)select.value='real';photorealRoots.forEach((modelRoot,key)=>{modelRoot.visible=key==='real'});frameRealModel(backup);update();flash('Highland indisponibil · Model 3 fotorealist activ');return true}
function loadRealModelLegacy(source,url,rotation){
  if(photorealRoots.has(source))return;
  const partMeshes=new Map(PARTS.map(p=>[p.id,[]])),modelRoot=new THREE.Group();modelRoot.visible=false;photorealMeshesBySource.set(source,partMeshes);photorealRoots.set(source,modelRoot);scene.add(modelRoot);
  new GLTFLoader().load(url,gltf=>{const model=gltf.scene;makePhotorealWhite(model);fitRealModel(model,rotation);modelRoot.add(model);model.updateMatrixWorld(true,true);const realMeshes=[];model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;realMeshes.push(o)}});realMeshes.forEach(mesh=>splitRealMesh(mesh,partMeshes));const missing=PARTS.map(p=>p.id).filter(id=>!partMeshes.get(p.id).length);modelRoot.userData.loaded=true;console.info(`${source} part triangle buckets`,Object.fromEntries(PARTS.map(p=>[p.id,partMeshes.get(p.id).length])));if(missing.length)console.warn(`${source} unavailable parts`,missing);if(modelSource===source){modelRoot.visible=true;root.visible=false;frameRealModel(modelRoot)}if(source==='real'&&modelSource==='highland-2026'&&photorealRoots.get('highland-2026')?.userData.failed)activateRealBackup();update()},undefined,()=>{modelRoot.userData.failed=true;if(source==='highland-2026'){loadRealModel('real',photorealSpecs.real.url,photorealSpecs.real.rotation);if(!activateRealBackup())flash('Highland indisponibil · se încarcă Model 3 fotorealist')}else if(modelSource===source){root.visible=true;modelRoot.visible=false;flash(`${source} indisponibil · fallback procedural activ`)}});
}
// Keep the parsed source scene visible if mobile Safari cannot complete the
// optional triangle segmentation step. This later declaration intentionally
// overrides the older loader above while preserving its public call sites.
function loadRealModel(source,url,rotation){
  if(photorealRoots.has(source))return;
  const partMeshes=new Map(PARTS.map(p=>[p.id,[]])),modelRoot=new THREE.Group();
  modelRoot.visible=false;photorealMeshesBySource.set(source,partMeshes);photorealRoots.set(source,modelRoot);scene.add(modelRoot);
  if(source==='highland-2026')loadingState('READING TAPE · MODEL 3');
  const loader=new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(url,gltf=>{
    const model=gltf.scene;makePhotorealWhite(model,source);fitRealModel(model,rotation);modelRoot.add(model);model.updateMatrixWorld(true,true);
    const realMeshes=[];model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;realMeshes.push(o)}});
    let splitError=null;
    try{if(source!=='cybertruck')realMeshes.forEach(mesh=>splitRealMesh(mesh,partMeshes))}catch(error){splitError=error;console.error(`${source} split failed; keeping original meshes`,error);model.traverse(o=>{if(o.isMesh)o.visible=true})}
    const missing=PARTS.map(p=>p.id).filter(id=>!partMeshes.get(id).length);modelRoot.userData.loaded=true;modelRoot.userData.splitError=splitError;
    console.info(`${source} loaded`,{meshes:realMeshes.length,splitError:splitError?.message||null,parts:Object.fromEntries(PARTS.map(p=>[p.id,partMeshes.get(p.id).length]))});
    if(missing.length)console.warn(`${source} unavailable parts`,missing);
    if(modelSource===source){modelRoot.visible=true;root.visible=false;frameRealModel(modelRoot);loadingState(splitError?'MODEL LOADED · SAFE MODE':'READY · MODEL 3',true);if(splitError)flash(`${source} încărcat · segmentarea pieselor a eșuat`)}
    if(source==='real'&&modelSource==='highland-2026'&&photorealRoots.get('highland-2026')?.userData.failed)activateRealBackup();update()
  },undefined,error=>{
    modelRoot.userData.failed=true;console.error(`${source} load failed`,error);
    if(modelSource===source)loadingState(`LOAD ERROR · ${error?.message||'GLTF'}`,false,true);
    if(source==='highland-2026'){loadRealModel('real',photorealSpecs.real.url,photorealSpecs.real.rotation);if(!activateRealBackup())flash(`Highland indisponibil · ${error?.message||'eroare GLTF'}`)}
    else if(modelSource===source){root.visible=true;modelRoot.visible=false;flash(`${source} indisponibil · fallback procedural activ`)}
  });
}
// Load only the selected GLB initially; the other photoreal model is lazy-loaded
// to avoid parsing two large assets simultaneously on iPhone Safari.
loadRealModel('highland-2026',photorealSpecs['highland-2026'].url,photorealSpecs['highland-2026'].rotation);
const pearl=new THREE.MeshStandardMaterial({color:0xf1f5f7,metalness:.62,roughness:.2}),dark=new THREE.MeshStandardMaterial({color:0x111722,metalness:.72,roughness:.23}),glass=new THREE.MeshPhysicalMaterial({color:0x1b3851,metalness:.1,roughness:.08,transmission:.1,transparent:true,opacity:.82}),tire=new THREE.MeshStandardMaterial({color:0x090b10,roughness:.75}),cyan=new THREE.MeshStandardMaterial({color:0x7ee7de,emissive:0x165b61,emissiveIntensity:1.5,metalness:.4,roughness:.25});
function box(id,size,pos,mat=pearl,rot=[0,0,0]){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.name=id;m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;m.userData.partId=id;root.add(m);return m}function cyl(id,r,depth,pos,rot,mat){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,depth,32),mat);m.name=id;m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.userData.partId=id;root.add(m);return m}
box('base',[2.6,.56,5.7],[0,.72,0]);box('sill',[2.76,.24,4.55],[0,.48,0],dark);box('nose',[2.48,.5,1.05],[0,.83,2.53]);box('deck',[2.45,.45,.92],[0,.98,-2.34]);box('undertray',[2.22,.15,4.45],[0,.32,0],dark);for(const x of[-1.34,1.34])for(const z of[-1.9,1.8])cyl('base-wheel',.53,.3,[x,.58,z],[0,0,Math.PI/2],tire);
function partMesh(p){const id=p.id,x=p.kind==='mirrors'?(id==='mirrors'?-1.47:0):0;let m;switch(p.kind){case'bumper':m=box(id,[2.5,.34,id==='front-bumper'?.22:.22],[0,.6,id==='front-bumper'?3.02:-3.02]);break;case'hood':m=box(id,[2.3,.13,1.52],[0,1.18,2],pearl,[-.05,0,0]);break;case'windshield':m=box(id,[2.2,.08,1.1],[0,1.57,.92],glass,[Math.PI*.31,0,0]);break;case'roof':m=box(id,[2.12,.12,1.95],[0,1.92,-.12],glass);break;case'trunk':m=box(id,[2.3,.13,1.1],[0,1.15,-2.25],pearl,[.05,0,0]);break;case'door':m=box(id,[.12,.8,1.62],[id.includes('left')?-1.38:1.38,1.02,id.includes('front')?1:-1.18]);break;case'mirrors':m=new THREE.Group();for(const sx of[-1.47,1.47])m.add(box(id,[.5,.18,.25],[sx,1.43,.92],dark));m.traverse(o=>o.userData.partId=id);root.add(m);break;case'seats':m=new THREE.Group();for(const sx of[-.65,.65])m.add(box(id,[.6,.7,.62],[sx,.98,-.18],dark));m.traverse(o=>o.userData.partId=id);root.add(m);break;case'dashboard':m=box(id,[2.08,.32,.42],[0,1.25,1.02],dark);break;case'battery':m=box(id,[2.05,.22,3.9],[0,.34,0],cyan);break;case'wheel':m=new THREE.Group();for(const wx of[-1.34,1.34])m.add(cyl(id,.54,.28,[wx,.58,p.id==='front-wheels'?1.8:-1.92],[0,0,Math.PI/2],tire));m.traverse(o=>o.userData.partId=id);root.add(m);break}meshes.set(id,m)}PARTS.forEach(partMesh);
const floor=new THREE.Mesh(new THREE.CircleGeometry(8,64),new THREE.MeshStandardMaterial({color:0x0d1425,roughness:.9,metalness:.15}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);const grid=new THREE.GridHelper(14,28,0x24304a,0x151d31);grid.position.y=.01;scene.add(grid);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();renderer.domElement.addEventListener('click',e=>{const r=renderer.domElement.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*2-1;pointer.y=-(e.clientY-r.top)/r.height*2+1;raycaster.setFromCamera(pointer,camera);const activeRoot=photorealRoots.get(modelSource);const hit=raycaster.intersectObjects([root,...(activeRoot?[activeRoot]:[])],true).find(h=>h.object.userData.partId);if(hit)toggle(hit.object.userData.partId)});
let mode='remove',modelSource='highland-2026';function modelLabel(source){return ({real:'Model 3','highland-2026':'Model 3 Highland 2026','model-y-legacy':'Model Y legacy','model-y-juniper':'Model Y Juniper 2025',cybertruck:'Cybertruck 2025',procedural:'procedural workshop model'})[source]||'Tesla'}function setModelSource(next){modelSource=next;explodeMode=false;const procedural=next==='procedural';if(!procedural&&!photorealRoots.has(next)){const spec=photorealSpecs[next];if(spec){loadingState(`READING TAPE · ${next.toUpperCase()}`);loadRealModel(next,spec.url,spec.rotation)}}photorealRoots.forEach((modelRoot,key)=>{modelRoot.visible=key===next&&modelRoot.userData.loaded===true});root.visible=procedural;if(!procedural&&photorealRoots.get(next)?.userData.loaded)frameRealModel(photorealRoots.get(next));applyExplode();flash(procedural?'Procedural model selected':`Photoreal ${modelLabel(next)} selected`)}function toggle(id){const part=PARTS.find(p=>p.id===id);if(!part)return;if(mode==='remove'&&!removed.has(id))removed.add(id);else if(mode==='add'&&removed.has(id))removed.delete(id);else{return flash(`${mode==='remove'?'Already removed':'Already installed'} · ${part.name}`)}update();flash(`${mode==='remove'?'Removed':'Installed'} · ${part.name}`)}function flash(t){const el=document.querySelector('#toast');el.textContent=t;el.classList.add('show');clearTimeout(flash.timer);flash.timer=setTimeout(()=>el.classList.remove('show'),1700)}
function renderList(){const list=document.querySelector('#partsList');list.innerHTML='';PARTS.forEach(p=>{const installed=!removed.has(p.id),b=document.createElement('button');b.type='button';b.className=`part-button ${installed?'done':''}`;b.innerHTML=`<span class="part-icon">${p.icon}</span><span>${p.name}<small>${p.group}</small></span><span class="part-state">${installed?'INSTALLED':'REMOVED'}</span>`;b.onclick=()=>toggle(p.id);list.appendChild(b)})}function update(){meshes.forEach((m,id)=>{const visible=!removed.has(id);m.visible=visible;m.traverse(o=>o.visible=visible)});const active=photorealMeshesBySource.get(modelSource);if(active)active.forEach((items,id)=>{const visible=!removed.has(id);items.forEach(mesh=>{mesh.visible=visible})});applyExplode();const done=removed.size;document.querySelector('#partCount').textContent=`${16-done} / 16 PARTS`;document.querySelector('#progressLabel').textContent=`${Math.round(done/16*100)}%`;document.querySelector('#progressBar').style.width=`${done/16*100}%`;document.querySelector('#completionMessage').textContent=done===16?'Chassis exposed — switch to Compose and rebuild it part by part.':`${done} of 16 parts removed. ${16-done} still in the workshop.`;renderList()}
function setMode(next){mode=next;document.querySelectorAll('.mode-button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));const remove=mode==='remove',label=modelLabel(modelSource);document.querySelector('#modeTitle').textContent=remove?'Decompose the vehicle':'Compose the vehicle';document.querySelector('#panelTitle').textContent=remove?`Take the ${label} apart`:`Rebuild the ${label}`;document.querySelector('#panelCopy').textContent=remove?'Select a glowing part in the scene or use the catalogue. Explore what sits under the pearl-white shell.':'Put the car back together in the right place. Install each missing part to complete the workshop challenge.';renderList();flash(remove?'Decompose mode active':'Compose mode active')}
modelSource='highland-2026';document.querySelectorAll('.mode-button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelector('#modelSelect').onchange=e=>setModelSource(e.target.value);document.querySelector('#explodeButton').onclick=()=>{explodeMode=!explodeMode;applyExplode();flash(explodeMode?'Exploded view active':'Exploded view reset')};document.querySelector('#flightButton').onclick=()=>{flightMode=!flightMode;const b=document.querySelector('#flightButton');b.classList.toggle('active',flightMode);b.setAttribute('aria-pressed',String(flightMode));flash(flightMode?'Flight demonstration active':'Flight demonstration reset')};document.querySelector('#resetButton').onclick=()=>{removed.clear();explodeMode=false;flightMode=false;setMode('remove');update();flash('Vehicle reset · all parts installed')};function resize(){const w=sceneEl.clientWidth,h=sceneEl.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}window.onresize=resize;resize();update();(function animate(){requestAnimationFrame(animate);flightClock+=.016;animateFlight(flightClock);controls.update();renderer.render(scene,camera)})();
