#!/usr/bin/env node
/* Resolves fixed-dark section colors to sRGB in BOTH real apps and compares.
 * SRC/TGT env; arg = light|dark */
import { chromium, webkit } from "playwright";
const SRC=process.env.SRC??"http://localhost:8080/", TGT=process.env.TGT??"http://localhost:4311/";
const scheme=process.argv[2]==="dark"?"dark":"light";
const engine=process.argv[3]==="webkit"?webkit:chromium;
const b=await engine.launch();
async function grab(url){
  const ctx=await b.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",colorScheme:scheme});
  const p=await ctx.newPage(); await p.goto(url,{waitUntil:"load",timeout:60000});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{
    const toRGB=c=>{const d=document.createElement('div');d.style.backgroundColor=`color-mix(in srgb, ${c} 100%, white 0%)`;document.body.appendChild(d);const v=getComputedStyle(d).backgroundColor;d.remove();return v;};
    const pk=(f,pr)=>{const e=f();return e?toRGB(getComputedStyle(e)[pr]):null};
    const secs=[...document.querySelectorAll('.env-charcoal')];
    const dash=()=>secs.find(x=>/See every action/i.test(x.textContent||''));
    return {
      dashSectionBg:pk(dash,'backgroundColor'), dashHeading:pk(()=>dash()?.querySelector('h2'),'color'),
      dashLink:pk(()=>dash()?.querySelector('a'),'color'),
      devSectionBg:pk(()=>document.querySelector('.env-ink'),'backgroundColor'),
      devHeading:pk(()=>document.querySelector('.env-ink h2'),'color'),
      devMuted:pk(()=>document.querySelector('.env-ink p'),'color'),
      codePanelBg:pk(()=>document.querySelector(".env-ink [class*='rounded-lg'][class*='border']"),'backgroundColor'),
      codePanelBorder:pk(()=>document.querySelector(".env-ink [class*='rounded-lg'][class*='border']"),'borderTopColor'),
      tabBarBg:pk(()=>document.querySelector(".env-ink [role='tablist']"),'backgroundColor'),
      authorityBg:pk(()=>document.querySelector('#authority'),'backgroundColor'),
      authorityHeading:pk(()=>document.querySelector('#authority h2'),'color'),
      copperPanelBg:pk(()=>document.querySelector('.env-copper-field'),'backgroundColor'),
      endingCTAbg:pk(()=>document.querySelector(".env-copper-field a[href*='signup']"),'backgroundColor'),
      endingCTAfg:pk(()=>document.querySelector(".env-copper-field a[href*='signup']"),'color'),
    };
  });
  await ctx.close(); return r;
}
const s=await grab(SRC),t=await grab(TGT); await b.close();
const near=(a,bb)=>{if(a===bb)return true;if(!a||!bb)return false;const f=x=>(x.match(/[\d.]+/g)||[]).map(Number);const A=f(a),B=f(bb);return A.length===B.length&&A.every((v,i)=>Math.abs(v-B[i])<0.003)};
let bad=0;console.log(`\n== ${process.argv[3]||'chromium'} / ${scheme} ==`);
for(const k of Object.keys(s)){const ok=near(s[k],t[k]);if(!ok)bad++;console.log(`${ok?'✓':'✗'} ${k}\n    src=${s[k]}\n    tgt=${t[k]}`);}
console.log(bad?`\n${bad} MISMATCH`:"\nALL MATCH ✓");
process.exit(bad?1:0);
