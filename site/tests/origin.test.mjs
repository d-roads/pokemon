import test from 'node:test';
import assert from 'node:assert/strict';
import {requestLocation} from '../lib/origin.mjs';
import {sessionCookie,clearCookie} from '../lib/accounts.mjs';

const req=(host,remoteAddress,proto,pathname='/api/auth/login')=>({headers:{host,'x-forwarded-proto':proto},socket:{remoteAddress},url:pathname});

test('Quick Tunnel uses its HTTPS origin only from a local tunnel connection',()=>{
 const location=requestLocation(req('test-name.trycloudflare.com','127.0.0.1','https'),5173,'0.0.0.0');
 assert.equal(location.url.origin,'https://test-name.trycloudflare.com');
 assert.equal(location.tunnel,true);
 assert.equal(requestLocation(req('test-name.trycloudflare.com','192.168.50.10','https'),5173,'0.0.0.0'),null);
 assert.equal(requestLocation(req('test-name.trycloudflare.com','127.0.0.1','http'),5173,'0.0.0.0'),null);
 assert.equal(requestLocation(req('other.example.com','127.0.0.1','https'),5173,'0.0.0.0'),null);
});

test('Local and LAN requests keep their HTTP origin',()=>{
 assert.equal(requestLocation(req('127.0.0.1:5173','127.0.0.1'),5173,'0.0.0.0').url.origin,'http://127.0.0.1:5173');
 assert.equal(requestLocation(req('192.168.50.64:5173','192.168.50.10'),5173,'0.0.0.0').url.origin,'http://192.168.50.64:5173');
 assert.equal(requestLocation(req('192.168.50.64:5173','192.168.50.10'),5173,'127.0.0.1'),null);
});

test('Tunnel session cookies are marked Secure',()=>{
 assert.match(sessionCookie('token',true),/; Secure$/);
 assert.match(sessionCookie('token',true),/; SameSite=Lax;/);
 assert.match(sessionCookie('token',true),/; Path=\/; HttpOnly;/);
 assert.match(clearCookie(true),/; Secure$/);
 assert.match(clearCookie(true),/; SameSite=Lax;/);
 assert.match(clearCookie(true),/; Max-Age=0;/);
 assert.doesNotMatch(sessionCookie('token'),/; Secure$/);
});
