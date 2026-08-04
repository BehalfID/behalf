#!/usr/bin/env node
/* Dual real-app comparison for the auth split-screen shell.
 * SRC/TGT env; args: [light|dark] [chromium|webkit] [width] [path] */
import { chromium, webkit } from "playwright";
const SRC=process.env.SRC??"http://localhost:8080", TGT=process.env.TGT??"http://localhost:4311";
const scheme=process.argv[2]==="dark"?"dark":"light";
const engine=process.argv[3]==="webkit"?webkit:chromium;
const width=Number(process.argv[4]??1440), path=process.argv[5]??"/login";
const b=await engine.launch();
async function grab(url){
  const ctx=await b.newContext({viewport:{width,height:900},reducedMotion:"reduce",colorScheme:scheme});
  const p=await ctx.newPage(); await p.goto(url,{waitUntil:"load",timeout:60000});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(600);
  const r=await p.evaluate(()=>{
    const rgb=c=>{const d=document.createElement('div');d.style.backgroundColor=`color-mix(in srgb, ${c} 100%, white 0%)`;document.body.appendChild(d);const v=getComputedStyle(d).backgroundColor;d.remove();return v;};
    const grid=document.querySelector('div[class*="min-h-dvh"]')||document.body;
    const aside=document.querySelector('aside');
    const main=document.querySelector('main');
    const h1=document.querySelector('main h1');
    const email=document.querySelector('#auth-email,#email');
    const pw=document.querySelector('#auth-password,#password');
    const submit=document.querySelector('main form button[type=submit]');
    const box=e=>e?{w:+e.getBoundingClientRect().width.toFixed(1),h:+e.getBoundingClientRect().height.toFixed(1)}:null;
    const cs=e=>e?getComputedStyle(e):null;
    return {
      gridCols:getComputedStyle(grid).gridTemplateColumns,
      aside:box(aside), asideBg:aside?rgb(cs(aside).backgroundColor):null,
      asidePad:aside?cs(aside).padding:null,
      gridField:!!document.querySelector('.grid-field'),
      formWrap:box(main?.querySelector('main > div:last-child > div')),
      h1:h1?{fs:cs(h1).fontSize,fw:cs(h1).fontWeight,text:h1.textContent.trim().slice(0,30)}:null,
      email:email?{...box(email),h:+email.getBoundingClientRect().height.toFixed(1),radius:cs(email).borderRadius,bg:cs(email).backgroundColor==='rgba(0, 0, 0, 0)'?'transparent':rgb(cs(email).backgroundColor),shadow:cs(email).boxShadow==='none'?'none':'yes',fs:cs(email).fontSize}:null,
      pwH:pw?+pw.getBoundingClientRect().height.toFixed(1):null,
      submit:submit?{h:+submit.getBoundingClientRect().height.toFixed(1),radius:cs(submit).borderRadius,bg:rgb(cs(submit).backgroundColor)}:null,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    };
  });
  await ctx.close(); return r;
}
const s=await grab(SRC+path), t=await grab(TGT+path); await b.close();
console.log(`\n== ${process.argv[3]||'chromium'} ${scheme} ${width}px ${path} ==`);
let d=0;
for(const k of Object.keys(s)){
  const A=JSON.stringify(s[k]),B=JSON.stringify(t[k]);
  if(A!==B){d++;console.log(`  ≠ ${k}: src=${A} tgt=${B}`);} else console.log(`    ${k}: ${A}`);
}
console.log(`DIFFS: ${d}`);
