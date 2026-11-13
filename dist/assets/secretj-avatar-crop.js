/* Circular crop editor for private Secret J profile photos. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SecretJAvatarCrop=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';const SIZE=256;
function placement(w,h,zoom=1,dx=0,dy=0){if(!(w>0&&h>0))throw Error('Invalid image');const scale=Math.max(SIZE/w,SIZE/h)*Math.max(1,Math.min(3,+zoom||1));const width=w*scale,height=h*scale;const maxX=(width-SIZE)/2,maxY=(height-SIZE)/2;const x=Math.max(-maxX,Math.min(maxX,+dx||0)),y=Math.max(-maxY,Math.min(maxY,+dy||0));return {width,height,x,y,drawX:(SIZE-width)/2+x,drawY:(SIZE-height)/2+y};}
async function encode(canvas){for(const q of [.86,.72,.56,.4]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',q));if(blob&&blob.size<=102400)return blob;}throw Error('Image is too large. Select another photo.');}
function open(file){
  if(!file||!/^image\/(?:png|jpeg|webp)$/.test(file.type))return Promise.reject(Error('Select a JPG, PNG or WebP image.'));
  if(file.size>12*1024*1024)return Promise.reject(Error('Photo must be smaller than 12 MB.'));
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not open photo'));};
    img.onload=()=>show();img.src=url;
    function show(){
      const layer=document.createElement('div');layer.className='sj-crop-backdrop';
      layer.innerHTML='<section class="sj-crop-modal" role="dialog" aria-modal="true" aria-label="Adjust photo">'+
        '<div class="sj-crop-heading"><h2>Adjust profile photo</h2><button type="button" data-close aria-label="Close">×</button></div>'+
        '<p>Drag to center your face, then zoom in or out.</p>'+
        '<canvas width="256" height="256" tabindex="0" aria-label="Photo crop. Drag or use arrow keys."></canvas>'+
        '<div class="sj-crop-slider"><button data-minus type="button" aria-label="Zoom out">−</button>'+
        '<label for="sj-zoom">Zoom</label><input id="sj-zoom" type="range" min="1" max="3" step=".02" value="1" aria-label="Photo zoom">'+
        '<button data-plus type="button" aria-label="Zoom in">+</button></div>'+
        '<div class="sj-crop-buttons"><button data-close type="button">Cancel</button>'+
        '<button data-save type="button">Save photo</button></div></section>';
      document.body.appendChild(layer);
      const canvas=layer.querySelector('canvas'),ctx=canvas.getContext('2d'),slider=layer.querySelector('input');
      const save=layer.querySelector('[data-save]'),focus=document.activeElement;
      let zoom=1,dx=0,dy=0,pointer=null,finished=false;
      function draw(){const p=placement(img.naturalWidth,img.naturalHeight,zoom,dx,dy);dx=p.x;dy=p.y;ctx.clearRect(0,0,SIZE,SIZE);ctx.save();ctx.beginPath();ctx.arc(128,128,128,0,Math.PI*2);ctx.clip();ctx.drawImage(img,p.drawX,p.drawY,p.width,p.height);ctx.restore();ctx.strokeStyle='#999';ctx.lineWidth=2;ctx.beginPath();ctx.arc(128,128,126,0,Math.PI*2);ctx.stroke();}
      function zoomTo(z){zoom=Math.max(1,Math.min(3,+z||1));slider.value=zoom;draw();}
      function close(value){if(finished)return;finished=true;document.removeEventListener('keydown',key);layer.remove();URL.revokeObjectURL(url);focus?.focus?.();resolve(value);}
      function key(e){if(e.key==='Escape')return close(null);if(document.activeElement!==canvas)return;if(e.key==='ArrowUp')dy+=8;else if(e.key==='ArrowDown')dy-=8;else if(e.key==='ArrowLeft')dx+=8;else if(e.key==='ArrowRight')dx-=8;else if(e.key==='+'||e.key==='=')zoomTo(zoom+.1);else if(e.key==='-')zoomTo(zoom-.1);else return;e.preventDefault();draw();}
      layer.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>close(null)));
      layer.addEventListener('click',e=>{if(e.target===layer)close(null);});
      layer.querySelector('[data-minus]').addEventListener('click',()=>zoomTo(zoom-.15));
      layer.querySelector('[data-plus]').addEventListener('click',()=>zoomTo(zoom+.15));
      slider.addEventListener('input',()=>zoomTo(slider.value));
      canvas.addEventListener('wheel',e=>{e.preventDefault();zoomTo(zoom+(e.deltaY<0?.08:-.08));},{passive:false});
      canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx,dy};});
      canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const scale=SIZE/canvas.getBoundingClientRect().width;dx=pointer.dx+(e.clientX-pointer.x)*scale;dy=pointer.dy+(e.clientY-pointer.y)*scale;draw();});
      canvas.addEventListener('pointerup',()=>{pointer=null;});canvas.addEventListener('pointercancel',()=>{pointer=null;});
      save.addEventListener('click',async()=>{save.disabled=true;save.textContent='Saving...';try{const output=document.createElement('canvas');output.width=SIZE;output.height=SIZE;const p=placement(img.naturalWidth,img.naturalHeight,zoom,dx,dy);output.getContext('2d').drawImage(img,p.drawX,p.drawY,p.width,p.height);close(await encode(output));}catch(e){save.disabled=false;save.textContent='Save photo';alert(e.message);}});
      document.addEventListener('keydown',key);draw();canvas.focus();
    }
  });
}
return{placement,open};
});
