#!/usr/bin/env node
/* Auth surface smoke: renders shell, no overflow, no crash, next preservation.
 * Usage: BASE=http://localhost:4312 node scripts/verify-auth-smoke.mjs */
import { chromium, webkit } from "playwright";
const B=process.env.BASE??"http://localhost:4312";
const ROUTES=["/login","/signup","/forgot-password","/reset-password","/reset-password?token=bogus","/verify-email","/complete-profile","/authenticate","/en/login"];
let fail=0;
for(const [en,engine] of [["chromium",chromium],["webkit",webkit]]){
 const b=await engine.launch();
 for(const scheme of ["light","dark"]){
  for(const w of [1440,390]){
   const ctx=await b.newContext({viewport:{width:w,height:900},colorScheme:scheme,reducedMotion:"reduce"});
   const p=await ctx.newPage();
   const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,80)));
   for(const r of ROUTES){
     const resp=await p.goto(B+r,{waitUntil:"load",timeout:30000}).catch(()=>null);
     await p.waitForTimeout(250);
     const m=await p.evaluate(()=>({
       shell:!!document.querySelector('.ds'),
       h1:document.querySelector('main h1')?.textContent?.trim().slice(0,28)||null,
       overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     }));
     const status=resp?.status()??0;
     const ok = status<500 && m.overflow<=1 && (m.shell||status>=300);
     if(!ok){fail++;console.log(`  ✗ ${en}/${scheme}/${w} ${r} status=${status} shell=${m.shell} overflow=${m.overflow}`);}
   }
   if(errs.length){fail++;console.log(`  ✗ ${en}/${scheme}/${w} pageerrors: ${errs.slice(0,2).join(" | ")}`);}
   await ctx.close();
  }
 }
 // next preservation (root + locale)
 const ctx=await b.newContext(); const p=await ctx.newPage();
 for(const [label,url] of [["root","/login?next=%2Fpricing"],["locale","/en/login?next=%2Fpricing"]]){
   await p.goto(B+url,{waitUntil:"load"}); await p.waitForTimeout(300);
   const nextInLinks=await p.evaluate(()=>{
     const a=[...document.querySelectorAll('a')].map(x=>x.getAttribute('href')||"");
     return a.some(h=>h.includes("next=%2Fpricing")||h.includes("next=/pricing"));
   });
   console.log(`  ${nextInLinks?"✓":"✗"} ${en} ${label} next preserved in cross-links`);
   if(!nextInLinks) fail++;
 }
 // unsafe next must be rejected
 await p.goto(B+"/login?next=https%3A%2F%2Fevil.example.com",{waitUntil:"load"}); await p.waitForTimeout(300);
 // Assert on navigable targets only. Next.js echoes the raw query param into the
 // inert RSC flight payload, which is not a redirect vector.
 // Resolve each target and compare the parsed hostname. A substring test would
 // be wrong here: the attacker host can appear anywhere in a URL without being
 // the host actually navigated to (and vice versa).
 const leaked=await p.evaluate(()=>{
   const targets=[
     ...[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),
     ...[...document.querySelectorAll('form')].map(f=>f.getAttribute('action'))
   ].filter(Boolean);
   return targets.some((value)=>{
     let resolved;
     try { resolved=new URL(value, document.baseURI); } catch { return false; }
     return resolved.hostname === "evil.example.com";
   });
 });
 console.log(`  ${leaked?"✗":"✓"} ${en} unsafe external next rejected`);
 if(leaked) fail++;
 await b.close();
}
console.log(fail?`\nSMOKE FAILURES: ${fail}`:"\nAUTH SMOKE OK ✓");
process.exit(fail?1:0);
