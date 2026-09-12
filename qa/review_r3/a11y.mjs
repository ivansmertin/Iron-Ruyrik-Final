import { chromium } from 'file:///C:/Users/iwans/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright-core/index.mjs';
import {writeFileSync} from 'node:fs';
const dir='qa/review_r3', results=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Moscow',recordVideo:{dir:dir+'/video'}});
const p=await ctx.newPage();p.setDefaultTimeout(6000);
await p.clock.install({time:new Date('2026-09-12T08:00:00+03:00')});
await p.addInitScript(()=>{window.vts=[];const original=document.startViewTransition?.bind(document);if(original)document.startViewTransition=(cb)=>{const row={before:location.pathname,names:[...document.querySelectorAll('*')].map(e=>getComputedStyle(e).viewTransitionName).filter(n=>n&&n!=='none')};window.vts.push(row);const vt=original(cb);vt.ready.then(()=>row.ready=true,e=>row.error=String(e));return vt;};});
const user={id:'u1',name:'Иван',city:'Великий Новгород',role:'admin',isActive:true};
const trainers=[{id:'t1',slug:'dima',name:'Дима',bio:'Тренер',specialties:['Силовые'],isActive:true}];
const slots=[10,11,12,18].map((h,i)=>({id:'s'+i,startAt:`2026-09-12T${h}:00:00+03:00`,endAt:`2026-09-12T${h+1}:00:00+03:00`,booked:i===1?8:2,capacity:8,available:i===1?0:6,isBlocked:i===2}));
let bookings=[],cap=8,adminError=false,same=false;
const booking=(id='b1')=>({id,userId:'u1',clientName:'Константинопольский Константин Константинович',trainerSlug:null,trainerName:null,slotId:'s3',startAt:slots[3].startAt,endAt:slots[3].endAt,status:'confirmed',notes:null,createdAt:'2026-09-12T05:00:00Z',cancelledAt:null});
let series=[1,5,10].map((d,i)=>({id:'w'+i,date:`2026-09-${String(d).padStart(2,'0')}`,measuredAt:`2026-09-${String(d).padStart(2,'0')}T08:00:00+03:00`,value:80-i,provenanceLabel:i?'Apple Health':'Внесено вручную',sourceProvider:i?'apple_health':'manual'}));
const membership={id:'m',name:'Абонемент на 8 посещений',type:'visits_package',visitsTotal:8,visitsRemaining:5,expiresAt:null,status:'active'};
await p.route('**/api/v1/**',async r=>{const req=r.request(),path=new URL(req.url()).pathname.replace('/api/v1',''),method=req.method();let body={};let status=200;
if(path==='/home')body={user,membership,nextBooking:bookings.find(b=>b.status==='confirmed')||null,currentOccupancy:2,capacity:cap};
else if(path==='/schedule')body={timezone:'Europe/Moscow',capacity:cap,days:[{date:'2026-09-12',slots}]};
else if(path==='/trainers')body=trainers;
else if(path==='/profile')body={user,membership,history:Array.from({length:12},(_,i)=>({...booking('h'+i),status:'completed'}))};
else if(path==='/health/progress'){const s=same?series.map(x=>({...x,measuredAt:series[0].measuredAt,date:series[0].date})):series;body={visitsThisMonth:3,consistentWeeks:3,weightSeries:s,latestWeight:{metricType:'weight',currentValue:s.at(-1).value,measuredAt:s.at(-1).measuredAt,unit:'kg',provenanceLabel:s.at(-1).provenanceLabel}};}
else if(path==='/health/measurements/manual'){const v=req.postDataJSON();series.push({id:'new',value:v.weight,measuredAt:v.measuredAt,date:v.measuredAt.slice(0,10),provenanceLabel:'Внесено вручную',sourceProvider:'manual'});body=[];results.push({manualPayload:v});}
else if(path==='/health/sources')body=[];
else if(path==='/bookings'&&method==='GET')body=bookings;
else if(path==='/bookings'&&method==='POST'){let v=req.postDataJSON();const s=slots.find(x=>x.id===v.slotId);body={...booking(),slotId:s.id,startAt:s.startAt,endAt:s.endAt,trainerSlug:v.trainerSlug,trainerName:v.trainerSlug?'Дима':null};bookings=[body];results.push({bookingPayload:v});}
else if(path.endsWith('/cancel')){bookings[0].status='cancelled';body=bookings[0];}
else if(path==='/admin/settings'){if(method==='PATCH')cap=req.postDataJSON().gymCapacity;body={gymCapacity:cap,defaultBookingDurationMinutes:60,bookingStepMinutes:60,cancelBeforeMinutes:240,timezone:'Europe/Moscow'};}
else if(path==='/admin/booking-blocks')body=[];
else if(path==='/admin/bookings'){if(method==='GET')body=[booking()];else {results.push({adminPayload:req.postDataJSON()});if(adminError){status=400;body={error:{message:'Контрольная ошибка'}}}else body=booking('new');}}
else if(path.includes('news'))body=[];
await r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
});
async function snap(name){await p.waitForTimeout(500);await p.screenshot({path:`${dir}/${name}.png`,fullPage:true});results.push({name,url:p.url(),text:(await p.locator('body').innerText()).slice(0,5000),diag:await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,small:[...document.querySelectorAll('button,a,input')].filter(e=>{let r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44)}).map(e=>({text:e.textContent,rect:{w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}})),vt:window.vts}))});}
async function go(path,name){await p.goto('http://127.0.0.1:5173'+path,{waitUntil:'domcontentloaded',timeout:20000});await p.waitForTimeout(600);await snap(name);}
try{await go('/schedule?trainer=dima','schedule-a11y');results.push({styles:await p.locator('.time-slot.is-disabled .time-slot__status').evaluateAll(es=>es.map(e=>({text:e.textContent,color:getComputedStyle(e).color,opacity:getComputedStyle(e.closest('.time-slot')).opacity}))),reset:await p.getByRole('button',{name:'Сбросить'}).boundingBox()});}finally{writeFileSync(dir+'/a11y-results.json',JSON.stringify(results,null,2));await ctx.close();await browser.close();}
