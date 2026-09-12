import { chromium } from 'file:///C:/Users/iwans/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright-core/index.mjs'
import { writeFileSync } from 'node:fs'
const dir = 'qa/review_r2'
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const results=[]
const realTrainers = await (await fetch('http://localhost:8000/api/v1/trainers')).json()
writeFileSync(`${dir}/trainers-api.json`,JSON.stringify(realTrainers,null,2))
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function setup(opts={}) {
 const context=await browser.newContext({viewport:{width:opts.width??360,height:800},recordVideo:{dir:`${dir}/video`,size:{width:430,height:900}}})
 const page=await context.newPage(); page.setDefaultTimeout(5000)
 await page.clock.install({time:new Date('2026-09-11T06:00:00+03:00')})
 await page.clock.pauseAt(new Date('2026-09-11T06:00:01+03:00'))
 const slots=Array.from({length:12},(_,i)=>({id:`s${i}`,startAt:`2026-09-12T${String(8+i).padStart(2,'0')}:00:00+03:00`,endAt:`2026-09-12T${String(9+i).padStart(2,'0')}:00:00+03:00`,booked:opts.lastPlace?7:2,capacity:8,available:opts.lastPlace?1:6,isBlocked:false}))
 const state={slots,bookings:[],posts:[],pending:null,trainers:opts.trainers??realTrainers,cancelError:false,errors:opts.errors??[],remove:false}
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1','')
  const fulfill=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
  if(state.errors.includes(path)) return fulfill({error:{message:'Контрольная сетевая ошибка'}},500)
  if(path==='/trainers')return fulfill(state.trainers)
  if(path==='/schedule')return fulfill({timezone:'Europe/Moscow',capacity:8,days:[{date:'2026-09-11',slots:[]},{date:'2026-09-12',slots:state.remove?slots.filter(s=>s.id!=='s11'):slots}]})
  if(path==='/bookings'&&req.method()==='GET')return fulfill(state.bookings)
  if(path==='/bookings'&&req.method()==='POST') {
   const body=req.postDataJSON();state.posts.push(body)
   await new Promise(r=>state.pending=r)
   const slot=slots.find(s=>s.id===body.slotId)
   const booking={...slot,id:'b1',slotId:slot.id,userId:'u1',clientName:'Reviewer',trainerSlug:body.trainerSlug,trainerName:state.trainers.find(t=>t.slug===body.trainerSlug)?.name??null,status:'confirmed',notes:null,createdAt:'2026-09-11T03:00:01Z',cancelledAt:null}
   state.bookings=[booking];slot.booked++;slot.available--
   return fulfill(booking)
  }
  if(path.endsWith('/cancel')) {
   if(state.cancelError)return fulfill({error:{message:'Контрольная ошибка отмены'}},500)
   state.bookings[0].status='cancelled';return fulfill(state.bookings[0])
  }
  return fulfill({})
 })
 const go=async path=>{await page.goto(`http://localhost:5173${path}`);await wait(200);await page.clock.runFor(20);await wait(100)}
 const snap=async name=>{await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});results.push({name,url:page.url(),...await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollY,focus:document.activeElement?.id,text:document.querySelector('main')?.innerText,targets:[...document.querySelectorAll('main a,main button,main label,nav a')].map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.trim(),w:r.width,h:r.height,x:r.x,y:r.y}})}))})}
 return {context,page,state,go,snap}
}
async function test(name,fn){if(process.env.R2_FILTER&&!name.includes(process.env.R2_FILTER))return;try{await fn();console.log(name,'DONE')}catch(e){results.push({name,error:e.message});console.log(name,'ERROR',e.message)}finally{writeFileSync(`${dir}/browser-results${process.env.R2_FILTER?'-'+process.env.R2_FILTER:''}.json`,JSON.stringify(results,null,2))}}
await test('main roundtrip and native browser Back',async()=>{
 const {context,page,state,go,snap}=await setup({width:320})
 await go('/schedule?trainer=dima');await page.getByRole('button',{name:/12/}).click();await page.clock.runFor(400)
 await page.getByRole('link',{name:/19:00–20:00/}).scrollIntoViewIfNeeded();await snap('schedule320')
 await page.getByRole('link',{name:/19:00–20:00/}).click();await page.clock.runFor(30)
 await page.setViewportSize({width:360,height:800});await snap('booking360')
 await page.goBack();await page.clock.runFor(600);await snap('browser-back')
 await page.getByRole('link',{name:/19:00–20:00/}).click();await page.clock.runFor(30)
 const radio=page.locator('input[value=self]');await radio.focus();await page.keyboard.press('ArrowDown');await snap('radio-keyboard')
 await page.getByRole('button',{name:'Подтвердить запись'}).dblclick({delay:5});await wait(80)
 results.push({name:'rapid-submit',posts:state.posts,disabled:await page.locator('input[type=radio]').evaluateAll(xs=>xs.every(x=>x.disabled))})
 state.pending();await wait(150);await page.clock.runFor(20);await snap('confirmed20')
 await page.clock.runFor(329);await snap('confirmed349');await page.clock.runFor(1);await wait(80);await snap('details350')
 await page.getByRole('button',{name:'Отменить запись',exact:true}).click();await snap('cancel-modal')
 state.cancelError=true;await page.getByRole('dialog').getByRole('button',{name:'Отменить запись',exact:true}).click();await wait(100);await page.clock.runFor(20);await snap('cancel-error')
 await page.keyboard.press('Escape');results.push({name:'modal-isolation-restore',...await page.evaluate(()=>({inert:document.querySelector('#root').inert,focus:document.activeElement?.textContent}))})
 await page.getByRole('button',{name:'Отменить запись',exact:true}).click();state.cancelError=false;await page.getByRole('dialog').getByRole('button',{name:'Отменить запись',exact:true}).click();await wait(100);await page.clock.runFor(20);await snap('cancelled')
 await context.close()
})
for(const phase of ['before-resolve','100ms','last-place'])await test(phase,async()=>{
 const {context,page,state,go,snap}=await setup({lastPlace:phase==='last-place'})
 await go('/schedule?date=2026-09-12&trainer=dima');await page.getByRole('link',{name:/08:00–09:00/}).click();await page.clock.runFor(20)
 await page.getByRole('button',{name:'Подтвердить запись'}).click();await wait(80)
 if(phase==='before-resolve'){await page.goBack();await page.clock.runFor(120)}
 state.pending();await wait(200);await page.clock.runFor(100);await snap(`${phase}-100`)
 if(phase==='100ms'){await page.goBack();await page.clock.runFor(120)}
 if(phase!=='last-place'){await page.goForward();await page.clock.runFor(120);await snap(`${phase}-return`)}
 else {await page.clock.runFor(250);await snap('last-place350')}
 results.push({name:phase,posts:state.posts});await context.close()
})
await test('trainers main and unsupported catalog path',async()=>{
 const extra={id:'extra',slug:'sergey',name:'Сергей Александрович Константинопольский',specialties:['Контрольная длинная строка направления'],bio:'Контрольный текст для проверки переноса, не продуктовые данные.',isActive:true}
 const {context,page,state,go,snap}=await setup({width:390,trainers:[...realTrainers,extra]})
 await go('/trainers');await snap('trainers390');await page.getByRole('link',{name:`Профиль тренера ${realTrainers[0].name}`}).click();await page.clock.runFor(100)
 await page.setViewportSize({width:430,height:932});await snap('profile430');await page.getByRole('link',{name:/Выбрать время тренировки с/}).click();await page.clock.runFor(100);await snap('profile-to-schedule')
 await go('/trainers');await page.getByRole('link',{name:`Выбрать время тренировки с ${extra.name}`}).click();await wait(150);await page.clock.runFor(100);await page.getByRole('button',{name:/12/}).click();await page.getByRole('link',{name:/08:00–09:00/}).click();await wait(150);await page.clock.runFor(100);await snap('unsupported-booking')
 await page.getByRole('button',{name:'Подтвердить запись'}).click();await wait(80);results.push({name:'unsupported-post',posts:state.posts});state.pending();await wait(80)
 state.trainers=[{...extra,slug:'dima'}];await page.setViewportSize({width:320,height:740});await go('/trainers');await snap('long-name320');await go('/trainers/dima');await snap('long-profile320')
 for(const n of [0,1,12]){state.trainers=Array.from({length:n},(_,i)=>({...extra,slug:`trainer${i}`}));await go('/trainers');await snap(`trainers-count${n}`)}
 await context.close()
})
for(const [path,error] of [['/schedule','/schedule'],['/booking/s0','/bookings'],['/booking/s0?trainer=dima','/trainers'],['/trainers','/trainers'],['/trainers/dima','/trainers']])await test(`error ${path}`,async()=>{
 const {context,page,go,snap}=await setup({errors:[error]});await go(path);for(let i=0;i<4;i++){await page.clock.runFor(1100);await wait(100)}await page.clock.runFor(20);await snap(`error-${path.split('?')[0].replaceAll('/','_')}-${error.slice(1)}`);await context.close()
})
await test('boundary',async()=>{
 const {context,page,state,go,snap}=await setup({width:320})
 state.slots[0].booked=8;state.slots[1].isBlocked=true;state.slots[2].startAt='2026-09-11T04:00:00+03:00';state.slots[2].endAt='2026-09-11T05:00:00+03:00'
 await go('/schedule?date=2026-09-12&trainer=dima');await snap('boundary-schedule320')
 results.push({name:'contrast-targets',...await page.evaluate(()=>({reset:(()=>{let e=[...document.querySelectorAll('button')].find(e=>e.textContent==='Сбросить');let r=e.getBoundingClientRect();return {w:r.width,h:r.height}})(),disabled:[...document.querySelectorAll('.time-slot.is-disabled')].map(e=>({opacity:getComputedStyle(e).opacity,text:e.innerText,colors:[...e.querySelectorAll('span,strong')].map(x=>({text:x.textContent,color:getComputedStyle(x).color}))}))}))})
 await page.getByRole('link',{name:/19:00–20:00/}).click();await wait(150);await page.clock.runFor(30);await page.getByRole('link',{name:'Вернуться к расписанию'}).click();await page.clock.runFor(600);await snap('explicit-return-focus')
 state.remove=true;await go('/schedule?date=2026-09-12&trainer=dima&slot=s11');await page.clock.runFor(600);await snap('missing-slot-fallback')
 state.trainers=[{...realTrainers[0],name:'Константин Константинопольский-Преображенский Александрович'}];await go('/schedule?date=2026-09-12&trainer=dima');await snap('long-filter320')
 for(const id of ['s0','s1','s2','unknown']){await go(`/booking/${id}`);await snap(`boundary-booking-${id}`)}
 state.trainers=[];await go('/booking/s3?trainer=dima');await snap('no-trainer-selected-id');await page.getByRole('button',{name:'Подтвердить запись'}).click();await wait(80);results.push({name:'no-trainer-post',posts:state.posts});state.pending();await wait(80)
 await context.close();await page.video().saveAs(`${dir}/boundary.webm`)
})
await test('timing-proof',async()=>{
 for(const lastPlace of [false,true]){
 const {context,page,state,go,snap}=await setup({lastPlace})
 await go('/booking/s0?trainer=dima');await page.getByRole('button',{name:'Подтвердить запись'}).click();await wait(80);state.pending();await wait(250)
 for(const [delta,label] of [[0,'0'],[100,'100'],[249,'349'],[1,'350']]){await page.clock.runFor(delta);await wait(80);await snap(`timing-${lastPlace?'last':'normal'}-${label}`)}
 await context.close();await page.video().saveAs(`${dir}/timing-${lastPlace?'last':'normal'}.webm`)
 }
})
await test('back-proof',async()=>{
 const {context,page,go,snap}=await setup({width:320})
 await go('/schedule?date=2026-09-12&trainer=dima');await page.getByRole('link',{name:/19:00–20:00/}).scrollIntoViewIfNeeded();await page.clock.runFor(500);await snap('back-before')
 await page.getByRole('link',{name:/19:00–20:00/}).click();await wait(150);await page.clock.runFor(200);await page.goBack();await wait(150);await page.clock.runFor(700);await snap('back-after')
 await page.getByRole('link',{name:/19:00–20:00/}).click();await wait(150);await page.clock.runFor(200);await page.getByRole('link',{name:'Вернуться к расписанию'}).click();await wait(150);await page.clock.runFor(700);await snap('back-explicit')
 await context.close()
})
await test('offline',async()=>{
 const {context,page,go,snap}=await setup()
 await go('/404');await context.setOffline(true)
 for(const path of ['/booking/s0','/trainers/dima','/trainers','/schedule']){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'))},path);await wait(100);await page.clock.runFor(100);await snap(`offline${path.replaceAll('/','_')}`)}
 await context.close()
})
await test('started-slot',async()=>{
 const {context,page,go,snap}=await setup({width:430});await page.clock.setSystemTime(new Date('2026-09-12T08:30:00+03:00'))
 await go('/trainers/dima');await wait(150);await page.clock.runFor(50);await snap('started-profile')
 await go('/schedule?date=2026-09-12&trainer=dima');await snap('started-schedule');await page.getByRole('link',{name:/08:00–09:00/}).click();await wait(150);await page.clock.runFor(100);await snap('started-booking');await context.close()
})
await browser.close()
