/* Secret J local CV text extraction. No CV bytes are sent to parsing services.
 * PDF: Mozilla PDF.js 3.11; DOCX: Mammoth 1.13. Text-only CVs supported.
 * Scanned/image-only PDFs require OCR and will not be silently fabricated.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.SecretJCVParser=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const FIELDS=['display_name','headline','location','summary','skills',
  'experience','education','linkedin','github','portfolio'];
const limits={
  display_name:120,headline:220,location:180,summary:9000,skills:5000,
  experience:12000,education:12000,linkedin:500,github:500,portfolio:500
};
const headings=[
  ['summary',/^(?:professional\s+)?(?:summary|profile|objective|about\s+me|personal\s+statement)$/i],
  ['skills',/^(?:technical\s+)?(?:skills|technologies|tech\s+stack|core\s+competencies|tools\s+and\s+technologies|technical\s+expertise)$/i],
  ['experience',/^(?:professional\s+|work\s+|relevant\s+)?(?:experience|employment|work\s+history|internships?)$/i],
  ['education',/^(?:education|academic\s+background|qualifications)$/i]
];
const otherHead=/^(?:certifications?|certificates?|achievements?|honors?|awards?|publications?|projects?|languages?|volunteering|references?|courses?|training|contact|activities|leadership|interests?)$/i;
function normalizeText(text){
  return String(text||'').replace(/\u00a0/g,' ').replace(/\r/g,'\n')
    .replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n')
    .replace(/\n{3,}/g,'\n\n').trim();
}
function sectionOf(line){
  const clean=line.replace(/[:：]\s*$/,'').trim();
  for(const [key,re] of headings)if(re.test(clean))return key;
  return otherHead.test(clean)?'_other':null;
}
function readLink(text,re){
  const m=text.match(re);
  if(!m)return '';
  const raw=m[0].replace(/[),.;]+$/,'');
  const u=/^https?:\/\//i.test(raw)?raw:'https://'+raw;
  try{
    const url=new URL(u);
    if(url.protocol!=='https:'||url.username||url.password)return '';
    return url.toString().slice(0,500);
  }catch{return '';}
}
function parseText(raw){
  const text=normalizeText(raw);
  if(text.length<35)throw Error('No readable CV text found. Image-only or scanned PDFs require OCR.');
  const lines=text.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const sections={summary:[],skills:[],experience:[],education:[]};
  const intro=[];
  let section=null;
  for(const line of lines){
    const name=sectionOf(line);
    if(name){section=name;continue;}
    if(section&&sections[section]){
      if(sections[section].join('\n').length<limits[section])sections[section].push(line);
    }else if(!section&&intro.length<15)intro.push(line);
  }
  const cleanIntro=intro.filter(x=>!/(?:@|https?:\/\/|linkedin\.com|github\.com|tel\s*:|phone\s*:)/i.test(x)
    &&x.length>=3 &&x.length<180 &&!/^\+?\d[\d\s()\-]+$/.test(x));
  const first=cleanIntro[0]||'';
  const second=cleanIntro[1]||'';
  const name=/^[\p{L}' .-]{5,100}$/u.test(first)&&
    first.trim().split(/\s+/).length>=2&&first.trim().split(/\s+/).length<=6?
    first:'';
  const headline=name?second:'';
  const locationLine=lines.find(x=>/,\s*(?:Egypt|Cairo|Giza|Alexandria)\b|\b(?:Cairo|Giza|Alexandria),?\s+Egypt\b/i.test(x)&&x.length<95)||'';
  const record={
    display_name:name.slice(0,120),
    headline:headline && !sectionOf(headline)&&headline.length<220?headline:'',
    location:locationLine.slice(0,180),
    summary:sections.summary.join('\n').slice(0,9000),
    skills:sections.skills.join('\n').slice(0,5000),
    experience:sections.experience.join('\n').slice(0,12000),
    education:sections.education.join('\n').slice(0,12000),
    linkedin:readLink(text,/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+\/?/i),
    github:readLink(text,/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/?/i),
    portfolio:readLink(text,/https:\/\/(?:www\.)?(?!linkedin\.com|github\.com)[\w.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i)
  };
  // A generic URL matching the LinkedIn or GitHub link cannot be the portfolio.
  if(record.portfolio&&/linkedin\.com|github\.com/i.test(record.portfolio))record.portfolio='';
  return Object.fromEntries(FIELDS.filter(x=>record[x]).map(x=>[x,record[x]]));
}
const libraryPromises={};
function loadLibrary(url, globalName){
  if(window[globalName])return Promise.resolve(window[globalName]);
  if(libraryPromises[globalName])return libraryPromises[globalName];
  libraryPromises[globalName]=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=url;script.async=true;script.referrerPolicy='no-referrer';
    script.onload=()=>window[globalName]?resolve(window[globalName]):reject(Error('Parser library unavailable'));
    script.onerror=()=>reject(Error('Could not load the CV parser library. Check your internet connection.'));
    document.head.appendChild(script);
  }).catch(err=>{delete libraryPromises[globalName];throw err;});
  return libraryPromises[globalName];
}
async function extractPDF(file){
  const pdfjs=await loadLibrary(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib'
  );
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  try{
    const pages=[];
    for(let i=1;i<=Math.min(pdf.numPages,12);i++){
      const page=await pdf.getPage(i);
      const items=(await page.getTextContent()).items||[];
      // Coordinates preserve section and line boundaries better than naive joining.
      let y=null,parts=[],rows=[];
      for(const item of items){
        if(typeof item.str!=='string'||!item.str.trim())continue;
        const nextY=Array.isArray(item.transform)?item.transform[5]:0;
        if(y!==null&&Math.abs(nextY-y)>3){rows.push(parts.join(' '));parts=[];}
        parts.push(item.str);y=nextY;
      }
      if(parts.length)rows.push(parts.join(' '));
      pages.push(rows.join('\n'));
    }
    return pages.join('\n');
  }finally{pdf.destroy();}
}
async function extractDOCX(file){
  const mammoth=await loadLibrary(
    'https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js','mammoth'
  );
  const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  return result.value||'';
}
async function extract(file){
  if(file.size>786432)throw Error('CV limit: 768 KB');
  const name=String(file.name||'').toLowerCase();
  let text='';
  if(name.endsWith('.pdf')||file.type==='application/pdf')text=await extractPDF(file);
  else if(name.endsWith('.docx')||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    text=await extractDOCX(file);
  else throw Error('Only PDF or DOCX files are supported');
  return parseText(text);
}
return{parseText,extract,normalizeText,sectionOf,fields:FIELDS};
});
