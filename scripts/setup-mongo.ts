import {execFileSync} from 'node:child_process';import {mkdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
await mkdir('.data/bin',{recursive:true});const name=`ringback-extract-${randomUUID()}`;
const image='mongo@sha256:c53852c00c23ca9f23fc39690350ffa9a80e3642fe8f96879726d8da0abe80a7';
try{execFileSync('docker',['create','--name',name,image],{stdio:'ignore'});execFileSync('docker',['cp',`${name}:/usr/bin/mongod`,'.data/bin/mongod'],{stdio:'ignore'});execFileSync('.data/bin/mongod',['--version'],{stdio:'ignore'});console.log('Official MongoDB binary extracted from digest-pinned image for in-memory integration tests.');}finally{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}
