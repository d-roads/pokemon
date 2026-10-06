import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/login.js',import.meta.url),'utf8');
const submit=source.slice(source.indexOf('async function submit('),source.indexOf("forms.in.addEventListener"));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function attempt(responses){
 const button={textContent:'Sign in',disabled:false},msg={},calls=[],navigations=[];
 const form={querySelector:s=>s==='.go'?button:msg};
 const context=vm.createContext({form,fetch:async(url,options)=>{calls.push({url,options});return responses.shift();},fail:(_form,text)=>{msg.textContent=text;},location:{replace:url=>navigations.push(url)}});
 vm.runInContext(submit,context);
 await vm.runInContext("submit(form,'login',{username:'tester',password:'test1'})",context);
 return {button,msg,calls,navigations};
}
test('Login opens the app only after a fresh session check succeeds',async()=>{
 const r=await attempt([json({user:{username:'tester'}}),json({user:{username:'tester'}})]);
 assert.deepEqual(r.navigations,['/']);
 assert.equal(r.calls[1].url,'/api/auth/me');
 assert.equal(r.calls[1].options.credentials,'same-origin');
 assert.equal(r.calls[1].options.cache,'no-store');
 assert.equal(r.button.disabled,false);
});
test('Login stays on the form when the app cookie is not retained',async()=>{
 const r=await attempt([json({user:{username:'tester'}}),json({signedOut:true},401)]);
 assert.deepEqual(r.navigations,[]);
 assert.match(r.msg.textContent,/session was not retained/);
 assert.equal(r.button.disabled,false);
});
test('Login distinguishes a tunnel redirect from a lost app session',async()=>{
 const r=await attempt([json({user:{username:'tester'}}),{type:'opaqueredirect'}]);
 assert.deepEqual(r.navigations,[]);
 assert.match(r.msg.textContent,/connection was interrupted/);
});
test('Rejected credentials do not trigger a session check',async()=>{
 const r=await attempt([json({error:'That username and password do not match.'},401)]);
 assert.equal(r.calls.length,1);
 assert.deepEqual(r.navigations,[]);
 assert.match(r.msg.textContent,/do not match/);
});
