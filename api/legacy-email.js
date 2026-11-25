'use strict';
// Vercel-only transport adapter. The two legacy admin email handlers retain
// their original code, authentication, methods, response headers and I/O.
module.exports=function legacyEmailRouter(req,res){
  const route=req.query?.__legacy_email_route;
  if(route==='destination')return require('../lib/legacy-email/email-destination')(req,res);
  if(route==='test')return require('../lib/legacy-email/test-email')(req,res);
  res.statusCode=404;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.end(JSON.stringify({error:'Not found'}));
};
