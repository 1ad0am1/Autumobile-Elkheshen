const express=require('express');
const multer=require('multer');
const crypto=require('crypto');
const app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:20}});
app.use(express.json({limit:'20mb'}));
app.use(express.urlencoded({extended:true,limit:'20mb'}));
const DEFAULT_PRODUCTS=[
 {id:'demo-1',name:'Mercedes-Benz C180',price:'تواصل معنا',year:'2024',transmission:'أوتوماتيك',fuel:'بنزين',description:'سيارة متاحة لدى Automobile Elkheshen',images:[],status:'available'}
];
function passwordOf(req){
 const b=req.headers['x-admin-password-b64'];
 if(b){try{return Buffer.from(String(b),'base64').toString('utf8')}catch{}}
 return req.headers['x-admin-password']||'';
}
function auth(req,res,next){
 const expected=process.env.ADMIN_PASSWORD;
 if(!expected)return res.status(500).json({error:'ADMIN_PASSWORD غير مضبوط في Vercel Environment Variables.'});
 if(passwordOf(req)!==expected)return res.status(401).json({error:'كلمة المرور غير صحيحة.'});
 next();
}
function normalizePath(req){
 let p=req.path||'/';
 if(p.startsWith('/api'))p=p.slice(4)||'/';
 return p;
}
function clean(p){
 return {id:String(p.id||crypto.randomUUID()),name:String(p.name||''),price:String(p.price||''),year:String(p.year||''),transmission:String(p.transmission||''),fuel:String(p.fuel||''),description:String(p.description||''),images:Array.isArray(p.images)?p.images:[],status:p.status==='sold'?'sold':'available'};
}
async function github(method,path,body){
 const token=process.env.GITHUB_TOKEN, repo=process.env.GITHUB_REPO, branch=process.env.GITHUB_BRANCH||'main';
 if(!token||!repo) return null;
 const url=`https://api.github.com/repos/${repo}/contents/${path}`;
 const h={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Automobile-Elkheshen-Admin'};
 if(method==='GET'){let r=await fetch(`${url}?ref=${encodeURIComponent(branch)}`,{headers:h});if(r.status===404)return null;if(!r.ok)throw new Error('GitHub read failed');return r.json()}
 let r=await fetch(url,{method,headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)});let t=await r.text();if(!r.ok)throw new Error('GitHub write failed: '+t.slice(0,200));return JSON.parse(t);
}
async function readProducts(){
 try{
  const path=process.env.GITHUB_PRODUCTS_PATH||'data/products.json';
  const f=await github('GET',path);
  if(!f)return DEFAULT_PRODUCTS;
  const raw=Buffer.from(f.content,'base64').toString('utf8');
  const arr=JSON.parse(raw);return Array.isArray(arr)?arr.map(clean):DEFAULT_PRODUCTS;
 }catch(e){return DEFAULT_PRODUCTS}
}
async function writeProducts(arr){
 const path=process.env.GITHUB_PRODUCTS_PATH||'data/products.json';
 const old=await github('GET',path);
 const content=Buffer.from(JSON.stringify(arr.map(clean),null,2),'utf8').toString('base64');
 await github('PUT',path,{message:'Update car inventory',content,branch:process.env.GITHUB_BRANCH||'main',...(old?.sha?{sha:old.sha}:{})});
 return arr;
}
async function uploadImage(buffer,originalname){
 const repo=process.env.GITHUB_REPO,token=process.env.GITHUB_TOKEN;
 if(!repo||!token)return null;
 const safe=String(originalname||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
 const path=`uploads/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
 const f=await github('PUT',path,{message:'Upload car image',content:buffer.toString('base64'),branch:process.env.GITHUB_BRANCH||'main'});
 return f?.content?.download_url||`https://raw.githubusercontent.com/${repo}/${process.env.GITHUB_BRANCH||'main'}/${path}`;
}
async function router(req,res){
 const p=normalizePath(req);
 if(req.method==='GET'&&(p==='/'||p==='/health'))return res.json({ok:true,service:'automobile-elkheshen-api'});
 if(req.method==='GET'&&p==='/products')return res.json(await readProducts());
 if(req.method==='GET'&&p==='/admin/products'){return auth(req,res,async()=>res.json(await readProducts()))}
 if(req.method==='POST'&&p==='/admin/upload-images'){
  return auth(req,res,()=>upload.array('images',20)(req,res,async err=>{
   if(err)return res.status(400).json({error:err.message});
   try{let urls=[];for(const f of req.files||[]){let u=await uploadImage(f.buffer,f.originalname);if(u)urls.push(u)}res.json({images:urls})}catch(e){res.status(500).json({error:e.message})}
  }));
 }
 if(req.method==='POST'&&p==='/admin/products')return auth(req,res,async()=>{try{let a=await readProducts();let n=clean(req.body);n.id=n.id||crypto.randomUUID();a.push(n);res.json(clean(await writeProducts(a).then(()=>n)))}catch(e){res.status(500).json({error:e.message})}});
 const m=p.match(/^\/admin\/products\/([^/]+)$/);
 if(m&&['PUT','DELETE'].includes(req.method))return auth(req,res,async()=>{
  try{let a=await readProducts(),i=a.findIndex(x=>String(x.id)===decodeURIComponent(m[1]));if(i<0)return res.status(404).json({error:'السيارة غير موجودة'});
   if(req.method==='DELETE')a.splice(i,1);else a[i]=clean({...a[i],...req.body,id:a[i].id});
   await writeProducts(a);res.json({ok:true,products:a});
  }catch(e){res.status(500).json({error:e.message})}
 });
 if(req.method==='POST'&&p==='/order')return res.json({ok:true});
 res.status(404).json({error:'NOT_FOUND',path:p});
}
app.all('*',(req,res,next)=>router(req,res).catch(e=>res.status(500).json({error:e.message})));
module.exports=app;
