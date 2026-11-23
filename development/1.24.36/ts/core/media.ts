// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/media.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
const PlazCodeMedia = (() => {
  type MediaItem = { name: string; mimeType: string; data: string };
  type MediaInput = { name?: string; mimeType?: string; data: string };
  type Quality = { maxw?: number; q?: number };
  type ConvertFn = (file: File, video: boolean) => Promise<{ ok?: boolean; error?: string; files?: MediaItem[] }>;
  type PrepareOpts = { nativeVideo?: boolean; frames?: boolean; progress?: (msg: string) => void; convert?: ConvertFn; quality?: Quality };
  const types: Record<string, string> = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',svg:'image/svg+xml',avif:'image/avif',heic:'image/heic',heif:'image/heif',tif:'image/tiff',tiff:'image/tiff',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',avi:'video/x-msvideo',mpeg:'video/mpeg',mpg:'video/mpeg',ogv:'video/ogg',wmv:'video/x-ms-wmv',flv:'video/x-flv', '3gp':'video/3gpp'};
  const MAX_BYTES = 12 * 1024 * 1024, MAX_FILES = 8;
  function mime(file: { type?: string; name?: string }): string { return file.type && file.type !== 'application/octet-stream' ? file.type : types[(String(file.name || '').split('.').pop() || '').toLowerCase()] || ''; }
  function fileFrom(payload: MediaInput, index = 0): File {
    const type = payload.mimeType || 'image/jpeg', bin = atob(payload.data), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const ext = Object.keys(types).find(key => types[key] === type) || 'bin';
    return new File([bytes], payload.name || `plazcode_${Date.now()}_${index}.${ext}`, {type});
  }
  async function encode(file: File): Promise<MediaItem> {
    return new Promise((resolve,reject) => { const reader = new FileReader();reader.onload=()=>resolve({name:file.name,mimeType:mime(file),data:String(reader.result).split(',')[1] || ''});reader.onerror=()=>reject(Error('Could not read '+file.name));reader.readAsDataURL(file); });
  }
  function event(target: EventTarget, name: string, action: () => void, timeout = 15000): Promise<void> {
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>finish(Error('Media decoding timed out. This codec may not be supported by your browser.')),timeout);
      const success=()=>finish(), failure=()=>finish(Error('This media codec cannot be decoded on this device. Convert it to PNG/JPEG or MP4/WebM and try again.'));
      function finish(error?: unknown) { clearTimeout(timer);target.removeEventListener(name,success);target.removeEventListener('error',failure);error?reject(error):resolve(); }
      target.addEventListener(name,success,{once:true});target.addEventListener('error',failure,{once:true});
      try { action(); } catch(error) { finish(error); }
    });
  }
  async function pixels(file: File, video: boolean, progress: (msg: string) => void = () => {}, quality: Quality = {}): Promise<MediaItem[]> {
    const element=document.createElement(video?'video':'img') as HTMLVideoElement & HTMLImageElement, url=URL.createObjectURL(file), output: MediaItem[]=[];
    try {
      if(video){element.muted=true;element.playsInline=true;element.preload='auto';}
      await event(element,video?'loadeddata':'load',()=>{element.src=url;});
      const width=video?element.videoWidth:element.naturalWidth,height=video?element.videoHeight:element.naturalHeight;
      if(!width || !height)throw Error('Media has no readable image dimensions.');
      const ratio=Math.min(1,(quality.maxw || 1600)/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image conversion is unavailable.');
      const duration=element.duration,count=video?Math.min(8,Math.max(1,Math.ceil(duration))):1;
      if(video && (!Number.isFinite(duration)||duration<=0))throw Error('Video duration could not be read.');
      for(let i=0;i<count;i++){
        const time=count===1?0:(duration-.05)*i/(count-1);
        if(video && Math.abs(element.currentTime-time)>.01)await event(element,'seeked',()=>{element.currentTime=time;});
        ctx.drawImage(element,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL(video?'image/jpeg':'image/png',quality.q || .86).split(',')[1];
        output.push({name:video?`${file.name} - frame ${i+1} at ${time.toFixed(2)}s.jpg`:`${file.name}.png`,mimeType:video?'image/jpeg':'image/png',data});
        progress(`Preparing ${file.name}: ${i+1}/${count}${video?' frames':''}`);
      }
      return output;
    } finally { if(video){element.pause();element.removeAttribute('src');element.load();}URL.revokeObjectURL(url); }
  }
  function validate(payloads: Array<{ name?: unknown; mimeType?: unknown; data?: unknown }>): typeof payloads {
    if(!Array.isArray(payloads)||!payloads.length||payloads.length>MAX_FILES)throw Error('Send 1–8 attachments at a time.');
    let bytes=0;
    for(const p of payloads){
      if(!p || typeof p.name!=='string'||p.name.length>512||typeof p.mimeType!=='string'||!/^((image|video)\/[a-z0-9.+-]+)$/.test(p.mimeType)||typeof p.data!=='string'||!p.data.length||p.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data))throw Error('Invalid media attachment.');
      bytes+=p.data.length*3/4;
    }
    if(bytes>MAX_BYTES)throw Error('Attachments exceed the 12 MB transfer limit. Use fewer files or video frames.');
    return payloads;
  }
  async function prepare(files: Iterable<File> | ArrayLike<File>,{nativeVideo=false,frames=false,progress=()=>{},convert,quality}: PrepareOpts={}): Promise<{ files: MediaItem[]; notice: string }> {
    const result: MediaItem[]=[], notices: string[]=[];
    async function decode(file: File,video: boolean): Promise<MediaItem[]>{try{return await pixels(file,video,progress,quality);}catch(error){if(!convert)throw error;progress('Trying the local decoder for '+file.name+'…');const converted=await convert(file,video);if(!converted || !converted.ok)throw Error(converted && converted.error || 'Local conversion failed.');return converted.files || [];}}
    for(const file of Array.from(files)){
      const type=mime(file);progress('Preparing '+file.name+'…');
      if(!type.startsWith('image/')&&!type.startsWith('video/'))throw Error('Choose an image or video file: '+file.name);
      const video=type.startsWith('video/');
      if(video && (!nativeVideo || frames || file.size>MAX_BYTES)){
        result.push(...await decode(file,true));notices.push(`${file.name}: sampled frames only; audio and motion between frames are not included.`);
      }else if(!video && !['image/png','image/jpeg','image/webp'].includes(type)){
        result.push(...await decode(file,false));notices.push(`${file.name}: converted to PNG (still image).`);
      }else{if(file.size>MAX_BYTES)throw Error(file.name+' exceeds the 12 MB transfer limit.');const payload=await encode(file);payload.mimeType=type;result.push(payload);}
      validate(result);
    }
    validate(result);return {files:result,notice:notices.join(' ')};
  }
  return {mime,fileFrom,prepare,pixels,encode,validate,MAX_BYTES,MAX_FILES};
})();
if(typeof module!=='undefined' && module.exports)module.exports=PlazCodeMedia;
