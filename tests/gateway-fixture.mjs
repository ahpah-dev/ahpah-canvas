// Development-only fixture for verifying the browser -> gateway -> UI flow.
import http from 'node:http';
const requests=[];
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5173');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.url==='/preview'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Canvas verification preview</title><body style="background:#13101d;color:#c6a2ef;font:20px system-ui;padding:40px"><h1>Real browser preview</h1><p>This page is served by the local verification fixture.</p></body>');return;}
  res.setHeader('Content-Type','application/json');
  if(req.url==='/requests'){res.end(JSON.stringify(requests));return;}
  if(req.url?.startsWith('/v1/models')){res.end(JSON.stringify({data:[{id:'verification-model',name:'Verification fixture model'}]}));return;}
  if(req.url==='/v1/chat/completions'){
    let body='';for await(const chunk of req)body+=chunk;
    const payload=JSON.parse(body);requests.push(payload);
    const prompt=payload.messages.at(-1).content;
    if(prompt==='slow')await new Promise(resolve=>setTimeout(resolve,5000));
    if(prompt==='fail'){res.writeHead(429);res.end(JSON.stringify({error:{message:'Verification fixture rate limit'}}));return;}
    res.end(JSON.stringify({model:'verification-resolved',choices:[{message:{content:'## Verification response\n\nThe canvas successfully sent your prompt.\n\n```typescript\nconst workspace = "ready";\n```\n\n- Conversation context received\n- Response rendered successfully'}}],usage:{total_tokens:42}}));return;
  }
  res.writeHead(404);res.end(JSON.stringify({error:{message:'Not found'}}));
});
server.listen(20129,'127.0.0.1',()=>console.log('Verification fixture at http://127.0.0.1:20129'));
