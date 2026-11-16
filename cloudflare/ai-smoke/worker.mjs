/** Only used in GitHub CI via loopback Wrangler dev, never deployed to production. */
export default {async fetch(request,env){
 if(request.method!=='POST')return new Response('method not allowed',{status:405});
 try{
  const input=await request.json();
  if(!Array.isArray(input.messages)||input.messages.length>3)return new Response('invalid input',{status:400});
  const response=await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast',{
    messages:input.messages,response_format:input.response_format,
    max_tokens:input.max_tokens??240,temperature:0
  });
  return Response.json(response);
 }catch(error){console.warn('AI binding invocation failed',String(error).slice(0,180));
  return Response.json({error:'AI binding unavailable'},{status:503});}
}};
