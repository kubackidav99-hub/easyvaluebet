import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const port=process.env.PORT||'3000';
if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('Invalid PORT');
const cli=fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url));
const server=spawn(process.execPath,[cli,'start','--hostname','0.0.0.0','--port',port],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.kill(signal));
server.on('error',e=>{console.error(e.message);process.exit(1)});
server.on('exit',(code,signal)=>process.exit(code??(signal?1:0)));
